/*************************************************************************
 * STATE.JS - Manajemen State Terpusat Permainan & LocalStorage
 *************************************************************************/

// 1. Data Penyimpanan LocalStorage
export const saveState = {
  stars: 0,
  hat: 'none',
  camMode: 'top', // Default pertama kali main: Kamera Atas
  album: { kelinci: 0, ayam: 0, kucing: 0 }
};

export function loadProgress() {
  try {
    const raw = localStorage.getItem('zombie_huruf_save_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.stars === 'number') saveState.stars = parsed.stars;
      if (typeof parsed.hat === 'string') saveState.hat = parsed.hat;
      if (parsed.camMode === 'top' || parsed.camMode === 'shoulder') {
        saveState.camMode = parsed.camMode;
      }
      if (parsed.album) {
        saveState.album.kelinci = parsed.album.kelinci || 0;
        saveState.album.ayam = parsed.album.ayam || 0;
        saveState.album.kucing = parsed.album.kucing || 0;
      }
    }
  } catch (err) {
    // Abaikan jika localStorage diblokir
  }
}

export function saveProgress() {
  try {
    localStorage.setItem('zombie_huruf_save_v1', JSON.stringify(saveState));
  } catch (err) {
    // Abaikan jika localStorage diblokir
  }
}

// Muat data saat modul diinisialisasi
loadProgress();

// Kunci penyimpanan terpisah untuk preferensi jumlah target (agar tidak menimpa save progress utama)
export const TARGET_COUNT_KEY = 'zombaca_target_count_v1';

export function loadTargetCount() {
  try {
    const raw = localStorage.getItem(TARGET_COUNT_KEY);
    if (raw) {
      const val = parseInt(raw, 10);
      if (val >= 3 && val <= 20) return val;
    }
  } catch (err) {}
  return 5; // Bawaan pertama kali: 5
}

export function saveTargetCount(count) {
  try {
    localStorage.setItem(TARGET_COUNT_KEY, count.toString());
  } catch (err) {}
}

// 2. State Game Alur Permainan
export const gameStateRef = {
  current: 'MENU', // 'MENU' | 'PLAYING' | 'ROUND_END'
  isPaused: false
};

export const selectionState = {
  char: 'bima',
  tool: 'bubble',
  level: 1,
  mode: 'santai',
  targetCount: loadTargetCount()
};

// 3. State Pemain (Posisi, Gerak, Fisika, Aksi)
export const playerState = {
  x: 0,
  y: 0,
  z: 8,
  vy: 0,
  rotY: Math.PI,
  isGrounded: true,
  shootCooldown: 0,
  toolSwingTimer: 0,
  tickleStunTimer: 0,
  knockbackVx: 0,
  knockbackVz: 0,
  walkTime: 0,
  standingRaft: null
};

// 4. State Penyelamatan Air (Pelampung Bebek)
export const playerRescue = {
  active: false,
  timer: 0,
  fromX: 0,
  fromZ: 0,
  targetX: 0,
  targetZ: 0
};

// 5. State Kontrol Kamera
export const cameraState = {
  mode: saveState.camMode || 'top', // 'top' | 'shoulder'
  menuOpen: false
};

export const camControl = {
  yaw: Math.PI,
  pitch: 18 * Math.PI / 180,
  dist: 7.5,
  targetYaw: Math.PI,
  targetPitch: 18 * Math.PI / 180,
  targetDist: 7.5,
  shoulderOffset: 0.85,
  heightOffset: 1.75,
  idleTimer: 0,
  lookAtPos: null // diinisialisasi di main.js dengan new THREE.Vector3(0, 2, 0)
};

// 6. State Target & Ronde
export const roundState = {
  targets: [],
  completedTargets: [],
  targetIndex: 0,
  targetObj: null,
  letterIndex: 0,
  targetTimer: 0,
  hintActive: false,
  animalsRescued: 0,
  roundId: 0 // naik setiap ronde baru; timer dari ronde lama diabaikan
};

export const screenState = {
  shakeTime: 0
};

export const totalTimeRef = { t: 0 };

// 7. Entitas Permainan
export const zombies = [];
export const projectiles = [];
export const particles = [];
export const hoppingAnimals = [];

// 8. Benda Padat & Rintangan Dunia
export const colliders = [];
export const steppingStones = [];
export const rafts = [];
export const trampolines = [];
export const treeSpots = [];

// 9. Sistem Transparansi Penghalang Kamera (Occlusion)
export const occludableObjects = [];
export const occludableMeshes = [];
export const meshToOccludableMap = new Map();
export const instOccluders = [];
export let occlusionRaycaster = null;

export function setOcclusionRaycaster(raycaster) {
  occlusionRaycaster = raycaster;
}

// 10. Kontrol Input
export const keys = {};
export const joyVector = { x: 0, y: 0 };
export const touchState = {
  joyTouchId: null,
  isMouseDraggingCam: false,
  lastMouseX: 0,
  lastMouseY: 0,
  camTouches: new Map(),
  prevPinchDist: null
};

// 11. State Audio
export const audioState = {
  ctx: null,
  musicEnabled: true,
  isSpeaking: false,
  bgmTimer: null,
  bgmStep: 0,
  indoVoice: null
};

// 12. Objek Three.js Global & Scene Refs
export const sceneRefs = {
  canvas: null,
  renderer: null,
  scene: null,
  camera: null,
  staticGroup: null,
  dynGroup: null,
  oceanMesh: null,
  waveRingMeshes: [],
  targetRingMesh: null,
  helpArrowGroup: null,
  playerObj: null,
  startScreenZombie: null,
  minimapCanvas: null,
  minimapCtx: null,
  previewRenderers: {}
};
