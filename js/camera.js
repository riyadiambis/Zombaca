/*************************************************************************
 * CAMERA.JS - Sistem Kamera Ganda (Atas & Bahu), Reset, & Occlusion
 *************************************************************************/
import { topCamConfig } from './config.js';
import {
  saveState, saveProgress, cameraState, camControl, playerState,
  screenState, totalTimeRef, sceneRefs, occludableObjects,
  occludableMeshes, meshToOccludableMap, occlusionRaycaster,
  gameStateRef
} from './state.js';
import { lerpAngle } from './world.js';
import { speakText } from './audio.js';
import { showToast } from './ui.js';

    export function resetCameraBehindPlayer(instant = false) {
      camControl.targetYaw = playerState.rotY;
      camControl.targetPitch = THREE.MathUtils.degToRad(18);
      camControl.targetDist = 7.5;
      camControl.idleTimer = 2.0;
      if (instant) {
        camControl.yaw = camControl.targetYaw;
        camControl.pitch = camControl.targetPitch;
        camControl.dist = camControl.targetDist;
      }
    }

    export function applyCamModeUI(initial = false) {
      const btnTop = document.getElementById('btn-mode-top');
      const btnSh = document.getElementById('btn-mode-shoulder');
      const dragHint = document.getElementById('cam-drag-zone-hint');

      if (btnTop && btnSh) {
        btnTop.classList.toggle('active', cameraState.mode === 'top');
        btnSh.classList.toggle('active', cameraState.mode === 'shoulder');
      }

      // Di mode Kamera Atas, matikan geser layar dan sembunyikan petunjuk geser
      if (dragHint) {
        dragHint.style.display = (cameraState.mode === 'shoulder') ? 'block' : 'none';
      }
    }

    export function switchCameraMode(newMode, showToastNotice = true) {
      if (newMode !== 'top' && newMode !== 'shoulder') return;
      cameraState.mode = newMode;
      saveState.camMode = newMode;
      saveProgress();

      applyCamModeUI(false);

      if (cameraState.mode === 'shoulder') {
        resetCameraBehindPlayer(false);
      }

      if (showToastNotice) {
        showToast(cameraState.mode === 'top' ? '🗺️ Kamera Atas aktif' : '🎮 Kamera Bahu aktif');
        speakText(cameraState.mode === 'top' ? 'Kamera Atas aktif' : 'Kamera Bahu aktif');
      }
    }

    export const setCameraMode = switchCameraMode;

    export function toggleCamMenu() {
      cameraState.menuOpen = !cameraState.menuOpen;
      const popup = document.getElementById('cam-menu-popup');
      if (popup) {
        popup.classList.toggle('open', cameraState.menuOpen);
      }
    }

    export function closeCamMenu() {
      cameraState.menuOpen = false;
      const popup = document.getElementById('cam-menu-popup');
      if (popup) {
        popup.classList.remove('open');
      }
    }

    // Tutup popup jika klik di luar
    window.addEventListener('click', (e) => {
      if (!cameraState.menuOpen) return;
      const popup = document.getElementById('cam-menu-popup');
      const btnCam = document.getElementById('btn-hud-cam');
      if (popup && !popup.contains(e.target) && btnCam && !btnCam.contains(e.target)) {
        closeCamMenu();
      }
    });


    const rayTempVec = new THREE.Vector3();
    const rayOriginVec = new THREE.Vector3();

    export function updateCameraOcclusion(dt) {
      for (let i = 0; i < occludableObjects.length; i++) {
        occludableObjects[i].targetOpacity = 1.0;
      }

      if (gameStateRef.current === 'PLAYING') {
        rayOriginVec.copy(sceneRefs.camera.position);
        const sampleHeights = [0.7, 1.5, 2.3];
        for (let s = 0; s < sampleHeights.length; s++) {
          rayTempVec.set(playerState.x, playerState.y + sampleHeights[s], playerState.z);
          const dir = rayTempVec.sub(rayOriginVec);
          const distToPlayer = dir.length();
          if (distToPlayer > 0.5) {
            dir.normalize();
            occlusionRaycaster.set(rayOriginVec, dir);
            occlusionRaycaster.far = Math.max(0.2, distToPlayer - 0.35);
            const hits = occlusionRaycaster.intersectObjects(occludableMeshes, false);
            for (let h = 0; h < hits.length; h++) {
              const entry = meshToOccludableMap.get(hits[h].object);
              if (entry) {
                entry.targetOpacity = 0.25;
              }
            }
          }
        }
      }

      const fadeSpeed = Math.min(1, dt * 10);
      for (let i = 0; i < occludableObjects.length; i++) {
        const entry = occludableObjects[i];
        const diff = entry.targetOpacity - entry.currentOpacity;
        if (Math.abs(diff) > 0.004) {
          entry.currentOpacity += diff * fadeSpeed;
          const isTrans = entry.currentOpacity < 0.98;
          for (let m = 0; m < entry.meshes.length; m++) {
            const mat = entry.meshes[m].material;
            mat.transparent = isTrans;
            mat.opacity = isTrans ? entry.currentOpacity : 1.0;
            mat.depthWrite = !isTrans;
          }
        } else if (entry.targetOpacity === 1.0 && entry.currentOpacity !== 1.0) {
          entry.currentOpacity = 1.0;
          for (let m = 0; m < entry.meshes.length; m++) {
            const mat = entry.meshes[m].material;
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.depthWrite = true;
          }
        }
      }
    }


// Update Posisi & Orientasi Kamera (Kamera Bahu vs Kamera Atas)
export function updateCamera(dt, isPlaying = true) {
  if (!sceneRefs.camera) return;

  if (!isPlaying) {
    // Kamera berputar pelan mengelilingi pulau saat di menu
    const camAngle = Math.sin(totalTimeRef.t * 0.22) * 0.55;
    const targetCamX = Math.sin(camAngle) * 26;
    const targetCamZ = Math.cos(camAngle) * 26;
    sceneRefs.camera.position.lerp(new THREE.Vector3(targetCamX, 11, targetCamZ), 0.05);
    sceneRefs.camera.lookAt(0, 2.2, 6);
    updateCameraOcclusion(dt);
    return;
  }

  let shakeX = 0, shakeY = 0;
  if (screenState.shakeTime > 0) {
    shakeX = Math.sin(totalTimeRef.t * 45) * 0.22;
    shakeY = Math.cos(totalTimeRef.t * 40) * 0.18;
  }

  if (cameraState.mode === 'top') {
    // Mode Kamera Atas: Tampilan tetap dari atas belakang karakter, sangat stabil & mudah
    const targetCamPos = new THREE.Vector3(
      playerState.x + shakeX,
      playerState.y + topCamConfig.height + shakeY,
      playerState.z + topCamConfig.distBack
    );
    sceneRefs.camera.position.lerp(targetCamPos, Math.min(1, dt * 8));

    const targetLookAt = new THREE.Vector3(
      playerState.x,
      playerState.y + 1.0,
      playerState.z + topCamConfig.lookAhead
    );
    camControl.lookAtPos.lerp(targetLookAt, Math.min(1, dt * 10));
    sceneRefs.camera.lookAt(camControl.lookAtPos);
  } else {
    // Mode Kamera Bahu (Third-Person Free Fire Style)
    const camLerpFactor = Math.min(1, dt * 12);
    camControl.yaw = lerpAngle(camControl.yaw, camControl.targetYaw, camLerpFactor);
    camControl.pitch += (camControl.targetPitch - camControl.pitch) * camLerpFactor;
    camControl.dist += (camControl.targetDist - camControl.dist) * camLerpFactor;

    const lookDirX = Math.sin(camControl.yaw);
    const lookDirZ = Math.cos(camControl.yaw);
    const rightDirX = -Math.cos(camControl.yaw);
    const rightDirZ = Math.sin(camControl.yaw);

    const shoulderPivotX = playerState.x + rightDirX * camControl.shoulderOffset;
    const shoulderPivotY = playerState.y + camControl.heightOffset;
    const shoulderPivotZ = playerState.z + rightDirZ * camControl.shoulderOffset;

    const horizDist = camControl.dist * Math.cos(camControl.pitch);
    const vertDist = camControl.dist * Math.sin(camControl.pitch);

    const desiredCamPos = new THREE.Vector3(
      shoulderPivotX - lookDirX * horizDist + shakeX,
      Math.max(0.75, shoulderPivotY + vertDist + shakeY),
      shoulderPivotZ - lookDirZ * horizDist
    );
    sceneRefs.camera.position.lerp(desiredCamPos, Math.min(1, dt * 15));

    const desiredLookAt = new THREE.Vector3(
      shoulderPivotX + lookDirX * 6.0,
      shoulderPivotY + 0.35 - Math.sin(camControl.pitch) * 2.4,
      shoulderPivotZ + lookDirZ * 6.0
    );
    camControl.lookAtPos.lerp(desiredLookAt, Math.min(1, dt * 15));
    sceneRefs.camera.lookAt(camControl.lookAtPos);
  }

  // Transparansi Otomatis Objek Penghalang Kamera
  updateCameraOcclusion(dt);
}
