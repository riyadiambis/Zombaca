/*************************************************************************
 * ZOMBIES.JS - Zombie Lucu, AI, Papan Huruf Billboard, & Hewan Balok
 *************************************************************************/
import { ALLOWED_LETTERS, MODE_CONFIG, MAZE, ZONES, STEP_H, PLAYER_SPEED } from './config.js';
import {
  zombies, playerState, roundState, selectionState, screenState,
  totalTimeRef, sceneRefs, playerRescue
} from './state.js';
import {
  isFreeSpot, findNearestLand, nearWater, resolveColliders,
  getSupport, lerpAngle, clampToMaze, insideIsland, blockedForWalker
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
      // Syarat: minimal 15 unit dari pemain dan minimal 8 unit dari zombie lain
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

        for (let tries = 0; tries < 50; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * Math.min(zn.rx, zn.rz);
          const px = zn.x + Math.cos(a) * r;
          const pz = zn.z + Math.sin(a) * r;
          const distToPlayer = Math.hypot(px - playerState.x, pz - playerState.z);
          const tooCloseToOther = zombies.some(other => Math.hypot(px - other.x, pz - other.z) < 8.0);

          if (distToPlayer >= 15.0 && !tooCloseToOther && isFreeSpot(px, pz, 1.0)) {
            zx = px;
            zz = pz;
            foundSpot = true;
            break;
          }
        }

        // Fallback: cari di zona lain bila zona saat ini padat
        if (!foundSpot) {
          for (let fTries = 0; fTries < 40; fTries++) {
            const altZone = ZONES[Math.floor(Math.random() * ZONES.length)];
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * Math.min(altZone.rx, altZone.rz);
            const px = altZone.x + Math.cos(a) * r;
            const pz = altZone.z + Math.sin(a) * r;
            const distToPlayer = Math.hypot(px - playerState.x, pz - playerState.z);
            const tooCloseToOther = zombies.some(other => Math.hypot(px - other.x, pz - other.z) < 8.0);

            if (distToPlayer >= 15.0 && !tooCloseToOther && isFreeSpot(px, pz, 1.0)) {
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
      }

      model.root.position.set(zx, 0, zz);
      sceneRefs.scene.add(model.root);
      spawnPuffParticles(zx, 1.2, zz, 10);

      const initialAngle = Math.atan2(playerState.x - zx, playerState.z - zz) + Math.PI; // hadap menjauh/netral
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
        state: 'WANDER', // 'WANDER' | 'FLEE' | 'TIRED'
        wanderTimer: 1.5 + Math.random() * 2.5,
        pauseTimer: 0,
        actionTimer: 0,
        actionType: 'none',
        fleeTimer: 0,
        tiredTimer: 0,
        fleeCooldown: 0,
        sweatTimer: 0,
        lastLaughTime: 0,
        zigzagPhase: Math.random() * Math.PI * 2,
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
// ---------- Arah kabur yang aman ----------
const FLEE_STEER_INTERVAL = 0.125;
const FLEE_LOOK_AHEAD = 2.6;
// Belokan yang dicoba berurutan: lurus, lalu makin menyamping (maks ~160 derajat)
const FLEE_OFFSETS = [0, Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.7, Math.PI * 0.9];

function fleeSpotOk(x, z, zb) {
  if (!zb.inMaze && (!insideIsland(x, z, 3.2) || nearWater(x, z, 2.2))) return false;
  return !blockedForWalker(x, z, 0.85, zb.y);
}

// Mengembalikan sudut belok (radian) dari arah menjauhi pemain, atau null bila terpojok.
// Sisi belokan sebelumnya diutamakan agar zombie tidak goyang kiri-kanan di depan rintangan.
function chooseFleeOffset(z, baseAngle) {
  const prevSide = z.steerOffset > 0 ? 1 : (z.steerOffset < 0 ? -1 : 0);
  for (let k = 0; k < FLEE_OFFSETS.length; k++) {
    const off = FLEE_OFFSETS[k];
    if (off === 0) {
      if (fleeSpotOk(z.x + Math.sin(baseAngle) * FLEE_LOOK_AHEAD, z.z + Math.cos(baseAngle) * FLEE_LOOK_AHEAD, z)) return 0;
      continue;
    }
    const first = prevSide !== 0 ? prevSide : (Math.random() < 0.5 ? 1 : -1);
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? first : -first;
      const a = baseAngle + off * side;
      if (fleeSpotOk(z.x + Math.sin(a) * FLEE_LOOK_AHEAD, z.z + Math.cos(a) * FLEE_LOOK_AHEAD, z)) return off * side;
    }
  }
  return null;
}

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
    const isCorrectLetter = (z.letter === neededLetter);

    // Cooldown kabur
    if (z.fleeCooldown > 0) z.fleeCooldown -= dt;

    // Bantuan Otomatis (setelah 15 detik): zombie huruf benar berhenti kabur & langsung capek sampai tertangkap
    const hintHold = roundState.hintActive && isCorrectLetter;
    if (hintHold) {
      z.state = 'TIRED';
      z.hintTired = true;
    } else if (z.hintTired) {
      // Bantuan selesai (target berganti): capek biasa lalu kembali jalan-jalan
      z.hintTired = false;
      z.tiredTimer = modeCfg.tiredDuration;
    }

    const dxToPlayer = playerState.x - z.x;
    const dzToPlayer = playerState.z - z.z;
    const distToPlayer = Math.hypot(dxToPlayer, dzToPlayer);

    let isMoving = false;
    let currentMoveSpeed = 0;

    // 1. TRANSISI STATE MACHINE
    if (z.state === 'WANDER') {
      // Masuk jarak waspada -> kabur menjauh sambil tertawa
      if (distToPlayer < modeCfg.alertDist && z.fleeCooldown <= 0 && !hintHold) {
        z.state = 'FLEE';
        z.fleeTimer = modeCfg.fleeDuration;
        z.zigzagPhase = Math.random() * Math.PI * 2;
        if (!z.lastLaughTime || totalTimeRef.t - z.lastLaughTime > 3.0) {
          playSound('tickle');
          z.lastLaughTime = totalTimeRef.t;
        }
      }
    } else if (z.state === 'FLEE') {
      z.fleeTimer -= dt;
      if (z.fleeTimer <= 0) {
        // Selesai kabur -> masuk fase CAPEK
        z.state = 'TIRED';
        const extraTired = isCorrectLetter ? 1.0 : 0.0;
        z.tiredTimer = modeCfg.tiredDuration + extraTired;
        z.sweatTimer = 0;
      }
    } else if (z.state === 'TIRED') {
      if (!hintHold) {
        z.tiredTimer -= dt;
        if (z.tiredTimer <= 0) {
          // Selesai capek -> kembali jalan-jalan
          z.state = 'WANDER';
          z.wanderTimer = 2.0 + Math.random() * 2.5;
          z.pauseTimer = 0;
          z.fleeCooldown = 2.5; // jeda sebelum bisa kabur lagi
        }
      }
    }

    // 2. LOGIKA GERAK & ANIMASI SESUAI STATE
    if (z.state === 'FLEE') {
      // Kecepatan kabur: zombie huruf benar 80% dari kecepatan mode, tidak melebihi kecepatan pemain
      let fleeSpeed = PLAYER_SPEED * modeCfg.fleeRatio;
      if (isCorrectLetter) fleeSpeed *= 0.8;
      fleeSpeed = Math.min(fleeSpeed, PLAYER_SPEED);

      // Arah dasar: menjauh dari pemain
      let fleeAngle = Math.atan2(z.x - playerState.x, z.z - playerState.z);

      // Mode Seru: zig-zag
      if (modeCfg.zigzag) {
        z.zigzagPhase += dt * 8.0;
        fleeAngle += Math.sin(z.zigzagPhase) * 0.55;
      }

      // Hindari air, rintangan, rumah & tepi pulau. Dicek 8x per detik
      // (bukan tiap frame); belokan terpilih dipakai sampai cek berikutnya.
      z.steerTimer = (z.steerTimer || 0) - dt;
      if (z.steerTimer <= 0) {
        z.steerTimer = FLEE_STEER_INTERVAL;
        z.steerOffset = chooseFleeOffset(z, fleeAngle);
      }

      if (z.steerOffset === null) {
        // Terpojok di semua arah: berhenti dan langsung capek (tidak berbalik ke arah pemain)
        z.state = 'TIRED';
        z.tiredTimer = modeCfg.tiredDuration + (isCorrectLetter ? 1.0 : 0.0);
        z.sweatTimer = 0;
        z.steerOffset = 0;
      } else {
        fleeAngle += z.steerOffset;
        z.moveDirX = Math.sin(fleeAngle);
        z.moveDirZ = Math.cos(fleeAngle);
        z.x += z.moveDirX * fleeSpeed * dt;
        z.z += z.moveDirZ * fleeSpeed * dt;
        z.targetRotY = fleeAngle;
        currentMoveSpeed = fleeSpeed;
        isMoving = true;
      }
    }

    if (z.state === 'TIRED') {
      // Diam di tempat, terengah-engah menghadap ke pemain
      currentMoveSpeed = 0;
      isMoving = false;
      z.targetRotY = Math.atan2(dxToPlayer, dzToPlayer);

      // Partikel keringat kecil / puff saat capek
      z.sweatTimer += dt;
      if (z.sweatTimer > 0.65) {
        z.sweatTimer = 0;
        spawnPuffParticles(z.x, z.y + 1.85, z.z, 2, [0x38BDF8, 0x67E8F9]);
      }

    } else if (z.state === 'WANDER') {
      if (z.pauseTimer > 0) {
        z.pauseTimer -= dt;
        isMoving = false;
        currentMoveSpeed = 0;
        z.actionTimer += dt;
        if (z.actionType === 'wave') {
          z.model.rightArm.rotation.x = -Math.PI * 0.85;
          z.model.rightArm.rotation.z = Math.sin(z.actionTimer * 6) * 0.35;
          z.model.leftArm.rotation.x = -Math.PI * 0.2;
        } else if (z.actionType === 'dance') {
          z.model.root.rotation.z = Math.sin(z.actionTimer * 5) * 0.14;
          z.model.leftArm.rotation.x = -Math.PI * 0.5 + Math.sin(z.actionTimer * 5) * 0.3;
          z.model.rightArm.rotation.x = -Math.PI * 0.5 - Math.sin(z.actionTimer * 5) * 0.3;
        }
      } else {
        z.wanderTimer -= dt;
        if (z.wanderTimer <= 0) {
          if (Math.random() < 0.4) {
            z.pauseTimer = 1.2 + Math.random() * 1.5;
            z.wanderTimer = 2.5 + Math.random() * 3.0;
            z.actionTimer = 0;
            z.actionType = Math.random() < 0.5 ? 'wave' : 'dance';
          } else {
            z.wanderTimer = 2.5 + Math.random() * 3.0;
            const newAngle = Math.atan2(z.moveDirX, z.moveDirZ) + (Math.random() - 0.5) * 1.6;
            z.moveDirX = Math.sin(newAngle);
            z.moveDirZ = Math.cos(newAngle);
            z.actionType = 'none';
          }
        }
        // Jalan-jalan tidak pernah mengarah ke pemain yang sudah dekat
        if (distToPlayer < modeCfg.alertDist + 6 && distToPlayer > 0.01 &&
            (z.moveDirX * dxToPlayer + z.moveDirZ * dzToPlayer) > 0.3 * distToPlayer) {
          const awayAngle = Math.atan2(-dxToPlayer, -dzToPlayer) + (Math.random() - 0.5) * 1.2;
          z.moveDirX = Math.sin(awayAngle);
          z.moveDirZ = Math.cos(awayAngle);
        }
        currentMoveSpeed = 1.6;
        z.x += z.moveDirX * currentMoveSpeed * dt;
        z.z += z.moveDirZ * currentMoveSpeed * dt;
        z.targetRotY = Math.atan2(z.moveDirX, z.moveDirZ);
        isMoving = true;
      }
    }

    // 3. PEMISAHAN ANTAR ZOMBIE: jarak < 4 unit saling dorong pelan menjauh
    for (let j = i + 1; j < zombies.length; j++) {
      const z2 = zombies[j];
      const sdx = z.x - z2.x;
      const sdz = z.z - z2.z;
      const sd = Math.hypot(sdx, sdz);
      if (sd < 4.0 && sd > 0.001) {
        const push = (4.0 - sd) * 0.5 * dt * 2.8;
        const nx = sdx / sd;
        const nz = sdz / sd;
        z.x += nx * push;
        z.z += nz * push;
        z2.x -= nx * push;
        z2.z -= nz * push;
      }
    }

    // 4. BATASAN AIR & PULAU
    if (nearWater(z.x, z.z, 2.2)) {
      if (!nearWater(prevX, prevZ, 2.2)) {
        z.x = prevX;
        z.z = prevZ;
        const backAngle = Math.atan2(-z.moveDirX, -z.moveDirZ) + (Math.random() - 0.5) * 1.2;
        z.moveDirX = Math.sin(backAngle);
        z.moveDirZ = Math.cos(backAngle);
      } else {
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

    // Resolusi Tabrakan Mendatar dengan Rintangan & Tangga
    resolveColliders(z, z.y, 0.65);

    // Ketinggian Kaki Zombie Sesuai Pijakan
    const zSupp = getSupport(z.x, z.z, z.y);
    z.y = zSupp.h;

    // Interpolasi Sudut Hadap Terpendek
    z.rotY = lerpAngle(z.rotY, z.targetRotY, dt * 10);

    // 5. ANIMASI BADAN, KAKI & TANGAN
    let tiredYOffset = 0;
    // Lengan kanan miring hanya saat melambai
    if (z.state !== 'WANDER' || z.pauseTimer <= 0 || z.actionType !== 'wave') {
      z.model.rightArm.rotation.z = 0;
    }
    if (z.state === 'TIRED') {
      z.walkPhase += dt * 8.0;
      tiredYOffset = Math.abs(Math.sin(z.walkPhase)) * 0.16; // badan naik-turun terengah-engah
      z.model.leftLeg.rotation.x = 0;
      z.model.rightLeg.rotation.x = 0;
      z.model.root.rotation.z = Math.sin(z.walkPhase * 0.5) * 0.05;
    } else if (isMoving) {
      z.walkPhase += dt * (currentMoveSpeed * 2.6 + 2.0);
      z.model.root.rotation.z = Math.sin(z.walkPhase) * 0.08;
      z.model.leftLeg.rotation.x = Math.sin(z.walkPhase) * 0.55;
      z.model.rightLeg.rotation.x = -Math.sin(z.walkPhase) * 0.55;
      z.model.leftArm.rotation.x = -Math.PI * 0.92 + Math.sin(z.walkPhase) * 0.06;
      z.model.rightArm.rotation.x = -Math.PI * 0.92 - Math.sin(z.walkPhase) * 0.06;
    } else {
      z.walkPhase += dt * 3.0;
      if (z.actionType === 'none') {
        z.model.root.rotation.z = Math.sin(z.walkPhase) * 0.03;
        z.model.leftLeg.rotation.x = 0;
        z.model.rightLeg.rotation.x = 0;
        z.model.leftArm.rotation.x = -Math.PI * 0.92;
        z.model.rightArm.rotation.x = -Math.PI * 0.92;
      }
    }

    z.model.root.position.set(z.x, z.y + tiredYOffset, z.z);
    z.model.root.rotation.y = z.rotY;

    // Papan Huruf Billboard SELALU Menghadap Kamera
    alignBillboardToCamera(z.boardMesh);

    // Lingkaran Kuning Berkedip Bila Membawa Huruf Benar & Bantuan Aktif
    if (roundState.hintActive && isCorrectLetter) {
      z.model.hintRing.visible = true;
      const s = 1 + Math.sin(totalTimeRef.t * 7) * 0.15;
      z.model.hintRing.scale.set(s, s, 1);
    } else {
      z.model.hintRing.visible = false;
    }
  }
}
