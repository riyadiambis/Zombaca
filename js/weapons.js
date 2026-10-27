/*************************************************************************
 * WEAPONS.JS - Alat Ajaib, Bidik Otomatis, Proyektil, Partikel, & Hewan
 *************************************************************************/
import { TOOL_CONFIG, MODE_CONFIG, PARTICLE_COLORS } from './config.js';
import {
  saveState, saveProgress, roundState, playerState, selectionState,
  gameStateRef, playerRescue, sceneRefs, zombies, projectiles, particles,
  hoppingAnimals
} from './state.js';
import { playSound, speakText, getLetterSpokenName } from './audio.js';
import {
  createCuteAnimalMesh, getNeededLetter, reshuffleAllZombieLetters,
  spawnZombie, ensureCorrectLetterAmongZombies
} from './zombies.js';
import {
  animateFlyingLetterToTile, renderMissionHUD, updateStarHUD,
  startTarget, finishRound, showToast
} from './ui.js';

    /*********************************************************************
     * PARTIKEL (OBJECT POOL + INSTANCEDMESH)
     * Semua puff = 1 draw call, semua confetti = 1 draw call. Objek partikel
     * dipakai ulang dari pool supaya tidak ada geometry/material/objek baru.
     *********************************************************************/
    const PARTICLE_MAX = 160; // slot per jenis (puff / confetti)
    const KIND_PUFF = 0;
    const KIND_CONFETTI = 1;
    const particlePool = [];
    const particleColors = PARTICLE_COLORS.map(c => new THREE.Color(c));
    const _pDummy = new THREE.Object3D();
    let puffInst = null;
    let confettiInst = null;

    function makeParticleInstanced(geo, mat) {
      const m = new THREE.InstancedMesh(geo, mat, PARTICLE_MAX);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Isi warna semua slot sejak awal agar shader langsung dibuat dengan warna per instance
      for (let i = 0; i < PARTICLE_MAX; i++) m.setColorAt(i, particleColors[i % particleColors.length]);
      m.count = 0;
      m.frustumCulled = false;
      sceneRefs.scene.add(m);
      return m;
    }

    function ensureParticleMeshes() {
      if (puffInst) return;
      puffInst = makeParticleInstanced(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshLambertMaterial({ color: 0xFFFFFF })
      );
      confettiInst = makeParticleInstanced(
        new THREE.BoxGeometry(0.32, 0.32, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xFFFFFF })
      );
    }

    function acquireParticle() {
      // Batas total partikel: buang yang paling tua bila penuh
      if (particles.length >= PARTICLE_MAX * 2) particlePool.push(particles.shift());
      const pt = particlePool.pop() || {};
      particles.push(pt);
      return pt;
    }

    export function spawnPuffParticles(x, y, z, count = 16) {
      if (!sceneRefs.scene) return;
      ensureParticleMeshes();
      for (let i = 0; i < count; i++) {
        const pt = acquireParticle();
        const a = Math.random() * Math.PI * 2;
        const spd = 2.5 + Math.random() * 4.5;
        pt.kind = KIND_PUFF;
        pt.colorIdx = i % particleColors.length;
        pt.size = 0.28 + Math.random() * 0.32;
        pt.x = x; pt.y = y; pt.z = z;
        pt.rx = 0; pt.ry = 0;
        pt.vx = Math.cos(a) * spd;
        pt.vy = 2.5 + Math.random() * 4.5;
        pt.vz = Math.sin(a) * spd;
        pt.life = 0.65 + Math.random() * 0.35;
        pt.maxLife = 1.0;
        pt.gravity = 9.5;
      }
    }

    export function spawnConfettiBurst() {
      if (!sceneRefs.scene) return;
      ensureParticleMeshes();
      for (let i = 0; i < 38; i++) {
        const pt = acquireParticle();
        pt.kind = KIND_CONFETTI;
        pt.colorIdx = i % particleColors.length;
        pt.size = 1;
        pt.x = playerState.x + (Math.random() - 0.5) * 6;
        pt.y = playerState.y + 4.5 + Math.random() * 2;
        pt.z = playerState.z + (Math.random() - 0.5) * 6;
        pt.rx = 0; pt.ry = 0;
        pt.vx = (Math.random() - 0.5) * 6;
        pt.vy = 2 + Math.random() * 4;
        pt.vz = (Math.random() - 0.5) * 6;
        pt.life = 1.4;
        pt.maxLife = 1.4;
        pt.gravity = 5.5;
      }
    }

    /*********************************************************************
     * PROYEKTIL (OBJECT POOL, GEOMETRY & MATERIAL DIPAKAI BERSAMA)
     *********************************************************************/
    let projRes = null;
    const projPool = { bubble: [], wand: [] };

    function getProjectileMesh(isBubble) {
      if (!projRes) {
        projRes = {
          bubbleGeo: new THREE.SphereGeometry(0.45, 14, 14),
          bubbleMat: new THREE.MeshLambertMaterial({ color: 0x22D3EE, transparent: true, opacity: 0.78 }),
          wandGeo: new THREE.BoxGeometry(0.5, 0.5, 0.5),
          wandMat: new THREE.MeshLambertMaterial({ color: 0xFACC15 })
        };
      }
      const pool = isBubble ? projPool.bubble : projPool.wand;
      const mesh = pool.pop() || (isBubble
        ? new THREE.Mesh(projRes.bubbleGeo, projRes.bubbleMat)
        : new THREE.Mesh(projRes.wandGeo, projRes.wandMat));
      mesh.userData.isBubble = isBubble;
      mesh.rotation.set(0, 0, 0);
      return mesh;
    }

    function releaseProjectileMesh(mesh) {
      if (sceneRefs.scene) sceneRefs.scene.remove(mesh);
      (mesh.userData.isBubble ? projPool.bubble : projPool.wand).push(mesh);
    }

    export function spawnHoppingAnimal(x, z) {
      const types = ['kelinci', 'ayam', 'kucing'];
      const chosen = types[Math.floor(Math.random() * types.length)];

      // Simpan ke Album Hewan
      saveState.album[chosen] = (saveState.album[chosen] || 0) + 1;
      saveProgress();
      roundState.animalsRescued++;

      const mesh = createCuteAnimalMesh(chosen);
      mesh.position.set(x, 0, z);
      const dirAngle = Math.random() * Math.PI * 2;
      mesh.rotation.y = dirAngle;
      sceneRefs.scene.add(mesh);

      hoppingAnimals.push({
        mesh,
        vx: Math.sin(dirAngle) * 4.8,
        vz: Math.cos(dirAngle) * 4.8,
        time: 0,
        life: 2.3
      });
    }


    export function onCorrectZombieHit(zombie, indexInArray) {
      const hitLetter = zombie.letter;
      const hitIndex = roundState.letterIndex;
      const roundId = roundState.roundId;
      const worldPos = zombie.model.root.position.clone();

      // Efek Puff + Ubah Jadi Hewan Lucu
      playSound('puff');
      spawnPuffParticles(worldPos.x, 1.3, worldPos.z, 20);
      spawnHoppingAnimal(worldPos.x, worldPos.z);

      // Hapus zombie dari daftar
      sceneRefs.scene.remove(zombie.model.root);
      zombies.splice(indexInArray, 1);

      // Majukan indeks huruf target
      roundState.letterIndex++;
      roundState.targetTimer = 0;
      roundState.hintActive = false;
      sceneRefs.helpArrowGroup.visible = false;

      const isTargetComplete = roundState.letterIndex >= roundState.targetObj.text.length;
      const letterSpoken = getLetterSpokenName(hitLetter);
      const fullTextLower = roundState.targetObj.text.toLowerCase();

      // Animasi huruf terbang ke panel misi
      animateFlyingLetterToTile(worldPos, hitLetter, hitIndex, () => {
        playSound('ting');
        renderMissionHUD();
        const filledTile = document.getElementById(`mission-tile-${hitIndex}`);
        if (filledTile) filledTile.classList.add('pop-anim');
      });

      // Susun ucapan sesuai aturan: nama huruf + suku kata tiap 2 huruf + kata lengkap
      if (!isTargetComplete) {
        if (roundState.letterIndex % 2 === 0) {
          const syl = fullTextLower.slice(roundState.letterIndex - 2, roundState.letterIndex);
          speakText(`${letterSpoken}... ${syl}!`);
        } else {
          speakText(`${letterSpoken}!`);
        }

        // Acak ulang papan huruf semua zombie untuk huruf berikutnya
        reshuffleAllZombieLetters();

        // Jadwalkan zombie baru muncul agar jumlah tetap sesuai mode
        const delayMs = MODE_CONFIG[selectionState.mode].respawnDelay * 1000;
        setTimeout(() => {
          if (roundState.roundId !== roundId) return;
          if (gameStateRef.current === 'PLAYING' && zombies.length < MODE_CONFIG[selectionState.mode].count) {
            spawnZombie(-1);
            ensureCorrectLetterAmongZombies();
          }
        }, delayMs);
      } else {
        // TARGET SELESAI!
        setTimeout(() => {
          playSound('winTarget');
          spawnConfettiBurst();

          // Tambah 1 Bintang
          saveState.stars++;
          saveProgress();
          updateStarHUD(true);

          // Rekam target yang selesai
          if (!roundState.completedTargets) roundState.completedTargets = [];
          roundState.completedTargets.push(roundState.targetObj);

          // Ucapan lengkap fonik/kata
          if (roundState.targetObj.text.length === 4) {
            const syl1 = fullTextLower.slice(0, 2);
            const syl2 = fullTextLower.slice(2, 4);
            speakText(`${letterSpoken}... ${syl2}! ${syl1}... ${syl2}... ${fullTextLower}! Hebat! ${fullTextLower}!`);
          } else if (roundState.targetObj.text.length === 2) {
            speakText(`${letterSpoken}... ${fullTextLower}! Hebat! ${fullTextLower}!`);
          } else {
            speakText(`${letterSpoken}! Hebat! Huruf ${letterSpoken}!`);
          }

          // Perayaan kecil setiap kelipatan 5 target selesai (kalau total target N > 5)
          const completedCount = roundState.targetIndex + 1;
          const totalTargets = roundState.targets.length;
          if (totalTargets > 5 && completedCount % 5 === 0 && completedCount < totalTargets) {
            setTimeout(() => {
              if (roundState.roundId !== roundId) return;
              showToast(`🎉 Hebat! Sudah ${completedCount}!`);
              speakText(`Hebat! Sudah ${completedCount}!`);
              spawnConfettiBurst();
            }, 1200);
          }

          // Tampilkan Emoji / Kata Besar Sebentar di Tengah Layar
          const celebBox = document.getElementById('center-celebration');
          document.getElementById('celeb-emoji').textContent = roundState.targetObj.emoji || '🌟';
          document.getElementById('celeb-word').textContent = `${roundState.targetObj.text}!`;
          celebBox.classList.add('show');

          setTimeout(() => {
            celebBox.classList.remove('show');
            // Abaikan bila pemain sudah keluar atau sudah memulai ronde baru
            if (gameStateRef.current !== 'PLAYING' || roundState.roundId !== roundId) return;

            if (roundState.targetIndex + 1 < roundState.targets.length) {
              // Pastikan jumlah zombie penuh kembali
              while (zombies.length < MODE_CONFIG[selectionState.mode].count) {
                spawnZombie(-1);
              }
              startTarget(roundState.targetIndex + 1);
            } else {
              finishRound();
            }
          }, 2300);
        }, 480);
      }
    }

    export function onWrongZombieHit(zombie) {
      playSound('wrong');
      const wrongSpoken = getLetterSpokenName(zombie.letter);
      const neededChar = getNeededLetter();
      const neededSpoken = getLetterSpokenName(neededChar);

      // Zombie tertawa dan lari menjauh sebentar (wajah menghadap arah larinya)
      zombie.fleeTimer = 2.2;
      zombie.pauseTimer = 0;
      const awayX = zombie.x - playerState.x;
      const awayZ = zombie.z - playerState.z;
      const awayLen = Math.hypot(awayX, awayZ) || 1;
      zombie.moveDirX = awayX / awayLen;
      zombie.moveDirZ = awayZ / awayLen;
      zombie.targetRotY = Math.atan2(zombie.moveDirX, zombie.moveDirZ);

      showToast(`Ini huruf ${zombie.letter}. Cari huruf ${neededChar} ya!`);
      speakText(`Ini huruf ${wrongSpoken}. Cari huruf ${neededSpoken} ya!`);
    }


    export function findBestTargetZombie() {
      const tool = TOOL_CONFIG[selectionState.tool];
      const maxRange = tool.range;
      const forwardX = Math.sin(playerState.rotY);
      const forwardZ = Math.cos(playerState.rotY);

      let bestZombie = null;
      let bestScore = Infinity;

      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        const dx = z.x - playerState.x;
        const dz = z.z - playerState.z;
        const dist = Math.hypot(dx, dz);
        if (dist > maxRange) continue;

        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        const dot = forwardX * nx + forwardZ * nz;

        // Di depan karakter (atau sangat dekat di sekitar karakter agar ramah anak)
        if (dot > -0.15 || dist < 6.0) {
          const score = dist - dot * 2.5;
          if (score < bestScore) {
            bestScore = score;
            bestZombie = z;
          }
        }
      }
      return bestZombie;
    }

    export function useMagicTool() {
      if (gameStateRef.current !== 'PLAYING') return;
      if (playerState.shootCooldown > 0 || playerState.tickleStunTimer > 0 || playerRescue.active) return;

      playerState.shootCooldown = 0.45; // Jeda tembak 0.45 detik
      playerState.toolSwingTimer = 0.32;

      const targetZ = findBestTargetZombie();
      if (targetZ) {
        // Arahkan karakter ke zombie yang dibidik otomatis
        playerState.rotY = Math.atan2(targetZ.x - playerState.x, targetZ.z - playerState.z);
      }

      if (selectionState.tool === 'hammer') {
        // Palu Bantal: pukulan jarak dekat ke depan dengan efek area empuk
        playSound('hammer');
        const hitX = playerState.x + Math.sin(playerState.rotY) * 2.6;
        const hitZ = playerState.z + Math.cos(playerState.rotY) * 2.6;
        spawnPuffParticles(hitX, playerState.y + 0.8, hitZ, 12);

        let hitIndex = -1;
        let closestDist = 5.4;
        for (let i = 0; i < zombies.length; i++) {
          const z = zombies[i];
          const d = Math.hypot(z.x - hitX, z.z - hitZ);
          if (d < closestDist) {
            closestDist = d;
            hitIndex = i;
          }
        }
        if (hitIndex !== -1) {
          const z = zombies[hitIndex];
          if (z.letter === getNeededLetter()) {
            onCorrectZombieHit(z, hitIndex);
          } else {
            onWrongZombieHit(z);
          }
        }
      } else {
        // Pistol Gelembung atau Tongkat Bintang
        playSound(selectionState.tool);
        const isBubble = selectionState.tool === 'bubble';
        const projMesh = getProjectileMesh(isBubble);

        const startX = playerState.x + Math.sin(playerState.rotY) * 1.1;
        const startZ = playerState.z + Math.cos(playerState.rotY) * 1.1;
        projMesh.position.set(startX, playerState.y + 1.4, startZ);
        sceneRefs.scene.add(projMesh);

        const spd = TOOL_CONFIG[selectionState.tool].projSpeed;
        projectiles.push({
          mesh: projMesh,
          vx: Math.sin(playerState.rotY) * spd,
          vy: 0,
          vz: Math.cos(playerState.rotY) * spd,
          target: targetZ,
          life: 2.0,
          bounced: false
        });
      }
    }


// Update Pergerakan & Tumbukan Proyektil Alat Ajaib
export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      releaseProjectileMesh(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }

    if (!p.bounced && p.target && zombies.includes(p.target)) {
      const tx = p.target.x - p.mesh.position.x;
      const tz = p.target.z - p.mesh.position.z;
      const d = Math.hypot(tx, tz);
      if (d > 0.1) {
        const spd = TOOL_CONFIG[selectionState.tool].projSpeed;
        p.vx = (tx / d) * spd;
        p.vz = (tz / d) * spd;
      }
    }

    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.y += dt * 6;
    p.mesh.rotation.x += dt * 4;

    if (!p.bounced) {
      for (let j = 0; j < zombies.length; j++) {
        const z = zombies[j];
        const dist = Math.hypot(p.mesh.position.x - z.x, p.mesh.position.z - z.z);
        if (dist < 1.25) {
          if (z.letter === getNeededLetter()) {
            releaseProjectileMesh(p.mesh);
            projectiles.splice(i, 1);
            onCorrectZombieHit(z, j);
          } else {
            p.bounced = true;
            p.vx = -p.vx * 0.55;
            p.vz = -p.vz * 0.55;
            p.vy = 6.5;
            p.life = 0.45;
            onWrongZombieHit(z);
          }
          break;
        }
      }
    } else {
      p.vy -= 18 * dt;
    }
  }
}

// Update Partikel Puff & Confetti (tulis matriks instance; tanpa alokasi)
export function updateParticles(dt) {
  if (!puffInst) return;
  let nPuff = 0, nConf = 0;
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      particlePool.push(pt);
      particles.splice(i, 1);
      continue;
    }
    pt.vy -= pt.gravity * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.z += pt.vz * dt;
    pt.rx += dt * 5;
    pt.ry += dt * 5;
    const inst = pt.kind === KIND_CONFETTI ? confettiInst : puffInst;
    const idx = pt.kind === KIND_CONFETTI ? nConf++ : nPuff++;
    if (idx >= PARTICLE_MAX) continue;
    const sc = Math.max(0.05, pt.life / pt.maxLife) * pt.size;
    _pDummy.position.set(pt.x, pt.y, pt.z);
    _pDummy.rotation.set(pt.rx, pt.ry, 0);
    _pDummy.scale.set(sc, sc, sc);
    _pDummy.updateMatrix();
    inst.setMatrixAt(idx, _pDummy.matrix);
    inst.setColorAt(idx, particleColors[pt.colorIdx]);
  }
  puffInst.count = Math.min(nPuff, PARTICLE_MAX);
  confettiInst.count = Math.min(nConf, PARTICLE_MAX);
  puffInst.instanceMatrix.needsUpdate = true;
  confettiInst.instanceMatrix.needsUpdate = true;
  if (puffInst.instanceColor) puffInst.instanceColor.needsUpdate = true;
  if (confettiInst.instanceColor) confettiInst.instanceColor.needsUpdate = true;
}

// Update Hewan Balok Lucu yang Melompat Bebas
export function updateHoppingAnimals(dt) {
  for (let i = hoppingAnimals.length - 1; i >= 0; i--) {
    const an = hoppingAnimals[i];
    an.life -= dt;
    an.time += dt * 10;
    if (an.life <= 0) {
      if (sceneRefs.scene) sceneRefs.scene.remove(an.mesh);
      hoppingAnimals.splice(i, 1);
      continue;
    }
    an.mesh.position.x += an.vx * dt;
    an.mesh.position.z += an.vz * dt;
    an.mesh.position.y = Math.abs(Math.sin(an.time)) * 1.15;
    if (an.life < 0.4) {
      const s = an.life / 0.4;
      an.mesh.scale.set(s, s, s);
    }
  }
}
