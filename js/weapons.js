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

    export function spawnPuffParticles(x, y, z, count = 16) {
      for (let i = 0; i < count; i++) {
        if (particles.length > 100) {
          const old = particles.shift();
          sceneRefs.scene.remove(old.mesh);
        }
        const size = 0.28 + Math.random() * 0.32;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(size, size, size),
          new THREE.MeshLambertMaterial({ color: PARTICLE_COLORS[i % PARTICLE_COLORS.length] })
        );
        mesh.position.set(x, y, z);
        sceneRefs.scene.add(mesh);

        const a = Math.random() * Math.PI * 2;
        const spd = 2.5 + Math.random() * 4.5;
        particles.push({
          mesh,
          vx: Math.cos(a) * spd,
          vy: 2.5 + Math.random() * 4.5,
          vz: Math.sin(a) * spd,
          life: 0.65 + Math.random() * 0.35,
          maxLife: 1.0,
          gravity: 9.5
        });
      }
    }

    export function spawnConfettiBurst() {
      for (let i = 0; i < 38; i++) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.32, 0.12),
          new THREE.MeshBasicMaterial({ color: PARTICLE_COLORS[i % PARTICLE_COLORS.length] })
        );
        mesh.position.set(
          playerState.x + (Math.random() - 0.5) * 6,
          playerState.y + 4.5 + Math.random() * 2,
          playerState.z + (Math.random() - 0.5) * 6
        );
        sceneRefs.scene.add(mesh);
        particles.push({
          mesh,
          vx: (Math.random() - 0.5) * 6,
          vy: 2 + Math.random() * 4,
          vz: (Math.random() - 0.5) * 6,
          life: 1.4,
          maxLife: 1.4,
          gravity: 5.5
        });
      }
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
            if (gameStateRef.current !== 'PLAYING') return;

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
        const projMesh = new THREE.Mesh(
          isBubble
            ? new THREE.SphereGeometry(0.45, 14, 14)
            : new THREE.BoxGeometry(0.5, 0.5, 0.5),
          new THREE.MeshLambertMaterial({
            color: isBubble ? 0x22D3EE : 0xFACC15,
            transparent: isBubble,
            opacity: isBubble ? 0.78 : 1.0
          })
        );

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
      if (sceneRefs.scene) sceneRefs.scene.remove(p.mesh);
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
            if (sceneRefs.scene) sceneRefs.scene.remove(p.mesh);
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

// Update Partikel Puff & Confetti
export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      if (sceneRefs.scene) sceneRefs.scene.remove(pt.mesh);
      particles.splice(i, 1);
      continue;
    }
    pt.vy -= pt.gravity * dt;
    pt.mesh.position.x += pt.vx * dt;
    pt.mesh.position.y += pt.vy * dt;
    pt.mesh.position.z += pt.vz * dt;
    pt.mesh.rotation.x += dt * 5;
    pt.mesh.rotation.y += dt * 5;
    const sc = Math.max(0.05, pt.life / pt.maxLife);
    pt.mesh.scale.set(sc, sc, sc);
  }
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
