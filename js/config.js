/*************************************************************************
 * CONFIG.JS - Konfigurasi Permainan, Level, Fonik, Fisika, & Kamera
 *************************************************************************/

export const ALLOWED_LETTERS = ['A','I','U','E','O','M','S','T','B','L','N','D','G','C','Z'];

export const LETTER_PHONETICS = {
  a: "a", i: "i", u: "u", e: "e", o: "o",
  m: "em", s: "es", t: "te", b: "be", l: "el",
  n: "en", d: "de", g: "ge", c: "ce", z: "zet"
};

const CONSONANTS = ['B', 'M', 'S', 'T', 'L', 'N', 'D', 'G', 'C', 'Z'];
const VOWELS = ['A', 'I', 'U', 'E', 'O'];

const LEVEL_2_SYLLABLES = [];
for (const c of CONSONANTS) {
  for (const v of VOWELS) {
    LEVEL_2_SYLLABLES.push({ text: c + v, emoji: "" });
  }
}

export const LEVEL_DATA = {
  1: [
    { text: "A", emoji: "" },
    { text: "I", emoji: "" },
    { text: "U", emoji: "" },
    { text: "E", emoji: "" },
    { text: "O", emoji: "" }
  ],
  2: LEVEL_2_SYLLABLES,
  3: [
    { text: "BOLA", emoji: "⚽" },
    { text: "SUSU", emoji: "🥛" },
    { text: "MATA", emoji: "👁️" },
    { text: "SATE", emoji: "🍢" },
    { text: "BATU", emoji: "🪨" },
    { text: "MADU", emoji: "🍯" },
    { text: "GIGI", emoji: "🦷" },
    { text: "DADU", emoji: "🎲" },
    { text: "TALI", emoji: "🪢" },
    { text: "NASI", emoji: "🍚" },
    { text: "DASI", emoji: "👔" },
    { text: "SOTO", emoji: "🍜" },
    { text: "BOLU", emoji: "🍰" },
    { text: "LAUT", emoji: "🌊" },
    { text: "BULU", emoji: "🪶" },
    { text: "TOGA", emoji: "🎓" },
    { text: "CABE", emoji: "🌶️" },
    { text: "DAUN", emoji: "🍃" },
    { text: "LIMA", emoji: "🖐️" },
    { text: "BATA", emoji: "🧱" }
  ]
};

// Kecepatan gerak standar pemain (dianggap 1.0)
export const PLAYER_SPEED = 9.2;

// Tingkat Kelincahan Zombi
// Santai: jarak waspada 5 unit, kecepatan kabur 0.5x, kabur 2s, capek 4s
// Sedang: jarak waspada 8 unit, kecepatan kabur 0.75x, kabur 3s, capek 3s
// Seru:   jarak waspada 12 unit, kecepatan kabur 0.9x (zig-zag), kabur 4s, capek 2s
export const MODE_CONFIG = {
  santai: {
    name: "Santai",
    desc: "Zombi santai, gampang ditangkap",
    count: 8,
    alertDist: 5.0,
    fleeRatio: 0.5,
    fleeDuration: 2.0,
    tiredDuration: 4.0,
    zigzag: false,
    respawnDelay: 2.2
  },
  sedang: {
    name: "Sedang",
    desc: "Zombi suka kabur",
    count: 12,
    alertDist: 8.0,
    fleeRatio: 0.75,
    fleeDuration: 3.0,
    tiredDuration: 3.0,
    zigzag: false,
    respawnDelay: 1.5
  },
  seru: {
    name: "Seru",
    desc: "Zombi lincah dan zig-zag",
    count: 16,
    alertDist: 12.0,
    fleeRatio: 0.9,
    fleeDuration: 4.0,
    tiredDuration: 2.0,
    zigzag: true,
    respawnDelay: 0.9
  }
};

export const TOOL_CONFIG = {
  bubble: { name: "Pistol Gelembung", icon: "🫧", range: 23, projSpeed: 13 },
  wand:   { name: "Tongkat Bintang",  icon: "🪄", range: 17, projSpeed: 25 },
  hammer: { name: "Palu Bantal",      icon: "🛋️", range: 7.5, projSpeed: 0 }
};

// Konstanta Fisika Dunia
export const STEP_H = 0.66;      // tinggi anak tangga maksimal yang dinaiki otomatis
export const WATER_Y = 0.06;     // tinggi permukaan air
export const GRAVITY = 26;
export const BOUNCE_VY = 16.5;   // kecepatan pantulan trampolin

// Geometri Sungai & Danau
export const RIVER_HALF = 3.6;
export const LAKE = { x: -6, z: 54, rx: 16, rz: 11 };

// Zona Permainan
export const ZONES = [
  { name: 'Desa',       x: 0,   z: 2,   rx: 17, rz: 17 },
  { name: 'Hutan',      x: -46, z: -12, rx: 27, rz: 32 },
  { name: 'Bukit',      x: -2,  z: -46, rx: 34, rz: 30 },
  { name: 'Sungai',     x: 8,   z: 48,  rx: 30, rz: 22 },
  { name: 'Taman',      x: 56,  z: 8,   rx: 22, rz: 22 }
];

export const MAZE = { x0: 41.5, z0: -18.5, cs: 4.2, n: 5, t: 0.9, cx: 52, cz: -8 };

// Parameter Kamera Bahu (Third-Person Free Fire Style)
// Gunakan Math.PI / 180 jika THREE belum diimpor atau Three.MathUtils.degToRad
export const CAM_MIN_PITCH = 10 * Math.PI / 180;
export const CAM_MAX_PITCH = 55 * Math.PI / 180;
export const CAM_MIN_DIST = 4.0;
export const CAM_MAX_DIST = 14.0;

// Parameter Kamera Atas (Fixed Angle Overhead View)
export const topCamConfig = {
  height: 16.5,
  distBack: 18.0,
  lookAhead: -2.5
};

// Warna-Warna Partikel
export const PARTICLE_COLORS = [0xFACC15, 0x4ADE80, 0x22D3EE, 0xF472B6, 0xFB923C, 0xA78BFA];

// Nada Musik Latar Belakang
export const BGM_NOTES = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 293.66, 392.00];
