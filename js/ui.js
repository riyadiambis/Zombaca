/*************************************************************************
 * UI.JS - Layar Menu, HUD Misi, Mini Map 140px, Notifikasi Toast, & Album
 *************************************************************************/
import { LEVEL_DATA, MODE_CONFIG, TOOL_CONFIG, MAZE, ZONES, RIVER_HALF, LAKE } from './config.js';
import {
  saveState, saveProgress, saveTargetCount, roundState, playerState, selectionState,
  gameStateRef, cameraState, camControl, totalTimeRef, sceneRefs,
  playerRescue, zombies
} from './state.js';
import { islandRadiusAt, worldInfo, riverCenterZ } from './world.js';
import { playSound, speakText, getLetterSpokenName, toggleMusic } from './audio.js';
import { rebuildPlayerModel, refreshPreviewHatsAndTools } from './characters.js';
import { resetCameraBehindPlayer, toggleCamMenu, setCameraMode } from './camera.js';
import { qualityState, setQualityPref } from './quality.js';
import {
  getNeededLetter, clearAllZombies, spawnZombie,
  ensureCorrectLetterAmongZombies, reshuffleAllZombieLetters
} from './zombies.js';

export let minimapCanvas = null;
export let minimapCtx = null;
let miniMapBgCanvas = null;

    // Gambar latar pulau statis satu kali ke offscreen canvas untuk performa tinggi
    export function buildMinimapBase() {
      if (!minimapCanvas && typeof document !== 'undefined') {
        minimapCanvas = document.getElementById('minimap-canvas');
        if (minimapCanvas) {
          minimapCtx = minimapCanvas.getContext('2d');
          sceneRefs.minimapCanvas = minimapCanvas;
          sceneRefs.minimapCtx = minimapCtx;
        }
      }
      miniMapBgCanvas = document.createElement('canvas');
      miniMapBgCanvas.width = 140;
      miniMapBgCanvas.height = 140;
      const mctx = miniMapBgCanvas.getContext('2d');
      if (!mctx) return;

      const cx = 70, cy = 70;
      const scale = 140 / 175; // Rentang ~175 unit mencakup seluruh pulau 160x160

      // Laut latar
      mctx.fillStyle = '#0EA5E9';
      mctx.beginPath();
      mctx.arc(cx, cy, 68, 0, Math.PI * 2);
      mctx.fill();

      // Pasir pantai mengikuti bentuk pulau tidak bulat
      mctx.beginPath();
      for (let i = 0; i < 90; i++) {
        const t = (i / 90) * Math.PI * 2;
        const r = (islandRadiusAt(t) + 2.0) * scale;
        const px = cx + Math.cos(t) * r;
        const py = cy + Math.sin(t) * r;
        if (i === 0) mctx.moveTo(px, py); else mctx.lineTo(px, py);
      }
      mctx.closePath();
      mctx.fillStyle = '#FDE047';
      mctx.fill();

      // Rumput hijau pulau
      mctx.beginPath();
      for (let i = 0; i < 90; i++) {
        const t = (i / 90) * Math.PI * 2;
        const r = islandRadiusAt(t) * scale;
        const px = cx + Math.cos(t) * r;
        const py = cy + Math.sin(t) * r;
        if (i === 0) mctx.moveTo(px, py); else mctx.lineTo(px, py);
      }
      mctx.closePath();
      mctx.fillStyle = '#4ADE80';
      mctx.fill();

      // Warna suasana 5 zona
      const drawZoneCircle = (zx, zz, zrx, zrz, color) => {
        mctx.fillStyle = color;
        mctx.beginPath();
        mctx.ellipse(cx + zx * scale, cy + zz * scale, zrx * scale, zrz * scale, 0, 0, Math.PI * 2);
        mctx.fill();
      };
      drawZoneCircle(0, 2, 17, 17, '#7EE8A8');     // Desa
      drawZoneCircle(-46, -12, 27, 30, '#2FB35C'); // Hutan
      drawZoneCircle(-2, -46, 32, 26, '#CFA878');  // Bukit
      drawZoneCircle(56, 8, 22, 22, '#93F0B8');    // Taman
      drawZoneCircle(8, 48, 28, 18, '#6BE39A');    // Danau

      // Garis jalan setapak krem
      mctx.strokeStyle = '#FDE9C0';
      mctx.lineWidth = 3.5;
      mctx.lineCap = 'round';
      mctx.lineJoin = 'round';
      if (worldInfo.pathLines) {
        worldInfo.pathLines.forEach(line => {
          mctx.beginPath();
          line.forEach(([px, pz], idx) => {
            const mx = cx + px * scale, my = cy + pz * scale;
            if (idx === 0) mctx.moveTo(mx, my); else mctx.lineTo(mx, my);
          });
          mctx.stroke();
        });
      }

      // Sungai biru melintang
      mctx.strokeStyle = '#38BDF8';
      mctx.lineWidth = (RIVER_HALF * 2) * scale;
      mctx.beginPath();
      for (let x = -80; x <= 80; x += 4) {
        const z = riverCenterZ(x);
        const mx = cx + x * scale, my = cy + z * scale;
        if (x === -80) mctx.moveTo(mx, my); else mctx.lineTo(mx, my);
      }
      mctx.stroke();

      // Danau biru
      mctx.fillStyle = '#38BDF8';
      mctx.beginPath();
      mctx.ellipse(cx + LAKE.x * scale, cy + LAKE.z * scale, LAKE.rx * scale, LAKE.rz * scale, 0, 0, Math.PI * 2);
      mctx.fill();

      // 2 Jembatan kayu cokelat
      mctx.fillStyle = '#B45309';
      [-20, 24].forEach(bx => {
        const bz = riverCenterZ(bx);
        mctx.fillRect(cx + (bx - 2.2) * scale, cy + (bz - 5) * scale, 4.4 * scale, 10 * scale);
      });

      // Labirin semak kecil di taman bermain
      mctx.fillStyle = '#16A34A';
      mctx.fillRect(cx + (MAZE.cx - 10) * scale, cy + (MAZE.cz - 10) * scale, 20 * scale, 20 * scale);

      // Tingkat bukit
      mctx.fillStyle = '#86EFAC';
      mctx.fillRect(cx + (-12) * scale, cy + (-55) * scale, 19 * scale, 19 * scale);
      mctx.fillStyle = '#BBF7D0';
      mctx.fillRect(cx + (-6.5) * scale, cy + (-50.5) * scale, 9 * scale, 9 * scale);
    }

    export function renderMinimap() {
      if (!minimapCtx || !miniMapBgCanvas) return;
      const w = 140, h = 140, cx = 70, cy = 70;
      const scale = 140 / 175;

      minimapCtx.clearRect(0, 0, 140, 140);
      minimapCtx.save();

      // Mask bulat mini map
      minimapCtx.beginPath();
      minimapCtx.arc(cx, cy, 68, 0, Math.PI * 2);
      minimapCtx.clip();

      // Di mode Kamera Bahu: mini map berputar mengikuti arah kamera
      // Di mode Kamera Atas: mini map diam (tidak berputar)
      if (cameraState.mode === 'shoulder') {
        minimapCtx.translate(cx, cy);
        minimapCtx.rotate(-camControl.yaw + Math.PI);
        minimapCtx.translate(-cx, -cy);
      }

      // Gambar peta dasar
      minimapCtx.drawImage(miniMapBgCanvas, 0, 0);

      // Gambar Raft (Rakit bergerak)
      if (worldInfo && worldInfo.rafts) {
        minimapCtx.fillStyle = '#C2833A';
        worldInfo.rafts.forEach(rf => {
          const rx = cx + rf.pos * scale - 2, rz = cy + rf.zc * scale - 2;
          minimapCtx.fillRect(rx, rz, 4, 4);
        });
      }

      // Gambar Zombie (titik hijau, berkedip kuning jika membawa huruf benar & bantuan aktif)
      const neededChar = getNeededLetter();
      zombies.forEach(z => {
        const zx = cx + z.x * scale;
        const zy = cy + z.z * scale;
        const isTarget = roundState.hintActive && (z.letter === neededChar);

        minimapCtx.beginPath();
        if (isTarget) {
          // Berkedip kuning mencolok
          const pulse = Math.sin(totalTimeRef.t * 8) > 0;
          minimapCtx.fillStyle = pulse ? '#FACC15' : '#FFFFFF';
          minimapCtx.arc(zx, zy, 4.5, 0, Math.PI * 2);
          minimapCtx.fill();
          minimapCtx.strokeStyle = '#EAB308';
          minimapCtx.lineWidth = 2;
          minimapCtx.stroke();
        } else {
          minimapCtx.fillStyle = '#22C55E';
          minimapCtx.arc(zx, zy, 3.2, 0, Math.PI * 2);
          minimapCtx.fill();
          minimapCtx.strokeStyle = '#14532D';
          minimapCtx.lineWidth = 1;
          minimapCtx.stroke();
        }
      });

      // Gambar Pemain (Panah hijau limau mencolok)
      const px = cx + playerState.x * scale;
      const py = cy + playerState.z * scale;

      minimapCtx.save();
      minimapCtx.translate(px, py);
      minimapCtx.rotate(playerState.rotY);

      minimapCtx.fillStyle = '#A3E635';
      minimapCtx.strokeStyle = '#14112B';
      minimapCtx.lineWidth = 2;

      minimapCtx.beginPath();
      minimapCtx.moveTo(0, 6.5);   // depan (sumbu +Z lokal di rotY)
      minimapCtx.lineTo(-4.5, -5); // kiri belakang
      minimapCtx.lineTo(0, -2.5);  // lekukan ekor
      minimapCtx.lineTo(4.5, -5);  // kanan belakang
      minimapCtx.closePath();
      minimapCtx.fill();
      minimapCtx.stroke();

      minimapCtx.restore();
      minimapCtx.restore();

      // Border kaca halus di sekeliling mini map
      minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      minimapCtx.lineWidth = 2.5;
      minimapCtx.beginPath();
      minimapCtx.arc(cx, cy, 68, 0, Math.PI * 2);
      minimapCtx.stroke();
    }


    /*************************************************************************
     * 13. INTI PERMAINAN: TARGET, UBIN HURUF, SUARA, DAN BANTUAN OTOMATIS
     *************************************************************************/
    export function shuffleDeck(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    export function pickRoundTargets(level, count = 5) {
      const pool = LEVEL_DATA[level];
      if (!pool || pool.length === 0) return [];

      const result = [];
      let lastText = null;

      while (result.length < count) {
        let deck = shuffleDeck(pool);
        // Cegah elemen pertama deck sama dengan target terakhir dari kocokan sebelumnya
        if (lastText && deck.length > 1 && deck[0].text === lastText) {
          const swapIdx = 1 + Math.floor(Math.random() * (deck.length - 1));
          [deck[0], deck[swapIdx]] = [deck[swapIdx], deck[0]];
        }

        for (let i = 0; i < deck.length && result.length < count; i++) {
          result.push(deck[i]);
          lastText = deck[i].text;
        }
      }

      return result;
    }

    export function updateTargetCountUI() {
      const count = selectionState.targetCount;
      const numEl = document.getElementById('target-count-number');
      if (numEl) numEl.textContent = count;

      document.querySelectorAll('#quick-target-chips .target-chip').forEach(chip => {
        const val = parseInt(chip.dataset.count, 10);
        chip.classList.toggle('selected', val === count);
      });

      updatePlaytimeEstimate();
    }

    export function updatePlaytimeEstimate() {
      const level = selectionState.level;
      const count = selectionState.targetCount;
      const secPerTarget = level === 1 ? 30 : (level === 2 ? 45 : 90);
      const totalSec = count * secPerTarget;
      const mins = totalSec / 60;
      let text = '';
      if (mins < 1) {
        text = `± ${totalSec} detik`;
      } else {
        const formatted = (mins % 1 === 0) ? mins : mins.toFixed(1);
        text = `± ${formatted} menit`;
      }
      const el = document.getElementById('playtime-text');
      if (el) el.textContent = text;
    }

    export function renderMissionHUD() {
      const emojiEl = document.getElementById('mission-emoji');
      const tilesEl = document.getElementById('mission-tiles');
      const progEl = document.getElementById('round-progress-text');
      const progressBarEl = document.getElementById('mission-progress-bar');

      if (!roundState.targetObj) return;

      if (roundState.targetObj.emoji) {
        emojiEl.textContent = roundState.targetObj.emoji;
        emojiEl.style.display = 'inline-block';
      } else {
        emojiEl.style.display = 'none';
      }

      tilesEl.innerHTML = '';
      const chars = roundState.targetObj.text.split('');
      chars.forEach((ch, idx) => {
        const tile = document.createElement('div');
        tile.className = 'letter-tile';
        tile.id = `mission-tile-${idx}`;
        tile.textContent = ch;
        if (idx < roundState.letterIndex) {
          tile.classList.add('filled', `color-${idx % 4}`);
        } else if (idx === roundState.letterIndex) {
          tile.classList.add('next-target');
        }
        tilesEl.appendChild(tile);
      });

      const totalTargets = roundState.targets.length || 1;
      if (progEl) {
        progEl.textContent = `Target ${roundState.targetIndex + 1} dari ${totalTargets}`;
      }
      if (progressBarEl) {
        const progressPct = ((roundState.targetIndex) / totalTargets) * 100;
        progressBarEl.style.width = `${progressPct}%`;
      }
    }

    export function announceCurrentTarget() {
      if (!roundState.targetObj) return;
      const needed = getNeededLetter();
      const neededName = getLetterSpokenName(needed);

      if (selectionState.level === 1) {
        showToast(`Cari zombie huruf ${needed}!`);
        speakText(`Cari zombie huruf ${neededName}!`);
      } else if (selectionState.level === 2) {
        const syl = roundState.targetObj.text.toLowerCase();
        showToast(`Susun "${ roundState.targetObj.text }" • Cari huruf ${needed}!`);
        if (roundState.letterIndex === 0) {
          speakText(`Ayo susun suku kata ${syl}! Cari zombie huruf ${neededName}!`);
        } else {
          speakText(`Cari zombie huruf ${neededName}!`);
        }
      } else {
        const word = roundState.targetObj.text.toLowerCase();
        showToast(`${roundState.targetObj.emoji} Susun "${roundState.targetObj.text}" • Cari huruf ${needed}!`);
        if (roundState.letterIndex === 0) {
          speakText(`Ayo susun kata ${word}! Cari zombie huruf ${neededName}!`);
        } else {
          speakText(`Cari zombie huruf ${neededName}!`);
        }
      }
    }

    export function startTarget(index) {
      roundState.targetIndex = index;
      roundState.targetObj = roundState.targets[index];
      roundState.letterIndex = 0;
      roundState.targetTimer = 0;
      roundState.hintActive = false;
      sceneRefs.helpArrowGroup.visible = false;

      renderMissionHUD();
      reshuffleAllZombieLetters();
      announceCurrentTarget();
    }

    export function animateFlyingLetterToTile(worldPos, letterChar, tileIndex, onComplete) {
      const v = worldPos.clone();
      v.y += 4.0;
      if (sceneRefs.camera) v.project(sceneRefs.camera);
      const startX = (v.x * 0.5 + 0.5) * window.innerWidth;
      const startY = (-(v.y * 0.5) + 0.5) * window.innerHeight;

      const flyEl = document.createElement('div');
      flyEl.className = 'flying-letter';
      flyEl.textContent = letterChar;
      flyEl.style.left = `${startX - 28}px`;
      flyEl.style.top = `${startY - 28}px`;
      document.body.appendChild(flyEl);

      const targetTile = document.getElementById(`mission-tile-${tileIndex}`);
      const rect = targetTile ? targetTile.getBoundingClientRect() : { left: window.innerWidth / 2, top: 40 };

      requestAnimationFrame(() => {
        flyEl.style.left = `${rect.left}px`;
        flyEl.style.top = `${rect.top}px`;
        flyEl.style.transform = 'scale(1.15)';
      });

      setTimeout(() => {
        flyEl.remove();
        if (onComplete) onComplete();
      }, 540);
    }


export     const screens = {
      start: document.getElementById('screen-start'),
      char: document.getElementById('screen-char'),
      tool: document.getElementById('screen-tool'),
      level: document.getElementById('screen-level'),
      end: document.getElementById('screen-end'),
      album: document.getElementById('screen-album')
    };

    export function showScreen(name) {
      Object.values(screens).forEach(s => {
        if (s) s.classList.remove('active');
      });
      if (name && screens[name]) {
        screens[name].classList.add('active');
      }
      const hud = document.getElementById('hud');
      const backdrop = document.getElementById('menu-backdrop');
      if (name === null) {
        if (hud) hud.classList.add('active');
        if (backdrop) hideMenuBackdrop(backdrop);
      } else {
        if (hud) hud.classList.remove('active');
        if (backdrop) showMenuBackdrop(backdrop);
      }
    }

    // Latar menu (gradien + 3 bulatan blur beranimasi) wajib display:none saat bermain;
    // opacity 0 saja tetap membuat browser menghitung blur dan animasinya.
    let backdropHideTimer = null;
    function hideMenuBackdrop(backdrop) {
      backdrop.classList.add('hidden');
      if (backdropHideTimer) clearTimeout(backdropHideTimer);
      backdropHideTimer = setTimeout(() => {
        if (backdrop.classList.contains('hidden')) backdrop.style.display = 'none';
      }, 380);
    }
    function showMenuBackdrop(backdrop) {
      if (backdropHideTimer) clearTimeout(backdropHideTimer);
      if (backdrop.style.display === 'none') {
        backdrop.style.display = '';
        void backdrop.offsetWidth; // paksa reflow agar transisi opacity tetap berjalan
      }
      backdrop.classList.remove('hidden');
    }

    let toastTimeout = null;
    export function showToast(msg) {
      const el = document.getElementById('toast-msg');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => el.classList.remove('show'), 3200);
    }

    export function updateStarHUD(animateBump = false) {
      const elHud = document.getElementById('hud-star-count');
      const elStart = document.getElementById('start-total-stars');
      if (elHud) elHud.textContent = saveState.stars;
      if (elStart) elStart.textContent = saveState.stars;
      if (animateBump) {
        const pill = document.getElementById('hud-star-pill');
        if (pill) {
          pill.classList.add('bump');
          setTimeout(() => pill.classList.remove('bump'), 320);
        }
      }
      updateHatButtonsUI();
    }

    // Tombol Grafis: Otomatis / Ringan / Tinggi
    export function updateGfxButtonsUI() {
      document.querySelectorAll('#gfx-btn-row .gfx-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.gfx === qualityState.pref);
      });
      const note = document.getElementById('gfx-note');
      if (note) {
        const activeName = qualityState.active === 'ringan' ? 'Ringan' : 'Tinggi';
        note.textContent = qualityState.pref === 'auto'
          ? `Otomatis memakai: ${activeName}`
          : `Grafis ${activeName}`;
      }
    }

    export function updateHatButtonsUI() {
      document.querySelectorAll('#hat-selector .hat-btn').forEach(btn => {
        const cost = parseInt(btn.dataset.cost, 10);
        const hat = btn.dataset.hat;
        btn.classList.toggle('locked', saveState.stars < cost);
        btn.classList.toggle('selected', saveState.hat === hat);
      });
    }

    export function startNewRound() {
      gameStateRef.current = 'PLAYING';
      roundState.roundId++;
      showScreen(null);

      if (sceneRefs.startScreenZombie) {
        sceneRefs.startScreenZombie.root.visible = false;
      }

      playerState.x = 0;
      playerState.y = 0;
      playerState.z = 8;
      playerState.vy = 0;
      playerState.rotY = Math.PI;
      playerState.tickleStunTimer = 0;
      playerState.standingRaft = null;
      playerRescue.active = false;
      rebuildPlayerModel();
      resetCameraBehindPlayer(true);

      const iconEl = document.getElementById('hud-tool-icon');
      if (iconEl && TOOL_CONFIG[selectionState.tool]) {
        iconEl.textContent = TOOL_CONFIG[selectionState.tool].icon;
      }
      updateStarHUD(false);

      roundState.animalsRescued = 0;
      roundState.completedTargets = [];
      roundState.targets = pickRoundTargets(selectionState.level, selectionState.targetCount);
      roundState.targetIndex = 0;
      roundState.targetObj = roundState.targets[0];
      roundState.letterIndex = 0;

      clearAllZombies();
      const targetZombieCount = MODE_CONFIG[selectionState.mode].count;
      for (let i = 0; i < targetZombieCount; i++) {
        spawnZombie(false);
      }

      startTarget(0);
    }

    export function finishRound() {
      gameStateRef.current = 'ROUND_END';
      sceneRefs.targetRingMesh.visible = false;
      sceneRefs.helpArrowGroup.visible = false;

      const savedEl = document.getElementById('end-animals-saved');
      const starsEl = document.getElementById('end-total-stars');
      if (savedEl) savedEl.textContent = roundState.animalsRescued;
      if (starsEl) starsEl.textContent = `${saveState.stars} ⭐ (+${roundState.targets.length} ⭐ di ronde ini)`;

      // Render daftar target yang telah diselesaikan ke dalam grid kartu kaca
      const gridEl = document.getElementById('end-completed-targets');
      if (gridEl) {
        gridEl.innerHTML = '';
        const listToRender = (roundState.completedTargets && roundState.completedTargets.length > 0)
          ? roundState.completedTargets
          : roundState.targets;
        listToRender.forEach((t) => {
          const card = document.createElement('div');
          card.className = 'completed-target-card';
          if (t.emoji) {
            const em = document.createElement('span');
            em.className = 'target-emoji';
            em.textContent = t.emoji;
            card.appendChild(em);
          }
          const txt = document.createElement('span');
          txt.textContent = t.text;
          card.appendChild(txt);
          gridEl.appendChild(card);
        });
      }

      const progressBarEl = document.getElementById('mission-progress-bar');
      if (progressBarEl) progressBarEl.style.width = '100%';

      const s1 = document.getElementById('end-star-1');
      const s2 = document.getElementById('end-star-2');
      const s3 = document.getElementById('end-star-3');
      [s1, s2, s3].forEach(s => { if (s) s.classList.remove('show'); });

      showScreen('end');
      speakText('Hore! Ronde selesai! Kamu hebat sekali!');

      setTimeout(() => { if (s1) s1.classList.add('show'); playSound('ting'); }, 250);
      setTimeout(() => { if (s2) s2.classList.add('show'); playSound('ting'); }, 600);
      setTimeout(() => { if (s3) s3.classList.add('show'); playSound('winTarget'); }, 950);
    }

    export function returnToMainMenu() {
      gameStateRef.current = 'MENU';
      sceneRefs.targetRingMesh.visible = false;
      sceneRefs.helpArrowGroup.visible = false;
      if (sceneRefs.startScreenZombie) {
        sceneRefs.startScreenZombie.root.visible = true;
      }
      updateStarHUD(false);
      showScreen('start');
    }

export function initUI() {
  // Hubungkan elemen layar
  screens.start = document.getElementById('screen-start');
  screens.char = document.getElementById('screen-char');
  screens.tool = document.getElementById('screen-tool');
  screens.level = document.getElementById('screen-level');
  screens.end = document.getElementById('screen-end');
  screens.album = document.getElementById('screen-album');

  // Hubungkan kanvas mini map
  minimapCanvas = document.getElementById('minimap-canvas');
  sceneRefs.minimapCanvas = minimapCanvas;
  if (minimapCanvas) {
    minimapCtx = minimapCanvas.getContext('2d');
    sceneRefs.minimapCtx = minimapCtx;
  }

      // Menu Flow
    const btnGoChar = document.getElementById('btn-go-char');
    if (btnGoChar) {
      btnGoChar.addEventListener('click', () => {
        playSound('click');
        updateHatButtonsUI();
        refreshPreviewHatsAndTools();
        showScreen('char');
        speakText('Pilih temanmu!');
      });
    }

    const btnBackStart = document.getElementById('btn-back-start');
    if (btnBackStart) {
      btnBackStart.addEventListener('click', () => {
        playSound('click');
        returnToMainMenu();
      });
    }

    const btnGoTool = document.getElementById('btn-go-tool');
    if (btnGoTool) {
      btnGoTool.addEventListener('click', () => {
        playSound('click');
        showScreen('tool');
        speakText('Pilih alat ajaibmu!');
      });
    }

    const btnBackChar = document.getElementById('btn-back-char');
    if (btnBackChar) {
      btnBackChar.addEventListener('click', () => {
        playSound('click');
        showScreen('char');
      });
    }

    const btnGoLevel = document.getElementById('btn-go-level');
    if (btnGoLevel) {
      btnGoLevel.addEventListener('click', () => {
        playSound('click');
        showScreen('level');
        speakText('Pilih level dan mode permainan!');
      });
    }

    const btnBackTool = document.getElementById('btn-back-tool');
    if (btnBackTool) {
      btnBackTool.addEventListener('click', () => {
        playSound('click');
        showScreen('tool');
      });
    }

    const btnStartPlay = document.getElementById('btn-start-play');
    if (btnStartPlay) {
      btnStartPlay.addEventListener('click', () => {
        playSound('click');
        startNewRound();
      });
    }

    const btnEndAgain = document.getElementById('btn-end-again');
    if (btnEndAgain) {
      btnEndAgain.addEventListener('click', () => {
        playSound('click');
        startNewRound();
      });
    }

    const btnEndMenu = document.getElementById('btn-end-menu');
    if (btnEndMenu) {
      btnEndMenu.addEventListener('click', () => {
        playSound('click');
        returnToMainMenu();
      });
    }

    // Album Hewan
    const btnOpenAlbum = document.getElementById('btn-open-album');
    if (btnOpenAlbum) {
      btnOpenAlbum.addEventListener('click', () => {
        playSound('click');
        const kEl = document.getElementById('album-count-kelinci');
        const aEl = document.getElementById('album-count-ayam');
        const cEl = document.getElementById('album-count-kucing');
        if (kEl) kEl.textContent = `${saveState.album.kelinci || 0} Diselamatkan`;
        if (aEl) aEl.textContent = `${saveState.album.ayam || 0} Diselamatkan`;
        if (cEl) cEl.textContent = `${saveState.album.kucing || 0} Diselamatkan`;
        showScreen('album');
      });
    }

    const btnCloseAlbum = document.getElementById('btn-close-album');
    if (btnCloseAlbum) {
      btnCloseAlbum.addEventListener('click', () => {
        playSound('click');
        showScreen('start');
      });
    }

    // Pilihan Karakter
    document.querySelectorAll('#char-cards .choice-card').forEach(card => {
      card.addEventListener('click', () => {
        playSound('click');
        document.querySelectorAll('#char-cards .choice-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectionState.char = card.dataset.char;
        speakText(selectionState.char);
      });
    });

    // Pilihan Topi Bonus
    document.querySelectorAll('#hat-selector .hat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cost = parseInt(btn.dataset.cost, 10);
        if (saveState.stars < cost) {
          playSound('wrong');
          speakText(`Kumpulkan ${cost} bintang dulu ya!`);
          return;
        }
        playSound('click');
        saveState.hat = btn.dataset.hat;
        saveProgress();
        updateHatButtonsUI();
        refreshPreviewHatsAndTools();
      });
    });

    // Pilihan Alat Ajaib
    document.querySelectorAll('#tool-cards .choice-card').forEach(card => {
      card.addEventListener('click', () => {
        playSound('click');
        document.querySelectorAll('#tool-cards .choice-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectionState.tool = card.dataset.tool;
        refreshPreviewHatsAndTools();
        if (TOOL_CONFIG[selectionState.tool]) {
          speakText(TOOL_CONFIG[selectionState.tool].name.toLowerCase());
        }
      });
    });

    // Pilihan Level
    document.querySelectorAll('#level-cards .choice-card').forEach(card => {
      card.addEventListener('click', () => {
        playSound('click');
        document.querySelectorAll('#level-cards .choice-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectionState.level = parseInt(card.dataset.level, 10);
        updatePlaytimeEstimate();
      });
    });

    // Pilihan Jumlah Target (Stepper − / + dan Chip Cepat)
    const btnTargetMinus = document.getElementById('btn-target-minus');
    if (btnTargetMinus) {
      btnTargetMinus.addEventListener('click', () => {
        playSound('click');
        if (selectionState.targetCount > 3) {
          selectionState.targetCount--;
          saveTargetCount(selectionState.targetCount);
          updateTargetCountUI();
        }
      });
    }

    const btnTargetPlus = document.getElementById('btn-target-plus');
    if (btnTargetPlus) {
      btnTargetPlus.addEventListener('click', () => {
        playSound('click');
        if (selectionState.targetCount < 20) {
          selectionState.targetCount++;
          saveTargetCount(selectionState.targetCount);
          updateTargetCountUI();
        }
      });
    }

    document.querySelectorAll('#quick-target-chips .target-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        playSound('click');
        const count = parseInt(chip.dataset.count, 10);
        if (count >= 3 && count <= 20) {
          selectionState.targetCount = count;
          saveTargetCount(count);
          updateTargetCountUI();
        }
      });
    });

    // Pilihan Mode Zombie
    document.querySelectorAll('#mode-pills .mode-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        playSound('click');
        document.querySelectorAll('#mode-pills .mode-pill').forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        selectionState.mode = pill.dataset.mode;
      });
    });

    // Tombol-Tombol HUD
    const btnHudCam = document.getElementById('btn-hud-cam');
    if (btnHudCam) {
      btnHudCam.addEventListener('click', () => {
        playSound('click');
        toggleCamMenu();
      });
    }

    const btnModeTop = document.getElementById('btn-mode-top');
    if (btnModeTop) {
      btnModeTop.addEventListener('click', () => {
        playSound('click');
        setCameraMode('top');
      });
    }

    const btnModeShoulder = document.getElementById('btn-mode-shoulder');
    if (btnModeShoulder) {
      btnModeShoulder.addEventListener('click', () => {
        playSound('click');
        setCameraMode('shoulder');
      });
    }

    const btnCamResetInner = document.getElementById('btn-cam-reset-inner');
    if (btnCamResetInner) {
      btnCamResetInner.addEventListener('click', () => {
        playSound('click');
        resetCameraBehindPlayer(false);
        showToast('Kamera diatur ulang ke belakang pemain! ↺');
      });
    }

    document.querySelectorAll('#gfx-btn-row .gfx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playSound('click');
        setQualityPref(btn.dataset.gfx);
        updateGfxButtonsUI();
      });
    });
    // Popup menu kamera dibuka: tampilkan status grafis terbaru (hasil Otomatis bisa berubah)
    if (btnHudCam) btnHudCam.addEventListener('click', updateGfxButtonsUI);

    const btnRepeatVoice = document.getElementById('btn-repeat-voice');
    if (btnRepeatVoice) {
      btnRepeatVoice.addEventListener('click', () => {
        playSound('click');
        announceCurrentTarget();
      });
    }

    const btnHudMusic = document.getElementById('btn-hud-music');
    if (btnHudMusic) btnHudMusic.addEventListener('click', toggleMusic);

    const btnToggleMusicMenu = document.getElementById('btn-toggle-music-menu');
    if (btnToggleMusicMenu) btnToggleMusicMenu.addEventListener('click', toggleMusic);

    // Tombol Rumah HUD & Modal Konfirmasi Berhenti Main
    const modalConfirm = document.getElementById('modal-confirm-exit');
    const btnConfirmStay = document.getElementById('btn-confirm-stay');
    const btnConfirmLeave = document.getElementById('btn-confirm-leave');

    const btnHudHome = document.getElementById('btn-hud-home');
    if (btnHudHome) {
      btnHudHome.addEventListener('click', () => {
        playSound('click');
        if (gameStateRef.current === 'PLAYING') {
          gameStateRef.isPaused = true;
          if (modalConfirm) modalConfirm.classList.add('show');
        } else {
          returnToMainMenu();
        }
      });
    }

    if (btnConfirmStay) {
      btnConfirmStay.addEventListener('click', () => {
        playSound('click');
        gameStateRef.isPaused = false;
        if (modalConfirm) modalConfirm.classList.remove('show');
      });
    }

    if (btnConfirmLeave) {
      btnConfirmLeave.addEventListener('click', () => {
        playSound('click');
        gameStateRef.isPaused = false;
        if (modalConfirm) modalConfirm.classList.remove('show');
        returnToMainMenu();
      });
    }

    // Inisialisasi tampilan target count awal dari penyimpanan
    updateTargetCountUI();
}
