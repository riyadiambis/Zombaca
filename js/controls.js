/*************************************************************************
 * CONTROLS.JS - Input Keyboard, Mouse, Virtual Joystick, Sentuh, & Tombol Aksi
 *************************************************************************/
import {
  CAM_MIN_PITCH, CAM_MAX_PITCH, CAM_MIN_DIST, CAM_MAX_DIST
} from './config.js';
import {
  keys, joyVector, touchState, playerState, playerRescue,
  cameraState, camControl, gameStateRef, sceneRefs
} from './state.js';
import { normalizeAngle } from './world.js';
import { playSound } from './audio.js';
import { useMagicTool } from './weapons.js';

export function triggerJump() {
  if (gameStateRef.current !== 'PLAYING') return;
  if (playerRescue.active) return;
  if (playerState.isGrounded && playerState.tickleStunTimer <= 0) {
    playerState.vy = 11.2;
    playerState.isGrounded = false;
    playSound('jump');
  }
}

export function isTouchOnUIButton(target) {
  if (!target || !target.closest) return false;
  return Boolean(
    target.closest('.action-buttons') ||
    target.closest('.hud-right-btns') ||
    target.closest('.hud-left-col') ||
    target.closest('.mission-pill') ||
    target.closest('#cam-menu-popup') ||
    target.closest('#modal-confirm-exit') ||
    target.closest('#rotate-device-overlay')
  );
}

export function enableTouchUI() {
  document.body.classList.add('touch-device');
  const hint = document.getElementById('desktop-hint');
  if (hint) hint.style.display = 'none';
}

export function toggleFullscreen() {
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  } catch (e) {}
}

export function tryFullscreenAndLockLandscape() {
  const isTouch = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  if (!isTouch) return;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  } catch (e) {}
}

// Handler Joystick Mengambang Dinamis
export function handleFloatingJoyStart(touch) {
  touchState.joyTouchId = touch.identifier;
  touchState.joyOriginX = touch.clientX;
  touchState.joyOriginY = touch.clientY;

  const joystickZone = document.getElementById('joystick-zone');
  const joystickKnob = document.getElementById('joystick-knob');
  if (joystickZone && joystickKnob) {
    joystickZone.style.left = `${touch.clientX}px`;
    joystickZone.style.top = `${touch.clientY}px`;
    joystickZone.style.display = 'flex';
    joystickKnob.style.transform = 'translate(0px, 0px)';
  }
  joyVector.x = 0;
  joyVector.y = 0;
}

export function handleFloatingJoyMove(touch) {
  const joystickKnob = document.getElementById('joystick-knob');
  if (!joystickKnob) return;

  const maxR = 46; // radius gerak knob di dalam zona 120px
  let dx = touch.clientX - touchState.joyOriginX;
  let dy = touch.clientY - touchState.joyOriginY;
  const dist = Math.hypot(dx, dy);

  if (dist > maxR) {
    dx = (dx / dist) * maxR;
    dy = (dy / dist) * maxR;
  }

  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVector.x = dx / maxR;
  joyVector.y = dy / maxR;
}

export function handleFloatingJoyEnd(identifier) {
  if (touchState.joyTouchId === identifier) {
    touchState.joyTouchId = null;
    joyVector.x = 0;
    joyVector.y = 0;

    const joystickZone = document.getElementById('joystick-zone');
    const joystickKnob = document.getElementById('joystick-knob');
    if (joystickZone) joystickZone.style.display = 'none';
    if (joystickKnob) joystickKnob.style.transform = 'translate(0px, 0px)';
  }
}

export function endCamTouches(e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    touchState.camTouches.delete(t.identifier);
    handleFloatingJoyEnd(t.identifier);
  }
  if (touchState.camTouches.size < 2) {
    touchState.prevPinchDist = null;
  }
}

export function initControls() {
  // Keyboard Listeners
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (gameStateRef.current === 'PLAYING') {
      if (e.code === 'Space') {
        e.preventDefault();
        triggerJump();
      } else if (e.code === 'KeyF' || e.code === 'Enter') {
        e.preventDefault();
        useMagicTool();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Mouse Drag untuk Memutar Kamera (HANYA AKTIF di Mode Kamera Bahu)
  if (sceneRefs.canvas) {
    sceneRefs.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && cameraState.mode === 'shoulder') {
        touchState.isMouseDraggingCam = true;
        touchState.lastMouseX = e.clientX;
        touchState.lastMouseY = e.clientY;
      }
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (!touchState.isMouseDraggingCam || gameStateRef.current !== 'PLAYING' || cameraState.mode !== 'shoulder') return;
    const dx = e.clientX - touchState.lastMouseX;
    const dy = e.clientY - touchState.lastMouseY;
    touchState.lastMouseX = e.clientX;
    touchState.lastMouseY = e.clientY;

    camControl.targetYaw = normalizeAngle(camControl.targetYaw - dx * 0.0065);
    camControl.targetPitch = THREE.MathUtils.clamp(
      camControl.targetPitch + dy * 0.0055,
      CAM_MIN_PITCH,
      CAM_MAX_PITCH
    );
    camControl.idleTimer = 0;
  });

  window.addEventListener('mouseup', () => {
    touchState.isMouseDraggingCam = false;
  });

  // Zoom Kamera dengan Roda Mouse
  window.addEventListener('wheel', (e) => {
    if (gameStateRef.current !== 'PLAYING' || cameraState.mode !== 'shoulder') return;
    camControl.targetDist = THREE.MathUtils.clamp(
      camControl.targetDist + e.deltaY * 0.005,
      CAM_MIN_DIST,
      CAM_MAX_DIST
    );
    camControl.idleTimer = 0;
  }, { passive: true });

  // Cegah menu tekan lama (contextmenu) di seluruh layar game
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Touch Management Terpadu (Floating Joystick di Kiri, Kamera di Kanan)
  window.addEventListener('touchstart', (e) => {
    enableTouchUI();
    if (gameStateRef.current !== 'PLAYING') return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (isTouchOnUIButton(t.target)) continue;

      // Separuh layar kiri: Joystick Mengambang
      if (t.clientX < window.innerWidth * 0.5) {
        if (touchState.joyTouchId === null) {
          handleFloatingJoyStart(t);
        }
      } else {
        // Separuh layar kanan: Putar Kamera Bahu
        if (cameraState.mode === 'shoulder') {
          touchState.camTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
          camControl.idleTimer = 0;
        }
      }
    }

    if (cameraState.mode === 'shoulder' && touchState.camTouches.size === 2) {
      const pts = Array.from(touchState.camTouches.values());
      touchState.prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (gameStateRef.current !== 'PLAYING') return;

    let updatedCam = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      // Gerak Joystick Mengambang
      if (t.identifier === touchState.joyTouchId) {
        handleFloatingJoyMove(t);
        continue;
      }

      // Gerak Kamera Bahu
      if (cameraState.mode === 'shoulder' && touchState.camTouches.has(t.identifier)) {
        const prev = touchState.camTouches.get(t.identifier);
        if (touchState.camTouches.size === 1) {
          const dx = t.clientX - prev.x;
          const dy = t.clientY - prev.y;
          camControl.targetYaw = normalizeAngle(camControl.targetYaw - dx * 0.0075);
          camControl.targetPitch = THREE.MathUtils.clamp(
            camControl.targetPitch + dy * 0.0065,
            CAM_MIN_PITCH,
            CAM_MAX_PITCH
          );
          camControl.idleTimer = 0;
        }
        prev.x = t.clientX;
        prev.y = t.clientY;
        updatedCam = true;
      }
    }

    if (updatedCam && touchState.camTouches.size === 2) {
      const pts = Array.from(touchState.camTouches.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (touchState.prevPinchDist !== null) {
        const delta = touchState.prevPinchDist - dist;
        camControl.targetDist = THREE.MathUtils.clamp(
          camControl.targetDist + delta * 0.03,
          CAM_MIN_DIST,
          CAM_MAX_DIST
        );
        camControl.idleTimer = 0;
      }
      touchState.prevPinchDist = dist;
    }
  }, { passive: true });

  window.addEventListener('touchend', endCamTouches, { passive: true });
  window.addEventListener('touchcancel', endCamTouches, { passive: true });

  // Deteksi Perangkat Sentuh
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 900) {
    enableTouchUI();
  }

  // Tombol Layar Penuh (Fullscreen) di HUD Kanan Atas
  const btnFullscreen = document.getElementById('btn-hud-fullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', (e) => {
      e.stopPropagation();
      playSound('click');
      toggleFullscreen();
    });
  }

  // Tombol Aksi Tembak dan Lompat
  const btnShoot = document.getElementById('btn-shoot');
  const btnJump = document.getElementById('btn-jump');

  if (btnShoot) {
    btnShoot.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      useMagicTool();
    }, { passive: false });
    btnShoot.addEventListener('click', (e) => {
      e.stopPropagation();
      useMagicTool();
    });
  }

  if (btnJump) {
    btnJump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      triggerJump();
    }, { passive: false });
    btnJump.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerJump();
    });
  }
}
