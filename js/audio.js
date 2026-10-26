/*************************************************************************
 * AUDIO.JS - Sistem Web Audio API, Efek Suara, BGM, & Speech Synthesis
 *************************************************************************/
import { BGM_NOTES, LETTER_PHONETICS } from './config.js';
import { audioState } from './state.js';

export function ensureAudioContext() {
  if (!audioState.ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioState.ctx = new AudioContextClass();
    }
  }
  if (audioState.ctx && audioState.ctx.state === 'suspended') {
    audioState.ctx.resume();
  }
  if (!audioState.bgmTimer) {
    startBackgroundMusic();
  }
}

export function playTone(freqStart, freqEnd, duration, type = 'sine', gainVal = 0.14, delay = 0) {
  if (!audioState.ctx) return;
  const now = audioState.ctx.currentTime + delay;
  const osc = audioState.ctx.createOscillator();
  const gain = audioState.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
  }
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(gainVal, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audioState.ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playSound(kind) {
  ensureAudioContext();
  if (!audioState.ctx) return;

  switch (kind) {
    case 'click':
      playTone(520, 680, 0.09, 'triangle', 0.12);
      break;
    case 'jump':
      playTone(280, 580, 0.18, 'sine', 0.15);
      break;
    case 'bounce': // Pantulan trampolin tinggi
      playTone(220, 680, 0.28, 'triangle', 0.24);
      playTone(440, 880, 0.22, 'sine', 0.16, 0.05);
      break;
    case 'plung': // Jatuh ke air lucu "plung"
      playTone(440, 180, 0.26, 'sine', 0.22);
      playTone(620, 290, 0.18, 'sine', 0.16, 0.04);
      break;
    case 'bubble': // Bunyi "blup"
      playTone(260, 560, 0.16, 'sine', 0.20);
      playTone(560, 380, 0.10, 'sine', 0.12, 0.12);
      break;
    case 'wand': // Bunyi "cring"
      playTone(880, 1760, 0.22, 'triangle', 0.14);
      playTone(1320, 2200, 0.25, 'sine', 0.12, 0.06);
      break;
    case 'hammer': // Bunyi "buk" lucu
      playTone(180, 65, 0.18, 'sine', 0.26);
      playTone(240, 120, 0.12, 'triangle', 0.16, 0.03);
      break;
    case 'puff': // Zombie berubah jadi hewan: puff + nada naik ceria
      playTone(200, 90, 0.14, 'triangle', 0.16);
      playTone(523.25, 659.25, 0.12, 'sine', 0.14, 0.08);
      playTone(659.25, 783.99, 0.18, 'sine', 0.14, 0.18);
      break;
    case 'ting': // Huruf benar masuk ubin
      playTone(987.77, 1318.5, 0.28, 'sine', 0.18);
      break;
    case 'wrong': // Zombie tertawa "hehehe" (nada naik turun cepat)
      playTone(440, 520, 0.09, 'triangle', 0.13, 0.00);
      playTone(420, 500, 0.09, 'triangle', 0.13, 0.11);
      playTone(460, 380, 0.12, 'triangle', 0.13, 0.22);
      break;
    case 'tickle': // Digelitik zombie: "hihihi"
      playTone(580, 740, 0.08, 'sine', 0.14, 0.00);
      playTone(620, 790, 0.08, 'sine', 0.14, 0.10);
      playTone(660, 840, 0.10, 'sine', 0.14, 0.20);
      break;
    case 'winTarget': // Arpeggio naik 4 nada
      playTone(523.25, 523.25, 0.14, 'triangle', 0.18, 0.00);
      playTone(659.25, 659.25, 0.14, 'triangle', 0.18, 0.13);
      playTone(783.99, 783.99, 0.14, 'triangle', 0.18, 0.26);
      playTone(1046.50, 1046.50, 0.35, 'triangle', 0.22, 0.39);
      break;
  }
}

// Musik Latar Ceria Berulang (Otomatis Lebih Pelan Saat Ada Ucapan)
export function startBackgroundMusic() {
  if (audioState.bgmTimer) clearInterval(audioState.bgmTimer);
  audioState.bgmTimer = setInterval(() => {
    if (!audioState.musicEnabled || !audioState.ctx || audioState.ctx.state !== 'running') return;
    const note = BGM_NOTES[audioState.bgmStep % BGM_NOTES.length];
    audioState.bgmStep++;
    const vol = audioState.isSpeaking ? 0.012 : 0.042;
    playTone(note, note, 0.24, 'sine', vol);
  }, 380);
}

// Pemilihan Voice Bahasa Indonesia & Fungsi Bicara
export function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  audioState.indoVoice = voices.find(v => v.lang && v.lang.toLowerCase().includes('id')) || null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'id-ID';
    utter.rate = 0.85;
    utter.pitch = 1.15;
    if (!audioState.indoVoice) loadVoices();
    if (audioState.indoVoice) utter.voice = audioState.indoVoice;
    audioState.isSpeaking = true;
    utter.onend = () => { audioState.isSpeaking = false; };
    utter.onerror = () => { audioState.isSpeaking = false; };
    window.speechSynthesis.speak(utter);
  } catch (e) {
    audioState.isSpeaking = false;
  }
}

export function getLetterSpokenName(charUpper) {
  const key = (charUpper || 'a').toLowerCase();
  return LETTER_PHONETICS[key] || key;
}

export function toggleMusic() {
  audioState.musicEnabled = !audioState.musicEnabled;
  const hBtn = document.getElementById('btn-hud-music');
  const mBtn = document.getElementById('btn-toggle-music-menu');
  if (hBtn) hBtn.textContent = audioState.musicEnabled ? '🔈' : '🔇';
  if (mBtn) mBtn.textContent = audioState.musicEnabled ? '🔈 Musik: Nyala' : '🔇 Musik: Mati';
}
