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
    target.closest('#joystick-zone') ||
    target.closest('.action-buttons') ||
    target.closest('.hud-right-btns') ||
    target.closest('.hud-left-col') ||
    target.closest('.mission-pill') ||
    target.closest('#cam-menu-popup')
  );
}

export function enableTouchUI() {
  const joystickZone = document.getElementById('joystick-zone');
  if (joystickZone) joystickZone.style.display = 'flex';
  const hint = document.getElementById('desktop-hint');
  if (hint) hint.style.display = 'none';
}

export function updateJoystickFromTouch(touch) {
  const joystickZone = document.getElementById('joystick-zone');
  const joystickKnob = document.getElementById('joystick-knob');
  if (!joystickZone || !joystickKnob) return;
  const rect = joystickZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxR = rect.width * 0.36;
  let dx = touch.clientX - cx;
  let dy = touch.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) {
    dx = (dx / dist) * maxR;
    dy = (dy / dist) * maxR;
  }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVector.x = dx / maxR;
  joyVector.y = dy / maxR;
}

export function resetJoystick(e) {
  const joystickKnob = document.getElementById('joystick-knob');
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === touchState.joyTouchId) {
      touchState.joyTouchId = null;
      joyVector.x = 0;
      joyVector.y = 0;
      if (joystickKnob) joystickKnob.style.transform = 'translate(0px, 0px)';
      break;
    }
  }
}

export function endCamTouches(e) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    touchState.camTouches.delete(e.changedTouches[i].identifier);
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

  // Touch Drag & Pinch Kamera di Separuh Layar Kanan (Hanya di Mode Kamera Bahu)
  window.addEventListener('touchstart', (e) => {
    if (gameStateRef.current !== 'PLAYING' || cameraState.mode !== 'shoulder') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchState.joyTouchId) continue;
      if (isTouchOnUIButton(t.target)) continue;
      if (t.clientX >= window.innerWidth * 0.5 || touchState.camTouches.size > 0) {
        touchState.camTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        camControl.idleTimer = 0;
      }
    }
    if (touchState.camTouches.size === 2) {
      const pts = Array.from(touchState.camTouches.values());
      touchState.prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (gameStateRef.current !== 'PLAYING' || touchState.camTouches.size === 0 || cameraState.mode !== 'shoulder') return;
    let updated = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (touchState.camTouches.has(t.identifier)) {
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
        updated = true;
      }
    }
    if (updated && touchState.camTouches.size === 2) {
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

  // Joystick Virtual
  const joystickZone = document.getElementById('joystick-zone');
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 900) {
    enableTouchUI();
  }
  window.addEventListener('touchstart', () => enableTouchUI(), { once: true, passive: true });

  if (joystickZone) {
    joystickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (touchState.joyTouchId === null) {
          touchState.joyTouchId = t.identifier;
          updateJoystickFromTouch(t);
          break;
        }
      }
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchState.joyTouchId) {
          updateJoystickFromTouch(t);
          break;
        }
      }
    }, { passive: false });

    joystickZone.addEventListener('touchend', resetJoystick, { passive: false });
    joystickZone.addEventListener('touchcancel', resetJoystick, { passive: false });
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
