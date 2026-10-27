/*************************************************************************
 * QUALITY.JS - Pengaturan Grafis: Otomatis / Ringan / Tinggi
 *************************************************************************/
import { sceneRefs } from './state.js';
import { decorMeshes } from './world.js';

const QUALITY_KEY = 'zombaca_grafis_v1';
const QUALITY_PREFS = ['auto', 'ringan', 'tinggi'];

export function loadQualityPref() {
  try {
    const raw = localStorage.getItem(QUALITY_KEY);
    if (QUALITY_PREFS.includes(raw)) return raw;
  } catch (err) {
    // Abaikan jika localStorage diblokir
  }
  return 'auto';
}

function saveQualityPref(pref) {
  try {
    localStorage.setItem(QUALITY_KEY, pref);
  } catch (err) {
    // Abaikan jika localStorage diblokir
  }
}

export const qualityState = {
  pref: loadQualityPref(),   // pilihan pengguna: 'auto' | 'ringan' | 'tinggi'
  active: 'tinggi',          // tingkat yang sedang dipakai: 'ringan' | 'tinggi'
  autoChecked: false,        // pengukuran 5 detik pertama sudah selesai
  autoResult: null,          // hasil mode Otomatis untuk sesi ini
  autoFps: null,
  autoThreshold: 45          // di bawah ini mode Otomatis pindah ke Ringan
};

// MSAA ditentukan saat WebGLRenderer dibuat (tidak bisa diubah tanpa muat ulang).
// Layar padat (dpr >= 1.5) sudah cukup halus tanpa MSAA.
export function wantsAntialias() {
  if (qualityState.pref === 'ringan') return false;
  if (qualityState.pref === 'tinggi') return true;
  return (window.devicePixelRatio || 1) < 1.5;
}

const LEVEL_SETTINGS = {
  tinggi: { fogNear: 55, fogFar: 175, cameraFar: 240 },
  ringan: { fogNear: 38, fogFar: 115, cameraFar: 140 }
};

// Terapkan tingkat grafis 'ringan' atau 'tinggi'
export function applyQuality(level) {
  const { renderer, scene, camera, dirLight } = sceneRefs;
  if (!renderer || !scene || !camera) return;
  const low = level === 'ringan';
  qualityState.active = low ? 'ringan' : 'tinggi';

  // Resolusi: Ringan = pixel ratio 1, Tinggi = maks 1.5
  renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Bayangan: Ringan tanpa bayangan sama sekali
  const shadows = !low;
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    if (dirLight) dirLight.castShadow = shadows;
    // Shader harus dibuat ulang dengan/tanpa kode bayangan
    scene.traverse(o => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; });
    });
  }

  // Kabut & jarak pandang: Ringan lebih dekat
  const s = LEVEL_SETTINGS[qualityState.active];
  if (scene.fog) {
    scene.fog.near = s.fogNear;
    scene.fog.far = s.fogFar;
  }
  camera.far = s.cameraFar;
  camera.updateProjectionMatrix();

  // Dekorasi kecil (bunga, semak): Ringan setengahnya
  decorMeshes.forEach(d => {
    d.mesh.count = low ? Math.ceil(d.full / 2) : d.full;
  });

  // CSS: Ringan tanpa backdrop-filter
  document.body.classList.toggle('gfx-low', low);
}

// Dipanggil saat pengguna memilih di menu 🎥
export function setQualityPref(pref) {
  if (!QUALITY_PREFS.includes(pref)) return;
  qualityState.pref = pref;
  saveQualityPref(pref);
  if (pref === 'auto') {
    applyQuality(qualityState.autoResult || 'tinggi');
  } else {
    applyQuality(pref);
  }
}

// Mode Otomatis: ukur FPS selama 5 detik pertama bermain (setelah 0,5 detik pemanasan).
// rawDelta = waktu nyata sejak frame sebelumnya (detik). Mengembalikan true bila
// grafis baru saja diturunkan ke Ringan.
const AUTO_WARMUP = 0.5;
const AUTO_WINDOW = 5.0;
let autoElapsed = 0;
let autoFrames = 0;

export function updateAutoQuality(rawDelta) {
  if (qualityState.pref !== 'auto' || qualityState.autoChecked) return false;
  if (rawDelta > 0.25) return false; // jeda (tab tersembunyi / dijeda) tidak dihitung
  autoElapsed += rawDelta;
  if (autoElapsed <= AUTO_WARMUP) return false;
  autoFrames++;
  if (autoElapsed < AUTO_WARMUP + AUTO_WINDOW) return false;

  const fps = autoFrames / (autoElapsed - AUTO_WARMUP);
  qualityState.autoChecked = true;
  qualityState.autoFps = fps;
  qualityState.autoResult = fps < qualityState.autoThreshold ? 'ringan' : 'tinggi';
  if (qualityState.autoResult === 'ringan' && qualityState.active !== 'ringan') {
    applyQuality('ringan');
    return true;
  }
  return false;
}
