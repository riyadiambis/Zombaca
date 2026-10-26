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
  rafts, trampolines, setOcclusionRaycaster
} from './state.js';
import {
  buildWorld, islandRadiusAt, isWaterAt, findNearestLand,
  resolveColliders, getSupport, lerpAngle, normalizeAngle
} from './world.js';
import { playSound, speakText, ensureAudioContext } from './audio.js';
import {
  initLetterTextures, createStartWavingZombie, updateZombies
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
import {
  initUI, buildMinimapBase, renderMinimap, updateStarHUD,
  announceCurrentTarget, showToast
} from './ui.js';

/*************************************************************************
 * 1. INISIALISASI THREE.JS (CANVAS, SCENE, RENDERER, CAMERA, LIGHTS)
 *************************************************************************/
const canvas = document.getElementById('game-canvas');
sceneRefs.canvas = canvas;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

const dirLight = new THREE.DirectionalLight(0xFFFBEB, 0.88);
dirLight.position.set(24, 46, 26);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 5;
dirLight.shadow.camera.far = 130;
const sdSize = 42;
dirLight.shadow.camera.left = -sdSize;
dirLight.shadow.camera.right = sdSize;
dirLight.shadow.camera.top = sdSize;
dirLight.shadow.camera.bottom = -sdSize;
scene.add(dirLight);

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

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
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

  // 2. Animasi Rakit Mengapung di Danau
  rafts.forEach(r => {
    r.phase += dt * r.speed;
    const pingPong = (Math.sin(r.phase) + 1) * 0.5;
    const newX = r.from.x + (r.to.x - r.from.x) * pingPong;
    const newZ = r.from.z + (r.to.z - r.from.z) * pingPong;

    r.currentDx = newX - r.mesh.position.x;
    r.currentDz = newZ - r.mesh.position.z;

    r.mesh.position.x = newX;
    r.mesh.position.z = newZ;
    r.mesh.position.y = 0.22 + Math.sin(totalTime * 3.5 + r.phase) * 0.04;
    r.mesh.rotation.z = Math.sin(totalTime * 2.8 + r.phase) * 0.02;

    if (r.collider) {
      r.collider.cx = newX;
      r.collider.cz = newZ;
      r.collider.topY = r.mesh.position.y + 0.15;
      r.collider.lowY = r.mesh.position.y - 0.4;
    }
  });

  // 3. Animasi Trampolin Memantul (Pemulihan Skala)
  trampolines.forEach(tr => {
    if (tr.squashTimer > 0) {
      tr.squashTimer -= dt;
      const sc = 0.8 + Math.sin(tr.squashTimer * 20) * 0.2;
      tr.mesh.scale.set(1.1, sc, 1.1);
    } else {
      tr.mesh.scale.set(1.0, 1.0, 1.0);
    }
  });

  // 4. Render Preview Karakter Berputar di Layar Pilih Karakter
  const charScreen = document.getElementById('screen-char');
  if (charScreen && charScreen.classList.contains('active')) {
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

    updateZombies(dt, false);
    renderMinimap();
    renderer.render(scene, camera);
    return;
  }

  /**************** STATE BERMAIN (PLAYING) ****************/
  if (gameStateRef.isPaused) {
    renderer.render(scene, camera);
    return;
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
      playerState.x += playerState.standingRaft.currentDx;
      playerState.z += playerState.standingRaft.currentDz;
    }

    resolveColliders(playerState.x, playerState.y, playerState.z, 0.55, 1.8, STEP_H);

    const curAngle = Math.atan2(playerState.z, playerState.x);
    const maxR = islandRadiusAt(curAngle) - 1.5;
    const curR = Math.hypot(playerState.x, playerState.z);
    if (curR > maxR) {
      playerState.x = Math.cos(curAngle) * maxR;
      playerState.z = Math.sin(curAngle) * maxR;
    }

    playerState.vy -= GRAVITY * dt;
    playerState.y += playerState.vy * dt;

    const supp = getSupport(playerState.x, playerState.y, playerState.z, 0.55, STEP_H);
    playerState.standingRaft = supp.raft || null;

    if (playerState.y <= supp.h) {
      playerState.y = supp.h;
      playerState.vy = 0;
      playerState.isGrounded = true;

      if (supp.type === 'tramp') {
        playerState.vy = BOUNCE_VY;
        playerState.isGrounded = false;
        playSound('bounce');
        showToast('Boing! Melompat tinggi! 🦘');
        spawnPuffParticles(playerState.x, playerState.y, playerState.z, 12);
        if (supp.trampRef) {
          supp.trampRef.squashTimer = 0.35;
        }
      }

      if (supp.type === 'slide' && supp.slideDir) {
        playerState.x += supp.slideDir.x * 12.0 * dt;
        playerState.z += supp.slideDir.z * 12.0 * dt;
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

  // Update Zombies
  updateZombies(dt, true);

  // Auto-Aim Target Ring & Tombol Tembak
  const btnShoot = document.getElementById('btn-shoot');
  const aimedZombie = findBestTargetZombie();
  if (aimedZombie) {
    targetRingMesh.visible = true;
    targetRingMesh.position.set(aimedZombie.x, aimedZombie.y + 0.07, aimedZombie.z);
    const pulse = 1 + Math.sin(totalTime * 10) * 0.14;
    targetRingMesh.scale.set(pulse, pulse, 1);
    if (btnShoot) btnShoot.classList.add('in-range');
  } else {
    targetRingMesh.visible = false;
    if (btnShoot) btnShoot.classList.remove('in-range');
  }

  // Bantuan Otomatis 15 Detik
  roundState.targetTimer += dt;
  if (roundState.targetTimer >= 15 && !roundState.hintActive) {
    roundState.hintActive = true;
    announceCurrentTarget();
  }

  // Update Proyektil & Partikel
  updateProjectiles(dt);
  updateParticles(dt);
  updateHoppingAnimals(dt);

  // Update Kamera & Mini Map
  updateCamera(dt, true);
  renderMinimap();

  renderer.render(scene, camera);
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
  buildMinimapBase();
  applyCamModeUI(true);
  await initLetterTextures();
  rebuildPlayerModel();
  createStartWavingZombie();
  initCharacterPreviews();
  updateStarHUD(false);
  initControls();
  initUI();

  // Tampilkan 4 zombie santai di desa pada menu awal
  for (let i = 0; i < 4; i++) {
    const { spawnZombie } = await import('./zombies.js');
    spawnZombie(0);
  }

  animate();
}

window.addEventListener('DOMContentLoaded', () => {
  initGame();
});

// Suport interaksi audio awal
window.addEventListener('click', () => {
  ensureAudioContext();
}, { once: true });
