/*************************************************************************
 * DEBUG.JS - Panel Performa (hanya aktif bila URL berisi ?debug=1)
 *************************************************************************/
import { sceneRefs, particles, projectiles } from './state.js';

let enabled = false;
try {
  enabled = new URLSearchParams(window.location.search).get('debug') === '1';
} catch (e) {
  enabled = false;
}
export const debugEnabled = enabled;

// Ring buffer waktu frame (ms) untuk FPS rata-rata & 1% terendah
const FRAME_BUF = 600;
const frameTimes = new Float32Array(FRAME_BUF);
const workTimes = new Float32Array(FRAME_BUF);
let frameCount = 0;
let lastFrameTs = 0;
let panelEl = null;
let lastPanelUpdate = 0;
let lastObjectCount = 0;
let lastObjectCountTs = 0;

// Rekaman pengukuran skenario (dipakai lewat window.__zombaca.measure)
let recording = null;

function countSceneObjects() {
  let n = 0;
  if (sceneRefs.scene) sceneRefs.scene.traverse(() => { n++; });
  return n;
}

function frameStats(times) {
  if (times.length === 0) return { fpsAvg: 0, fpsLow1: 0, frameMs: 0 };
  let sum = 0;
  for (let i = 0; i < times.length; i++) sum += times[i];
  const avg = sum / times.length;
  const sorted = Array.from(times).sort((a, b) => b - a);
  const worstN = Math.max(1, Math.floor(sorted.length * 0.01));
  let worstSum = 0;
  for (let i = 0; i < worstN; i++) worstSum += sorted[i];
  return {
    fpsAvg: 1000 / avg,
    fpsLow1: 1000 / (worstSum / worstN),
    frameMs: avg
  };
}

export function readRendererStats() {
  const r = sceneRefs.renderer;
  const info = r ? r.info : null;
  const mem = performance.memory;
  return {
    calls: info ? info.render.calls : 0,
    triangles: info ? info.render.triangles : 0,
    geometries: info ? info.memory.geometries : 0,
    textures: info ? info.memory.textures : 0,
    programs: info && info.programs ? info.programs.length : 0,
    objects: lastObjectCount,
    particles: particles.length + projectiles.length,
    heapMB: mem ? mem.usedJSHeapSize / 1048576 : null
  };
}

function updatePanel(now) {
  if (!panelEl) return;
  if (now - lastObjectCountTs > 1000) {
    lastObjectCount = countSceneObjects();
    lastObjectCountTs = now;
  }
  const n = Math.min(frameCount, 120);
  const recent = [];
  for (let i = 0; i < n; i++) {
    recent.push(frameTimes[(frameCount - 1 - i) % FRAME_BUF]);
  }
  const fs = frameStats(recent);
  const rs = readRendererStats();
  let workSum = 0;
  for (let i = 0; i < n; i++) workSum += workTimes[(frameCount - 1 - i) % FRAME_BUF];
  const workAvg = n ? workSum / n : 0;
  panelEl.textContent =
    `FPS ${fs.fpsAvg.toFixed(1)}  (1% low ${fs.fpsLow1.toFixed(1)})\n` +
    `Frame ${fs.frameMs.toFixed(2)} ms  (CPU ${workAvg.toFixed(2)} ms)\n` +
    `Draw calls ${rs.calls}\n` +
    `Triangles ${rs.triangles}\n` +
    `Geometries ${rs.geometries}  Textures ${rs.textures}\n` +
    `Programs ${rs.programs}\n` +
    `Objek scene ${rs.objects}\n` +
    `Partikel aktif ${rs.particles}\n` +
    `JS heap ${rs.heapMB === null ? 'n/a' : rs.heapMB.toFixed(1) + ' MB'}`;
}

// Dipanggil sekali per frame dari game loop (setelah render)
export function debugFrame(workStart) {
  if (!enabled) return;
  const now = performance.now();
  const workMs = now - workStart;
  workTimes[frameCount % FRAME_BUF] = workMs;
  if (recording) recording.workSum += workMs;
  if (lastFrameTs > 0) {
    const ft = now - lastFrameTs;
    frameTimes[frameCount % FRAME_BUF] = ft;
    frameCount++;
    if (recording) {
      recording.times.push(ft);
      const info = sceneRefs.renderer ? sceneRefs.renderer.info.render : null;
      if (info) {
        recording.callsSum += info.calls;
        recording.callsMax = Math.max(recording.callsMax, info.calls);
        recording.triSum += info.triangles;
      }
    }
  }
  lastFrameTs = now;
  if (now - lastPanelUpdate > 500) {
    lastPanelUpdate = now;
    updatePanel(now);
  }
}

// Saat loop dihentikan (tab tersembunyi) jangan hitung jeda sebagai frame
export function debugResetTiming() {
  lastFrameTs = 0;
}

export async function initDebug() {
  if (!enabled) return;
  panelEl = document.createElement('pre');
  panelEl.id = 'debug-panel';
  panelEl.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:2000;margin:0;padding:8px 10px;' +
    'background:rgba(0,0,0,0.72);color:#A3E635;font:12px/1.35 monospace;' +
    'border-radius:8px;pointer-events:none;white-space:pre;';
  document.body.appendChild(panelEl);

  // Kait untuk otomatisasi pengukuran skenario dari console
  const [state, ui, weapons, zombiesMod, camera, quality] = await Promise.all([
    import('./state.js'), import('./ui.js'), import('./weapons.js'),
    import('./zombies.js'), import('./camera.js'), import('./quality.js')
  ]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const memSnap = () => {
    const s = readRendererStats();
    return { geometries: s.geometries, textures: s.textures, programs: s.programs, objects: countSceneObjects(), heapMB: s.heapMB === null ? null : +s.heapMB.toFixed(1) };
  };
  const startPlay = async (camMode) => {
    document.querySelector('.mode-pill.seru').click();
    document.querySelector('#level-cards .choice-card[data-level="1"]').click();
    camera.setCameraMode(camMode, false);
    document.getElementById('btn-start-play').click();
    await sleep(1000);
  };
  // Skenario pengukuran standar AUDIT.md (jalankan: await __zombaca.run('s2'))
  const scenarios = {
    // 1. Layar menu (dunia 3D berputar di belakang)
    async s1() {
      await sleep(2000);
      return window.__zombaca.measure(15);
    },
    // 2. Main di zona Desa, Kamera Atas, mode Seru
    async s2() {
      await startPlay('top');
      return window.__zombaca.measure(15);
    },
    // 3. Main di zona Hutan, Kamera Bahu (kamera diputar dengan Q)
    async s3() {
      await startPlay('shoulder');
      state.playerState.x = -46; state.playerState.z = -12; state.playerState.y = 2;
      await sleep(1000);
      state.keys['KeyQ'] = true;
      const r = await window.__zombaca.measure(15);
      state.keys['KeyQ'] = false;
      return r;
    },
    // 4. Tiga ronde berturut-turut dengan "Main Lagi" (3 target, Level 1), lalu ukur ronde ke-4
    async s4() {
      const prevCount = state.selectionState.targetCount;
      state.selectionState.targetCount = 3;
      const rounds = [];
      await startPlay('top');
      for (let r = 0; r < 3; r++) {
        if (r > 0) {
          document.getElementById('btn-end-again').click();
          await sleep(800);
        }
        const atStart = memSnap();
        let guard = 0;
        while (state.gameStateRef.current === 'PLAYING' && guard++ < 60) {
          const needed = zombiesMod.getNeededLetter();
          const idx = state.zombies.findIndex(z => z.letter === needed);
          const celebrating = document.getElementById('center-celebration').classList.contains('show');
          if (idx >= 0 && !celebrating) weapons.onCorrectZombieHit(state.zombies[idx], idx);
          await sleep(1000);
        }
        await sleep(1200);
        rounds.push({ round: r + 1, atStart, atEnd: memSnap() });
      }
      document.getElementById('btn-end-again').click();
      await sleep(1000);
      const after = await window.__zombaca.measure(15);
      state.selectionState.targetCount = prevCount;
      return { rounds, after };
    }
  };
  const errors = [];
  window.addEventListener('error', e => errors.push(e.message));
  window.__zombaca = {
    state, ui, weapons, zombies: zombiesMod, camera, quality,
    stats: readRendererStats,
    errors,
    async run(name) {
      const result = await scenarios[name]();
      result.visibility = document.visibilityState;
      return result;
    },
    measure(seconds = 15) {
      return new Promise(resolve => {
        recording = { times: [], callsSum: 0, callsMax: 0, triSum: 0, workSum: 0 };
        setTimeout(() => {
          const rec = recording;
          recording = null;
          lastObjectCount = countSceneObjects();
          const fs = frameStats(rec.times);
          const rs = readRendererStats();
          const n = Math.max(1, rec.times.length);
          resolve({
            frames: rec.times.length,
            fpsAvg: +fs.fpsAvg.toFixed(1),
            fpsLow1: +fs.fpsLow1.toFixed(1),
            frameMs: +fs.frameMs.toFixed(2),
            cpuMs: +(rec.workSum / n).toFixed(2),
            callsAvg: Math.round(rec.callsSum / n),
            callsMax: rec.callsMax,
            trianglesAvg: Math.round(rec.triSum / n),
            geometries: rs.geometries,
            textures: rs.textures,
            programs: rs.programs,
            objects: rs.objects,
            particles: rs.particles,
            heapMB: rs.heapMB === null ? null : +rs.heapMB.toFixed(1)
          });
        }, seconds * 1000);
      });
    }
  };
}
