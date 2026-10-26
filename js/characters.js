/*************************************************************************
 * CHARACTERS.JS - 3 Karakter Pemain, Topi Bonus, Alat Ajaib, & Pelampung Bebek
 *************************************************************************/
import { TOOL_CONFIG } from './config.js';
import { saveState, selectionState, playerState, sceneRefs } from './state.js';

export const previewConfigs = ['bima', 'dina', 'kapi'];
export const previewRenderers = sceneRefs.previewRenderers;

    export function createHatMesh(hatType) {
      const hatGroup = new THREE.Group();
      if (hatType === 'party') {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.45, 0.95, 12),
          new THREE.MeshLambertMaterial({ color: 0xF472B6 })
        );
        cone.position.y = 0.48;
        const pom = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 10, 10),
          new THREE.MeshLambertMaterial({ color: 0xFACC15 })
        );
        pom.position.y = 1.0;
        hatGroup.add(cone, pom);
      } else if (hatType === 'crown') {
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12),
          new THREE.MeshLambertMaterial({ color: 0xFACC15 })
        );
        base.position.y = 0.2;
        hatGroup.add(base);
        for (let i = 0; i < 4; i++) {
          const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 0.38, 4),
            new THREE.MeshLambertMaterial({ color: 0xFACC15 })
          );
          const ang = (i / 4) * Math.PI * 2;
          spike.position.set(Math.cos(ang) * 0.45, 0.5, Math.sin(ang) * 0.45);
          hatGroup.add(spike);
        }
      } else if (hatType === 'cowboy') {
        const brim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 0.9, 0.08, 14),
          new THREE.MeshLambertMaterial({ color: 0x92400E })
        );
        brim.position.y = 0.08;
        const crown = new THREE.Mesh(
          new THREE.CylinderGeometry(0.48, 0.52, 0.55, 12),
          new THREE.MeshLambertMaterial({ color: 0xB45309 })
        );
        crown.position.y = 0.36;
        hatGroup.add(brim, crown);
      }
      return hatGroup;
    }

    export function createMagicToolMesh(toolType) {
      const g = new THREE.Group();
      if (toolType === 'bubble') {
        // Pistol Gelembung Lucu
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 0.75, 10),
          new THREE.MeshLambertMaterial({ color: 0x22D3EE })
        );
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(0.35, 0, 0);
        const nozzle = new THREE.Mesh(
          new THREE.TorusGeometry(0.24, 0.07, 8, 16),
          new THREE.MeshLambertMaterial({ color: 0xF472B6 })
        );
        nozzle.rotation.y = Math.PI / 2;
        nozzle.position.set(0.72, 0, 0);
        const grip = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.42, 0.16),
          new THREE.MeshLambertMaterial({ color: 0xA3E635 })
        );
        grip.position.set(0.08, -0.25, 0);
        g.add(barrel, nozzle, grip);
      } else if (toolType === 'wand') {
        // Tongkat Bintang Emas
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8),
          new THREE.MeshLambertMaterial({ color: 0xE0E7FF })
        );
        rod.position.y = 0.5;
        const star = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.4, 0.4),
          new THREE.MeshLambertMaterial({ color: 0xFACC15 })
        );
        star.position.y = 1.1;
        star.rotation.z = Math.PI / 4;
        g.add(rod, star);
      } else {
        // Palu Bantal Empuk
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.95, 8),
          new THREE.MeshLambertMaterial({ color: 0x78350F })
        );
        handle.position.y = 0.45;
        const pillow = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.55, 0.95),
          new THREE.MeshLambertMaterial({ color: 0xF472B6 })
        );
        pillow.position.y = 0.95;
        g.add(handle, pillow);
      }
      return g;
    }

    // Pelampung Bebek Lucu yang muncul saat karakter jatuh ke air
    export function createDuckFloatieMesh() {
      const g = new THREE.Group();
      // Donut kuning pelampung
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.32, 12, 24),
        new THREE.MeshLambertMaterial({ color: 0xFACC15 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.65;
      g.add(ring);

      // Kepala bebek di depan (+Z)
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.36, 12, 12),
        new THREE.MeshLambertMaterial({ color: 0xFACC15 })
      );
      head.position.set(0, 1.1, 0.95);
      g.add(head);

      // Paruh bebek oranye
      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.36, 8),
        new THREE.MeshLambertMaterial({ color: 0xFB923C })
      );
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 1.05, 1.35);
      g.add(beak);

      // Mata bebek lucu
      [-0.14, 0.14].forEach(x => {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x14112B })
        );
        eye.position.set(x, 1.18, 1.25);
        g.add(eye);
      });

      g.visible = false;
      return g;
    }

    export function createCharacterModel(charType, hatType = 'none', toolType = 'bubble') {
      const root = new THREE.Group();

      let skinColor = 0xFDBA74;
      let shirtColor = 0x3B82F6;
      let pantsColor = 0x64748B;

      if (charType === 'dina') {
        shirtColor = 0xF472B6;
        pantsColor = 0x9333EA;
      } else if (charType === 'kapi') {
        skinColor = 0x92400E;
        shirtColor = 0xA16207;
        pantsColor = 0x78350F;
      }

      // Kaki Kiri & Kanan
      const leftLeg = new THREE.Group();
      leftLeg.position.set(-0.28, 0.75, 0);
      const leftLegMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.75, 0.42),
        new THREE.MeshLambertMaterial({ color: pantsColor })
      );
      leftLegMesh.position.y = -0.37;
      leftLegMesh.castShadow = true;
      leftLeg.add(leftLegMesh);

      const rightLeg = new THREE.Group();
      rightLeg.position.set(0.28, 0.75, 0);
      const rightLegMesh = leftLegMesh.clone();
      rightLeg.add(rightLegMesh);
      root.add(leftLeg, rightLeg);

      // Badan
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.15, 0.65),
        new THREE.MeshLambertMaterial({ color: shirtColor })
      );
      body.position.y = 1.32;
      body.castShadow = true;
      root.add(body);

      // Rok Ungu Khusus Dina
      if (charType === 'dina') {
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(1.18, 0.42, 0.78),
          new THREE.MeshLambertMaterial({ color: 0x9333EA })
        );
        skirt.position.y = 0.82;
        root.add(skirt);
      }

      // Kepala
      const head = new THREE.Group();
      head.position.y = 2.42;
      const headBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.0, 1.0),
        new THREE.MeshLambertMaterial({ color: skinColor })
      );
      headBox.castShadow = true;
      head.add(headBox);

      // Mata Ramah
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1E1B4B });
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.08), eyeMat);
      eyeL.position.set(-0.24, 0.08, 0.52);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.24;
      head.add(eyeL, eyeR);

      // Rambut Karakter
      if (charType === 'bima') {
        const hair = new THREE.Mesh(
          new THREE.BoxGeometry(1.12, 0.35, 1.08),
          new THREE.MeshLambertMaterial({ color: 0x1F2937 })
        );
        hair.position.y = 0.55;
        head.add(hair);
      } else if (charType === 'dina') {
        const hair = new THREE.Mesh(
          new THREE.BoxGeometry(1.12, 0.35, 1.08),
          new THREE.MeshLambertMaterial({ color: 0x78350F })
        );
        hair.position.y = 0.55;
        // Kuncir Dua di Kiri dan Kanan
        const tailL = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.55, 0.3),
          new THREE.MeshLambertMaterial({ color: 0x78350F })
        );
        tailL.position.set(-0.7, 0.25, -0.15);
        const tailR = tailL.clone();
        tailR.position.x = 0.7;
        head.add(hair, tailL, tailR);
      } else {
        // Kapibara: Telinga bulat kecil
        const earL = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.24, 0.16),
          new THREE.MeshLambertMaterial({ color: 0x78350F })
        );
        earL.position.set(-0.55, 0.45, 0);
        const earR = earL.clone();
        earR.position.x = 0.55;
        // Hidung kotak khas kapibara
        const snout = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.36, 0.32),
          new THREE.MeshLambertMaterial({ color: 0x78350F })
        );
        snout.position.set(0, -0.18, 0.58);
        head.add(earL, earR, snout);
      }
      root.add(head);

      // Tangan Kiri & Kanan
      const leftArm = new THREE.Group();
      leftArm.position.set(-0.72, 1.82, 0);
      const armMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.95, 0.36),
        new THREE.MeshLambertMaterial({ color: shirtColor })
      );
      armMesh.position.y = -0.38;
      armMesh.castShadow = true;
      leftArm.add(armMesh);

      const rightArm = new THREE.Group();
      rightArm.position.set(0.72, 1.82, 0);
      rightArm.add(armMesh.clone());
      root.add(leftArm, rightArm);

      // Wadah Topi di Atas Kepala
      const hatAnchor = new THREE.Group();
      hatAnchor.position.y = 0.55;
      if (hatType !== 'none') {
        hatAnchor.add(createHatMesh(hatType));
      }
      head.add(hatAnchor);

      // Wadah Alat Ajaib di Tangan Kanan
      const toolAnchor = new THREE.Group();
      toolAnchor.position.set(0, -0.85, 0.1);
      toolAnchor.add(createMagicToolMesh(toolType));
      rightArm.add(toolAnchor);

      // Pelampung Bebek (aktif saat jatuh ke air)
      const duckFloatie = createDuckFloatieMesh();
      root.add(duckFloatie);

      return {
        root,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        head,
        hatAnchor,
        toolAnchor,
        duckFloatie
      };
    }

    export function initCharacterPreviews() {
      previewConfigs.forEach(type => {
        const cnv = document.getElementById(`preview-${type}`);
        if (!cnv) return;
        const pRenderer = new THREE.WebGLRenderer({ canvas: cnv, alpha: true, antialias: true });
        pRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        pRenderer.setSize(140, 140, false);

        const pScene = new THREE.Scene();
        const pCam = new THREE.PerspectiveCamera(40, 1, 0.1, 20);
        pCam.position.set(0, 1.85, 4.4);
        pCam.lookAt(0, 1.5, 0);

        pScene.add(new THREE.HemisphereLight(0xFFFFFF, 0x4ADE80, 0.9));
        const dL = new THREE.DirectionalLight(0xFFFFFF, 0.8);
        dL.position.set(3, 5, 4);
        pScene.add(dL);

        const model = createCharacterModel(type, saveState.hat, selectionState.tool);
        pScene.add(model.root);

        previewRenderers[type] = { renderer: pRenderer, scene: pScene, camera: pCam, model };
      });
    }

    export function refreshPreviewHatsAndTools() {
      previewConfigs.forEach(type => {
        const item = previewRenderers[type];
        if (!item) return;
        const { hatAnchor, toolAnchor } = item.model;
        while (hatAnchor.children.length > 0) hatAnchor.remove(hatAnchor.children[0]);
        if (saveState.hat !== 'none') hatAnchor.add(createHatMesh(saveState.hat));

        while (toolAnchor.children.length > 0) toolAnchor.remove(toolAnchor.children[0]);
        toolAnchor.add(createMagicToolMesh(selectionState.tool));
      });
    }

export function rebuildPlayerModel() {
  if (sceneRefs.playerObj && sceneRefs.playerObj.root && sceneRefs.scene) {
    sceneRefs.scene.remove(sceneRefs.playerObj.root);
  }
  sceneRefs.playerObj = createCharacterModel(selectionState.char, saveState.hat, selectionState.tool);
  sceneRefs.playerObj.root.position.set(playerState.x, playerState.y, playerState.z);
  if (sceneRefs.scene) {
    sceneRefs.scene.add(sceneRefs.playerObj.root);
  }
}
