/*************************************************************************
 * MAIN.JS - Inisialisasi Three.js, Game Loop, Fisika Pemain, & Siklus Hidup
 *************************************************************************/
import {
  STEP_H, WATER_Y, GRAVITY, BOUNCE_VY,
  CAM_MIN_DIST, CAM_MAX_DIST
} from './config.js';
import {
  saveState, roundState, playerState, selectionState,
  gameStateRef, cameraState, camControl, screenState, totalTimeRef,
  sceneRefs, playerRescue, touchState, keys, joyVector,
  zombies, setOcclusionRaycaster
} from './state.js';
import {
  buildWorld, islandRadiusAt, isWaterAt, findNearestLand,
  resolveColliders, getSupport, lerpAngle, normalizeAngle,
  updateRafts, updateTramps
} from './world.js';
import { playSound, speakText, ensureAudioContext, suspendAudio, resumeAudio } from './audio.js';
import {
  initLetterTextures, createStartWavingZombie, updateZombies, getNeededLetter,
  spawnZombie
} from './zombies.js';
import {
  rebuildPlayerModel, initCharacterPreviews, previewConfigs,
  previewRenderers
} from './characters.js';
import {
  findBestTargetZombie, updateProjectiles, updateParticles,
  updateHoppingAnimals, spawnPuffParticles
} from './weapons.js';
import {
  updateCamera, applyCamModeUI, resetCameraBehindPlayer
} from './camera.js';
import { initControls } from './controls.js';
import { initDebug, debugFrame, debugResetTiming } from './debug.js';
import { wantsAntialias, applyQuality, qualityState, updateAutoQuality } from './quality.js';
import {
  initUI, buildMinimapBase, renderMinimap, updateStarHUD,
  announceCurrentTarget, showToast
} from './ui.js';

/*************************************************************************
 * 1. INISIALISASI THREE.JS (CANVAS, SCENE, RENDERER, CAMERA, LIGHTS)
 *************************************************************************/
const canvas = document.getElementById('game-canvas');
sceneRefs.canvas = canvas;

// MSAA mengikuti pilihan grafis (lihat quality.js); pixel ratio diatur applyQuality()
const renderer = new THREE.WebGLRenderer({ canvas, antialias: wantsAntialias(), powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
sceneRefs.renderer = renderer;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7DD3FC);
scene.fog = new THREE.Fog(0x7DD3FC, 55, 175);
sceneRefs.scene = scene;

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 240);
camera.position.set(0, 24, 30);
sceneRefs.camera = camera;

camControl.lookAtPos = new THREE.Vector3(0, 2, 0);

// Raycaster Occlusion
setOcclusionRaycaster(new THREE.Raycaster());

// Pencahayaan
const hemiLight = new THREE.HemisphereLight(0xFFFFFF, 0x4ADE80, 0.82);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

// Satu DirectionalLight; kotak bayangan ±28 unit yang mengikuti pemain
const SHADOW_HALF = 28;
const SHADOW_TEXEL = (SHADOW_HALF * 2) / 1024;
const dirLight = new THREE.DirectionalLight(0xFFFBEB, 0.88);
dirLight.position.set(24, 46, 26);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 5;
dirLight.shadow.camera.far = 110;
dirLight.shadow.camera.left = -SHADOW_HALF;
dirLight.shadow.camera.right = SHADOW_HALF;
dirLight.shadow.camera.top = SHADOW_HALF;
dirLight.shadow.camera.bottom = -SHADOW_HALF;
scene.add(dirLight);
scene.add(dirLight.target);
sceneRefs.dirLight = dirLight;

// Pusat bayangan dibulatkan ke ukuran texel agar tepi bayangan tidak berkedip saat bergerak
function updateShadowCenter(x, z) {
  const cx = Math.round(x / SHADOW_TEXEL) * SHADOW_TEXEL;
  const cz = Math.round(z / SHADOW_TEXEL) * SHADOW_TEXEL;
  dirLight.position.set(cx + 24, 46, cz + 26);
  dirLight.target.position.set(cx, 0, cz);
}
updateShadowCenter(0, 6);

// Lingkaran Target Berkedip
const targetRingMesh = new THREE.Mesh(
  new THREE.RingGeometry(0.95, 1.35, 28),
  new THREE.MeshBasicMaterial({ color: 0xF472B6, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
);
targetRingMesh.rotation.x = -Math.PI / 2;
targetRingMesh.position.y = 0.08;
targetRingMesh.visible = false;
scene.add(targetRingMesh);
sceneRefs.targetRingMesh = targetRingMesh;

// Panah Bantuan Otomatis
const helpArrowGroup = new THREE.Group();
const arrowCone = new THREE.Mesh(
  new THREE.ConeGeometry(0.38, 0.8, 10),
  new THREE.MeshLambertMaterial({ color: 0xFACC15 })
);
arrowCone.rotation.x = Math.PI / 2;
arrowCone.position.z = 0.45;
const arrowShaft = new THREE.Mesh(
  new THREE.BoxGeometry(0.24, 0.24, 0.7),
  new THREE.MeshLambertMaterial({ color: 0xFACC15 })
);
helpArrowGroup.add(arrowCone, arrowShaft);
helpArrowGroup.visible = false;
scene.add(helpArrowGroup);
sceneRefs.helpArrowGroup = helpArrowGroup;

/*************************************************************************
 * 2. PENYELAMATAN AIR (PELAMPUANG BEBEK)
 *************************************************************************/
export function triggerWaterRescue() {
  if (playerRescue.active) return;
  playSound('plung');
  showToast('Plung! Mengapung dengan pelampung bebek! 🦆');
  speakText('Plung!');

  playerRescue.active = true;
  playerRescue.timer = 0;
  playerRescue.fromX = playerState.x;
  playerRescue.fromZ = playerState.z;

  const safe = findNearestLand(playerState.x, playerState.z);
  playerRescue.targetX = safe.x;
  playerRescue.targetZ = safe.z;

  if (sceneRefs.playerObj && sceneRefs.playerObj.duckFloatie) {
    sceneRefs.playerObj.duckFloatie.visible = true;
  }
  playerState.vy = 0;
  playerState.isGrounded = false;
}

/*************************************************************************
 * 3. LOOP UTAMA ANIMASI (GAME LOOP)
 *************************************************************************/
const clock = new THREE.Clock();

// Hanya boleh ada SATU loop requestAnimationFrame. startLoop() aman dipanggil berulang.
let rafId = 0;
let loopRunning = false;
let frameAccum = 0;          // akumulasi waktu untuk pembatas 30 fps di menu
let pausedFrameDrawn = false;
let minimapTimer = 0;
const MENU_FRAME_TIME = 1 / 30;
const MINIMAP_INTERVAL = 0.1;

function startLoop() {
  if (loopRunning) return;
  loopRunning = true;
  clock.getDelta(); // buang jeda panjang saat tab tersembunyi
  frameAccum = 0;
  debugResetTiming();
  rafId = requestAnimationFrame(animate);
}

function stopLoop() {
  loopRunning = false;
  cancelAnimationFrame(rafId);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLoop();
    suspendAudio();
  } else {
    resumeAudio();
    startLoop();
  }
});

function animate() {
  if (!loopRunning) return;
  rafId = requestAnimationFrame(animate);
  const workStart = performance.now();
  if (tick()) debugFrame(workStart);
}

// Elemen DOM yang disentuh setiap frame (di-cache supaya tidak getElementById per frame)
const charScreenEl = document.getElementById('screen-char');
const btnShootEl = document.getElementById('btn-shoot');
let shootInRange = false;

function setShootInRange(inRange) {
  if (inRange === shootInRange) return;
  shootInRange = inRange;
  if (btnShootEl) btnShootEl.classList.toggle('in-range', inRange);
}

// Mengembalikan true bila frame ini benar-benar dirender
function tick() {
  const rawDelta = clock.getDelta();
  frameAccum += rawDelta;
  const isPlaying = gameStateRef.current === 'PLAYING';
  // Di menu / layar akhir cukup 30 fps
  if (!isPlaying && frameAccum < MENU_FRAME_TIME - 0.002) return false;
  const dt = Math.min(frameAccum, 0.05);
  frameAccum = 0;

  // Saat dijeda, scene tidak berubah: render sekali saja lalu diam
  if (isPlaying && gameStateRef.isPaused) {
    if (!pausedFrameDrawn) {
      renderer.render(scene, camera);
      pausedFrameDrawn = true;
      return true;
    }
    return false;
  }
  pausedFrameDrawn = false;

  totalTimeRef.t += dt;
  const totalTime = totalTimeRef.t;

  // 1. Animasi Ombak Laut
  if (sceneRefs.oceanMesh) {
    sceneRefs.oceanMesh.position.y = -1.8 + Math.sin(totalTime * 1.8) * 0.14;
  }
  sceneRefs.waveRingMeshes.forEach((ring, i) => {
    const s = 1 + Math.sin(totalTime * 2 + i * 1.5) * 0.025;
    ring.scale.set(s, s, 1);
  });

  // 2. Animasi Rakit Mengapung di Danau & Trampolin Memantul
  updateRafts(dt);
  updateTramps(dt);

  // 4. Render Preview Karakter Berputar di Layar Pilih Karakter
  if (charScreenEl && charScreenEl.classList.contains('active')) {
    previewConfigs.forEach(type => {
      const item = previewRenderers[type];
      if (item) {
        item.model.root.rotation.y = totalTime * 1.1;
        item.model.leftArm.rotation.x = Math.sin(totalTime * 3) * 0.25;
        item.model.rightArm.rotation.x = -Math.sin(totalTime * 3) * 0.25;
        item.renderer.render(item.scene, item.camera);
      }
    });
  }

  /**************** STATE MENU (TIDAK BERMAIN) ****************/
  if (gameStateRef.current !== 'PLAYING') {
    updateCamera(dt, false);

    // Zombie melambai di layar mulai
    if (sceneRefs.startScreenZombie && sceneRefs.startScreenZombie.root.visible) {
      sceneRefs.startScreenZombie.rightArm.rotation.x = -Math.PI * 0.85;
      sceneRefs.startScreenZombie.rightArm.rotation.z = Math.sin(totalTime * 6) * 0.35;
      sceneRefs.startScreenZombie.root.rotation.z = Math.sin(totalTime * 3) * 0.06;
      if (sceneRefs.startScreenZombie.boardMesh) {
        sceneRefs.startScreenZombie.boardMesh.quaternion.copy(camera.quaternion);
      }
    }

    updateShadowCenter(0, 6);
    updateZombies(dt, false);
    updateParticles(dt);
    updateHoppingAnimals(dt);
    renderer.render(scene, camera);
    return true;
  }

  /**************** STATE BERMAIN (PLAYING) ****************/
  // Grafis Otomatis: ukur FPS 5 detik pertama bermain, turunkan ke Ringan bila < 45
  if (updateAutoQuality(rawDelta)) {
    showToast('Grafis disesuaikan supaya lancar');
  }

  if (playerState.shootCooldown > 0) playerState.shootCooldown -= dt;
  if (playerState.toolSwingTimer > 0) playerState.toolSwingTimer -= dt;
  if (screenState.shakeTime > 0) screenState.shakeTime -= dt;

  // Putar Kamera dengan Q dan E di Keyboard (Kamera Bahu)
  if (cameraState.mode === 'shoulder') {
    if (keys['KeyQ']) {
      camControl.targetYaw = normalizeAngle(camControl.targetYaw + 1.9 * dt);
      camControl.idleTimer = 0;
    }
    if (keys['KeyE']) {
      camControl.targetYaw = normalizeAngle(camControl.targetYaw - 1.9 * dt);
      camControl.idleTimer = 0;
    }
  }

  // Input Gerakan Mentah (Joystick & WASD / Panah)
  let rawRight = joyVector.x;
  let rawForward = -joyVector.y;
  if (keys['ArrowLeft'] || keys['KeyA']) rawRight -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) rawRight += 1;
  if (keys['ArrowUp'] || keys['KeyW']) rawForward += 1;
  if (keys['ArrowDown'] || keys['KeyS']) rawForward -= 1;

  const moveLen = Math.hypot(rawRight, rawForward);
  if (moveLen > 1) {
    rawRight /= moveLen;
    rawForward /= moveLen;
  }

  // Hitung Vektor Arah Gerak Sesuai Mode Kamera
  let worldMoveX = 0;
  let worldMoveZ = 0;

  if (cameraState.mode === 'shoulder') {
    const camForwardX = Math.sin(camControl.yaw);
    const camForwardZ = Math.cos(camControl.yaw);
    const camRightX = -Math.cos(camControl.yaw);
    const camRightZ = Math.sin(camControl.yaw);

    worldMoveX = camForwardX * rawForward + camRightX * rawRight;
    worldMoveZ = camForwardZ * rawForward + camRightZ * rawRight;
  } else {
    worldMoveX = rawRight;
    worldMoveZ = -rawForward;
  }

  // Logika Penyelamatan Pelampung Bebek
  if (playerRescue.active) {
    playerRescue.timer += dt;
    const prog = Math.min(1.0, playerRescue.timer / 1.4);
    const ease = prog * (2 - prog);

    playerState.x = playerRescue.fromX + (playerRescue.targetX - playerRescue.fromX) * ease;
    playerState.z = playerRescue.fromZ + (playerRescue.targetZ - playerRescue.fromZ) * ease;
    playerState.y = WATER_Y + Math.sin(prog * Math.PI * 4) * 0.12;

    if (sceneRefs.playerObj && sceneRefs.playerObj.duckFloatie) {
      sceneRefs.playerObj.duckFloatie.visible = true;
      sceneRefs.playerObj.duckFloatie.rotation.y = totalTime * 6;
    }

    if (prog >= 1.0) {
      playerRescue.active = false;
      if (sceneRefs.playerObj && sceneRefs.playerObj.duckFloatie) {
        sceneRefs.playerObj.duckFloatie.visible = false;
      }
      playerState.isGrounded = true;
      playerState.vy = 0;
    }
  } else {
    // Pergerakan Standar Pemain
    if (playerState.tickleStunTimer > 0) {
      playerState.tickleStunTimer -= dt;
      playerState.x += playerState.knockbackVx * dt;
      playerState.z += playerState.knockbackVz * dt;
      playerState.knockbackVx *= 0.9;
      playerState.knockbackVz *= 0.9;
    } else if (moveLen > 0.08) {
      const speed = 9.2;
      playerState.x += worldMoveX * speed * dt;
      playerState.z += worldMoveZ * speed * dt;

      const desiredPlayerRotY = Math.atan2(worldMoveX, worldMoveZ);
      playerState.rotY = lerpAngle(playerState.rotY, desiredPlayerRotY, dt * 12);
      playerState.walkTime += dt * 11;

      if (cameraState.mode === 'shoulder' && !touchState.isMouseDraggingCam && touchState.camTouches.size === 0 && !keys['KeyQ'] && !keys['KeyE']) {
        camControl.idleTimer += dt;
        if (camControl.idleTimer >= 2.0) {
          camControl.targetYaw = lerpAngle(camControl.targetYaw, playerState.rotY, dt * 2.2);
        }
      }
    } else {
      if (cameraState.mode === 'shoulder' && !touchState.isMouseDraggingCam && touchState.camTouches.size === 0 && !keys['KeyQ'] && !keys['KeyE']) {
        camControl.idleTimer += dt;
      }
    }

    if (playerState.standingRaft) {
      playerState.x += playerState.standingRaft.dx;
      playerState.z += playerState.standingRaft.dz;
    }

    resolveColliders(playerState, playerState.y, 0.55);

    const curAngle = Math.atan2(playerState.z, playerState.x);
    const maxR = islandRadiusAt(curAngle) - 1.5;
    const curR = Math.hypot(playerState.x, playerState.z);
    if (curR > maxR) {
      playerState.x = Math.cos(curAngle) * maxR;
      playerState.z = Math.sin(curAngle) * maxR;
    }

    playerState.vy -= GRAVITY * dt;
    playerState.y += playerState.vy * dt;

    const supp = getSupport(playerState.x, playerState.z, playerState.y);
    const suppCol = supp.obj;
    playerState.standingRaft = (suppCol && suppCol.raft && playerState.y <= supp.h + 0.05) ? suppCol.raft : null;

    if (playerState.y <= supp.h) {
      playerState.y = supp.h;
      playerState.vy = 0;
      playerState.isGrounded = true;

      if (suppCol && suppCol.kind === 'tramp') {
        playerState.vy = BOUNCE_VY;
        playerState.isGrounded = false;
        playSound('bounce');
        showToast('Boing! Melompat tinggi! 🦘');
        spawnPuffParticles(playerState.x, playerState.y, playerState.z, 12);
        if (suppCol.tramp) {
          suppCol.tramp.squash = 0.35;
        }
      }

      if (suppCol && suppCol.slideDir) {
        playerState.x += suppCol.slideDir.x * 12.0 * dt;
        playerState.z += suppCol.slideDir.z * 12.0 * dt;
      }
    } else {
      playerState.isGrounded = false;
    }

    if (playerState.y <= WATER_Y + 0.1 && isWaterAt(playerState.x, playerState.z)) {
      triggerWaterRescue();
    }
  }

  // Update Model Pemain
  if (sceneRefs.playerObj) {
    sceneRefs.playerObj.root.position.set(playerState.x, playerState.y, playerState.z);
    sceneRefs.playerObj.root.rotation.y = playerState.rotY;

    if (playerRescue.active) {
      sceneRefs.playerObj.leftLeg.rotation.x = 0;
      sceneRefs.playerObj.rightLeg.rotation.x = 0;
      sceneRefs.playerObj.leftArm.rotation.x = -0.5;
      sceneRefs.playerObj.rightArm.rotation.x = -0.5;
    } else if (!playerState.isGrounded) {
      sceneRefs.playerObj.leftLeg.rotation.x = -0.45;
      sceneRefs.playerObj.rightLeg.rotation.x = 0.45;
      sceneRefs.playerObj.leftArm.rotation.x = -0.7;
    } else if (moveLen > 0.08 && playerState.tickleStunTimer <= 0) {
      const swing = Math.sin(playerState.walkTime) * 0.65;
      sceneRefs.playerObj.leftLeg.rotation.x = swing;
      sceneRefs.playerObj.rightLeg.rotation.x = -swing;
      sceneRefs.playerObj.leftArm.rotation.x = -swing * 0.8;
      sceneRefs.playerObj.rightArm.rotation.x = swing * 0.8;
    } else {
      sceneRefs.playerObj.leftLeg.rotation.x = 0;
      sceneRefs.playerObj.rightLeg.rotation.x = 0;
      sceneRefs.playerObj.leftArm.rotation.x = 0;
      sceneRefs.playerObj.rightArm.rotation.x = -0.25;
    }

    if (playerState.toolSwingTimer > 0) {
      sceneRefs.playerObj.rightArm.rotation.x = -1.35 + Math.sin(playerState.toolSwingTimer * 25) * 0.6;
    }
  }

  // Kamera diperbarui sebelum zombie supaya papan huruf menghadap kamera frame ini
  updateCamera(dt, true);
  // Bayangan dipusatkan sedikit di depan pemain (arah pandang kamera)
  if (cameraState.mode === 'shoulder') {
    updateShadowCenter(playerState.x + Math.sin(camControl.yaw) * 8, playerState.z + Math.cos(camControl.yaw) * 8);
  } else {
    updateShadowCenter(playerState.x, playerState.z - 8);
  }

  // Update Zombies
  updateZombies(dt, true);

  // Auto-Aim Target Ring & Tombol Tembak
  const aimedZombie = findBestTargetZombie();
  if (aimedZombie) {
    targetRingMesh.visible = true;
    targetRingMesh.position.set(aimedZombie.x, aimedZombie.y + 0.07, aimedZombie.z);
    const pulse = 1 + Math.sin(totalTime * 10) * 0.14;
    targetRingMesh.scale.set(pulse, pulse, 1);
    setShootInRange(true);
  } else {
    targetRingMesh.visible = false;
    setShootInRange(false);
  }

  // Bantuan Otomatis 15 Detik
  roundState.targetTimer += dt;
  if (roundState.targetTimer >= 15 && !roundState.hintActive) {
    roundState.hintActive = true;
    announceCurrentTarget();
  }
  if (roundState.hintActive) {
    const neededLetter = getNeededLetter();
    let correctZ = null;
    for (let i = 0; i < zombies.length; i++) {
      if (zombies[i].letter === neededLetter) { correctZ = zombies[i]; break; }
    }
    if (correctZ) {
      helpArrowGroup.visible = true;
      helpArrowGroup.position.set(playerState.x, playerState.y + 3.6 + Math.sin(totalTime * 6) * 0.2, playerState.z);
      helpArrowGroup.rotation.y = Math.atan2(correctZ.x - playerState.x, correctZ.z - playerState.z);
    } else {
      helpArrowGroup.visible = false;
    }
  } else {
    helpArrowGroup.visible = false;
  }

  // Update Proyektil & Partikel
  updateProjectiles(dt);
  updateParticles(dt);
  updateHoppingAnimals(dt);

  // Mini map cukup 10x per detik
  minimapTimer += dt;
  if (minimapTimer >= MINIMAP_INTERVAL) {
    minimapTimer = 0;
    renderMinimap();
  }

  renderer.render(scene, camera);
  return true;
}

// Responsif Layar
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Inisialisasi Game
async function initGame() {
  buildWorld();
  applyQuality(qualityState.pref === 'ringan' ? 'ringan' : 'tinggi');
  buildMinimapBase();
  applyCamModeUI(true);
  await initLetterTextures();
  rebuildPlayerModel();
  createStartWavingZombie();
  initCharacterPreviews();
  updateStarHUD(false);
  initControls();
  initUI();
  initDebug();

  // Tampilkan 4 zombie santai di desa pada menu awal
  for (let i = 0; i < 4; i++) {
    spawnZombie(0);
  }

  startLoop();
}

window.addEventListener('DOMContentLoaded', () => {
  initGame();
});

// Suport interaksi audio awal
window.addEventListener('click', () => {
  ensureAudioContext();
}, { once: true });
