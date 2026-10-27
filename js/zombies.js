/*************************************************************************
 * ZOMBIES.JS - Zombie Lucu, AI, Papan Huruf Billboard, & Hewan Balok
 *************************************************************************/
import { ALLOWED_LETTERS, MODE_CONFIG, MAZE, ZONES, STEP_H } from './config.js';
import {
  zombies, playerState, roundState, selectionState, screenState,
  totalTimeRef, sceneRefs, playerRescue
} from './state.js';
import {
  isFreeSpot, findNearestLand, nearWater, resolveColliders,
  getSupport, lerpAngle, clampToMaze
} from './world.js';
import { playSound } from './audio.js';
import { spawnPuffParticles } from './weapons.js';
import { showToast } from './ui.js';
import { mergeMeshes } from './merge.js';

export const letterTextures = {};
export let fontLoadedReady = false;

    export function createLetterTexture(letter) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      ctx.clearRect(0, 0, 256, 256);

      // Kotak bulat putih dengan border hijau limau #A3E635
      const r = 48;
      const x = 16, y = 16, w = 224, h = 224;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();

      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 18;
      ctx.strokeStyle = '#A3E635';
      ctx.stroke();

      // Huruf Kapital Fredoka #14112B
      ctx.fillStyle = '#14112B';
      ctx.font = '700 138px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, 128, 136);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }

    export async function initLetterTextures() {
      try {
        if (document.fonts && document.fonts.load) {
          await document.fonts.load('700 120px Fredoka');
        }
      } catch (e) {
        // Lanjut jika browser tidak mendukung Font Loading API
      }
      ALLOWED_LETTERS.forEach(ltr => {
        const old = letterTextures[ltr];
        letterTextures[ltr] = createLetterTexture(ltr);
        // Material papan yang sudah ada cukup diganti teksturnya (dipakai bersama semua zombie)
        if (boardMaterials[ltr]) {
          boardMaterials[ltr].map = letterTextures[ltr];
          boardMaterials[ltr].needsUpdate = true;
        }
        if (old) old.dispose();
      });
      fontLoadedReady = true;
    }


export function getLetterCanvasTexture(letter) {
  if (letterTextures[letter]) return letterTextures[letter];
  letterTextures[letter] = createLetterTexture(letter);
  return letterTextures[letter];
}

    // Satu material papan per huruf, dipakai bersama semua zombie (texture dibuat sekali per huruf)
    const boardMaterials = {};
    export function getBoardMaterial(letter) {
      if (!boardMaterials[letter]) {
        boardMaterials[letter] = new THREE.MeshBasicMaterial({
          map: getLetterCanvasTexture(letter),
          transparent: true,
          side: THREE.DoubleSide
        });
      }
      return boardMaterials[letter];
    }

    const tempParentQuat = new THREE.Quaternion();

    export function alignBillboardToCamera(boardMesh) {
      if (!boardMesh || !boardMesh.parent || !sceneRefs.camera) return;
      // Induk papan (root zombie) berada langsung di scene, jadi quaternion lokalnya
      // sama dengan quaternion dunia: tidak perlu updateMatrixWorld tiap frame.
      tempParentQuat.copy(boardMesh.parent.quaternion).invert();
      boardMesh.quaternion.copy(tempParentQuat).multiply(sceneRefs.camera.quaternion);
    }

    // Geometry & material zombie dibuat SEKALI lalu dipakai bersama semua zombie.
    // Badan+kepala digabung jadi 1 mesh, mata+pupil+senyum jadi 1 mesh.
    let zombieRes = null;
    function getZombieResources() {
      if (zombieRes) return zombieRes;
      const zGreen = 0x86EFAC; // Hijau muda cerah ramah anak
      const zShirt = 0x38BDF8;
      const zPants = 0x6366F1;
      const part = (geo, color, x, y, z, basic) => {
        const mat = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        return m;
      };
      const bodyParts = [
        part(new THREE.BoxGeometry(1.0, 1.1, 0.62), zShirt, 0, 1.28, 0),
        part(new THREE.BoxGeometry(1.0, 0.95, 0.95), zGreen, 0, 2.38, 0)
      ];
      // Wajah di sumbu +Z lokal (mata besar bulat lucu & senyum), kepala di y = 2.38
      const whiteGeo = new THREE.SphereGeometry(0.22, 12, 12);
      const pupilGeo = new THREE.SphereGeometry(0.11, 10, 10);
      const faceParts = [
        part(whiteGeo, 0xFFFFFF, -0.26, 2.48, 0.48, true),
        part(pupilGeo, 0x14112B, -0.26, 2.48, 0.64, true),
        part(whiteGeo, 0xFFFFFF, 0.26, 2.48, 0.48, true),
        part(pupilGeo, 0x14112B, 0.26, 2.48, 0.64, true),
        part(new THREE.BoxGeometry(0.42, 0.12, 0.1), 0x14112B, 0, 2.14, 0.52, true)
      ];
      zombieRes = {
        bodyGeo: mergeMeshes(bodyParts, null),
        bodyMat: new THREE.MeshLambertMaterial({ vertexColors: true }),
        faceGeo: mergeMeshes(faceParts, null),
        faceMat: new THREE.MeshBasicMaterial({ vertexColors: true }),
        legGeo: new THREE.BoxGeometry(0.4, 0.72, 0.4),
        legMat: new THREE.MeshLambertMaterial({ color: zPants }),
        armGeo: new THREE.BoxGeometry(0.35, 0.95, 0.35),
        armMat: new THREE.MeshLambertMaterial({ color: zGreen }),
        boardGeo: new THREE.PlaneGeometry(2.3, 2.3),
        hintGeo: new THREE.RingGeometry(0.95, 1.35, 24),
        hintMat: new THREE.MeshBasicMaterial({ color: 0xFACC15, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      };
      [...bodyParts, ...faceParts].forEach(m => { m.geometry.dispose(); m.material.dispose(); });
      return zombieRes;
    }

    export function createCuteZombieMesh(initialLetter) {
      const R = getZombieResources();
      const root = new THREE.Group();

      const leftLeg = new THREE.Group();
      leftLeg.position.set(-0.28, 0.72, 0);
      const lMesh = new THREE.Mesh(R.legGeo, R.legMat);
      lMesh.position.y = -0.36;
      lMesh.castShadow = true;
      leftLeg.add(lMesh);

      const rightLeg = new THREE.Group();
      rightLeg.position.set(0.28, 0.72, 0);
      rightLeg.add(lMesh.clone());
      root.add(leftLeg, rightLeg);

      // Badan + kepala (1 mesh) dan wajah (1 mesh)
      const body = new THREE.Mesh(R.bodyGeo, R.bodyMat);
      body.castShadow = true;
      const face = new THREE.Mesh(R.faceGeo, R.faceMat);
      root.add(body, face);

      // Dua Tangan Zombie Terangkat ke Atas Memegang Papan Huruf
      const leftArm = new THREE.Group();
      leftArm.position.set(-0.72, 1.82, 0);
      const armMesh = new THREE.Mesh(R.armGeo, R.armMat);
      armMesh.position.y = -0.38;
      leftArm.add(armMesh);
      leftArm.rotation.x = -Math.PI * 0.92;
      leftArm.rotation.z = 0.12;

      const rightArm = new THREE.Group();
      rightArm.position.set(0.72, 1.82, 0);
      rightArm.add(armMesh.clone());
      rightArm.rotation.x = -Math.PI * 0.92;
      rightArm.rotation.z = -0.12;
      root.add(leftArm, rightArm);

      // Papan Huruf Besar di Atas Kepala (Selalu Menghadap Kamera / Billboard)
      const boardMesh = new THREE.Mesh(R.boardGeo, getBoardMaterial(initialLetter));
      boardMesh.position.set(0, 4.15, 0);
      root.add(boardMesh);

      // Cahaya Kuning Bantuan Otomatis (15 detik)
      const hintRing = new THREE.Mesh(R.hintGeo, R.hintMat);
      hintRing.rotation.x = -Math.PI / 2;
      hintRing.position.y = 0.08;
      hintRing.visible = false;
      root.add(hintRing);

      return {
        root,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        boardMesh,
        hintRing
      };
    }

    // Hewan dibuat sekali per jenis sebagai cetakan, lalu di-clone (geometry & material dipakai bersama)
    const animalTemplates = {};
    export function createCuteAnimalMesh(animalType) {
      if (!animalTemplates[animalType]) animalTemplates[animalType] = buildAnimalTemplate(animalType);
      return animalTemplates[animalType].clone();
    }

    function buildAnimalTemplate(animalType) {
      const group = new THREE.Group();
      if (animalType === 'kelinci') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 1.1), new THREE.MeshLambertMaterial({ color: 0xFFFFFF }));
        body.position.y = 0.45;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.65, 0.7), new THREE.MeshLambertMaterial({ color: 0xFFFFFF }));
        head.position.set(0, 0.9, 0.45);
        const earL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.18), new THREE.MeshLambertMaterial({ color: 0xF472B6 }));
        earL.position.set(-0.2, 1.4, 0.45);
        const earR = earL.clone();
        earR.position.x = 0.2;
        group.add(body, head, earL, earR);
      } else if (animalType === 'ayam') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.95), new THREE.MeshLambertMaterial({ color: 0xFACC15 }));
        body.position.y = 0.5;
        const beak = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.3), new THREE.MeshLambertMaterial({ color: 0xFB923C }));
        beak.position.set(0, 0.6, 0.58);
        const comb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.35), new THREE.MeshLambertMaterial({ color: 0xEF4444 }));
        comb.position.set(0, 0.98, 0.2);
        group.add(body, beak, comb);
      } else {
        // Anak Kucing Oranye
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.65, 1.05), new THREE.MeshLambertMaterial({ color: 0xFB923C }));
        body.position.y = 0.42;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.65, 0.68), new THREE.MeshLambertMaterial({ color: 0xFB923C }));
        head.position.set(0, 0.85, 0.45);
        const earL = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 4), new THREE.MeshLambertMaterial({ color: 0xEA580C }));
        earL.position.set(-0.22, 1.28, 0.45);
        const earR = earL.clone();
        earR.position.x = 0.22;
        group.add(body, head, earL, earR);
      }
      return group;
    }


    export function createStartWavingZombie() {
      sceneRefs.startScreenZombie = createCuteZombieMesh('Z');
      sceneRefs.startScreenZombie.root.position.set(0, 0, 15);
      sceneRefs.startScreenZombie.root.rotation.y = 0;
      sceneRefs.scene.add(sceneRefs.startScreenZombie.root);
    }

    /*************************************************************************
     * 11. MANAJEMEN ZOMBIE DI PETA LUAS (ATURAN MINIMAL 2 HURUF BENAR & 1 < 40 UNIT)
     *************************************************************************/
    export function getNeededLetter() {
      if (!roundState.targetObj) return 'A';
      return roundState.targetObj.text[roundState.letterIndex] || roundState.targetObj.text[0];
    }

    export function getRandomDistractor(excludeLetter) {
      const pool = ALLOWED_LETTERS.filter(l => l !== excludeLetter);
      return pool[Math.floor(Math.random() * pool.length)];
    }

    export function setZombieLetter(z, letter) {
      z.letter = letter;
      z.boardMesh.material = getBoardMaterial(letter);
    }

    // SELALU ada minimal 2 zombie yang membawa huruf benar, dan minimal 1 di antaranya berada dalam jarak 40 unit dari pemain.
    export function ensureCorrectLetterAmongZombies() {
      if (zombies.length === 0) return;
      const needed = getNeededLetter();

      // Jalur cepat tanpa alokasi (dipanggil setiap frame): aturan sudah terpenuhi
      let matchCount = 0;
      let closeMatch = false;
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (z.letter !== needed) continue;
        matchCount++;
        const dx = z.x - playerState.x, dz = z.z - playerState.z;
        if (dx * dx + dz * dz <= 1600) closeMatch = true;
      }
      if (matchCount >= 2 && closeMatch) return;

      let matches = zombies.filter(z => z.letter === needed);

      // Pastikan minimal 2 zombie membawa huruf benar
      if (matches.length < 2) {
        const available = zombies.filter(z => z.letter !== needed);
        // Urutkan berdasarkan jarak ke pemain agar salah satunya dekat
        available.sort((a, b) => {
          const da = Math.hypot(a.x - playerState.x, a.z - playerState.z);
          const db = Math.hypot(b.x - playerState.x, b.z - playerState.z);
          return da - db;
        });
        while (matches.length < 2 && available.length > 0) {
          const picked = available.shift();
          setZombieLetter(picked, needed);
          matches.push(picked);
        }
      }

      // Pastikan minimal 1 dari zombie huruf benar berada dalam jarak 40 unit dari pemain
      const hasClose = matches.some(z => Math.hypot(z.x - playerState.x, z.z - playerState.z) <= 40);
      if (!hasClose) {
        // Cari zombie mana saja yang berada dalam jarak 40 unit dari pemain dan ubah hurufnya jadi benar
        const closeCandidate = zombies.find(z => Math.hypot(z.x - playerState.x, z.z - playerState.z) <= 40);
        if (closeCandidate) {
          setZombieLetter(closeCandidate, needed);
        } else {
          // Jika tidak ada yang < 40, pilih zombie terdekat dari semua yang ada
          let closest = zombies[0];
          let minD = Infinity;
          zombies.forEach(z => {
            const d = Math.hypot(z.x - playerState.x, z.z - playerState.z);
            if (d < minD) { minD = d; closest = z; }
          });
          if (closest) setZombieLetter(closest, needed);
        }
      }
    }

    export function reshuffleAllZombieLetters() {
      const needed = getNeededLetter();
      if (zombies.length === 0) return;

      // Urutkan zombie berdasarkan jarak ke pemain
      const sorted = [...zombies].sort((a, b) => {
        const da = Math.hypot(a.x - playerState.x, a.z - playerState.z);
        const db = Math.hypot(b.x - playerState.x, b.z - playerState.z);
        return da - db;
      });

      // Zombie 1: terdekat ke pemain (< 40 unit) selalu diberi huruf benar
      setZombieLetter(sorted[0], needed);

      // Zombie 2: pilih zombie lain (misal di zona lain) untuk huruf benar kedua
      const secondCorrectIdx = Math.min(sorted.length - 1, 2 + Math.floor(Math.random() * (sorted.length - 2)));
      setZombieLetter(sorted[secondCorrectIdx], needed);

      // Zombie lainnya diberi huruf pengecoh
      sorted.forEach((z, idx) => {
        if (idx !== 0 && idx !== secondCorrectIdx) {
          setZombieLetter(z, getRandomDistractor(needed));
        }
        z.model.hintRing.visible = false;
      });

      ensureCorrectLetterAmongZombies();
    }

    export function spawnZombie(zoneHint = -1) {
      const needed = getNeededLetter();
      const currentCorrectCount = zombies.filter(z => z.letter === needed).length;
      const letter = currentCorrectCount < 2 ? needed : getRandomDistractor(needed);

      const model = createCuteZombieMesh(letter);

      // Tentukan posisi muncul di salah satu dari 5 zona pulau luas
      let zx = 0, zz = 12;
      let inMaze = false;

      // Jika ada slot di labirin dan belum ada zombie di tengah labirin
      const hasMazeZombie = zombies.some(z => z.inMaze);
      if (!hasMazeZombie && (zoneHint === 4 || (zoneHint === -1 && Math.random() < 0.2))) {
        zx = MAZE.cx;
        zz = MAZE.cz;
        inMaze = true;
      } else {
        // Pilih salah satu zona
        let zIdx = zoneHint >= 0 ? (zoneHint % ZONES.length) : Math.floor(Math.random() * ZONES.length);
        const zn = ZONES[zIdx];
        let foundSpot = false;
        for (let tries = 0; tries < 30; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * Math.min(zn.rx, zn.rz);
          const px = zn.x + Math.cos(a) * r;
          const pz = zn.z + Math.sin(a) * r;
          if (isFreeSpot(px, pz, 1.0) && Math.hypot(px - playerState.x, pz - playerState.z) > 7) {
            zx = px;
            zz = pz;
            foundSpot = true;
            break;
          }
        }
        if (!foundSpot) {
          const land = findNearestLand(zn.x, zn.z);
          zx = land.x;
          zz = land.z;
        }
      }

      model.root.position.set(zx, 0, zz);
      sceneRefs.scene.add(model.root);
      spawnPuffParticles(zx, 1.2, zz, 10);

      const initialAngle = Math.atan2(playerState.x - zx, playerState.z - zz);
      model.root.rotation.y = initialAngle;

      zombies.push({
        model,
        boardMesh: model.boardMesh,
        letter,
        x: zx,
        y: 0,
        z: zz,
        rotY: initialAngle,
        targetRotY: initialAngle,
        moveDirX: Math.sin(initialAngle),
        moveDirZ: Math.cos(initialAngle),
        wanderTimer: 1.5 + Math.random() * 2.5,
        pauseTimer: 0,
        fleeTimer: 0,
        walkPhase: Math.random() * 10,
        inMaze
      });
    }

    export function clearAllZombies() {
      while (zombies.length > 0) {
        const z = zombies.pop();
        sceneRefs.scene.remove(z.model.root);
      }
    }


// Update Perilaku & Animasi Semua Zombie
export function updateZombies(dt, isPlaying = true) {
  if (!isPlaying) {
    zombies.forEach(z => {
      z.walkPhase += dt * 4;
      z.x += z.moveDirX * 1.8 * dt;
      z.z += z.moveDirZ * 1.8 * dt;
      const r = Math.hypot(z.x, z.z);
      if (r > 20 || nearWater(z.x, z.z, 2.5)) {
        const toCenterAngle = Math.atan2(-z.x, -z.z) + (Math.random() - 0.5) * 0.8;
        z.moveDirX = Math.sin(toCenterAngle);
        z.moveDirZ = Math.cos(toCenterAngle);
      }
      z.targetRotY = Math.atan2(z.moveDirX, z.moveDirZ);
      z.rotY = lerpAngle(z.rotY, z.targetRotY, dt * 8);
      z.model.root.position.set(z.x, 0, z.z);
      z.model.root.rotation.y = z.rotY;
      alignBillboardToCamera(z.boardMesh);
    });
    return;
  }

  const modeCfg = MODE_CONFIG[selectionState.mode];
  const neededLetter = getNeededLetter();
  ensureCorrectLetterAmongZombies();

  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    const prevX = z.x, prevZ = z.z;
    const dxToPlayer = playerState.x - z.x;
    const dzToPlayer = playerState.z - z.z;
    const distToPlayer = Math.hypot(dxToPlayer, dzToPlayer);
    let isMoving = false;
    let currentMoveSpeed = 0;

    if (z.fleeTimer > 0) {
      z.fleeTimer -= dt;
      currentMoveSpeed = modeCfg.speed * 1.45;
      z.x += z.moveDirX * currentMoveSpeed * dt;
      z.z += z.moveDirZ * currentMoveSpeed * dt;
      z.targetRotY = Math.atan2(z.moveDirX, z.moveDirZ);
      isMoving = true;
    } else if (modeCfg.chaseDist > 0 && distToPlayer < modeCfg.chaseDist && !z.inMaze) {
      if (distToPlayer > 0.01) {
        z.moveDirX = dxToPlayer / distToPlayer;
        z.moveDirZ = dzToPlayer / distToPlayer;
      }
      currentMoveSpeed = modeCfg.speed;
      z.x += z.moveDirX * currentMoveSpeed * dt;
      z.z += z.moveDirZ * currentMoveSpeed * dt;
      z.targetRotY = Math.atan2(dxToPlayer, dzToPlayer);
      isMoving = true;
    } else {
      if (z.pauseTimer > 0) {
        z.pauseTimer -= dt;
        z.targetRotY = Math.atan2(dxToPlayer, dzToPlayer);
        isMoving = false;
      } else {
        z.wanderTimer -= dt;
        if (z.wanderTimer <= 0) {
          if (Math.random() < 0.35) {
            z.pauseTimer = 1.0 + Math.random() * 1.2;
            z.wanderTimer = 2.0 + Math.random() * 2.5;
          } else {
            z.wanderTimer = 2.0 + Math.random() * 2.5;
            const newAngle = Math.atan2(z.moveDirX, z.moveDirZ) + (Math.random() - 0.5) * 1.8;
            z.moveDirX = Math.sin(newAngle);
            z.moveDirZ = Math.cos(newAngle);
          }
        }
        currentMoveSpeed = modeCfg.speed * 0.65;
        z.x += z.moveDirX * currentMoveSpeed * dt;
        z.z += z.moveDirZ * currentMoveSpeed * dt;
        z.targetRotY = Math.atan2(z.moveDirX, z.moveDirZ);
        isMoving = true;
      }
    }

    // Pemisahan Antar Zombie
    for (let j = i + 1; j < zombies.length; j++) {
      const z2 = zombies[j];
      const sdx = z.x - z2.x;
      const sdz = z.z - z2.z;
      const sd = Math.hypot(sdx, sdz);
      if (sd < 1.65 && sd > 0.001) {
        const push = (1.65 - sd) * 0.5;
        z.x += (sdx / sd) * push;
        z.z += (sdz / sd) * push;
        z2.x -= (sdx / sd) * push;
        z2.z -= (sdz / sd) * push;
      }
    }

    // Zombie Dilarang Masuk Air & Dilarang Keluar Pulau
    if (nearWater(z.x, z.z, 2.2)) {
      if (!nearWater(prevX, prevZ, 2.2)) {
        // Jangan masuk ke tepi air: kembali ke posisi sebelumnya lalu berbalik arah
        z.x = prevX;
        z.z = prevZ;
        const backAngle = Math.atan2(-z.moveDirX, -z.moveDirZ) + (Math.random() - 0.5) * 1.2;
        z.moveDirX = Math.sin(backAngle);
        z.moveDirZ = Math.cos(backAngle);
      } else {
        // Sudah terlanjur di tepi air: cari daratan terdekat paling sering 1x per detik
        // (findNearestLand sangat mahal, dulu dipanggil setiap frame)
        z.landCheckTimer = (z.landCheckTimer || 0) - dt;
        if (!z.safeLand || z.landCheckTimer <= 0) {
          z.safeLand = findNearestLand(z.x, z.z);
          z.landCheckTimer = 1.0;
        }
        const toSafeAngle = Math.atan2(z.safeLand.x - z.x, z.safeLand.z - z.z);
        z.moveDirX = Math.sin(toSafeAngle);
        z.moveDirZ = Math.cos(toSafeAngle);
      }
    }

    // Zombie Labirin Terkunci di Labirin
    if (z.inMaze) {
      clampToMaze(z);
    }

    // Resolusi Tabrakan Mendatar Zombie dengan Tangga & Rintangan
    resolveColliders(z, z.y, 0.65);

    // Ketinggian Kaki Zombie Sesuai Pijakan
    const zSupp = getSupport(z.x, z.z, z.y);
    z.y = zSupp.h;

    // Interpolasi Sudut Terpendek
    z.rotY = lerpAngle(z.rotY, z.targetRotY, dt * 10);

    // Menggelitik Pemain Bila Tersentuh
    if (distToPlayer < 1.38 && playerState.tickleStunTimer <= 0 && !playerRescue.active) {
      playSound('tickle');
      playerState.tickleStunTimer = 1.0;
      screenState.shakeTime = 0.45;
      const pushAngle = Math.atan2(playerState.x - z.x, playerState.z - z.z);
      playerState.knockbackVx = Math.sin(pushAngle) * 9.5;
      playerState.knockbackVz = Math.cos(pushAngle) * 9.5;
      z.fleeTimer = 1.4;
      const fleeAngle = pushAngle + Math.PI;
      z.moveDirX = Math.sin(fleeAngle);
      z.moveDirZ = Math.cos(fleeAngle);
      z.targetRotY = Math.atan2(z.moveDirX, z.moveDirZ);
      showToast('Hihihi! Geli! Zombie menggelitikmu! 😆');
    }

    // Animasi Berjalan Lucu
    if (isMoving) {
      z.walkPhase += dt * (currentMoveSpeed * 2.6 + 2.0);
      z.model.root.rotation.z = Math.sin(z.walkPhase) * 0.08;
      z.model.leftLeg.rotation.x = Math.sin(z.walkPhase) * 0.55;
      z.model.rightLeg.rotation.x = -Math.sin(z.walkPhase) * 0.55;
    } else {
      z.walkPhase += dt * 3.0;
      z.model.root.rotation.z = Math.sin(z.walkPhase) * 0.03;
      z.model.leftLeg.rotation.x = 0;
      z.model.rightLeg.rotation.x = 0;
    }

    z.model.leftArm.rotation.x = -Math.PI * 0.92 + Math.sin(z.walkPhase) * 0.06;
    z.model.rightArm.rotation.x = -Math.PI * 0.92 - Math.sin(z.walkPhase) * 0.06;

    z.model.root.position.set(z.x, z.y, z.z);
    z.model.root.rotation.y = z.rotY;

    // Papan Huruf Billboard SELALU Menghadap Kamera
    alignBillboardToCamera(z.boardMesh);

    // Lingkaran Kuning Berkedip Bila Membawa Huruf Benar & Bantuan Aktif
    if (roundState.hintActive && z.letter === neededLetter) {
      z.model.hintRing.visible = true;
      const s = 1 + Math.sin(totalTimeRef.t * 7) * 0.15;
      z.model.hintRing.scale.set(s, s, 1);
    } else {
      z.model.hintRing.visible = false;
    }
  }
}
