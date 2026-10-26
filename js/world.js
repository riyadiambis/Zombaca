/*************************************************************************
 * WORLD.JS - Geometri Pulau, 5 Zona, Rintangan, Sungai/Danau, & Tabrakan
 *************************************************************************/
import {
  STEP_H, WATER_Y, GRAVITY, BOUNCE_VY,
  RIVER_HALF, LAKE, ZONES, MAZE
} from './config.js';
import {
  colliders, steppingStones, rafts, trampolines,
  occludableObjects, occludableMeshes, meshToOccludableMap, instOccluders,
  sceneRefs, totalTimeRef
} from './state.js';

export const staticGroup = new THREE.Group();
export const dynGroup = new THREE.Group();
export const worldInfo = { bridges: [], rafts: [], tramps: [], pathLines: [], hill: [], docks: [], stones: [] };
export let oceanMesh = null;
export const waveRingMeshes = [];
export const waterMats = [];

    export function registerOccludableGroup(groupOrMesh) {
      const meshes = [];
      groupOrMesh.traverse(child => {
        if (child.isMesh) {
          // Kloning material agar perubahan opacity tidak mempengaruhi objek lain
          child.material = Array.isArray(child.material)
            ? child.material.map(m => m.clone())
            : child.material.clone();
          meshes.push(child);
          occludableMeshes.push(child);
        }
      });
      const entry = {
        meshes,
        currentOpacity: 1.0,
        targetOpacity: 1.0
      };
      occludableObjects.push(entry);
      meshes.forEach(m => meshToOccludableMap.set(m, entry));
    }

    // Fungsi bantu matematika sudut terpendek (-PI sampai PI)
    export function normalizeAngle(angle) {
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
      return angle;
    }

    export function lerpAngle(current, target, t) {
      const diff = normalizeAngle(target - current);
      return normalizeAngle(current + diff * Math.min(1, t));
    }

    /*************************************************************************
     * 5B. PULAU BESAR (~160 x 160), ZONA, AIR, DAN SISTEM TABRAKAN
     *************************************************************************/


    export function mulberry32(seed) {
      return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
export const worldRng = mulberry32(20240607);

    // ---------- Bentuk pulau tidak bulat (ada tanjung dan teluk) ----------
    export function gaussAng(t, c, w) {
      const d = Math.atan2(Math.sin(t - c), Math.cos(t - c));
      return Math.exp(-(d * d) / (2 * w * w));
    }
    export function islandRadiusAt(t) {
      return 75 + 7 * Math.sin(t) + 4.5 * Math.sin(3 * t + 0.6) + 3 * Math.cos(5 * t) +
        2.5 * Math.sin(2 * t + 1.2) + 8 * gaussAng(t, -2.0, 0.3) -
        9 * gaussAng(t, 0.55, 0.22) + 6 * gaussAng(t, 2.6, 0.25);
    }
    export function islandMargin(x, z) {
      return islandRadiusAt(Math.atan2(z, x)) - Math.hypot(x, z);
    }
    export function insideIsland(x, z, margin = 0) {
      return islandMargin(x, z) >= margin;
    }
    // Pemain / zombie tidak bisa keluar dari pulau
    export function clampToIsland(pos, margin) {
      const r = Math.hypot(pos.x, pos.z);
      const maxR = islandRadiusAt(Math.atan2(pos.z, pos.x)) - margin;
      if (r > maxR && r > 0.0001) {
        pos.x *= maxR / r;
        pos.z *= maxR / r;
        return true;
      }
      return false;
    }

    // ---------- Sungai & danau ----------
    export function riverCenterZ(x) {
      return 30 + 3.2 * Math.sin(x * 0.06 + 0.5);
    }
    export function isWaterAt(x, z) {
      if (Math.abs(z - riverCenterZ(x)) < RIVER_HALF) return true;
      const lx = (x - LAKE.x) / LAKE.rx;
      const lz = (z - LAKE.z) / LAKE.rz;
      return lx * lx + lz * lz < 1;
    }
    // -1 = tepi utara sungai, +1 = tepi selatan, 0 = di badan sungai
    export function riverSide(x, z) {
      const d = z - riverCenterZ(x);
      if (d < -RIVER_HALF) return -1;
      if (d > RIVER_HALF) return 1;
      return 0;
    }
    export function nearWater(x, z, m) {
      if (isWaterAt(x, z)) return true;
      const k = m * 0.7;
      return isWaterAt(x + m, z) || isWaterAt(x - m, z) || isWaterAt(x, z + m) || isWaterAt(x, z - m) ||
        isWaterAt(x + k, z + k) || isWaterAt(x - k, z - k) || isWaterAt(x + k, z - k) || isWaterAt(x - k, z + k);
    }

    // ---------- Zona permainan ----------
    export function inMazeArea(x, z, margin) {
      const s = MAZE.cs * MAZE.n;
      return x > MAZE.x0 - margin && x < MAZE.x0 + s + margin && z > MAZE.z0 - margin && z < MAZE.z0 + s + margin;
    }
    export function clampToMaze(pos) {
      const s = MAZE.cs * MAZE.n, pad = 1.3;
      let hit = false;
      if (pos.x < MAZE.x0 + pad) { pos.x = MAZE.x0 + pad; hit = true; }
      if (pos.x > MAZE.x0 + s - pad) { pos.x = MAZE.x0 + s - pad; hit = true; }
      if (pos.z < MAZE.z0 + pad) { pos.z = MAZE.z0 + pad; hit = true; }
      if (pos.z > MAZE.z0 + s - pad) { pos.z = MAZE.z0 + s - pad; hit = true; }
      return hit;
    }


    // ---------- Pembuat tabrakan ----------
    export function addBoxCollider(x0, x1, z0, z1, top, kind, extra) {
      const c = { t: 0, x0, x1, z0, z1, top, kind: kind || 'solid', ramp: null, raft: null, tramp: null, slideDir: null };
      if (extra) Object.assign(c, extra);
      colliders.push(c);
      return c;
    }
    export function addCylCollider(x, z, r, top, kind) {
      const c = { t: 1, x, z, r, top, kind: kind || 'solid', raft: null, tramp: null };
      colliders.push(c);
      return c;
    }
    export function boxTopAt(c, x, z) {
      if (!c.ramp) return c.top;
      const a = c.ramp;
      const v = a.axis === 'x' ? x : z;
      let f = (v - a.from) / (a.to - a.from);
      f = f < 0 ? 0 : (f > 1 ? 1 : f);
      return a.hFrom + (a.hTo - a.hFrom) * f;
    }

    // Dorong lingkaran (pemain/zombie) keluar dari benda yang terlalu tinggi untuk dinaiki
    export function resolveColliders(pos, feetY, r) {
      let hit = false;
      const lim = feetY + STEP_H;
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.t === 1) {
          if (c.top <= lim) continue;
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const rr = c.r + r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2);
          if (d > 0.0001) {
            pos.x = c.x + (dx / d) * rr;
            pos.z = c.z + (dz / d) * rr;
          } else {
            pos.x = c.x + rr;
          }
          hit = true;
        } else {
          if (pos.x < c.x0 - r || pos.x > c.x1 + r || pos.z < c.z0 - r || pos.z > c.z1 + r) continue;
          const cx = pos.x < c.x0 ? c.x0 : (pos.x > c.x1 ? c.x1 : pos.x);
          const cz = pos.z < c.z0 ? c.z0 : (pos.z > c.z1 ? c.z1 : pos.z);
          if (boxTopAt(c, cx, cz) <= lim) continue;
          const dx = pos.x - cx, dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x = cx + (dx / d) * r;
            pos.z = cz + (dz / d) * r;
          } else {
            const l = pos.x - c.x0, rt = c.x1 - pos.x, tp = pos.z - c.z0, bt = c.z1 - pos.z;
            const m = Math.min(l, rt, tp, bt);
            if (m === l) pos.x = c.x0 - r;
            else if (m === rt) pos.x = c.x1 + r;
            else if (m === tp) pos.z = c.z0 - r;
            else pos.z = c.z1 + r;
          }
          hit = true;
        }
      }
      return hit;
    }

    // Permukaan tertinggi yang bisa dipijak di titik (x,z) dari ketinggian kaki feetY
    const supportResult = { h: 0, obj: null, found: false };
    export function getSupport(x, z, feetY) {
      const lim = feetY + STEP_H;
      let h = 0, obj = null, found = false;
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        let t;
        if (c.t === 1) {
          const dx = x - c.x, dz = z - c.z;
          const rr = c.r + 0.12;
          if (dx * dx + dz * dz > rr * rr) continue;
          t = c.top;
        } else {
          if (x < c.x0 - 0.1 || x > c.x1 + 0.1 || z < c.z0 - 0.1 || z > c.z1 + 0.1) continue;
          t = c.ramp ? boxTopAt(c, x, z) : c.top;
        }
        if (t <= lim && t > h) {
          h = t; obj = c; found = true;
        }
      }
      supportResult.h = h;
      supportResult.obj = obj;
      supportResult.found = found;
      return supportResult;
    }

    // Titik bebas untuk menaruh dekorasi / zombie (tidak di air, tidak di dalam benda apapun)
    export function blockedAtGround(x, z, r) {
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.raft) continue;
        if (c.t === 1) {
          const rr = c.r + r;
          const dx = x - c.x, dz = z - c.z;
          if (dx * dx + dz * dz < rr * rr) return true;
        } else {
          const cx = x < c.x0 ? c.x0 : (x > c.x1 ? c.x1 : x);
          const cz = z < c.z0 ? c.z0 : (z > c.z1 ? c.z1 : z);
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz < r * r) return true;
        }
      }
      return false;
    }
    export function isFreeSpot(x, z, r) {
      return insideIsland(x, z, 3.2) && !nearWater(x, z, r + 0.8) && !blockedAtGround(x, z, r);
    }
    // Daratan terdekat (dipakai saat karakter / zombie jatuh ke air)
    export function findNearestLand(x, z) {
      for (let rad = 1.5; rad <= 70; rad += 1.5) {
        const n = Math.max(10, Math.floor(rad * 2.2));
        const off = Math.random() * 6.28;
        for (let k = 0; k < n; k++) {
          const a = off + (k / n) * Math.PI * 2;
          const px = x + Math.cos(a) * rad;
          const pz = z + Math.sin(a) * rad;
          if (isFreeSpot(px, pz, 1.0) && !inMazeArea(px, pz, 1.0)) return { x: px, z: pz };
        }
      }
      return { x: 0, z: 8 };
    }

    // ---------- Jalan setapak ----------
    const pathSegs = [];
    export function distToPaths(x, z) {
      let best = Infinity;
      for (let i = 0; i < pathSegs.length; i++) {
        const s = pathSegs[i];
        const vx = s[2] - s[0], vz = s[3] - s[1];
        const l2 = vx * vx + vz * vz || 1;
        let t = ((x - s[0]) * vx + (z - s[1]) * vz) / l2;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const d = Math.hypot(x - (s[0] + vx * t), z - (s[1] + vz * t));
        if (d < best) best = d;
      }
      return best;
    }

    // ---------- Alat bantu pembuat mesh ----------
    const lamCache = {};
    export function lam(color) {
      if (!lamCache[color]) lamCache[color] = new THREE.MeshLambertMaterial({ color });
      return lamCache[color];
    }
    export function addBoxMesh(parent, w, h, d, x, y, z, color, shadow = true) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
      m.position.set(x, y, z);
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    }
    export function makeInstanced(geo, mat, count, castShadow, receiveShadow) {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
      m.count = count;
      m.frustumCulled = false; // r128: kotak pembatas instance tidak akurat, jadi matikan culling
      m.castShadow = !!castShadow;
      m.receiveShadow = !!receiveShadow;
      staticGroup.add(m);
      return m;
    }
    const _dummy = new THREE.Object3D();

    export function islandPoints(offset) {
      const pts = [];
      const N = 240;
      for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const r = islandRadiusAt(t) + offset;
        pts.push(new THREE.Vector2(Math.cos(t) * r, -Math.sin(t) * r));
      }
      return pts;
    }

    // Bidang datar berwarna di tanah (dipotong agar tidak keluar pulau)
    export function addGroundPatch(cx, cz, rx, rz, color, y) {
      const pts = [];
      for (let i = 0; i < 56; i++) {
        const t = (i / 56) * Math.PI * 2;
        let px = cx + Math.cos(t) * rx;
        let pz = cz + Math.sin(t) * rz;
        if (islandMargin(px, pz) < 1.6) {
          const r = Math.hypot(px, pz);
          const maxR = islandRadiusAt(Math.atan2(pz, px)) - 1.6;
          px *= maxR / r;
          pz *= maxR / r;
        }
        pts.push(new THREE.Vector2(px, -pz));
      }
      const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), new THREE.MeshLambertMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.receiveShadow = true;
      staticGroup.add(m);
    }

    // ---------- Rumah, sumur, gerobak ----------
    export function addHouse(x, z, wallColor, roofColor, rotY) {
      const group = new THREE.Group();
      const walls = addBoxMesh(group, 4.6, 3.2, 4.2, 0, 1.6, 0, wallColor);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2.4, 4), lam(roofColor));
      roof.position.y = 4.4;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);
      addBoxMesh(group, 1.1, 1.9, 0.2, 0, 0.95, 2.12, 0x78350F, false);
      addBoxMesh(group, 0.9, 0.9, 0.12, -1.5, 1.9, 2.12, 0xBAE6FD, false);
      addBoxMesh(group, 0.9, 0.9, 0.12, 1.5, 1.9, 2.12, 0xBAE6FD, false);
      addBoxMesh(group, 0.7, 1.4, 0.7, 1.4, 5.3, -0.9, 0x92400E, false);
      group.position.set(x, 0, z);
      group.rotation.y = rotY;
      staticGroup.add(group);
      const quarter = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;
      const hx = quarter ? 2.1 : 2.3;
      const hz = quarter ? 2.3 : 2.1;
      addBoxCollider(x - hx, x + hx, z - hz, z + hz, 6.5, 'house');
      registerOccludableGroup(group);
      return walls;
    }

    export function addWell(x, z) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 1.1, 14), lam(0xCBD5E1));
      base.position.y = 0.55; base.castShadow = true; base.receiveShadow = true; g.add(base);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.05, 14), lam(0x38BDF8));
      water.position.y = 1.08; g.add(water);
      addBoxMesh(g, 0.2, 2.3, 0.2, -0.95, 1.2, 0, 0x92400E);
      addBoxMesh(g, 0.2, 2.3, 0.2, 0.95, 1.2, 0, 0x92400E);
      addBoxMesh(g, 2.6, 0.25, 1.7, 0, 2.5, 0, 0xEF4444);
      g.position.set(x, 0, z);
      staticGroup.add(g);
      addCylCollider(x, z, 1.2, 1.3, 'well');
    }

    export function addCart(x, z) {
      const g = new THREE.Group();
      addBoxMesh(g, 2.4, 0.6, 1.3, 0, 0.95, 0, 0xB45309);
      addBoxMesh(g, 2.4, 0.4, 0.12, 0, 1.45, 0.62, 0x92400E);
      addBoxMesh(g, 2.4, 0.4, 0.12, 0, 1.45, -0.62, 0x92400E);
      addBoxMesh(g, 1.0, 0.55, 0.9, 0.3, 1.5, 0, 0xFACC15);
      [[-0.7, 0.72], [0.7, 0.72], [-0.7, -0.72], [0.7, -0.72]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 12), lam(0x78350F));
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.5, wz);
        w.castShadow = true;
        g.add(w);
      });
      addBoxMesh(g, 1.6, 0.12, 0.12, -2.0, 0.95, 0.4, 0x92400E);
      addBoxMesh(g, 1.6, 0.12, 0.12, -2.0, 0.95, -0.4, 0x92400E);
      g.position.set(x, 0, z);
      staticGroup.add(g);
      addBoxCollider(x - 1.3, x + 1.3, z - 0.8, z + 0.8, 1.35, 'cart');
    }

    // ---------- Bukit bertingkat dengan tangga balok ----------
    export function addTier(x0, x1, z0, z1, top, topColor) {
      const side = lam(0xCFA878);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(x1 - x0, top, z1 - z0),
        [side, side, lam(topColor), side, side, side]
      );
      m.position.set((x0 + x1) / 2, top / 2, (z0 + z1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      staticGroup.add(m);
      registerOccludableGroup(m);
      addBoxCollider(x0, x1, z0, z1, top, 'tier');
    }
    // dir: 'E' (+x), 'W' (-x), 'S' (+z), 'N' (-z): arah keluar dari sisi bidang atas
    export function addStairs(dir, face, along, width, tierTop, steps, color) {
      for (let k = 1; k <= steps; k++) {
        const top = tierTop - 0.6 * k;
        const a = (k - 1) * 1.2, b = k * 1.2;
        let x0, x1, z0, z1;
        if (dir === 'E') { x0 = face + a; x1 = face + b; z0 = along - width / 2; z1 = along + width / 2; }
        else if (dir === 'W') { x0 = face - b; x1 = face - a; z0 = along - width / 2; z1 = along + width / 2; }
        else if (dir === 'S') { z0 = face + a; z1 = face + b; x0 = along - width / 2; x1 = along + width / 2; }
        else { z0 = face - b; z1 = face - a; x0 = along - width / 2; x1 = along + width / 2; }
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, top, z1 - z0), lam(color));
        m.position.set((x0 + x1) / 2, top / 2, (z0 + z1) / 2);
        m.castShadow = true; m.receiveShadow = true;
        staticGroup.add(m);
        addBoxCollider(x0, x1, z0, z1, top, 'stair');
      }
    }

    // ---------- Jembatan, batu loncatan, dermaga, rakit ----------
    let plankTexture = null;
    export function getPlankTexture() {
      if (plankTexture) return plankTexture;
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#B7752F'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#8A5420'; g.fillRect(0, 0, 64, 6);
      g.fillStyle = '#C98B45'; g.fillRect(0, 10, 64, 20);
      g.fillStyle = '#A8652A'; g.fillRect(0, 36, 64, 20);
      plankTexture = new THREE.CanvasTexture(c);
      plankTexture.wrapS = plankTexture.wrapT = THREE.RepeatWrapping;
      return plankTexture;
    }

    export function addBridge(bx) {
      const cz = riverCenterZ(bx);
      const z0 = cz - 6.4, z1 = cz + 6.4, len = z1 - z0;
      const tex = getPlankTexture().clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, len / 1.2);
      const side = lam(0x8A5420);
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.35, len),
        [side, side, new THREE.MeshLambertMaterial({ map: tex }), side, side, side]
      );
      deck.position.set(bx, 0.375, cz);
      deck.castShadow = true; deck.receiveShadow = true;
      staticGroup.add(deck);
      addBoxCollider(bx - 1.8, bx + 1.8, z0, z1, 0.55, 'bridge');
      [-1, 1].forEach(sd => {
        const rx = bx + sd * 1.62;
        addBoxMesh(staticGroup, 0.16, 0.16, len, rx, 1.15, cz, 0xE9B26B);
        addBoxMesh(staticGroup, 0.16, 0.16, len, rx, 0.8, cz, 0xE9B26B);
        for (let pz = z0 + 0.3; pz <= z1 - 0.2; pz += 2.4) {
          addBoxMesh(staticGroup, 0.26, 1.3, 0.26, rx, 0.85, pz, 0x92400E);
        }
        addBoxCollider(rx - 0.2, rx + 0.2, z0, z1, 1.3, 'rail');
      });
      worldInfo.bridges.push({ x: bx, z0, z1 });
    }

    export function addStoneCrossing(xc) {
      const cz = riverCenterZ(xc);
      const defs = [
        [0.8, -4.0, 1.1, 0.45], [-0.9, -1.8, 1.05, 0.85], [0.7, 0.5, 1.15, 0.55],
        [-0.8, 2.7, 1.05, 0.95], [0.3, 4.3, 1.1, 0.5]
      ];
      defs.forEach(([ox, oz, r, h], i) => {
        const x = xc + ox, z = cz + oz;
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(r, r * 1.15, h + 0.4, 9),
          lam(i % 2 === 0 ? 0xCBD5E1 : 0x94A3B8)
        );
        m.position.set(x, (h - 0.4) / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        staticGroup.add(m);
        addCylCollider(x, z, r, h, 'stone');
        worldInfo.stones.push({ x, z });
      });
    }

    export function addDock(x0, x1, z0, z1) {
      addBoxMesh(staticGroup, x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, 0.3, (z0 + z1) / 2, 0xA16207);
      addBoxMesh(staticGroup, x1 - x0, 0.06, 0.12, (x0 + x1) / 2, 0.47, z0 + 0.5, 0xC98B45, false);
      addBoxMesh(staticGroup, x1 - x0, 0.06, 0.12, (x0 + x1) / 2, 0.47, z1 - 0.5, 0xC98B45, false);
      addBoxCollider(x0, x1, z0, z1, 0.45, 'dock');
      worldInfo.docks.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2 });
    }

    export function addRaft(zc, startAtMax) {
      const group = new THREE.Group();
      addBoxMesh(group, 3.4, 0.3, 3.4, 0, 0.3, 0, 0xC2833A);
      for (let i = -3; i <= 3; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.4, 8), lam(i % 2 ? 0xA16207 : 0x92400E));
        log.rotation.x = Math.PI / 2;
        log.position.set(i * 0.46, 0.5, 0);
        log.castShadow = true;
        group.add(log);
      }
      addBoxMesh(group, 0.14, 1.6, 0.14, -1.4, 1.3, -1.4, 0x78350F);
      addBoxMesh(group, 0.8, 0.5, 0.06, -1.0, 1.85, -1.4, 0xF472B6);
      dynGroup.add(group);
      const min = -17.68, max = 5.68;
      const raft = {
        zc, min, max, pos: startAtMax ? max : min, dir: startAtMax ? -1 : 1,
        speed: 2.2, pause: startAtMax ? 2.5 : 0.8, dx: 0, dz: 0, group, col: null
      };
      raft.col = addBoxCollider(raft.pos - 1.7, raft.pos + 1.7, zc - 1.7, zc + 1.7, 0.45, 'raft', { raft });
      group.position.set(raft.pos, 0, zc);
      worldInfo.rafts.push(raft);
    }

    export function updateRafts(dt) {
      for (let i = 0; i < worldInfo.rafts.length; i++) {
        const r = worldInfo.rafts[i];
        const old = r.pos;
        if (r.pause > 0) {
          r.pause -= dt;
        } else {
          r.pos += r.dir * r.speed * dt;
          if (r.pos >= r.max) { r.pos = r.max; r.dir = -1; r.pause = 2.2; }
          if (r.pos <= r.min) { r.pos = r.min; r.dir = 1; r.pause = 2.2; }
        }
        r.dx = r.pos - old;
        r.dz = 0;
        r.col.x0 = r.pos - 1.7; r.col.x1 = r.pos + 1.7;
        r.group.position.set(r.pos, Math.sin(totalTimeRef.t * 2 + i) * 0.03, r.zc);
      }
    }

    // ---------- Trampolin ----------
    export function addTramp(x, z) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.45, 18), lam(0x3B82F6));
      ring.position.y = 0.225; ring.castShadow = true; ring.receiveShadow = true;
      g.add(ring);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.1, 18), lam(0xF472B6));
      disc.position.y = 0.45;
      g.add(disc);
      const star = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.03, 5), lam(0xFACC15));
      star.position.y = 0.51;
      disc.add(star);
      star.position.y = 0.06;
      g.position.set(x, 0, z);
      dynGroup.add(g);
      const col = addCylCollider(x, z, 2.1, 0.5, 'tramp');
      col.tramp = { disc, squash: 0 };
      worldInfo.tramps.push(col);
    }
    export function updateTramps(dt) {
      for (let i = 0; i < worldInfo.tramps.length; i++) {
        const t = worldInfo.tramps[i].tramp;
        if (t.squash > 0) t.squash -= dt;
        const s = t.squash > 0 ? Math.sin((t.squash / 0.35) * Math.PI) * 0.45 : 0;
        t.disc.scale.y = 1 - s;
        t.disc.position.y = 0.45 - s * 0.05;
      }
    }

    // ---------- Pagar rendah & batang kayu tumbang ----------
    const fenceSegs = [];
    export function addFence(x0, z0, x1, z1) { fenceSegs.push([x0, z0, x1, z1]); }

    export function addLog(x, z, axis, len) {
      const geo = new THREE.CylinderGeometry(0.5, 0.5, len, 10);
      const log = new THREE.Mesh(geo, lam(0x92400E));
      if (axis === 'z') log.rotation.x = Math.PI / 2; else log.rotation.z = Math.PI / 2;
      log.position.set(x, 0.5, z);
      log.castShadow = true; log.receiveShadow = true;
      staticGroup.add(log);
      const capGeo = new THREE.CylinderGeometry(0.36, 0.36, len + 0.06, 10);
      const core = new THREE.Mesh(capGeo, lam(0xD6A56B));
      core.rotation.copy(log.rotation);
      core.position.copy(log.position);
      core.scale.set(1, 0.999, 1);
      staticGroup.add(core);
      const bx = axis === 'x' ? len / 2 : 0.5;
      const bz = axis === 'x' ? 0.5 : len / 2;
      addBoxCollider(x - bx, x + bx, z - bz, z + bz, 1.0, 'log');
    }

    // ---------- Labirin semak kecil ----------
    export function buildMaze() {
      const n = MAZE.n, cs = MAZE.cs, t = MAZE.t;
      const rngM = mulberry32(777);
      // dinding: h[j][i] (garis horizontal j, kolom i), v[i][j] (garis vertikal i, baris j)
      const hW = [], vW = [];
      for (let j = 0; j <= n; j++) { hW.push(new Array(n).fill(true)); }
      for (let i = 0; i <= n; i++) { vW.push(new Array(n).fill(true)); }
      const visited = [];
      for (let i = 0; i < n; i++) visited.push(new Array(n).fill(false));
      const stack = [[2, 2]];
      visited[2][2] = true;
      while (stack.length) {
        const [ci, cj] = stack[stack.length - 1];
        const opts = [];
        if (ci > 0 && !visited[ci - 1][cj]) opts.push([ci - 1, cj, 'W']);
        if (ci < n - 1 && !visited[ci + 1][cj]) opts.push([ci + 1, cj, 'E']);
        if (cj > 0 && !visited[ci][cj - 1]) opts.push([ci, cj - 1, 'N']);
        if (cj < n - 1 && !visited[ci][cj + 1]) opts.push([ci, cj + 1, 'S']);
        if (!opts.length) { stack.pop(); continue; }
        const [ni, nj, d] = opts[Math.floor(rngM() * opts.length)];
        if (d === 'W') vW[ci][cj] = false;
        if (d === 'E') vW[ci + 1][cj] = false;
        if (d === 'N') hW[cj][ci] = false;
        if (d === 'S') hW[cj + 1][ci] = false;
        visited[ni][nj] = true;
        stack.push([ni, nj]);
      }
      hW[n][2] = false; // pintu masuk di sisi selatan (tengah)
      // beberapa lubang tambahan supaya tidak terlalu sulit untuk anak
      for (let k = 0; k < 4; k++) {
        const i = 1 + Math.floor(rngM() * (n - 2)), j = 1 + Math.floor(rngM() * (n - 2));
        if (rngM() < 0.5) vW[i][j] = false; else hW[j][i] = false;
      }

      // lantai labirin
      addBoxMesh(staticGroup, cs * n, 0.05, cs * n, MAZE.cx, 0.03, MAZE.cz, 0xFEF3C7, false);

      const walls = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) if (hW[j][i]) {
        const cx = MAZE.x0 + (i + 0.5) * cs, cz = MAZE.z0 + j * cs;
        walls.push({ cx, cz, sx: cs + t, sz: t });
      }
      for (let i = 0; i <= n; i++) for (let j = 0; j < n; j++) if (vW[i][j]) {
        const cx = MAZE.x0 + i * cs, cz = MAZE.z0 + (j + 0.5) * cs;
        walls.push({ cx, cz, sx: t, sz: cs + t });
      }
      const H = 3.3;
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(0, 0.5, 0);
      const inst = makeInstanced(geo, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), walls.length, true, true);
      const cols = [0x22C55E, 0x16A34A, 0x4ADE80];
      walls.forEach((w, idx) => {
        _dummy.position.set(w.cx, 0, w.cz);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(w.sx, H, w.sz);
        _dummy.updateMatrix();
        const color = new THREE.Color(cols[idx % cols.length]);
        inst.setMatrixAt(idx, _dummy.matrix);
        inst.setColorAt(idx, color);
        addBoxCollider(w.cx - w.sx / 2, w.cx + w.sx / 2, w.cz - w.sz / 2, w.cz + w.sz / 2, H, 'hedge');
        instOccluders.push({
          x: w.cx, z: w.cz, r: Math.max(w.sx, w.sz) / 2 + 0.6, top: H,
          parts: [{ inst, idx, geom: geo, color, matrix: _dummy.matrix.clone() }]
        });
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }

    // ---------- Sebaran pohon / semak / bunga / batu (InstancedMesh) ----------
    const treeSpots = [];
    export function scatterTrees(cx, cz, rx, rz, count, minSp, sMin, sMax, edgeMargin) {
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 60) {
        tries++;
        const a = worldRng() * Math.PI * 2, rr = Math.sqrt(worldRng());
        const x = cx + Math.cos(a) * rx * rr, z = cz + Math.sin(a) * rz * rr;
        if (!insideIsland(x, z, edgeMargin)) continue;
        if (nearWater(x, z, 2.6)) continue;
        if (distToPaths(x, z) < 3.4) continue;
        const s = sMin + worldRng() * (sMax - sMin);
        if (blockedAtGround(x, z, 1.5 * s)) continue;
        if (Math.hypot(x - 0, z - 8) < 6) continue; // area titik awal tetap lapang
        let ok = true;
        for (let i = 0; i < treeSpots.length; i++) {
          if (Math.hypot(x - treeSpots[i].x, z - treeSpots[i].z) < minSp) { ok = false; break; }
        }
        if (!ok) continue;
        treeSpots.push({ x, z, s, sy: 0.9 + worldRng() * 0.3, rot: worldRng() * Math.PI, ci: Math.floor(worldRng() * 4) });
        placed++;
      }
    }

    export function buildInstancedTrees() {
      const n = treeSpots.length;
      const geos = [
        new THREE.BoxGeometry(1.1, 2.6, 1.1),
        new THREE.BoxGeometry(3.2, 2.2, 3.2),
        new THREE.BoxGeometry(2.1, 1.6, 2.1)
      ];
      geos[0].translate(0, 1.3, 0);
      geos[1].translate(0, 3.2, 0);
      geos[2].translate(0, 4.6, 0);
      const mat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
      const meshes = geos.map(g => makeInstanced(g, mat, n, true, false));
      const crownCols = [0x22C55E, 0x16A34A, 0x84CC16, 0x4ADE80];
      treeSpots.forEach((t, i) => {
        _dummy.position.set(t.x, 0, t.z);
        _dummy.rotation.set(0, t.rot, 0);
        _dummy.scale.set(t.s, t.s * t.sy, t.s);
        _dummy.updateMatrix();
        const cols = [new THREE.Color(0x92400E), new THREE.Color(crownCols[t.ci]), new THREE.Color(0xA3E635)];
        const parts = [];
        for (let k = 0; k < 3; k++) {
          meshes[k].setMatrixAt(i, _dummy.matrix);
          meshes[k].setColorAt(i, cols[k]);
          parts.push({ inst: meshes[k], idx: i, geom: geos[k], color: cols[k], matrix: _dummy.matrix.clone() });
        }
        addCylCollider(t.x, t.z, 0.85 * t.s, 6.5, 'tree');
        instOccluders.push({ x: t.x, z: t.z, r: 1.7 * t.s + 0.3, top: 5.6 * t.s * t.sy, parts });
      });
      meshes.forEach(m => {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      });
    }

    export function scatterPoints(count, cx, cz, rx, rz, minSp, radius, pathMin, edgeMargin, waterMargin) {
      const out = [];
      let tries = 0;
      while (out.length < count && tries < count * 50) {
        tries++;
        const a = worldRng() * Math.PI * 2, rr = Math.sqrt(worldRng());
        const x = cx + Math.cos(a) * rx * rr, z = cz + Math.sin(a) * rz * rr;
        if (!insideIsland(x, z, edgeMargin)) continue;
        if (nearWater(x, z, waterMargin)) continue;
        if (distToPaths(x, z) < pathMin) continue;
        if (blockedAtGround(x, z, radius)) continue;
        if (Math.hypot(x, z - 8) < 3) continue;
        let ok = true;
        for (let i = 0; i < treeSpots.length; i++) {
          if (Math.hypot(x - treeSpots[i].x, z - treeSpots[i].z) < 1.6) { ok = false; break; }
        }
        if (!ok) continue;
        for (let i = 0; i < out.length; i++) {
          if (Math.hypot(x - out[i].x, z - out[i].z) < minSp) { ok = false; break; }
        }
        if (!ok) continue;
        out.push({ x, z });
      }
      return out;
    }

    export function buildBushes() {
      let pts = [];
      pts = pts.concat(scatterPoints(44, -46, -12, 27, 32, 2.2, 0.8, 2.4, 4, 1.4));
      pts = pts.concat(scatterPoints(12, 0, 2, 22, 22, 3, 0.8, 2.4, 4, 1.4));
      pts = pts.concat(scatterPoints(14, -2, -46, 34, 28, 3, 0.8, 2.4, 4, 1.4));
      pts = pts.concat(scatterPoints(22, 8, 48, 32, 22, 3, 0.8, 2.4, 4, 1.4));
      pts = pts.concat(scatterPoints(14, 56, 8, 24, 22, 3, 0.8, 2.4, 4, 1.4));
      const n = pts.length;
      const gA = new THREE.BoxGeometry(1.5, 0.9, 1.5); gA.translate(0, 0.45, 0);
      const gB = new THREE.BoxGeometry(1.0, 0.6, 1.0); gB.translate(0, 1.0, 0);
      const mat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
      const mA = makeInstanced(gA, mat, n, true, false);
      const mB = makeInstanced(gB, mat, n, false, false);
      const cA = [0x16A34A, 0x22C55E, 0x15803D], cB = [0x4ADE80, 0x86EFAC, 0xA3E635];
      pts.forEach((p, i) => {
        const s = 0.75 + worldRng() * 0.6;
        _dummy.position.set(p.x, 0, p.z);
        _dummy.rotation.set(0, worldRng() * 3, 0);
        _dummy.scale.set(s, s, s);
        _dummy.updateMatrix();
        mA.setMatrixAt(i, _dummy.matrix); mA.setColorAt(i, new THREE.Color(cA[i % 3]));
        mB.setMatrixAt(i, _dummy.matrix); mB.setColorAt(i, new THREE.Color(cB[i % 3]));
      });
      [mA, mB].forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }

    export function buildFlowers() {
      const pts = scatterPoints(260, 0, 0, 78, 78, 1.8, 0.35, 2.0, 4, 1.0);
      const n = pts.length;
      const gs = new THREE.BoxGeometry(0.18, 0.35, 0.18); gs.translate(0, 0.17, 0);
      const gh = new THREE.BoxGeometry(0.45, 0.25, 0.45); gh.translate(0, 0.42, 0);
      const mat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
      const ms = makeInstanced(gs, mat, n, false, false);
      const mh = makeInstanced(gh, mat, n, false, false);
      const hc = [0xF472B6, 0xFACC15, 0xFB923C, 0x38BDF8, 0xFFFFFF, 0xC084FC];
      const green = new THREE.Color(0x16A34A);
      pts.forEach((p, i) => {
        _dummy.position.set(p.x, 0, p.z);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        ms.setMatrixAt(i, _dummy.matrix); ms.setColorAt(i, green);
        mh.setMatrixAt(i, _dummy.matrix); mh.setColorAt(i, new THREE.Color(hc[i % hc.length]));
      });
      [ms, mh].forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    }

    export function buildRocks() {
      let pts = [];
      pts = pts.concat(scatterPoints(12, -2, -46, 34, 28, 3, 1.2, 2.4, 4, 1.4));
      pts = pts.concat(scatterPoints(10, -46, -12, 27, 32, 3, 1.2, 2.4, 4, 1.4));
      pts = pts.concat(scatterPoints(10, 8, 48, 32, 22, 3, 1.2, 2.4, 4, 1.4));
      pts = pts.concat(scatterPoints(8, 56, 8, 24, 22, 3, 1.2, 2.4, 4, 1.4));
      const n = pts.length;
      const g = new THREE.IcosahedronGeometry(0.7, 0);
      g.translate(0, 0.3, 0);
      const m = makeInstanced(g, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), n, true, true);
      const cols = [0xCBD5E1, 0x94A3B8, 0xA8A29E];
      pts.forEach((p, i) => {
        const s = 0.5 + worldRng() * 0.9;
        _dummy.position.set(p.x, 0, p.z);
        _dummy.rotation.set(0, worldRng() * 6, 0);
        _dummy.scale.set(s, s * 0.8, s);
        _dummy.updateMatrix();
        m.setMatrixAt(i, _dummy.matrix);
        m.setColorAt(i, new THREE.Color(cols[i % 3]));
        if (s >= 1.05) addCylCollider(p.x, p.z, 0.75 * s, 0.85 * s, 'rock');
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    export function buildFences() {
      let posts = 0;
      fenceSegs.forEach(s => {
        const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
        posts += Math.floor(len / 1.6) + 1;
      });
      const gp = new THREE.BoxGeometry(0.28, 1.0, 0.28); gp.translate(0, 0.5, 0);
      const gr = new THREE.BoxGeometry(1, 0.14, 0.16);
      const mp = makeInstanced(gp, new THREE.MeshLambertMaterial({ color: 0xE9B26B }), posts, true, false);
      const mr = makeInstanced(gr, new THREE.MeshLambertMaterial({ color: 0xFCD9A6 }), fenceSegs.length * 2, true, false);
      let pi = 0, ri = 0;
      fenceSegs.forEach(s => {
        const vertical = Math.abs(s[2] - s[0]) < 0.01;
        const len = Math.hypot(s[2] - s[0], s[3] - s[1]);
        const np = Math.floor(len / 1.6) + 1;
        for (let k = 0; k < np; k++) {
          const t = np === 1 ? 0 : k / (np - 1);
          _dummy.position.set(s[0] + (s[2] - s[0]) * t, 0, s[1] + (s[3] - s[1]) * t);
          _dummy.rotation.set(0, 0, 0); _dummy.scale.set(1, 1, 1); _dummy.updateMatrix();
          mp.setMatrixAt(pi++, _dummy.matrix);
        }
        [0.35, 0.78].forEach(h => {
          _dummy.position.set((s[0] + s[2]) / 2, h, (s[1] + s[3]) / 2);
          _dummy.rotation.set(0, vertical ? Math.PI / 2 : 0, 0);
          _dummy.scale.set(len, 1, 1);
          _dummy.updateMatrix();
          mr.setMatrixAt(ri++, _dummy.matrix);
        });
        const x0 = Math.min(s[0], s[2]) - 0.25, x1 = Math.max(s[0], s[2]) + 0.25;
        const z0 = Math.min(s[1], s[3]) - 0.25, z1 = Math.max(s[1], s[3]) + 0.25;
        addBoxCollider(x0, x1, z0, z1, 1.0, 'fence');
      });
      mp.instanceMatrix.needsUpdate = true;
      mr.instanceMatrix.needsUpdate = true;
    }

    // ---------- Pembangun dunia utama ----------
    export function buildWorld() {
      if (sceneRefs.scene) {
        sceneRefs.scene.add(staticGroup);
        sceneRefs.scene.add(dynGroup);
      }
      sceneRefs.staticGroup = staticGroup;
      sceneRefs.dynGroup = dynGroup;
      // 1. Laut luas + riak buih mengikuti bentuk pulau
      oceanMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(420, 420, 2, 40),
        new THREE.MeshLambertMaterial({ color: 0x0EA5E9 })
      );
      oceanMesh.position.y = -1.8;
      sceneRefs.scene.add(oceanMesh);

      [[3.0, 4.0], [5.6, 6.4]].forEach(([a, b]) => {
        const outer = new THREE.Shape(islandPoints(b));
        outer.holes.push(new THREE.Path(islandPoints(a)));
        const ring = new THREE.Mesh(
          new THREE.ShapeGeometry(outer),
          new THREE.MeshBasicMaterial({ color: 0xE0F2FE, transparent: true, opacity: 0.5, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.65;
        sceneRefs.scene.add(ring);
        waveRingMeshes.push(ring);
      });

      // 2. Pulau tidak bulat: pasir (bawah) + rumput (atas)
      const sandGeo = new THREE.ExtrudeGeometry(new THREE.Shape(islandPoints(2.4)), { depth: 2.0, bevelEnabled: false });
      const sand = new THREE.Mesh(sandGeo, new THREE.MeshLambertMaterial({ color: 0xFDE047 }));
      sand.rotation.x = -Math.PI / 2;
      sand.position.y = -2.04;
      sand.receiveShadow = true;
      sceneRefs.scene.add(sand);

      const grassGeo = new THREE.ExtrudeGeometry(new THREE.Shape(islandPoints(0)), { depth: 1.6, bevelEnabled: false });
      const grass = new THREE.Mesh(grassGeo, new THREE.MeshLambertMaterial({ color: 0x4ADE80 }));
      grass.rotation.x = -Math.PI / 2;
      grass.position.y = -1.6;
      grass.receiveShadow = true;
      sceneRefs.scene.add(grass);

      // Warna tanah tiap zona (suasana berbeda)
      addGroundPatch(0, 2, 19, 19, 0x7EE8A8, 0.010);
      addGroundPatch(-46, -12, 29, 34, 0x2FB35C, 0.014);
      addGroundPatch(56, 8, 22, 22, 0x93F0B8, 0.012);
      addGroundPatch(8, 48, 30, 20, 0x6BE39A, 0.016);

      // 3. Sungai melintang + danau (tepi pasir di bawah air)
      const ribbon = (halfW, y, color, opacity, store) => {
        const pos = [], idx = [];
        let n = 0;
        for (let x = -92; x < 92; x += 2) {
          const x2 = x + 2;
          const c1 = riverCenterZ(x), c2 = riverCenterZ(x2);
          if (!insideIsland(x, c1, -0.5) || !insideIsland(x2, c2, -0.5)) continue;
          pos.push(x, y, c1 - halfW, x, y, c1 + halfW, x2, y, c2 - halfW, x2, y, c2 + halfW);
          idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
          n += 4;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity });
        if (store) waterMats.push(mat);
        sceneRefs.scene.add(new THREE.Mesh(geo, mat));
      };
      ribbon(RIVER_HALF + 1.5, 0.030, 0xFDE68A, 1, false);
      ribbon(RIVER_HALF, 0.050, 0x38BDF8, 0.86, true);

      const lakeBank = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xFDE68A }));
      lakeBank.scale.set(LAKE.rx + 1.5, LAKE.rz + 1.5, 1);
      lakeBank.rotation.x = -Math.PI / 2;
      lakeBank.position.set(LAKE.x, 0.030, LAKE.z);
      sceneRefs.scene.add(lakeBank);
      const lakeMat = new THREE.MeshBasicMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.86 });
      waterMats.push(lakeMat);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 48), lakeMat);
      lake.scale.set(LAKE.rx, LAKE.rz, 1);
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(LAKE.x, 0.052, LAKE.z);
      sceneRefs.scene.add(lake);

      // Daun teratai di danau
      for (let i = 0; i < 9; i++) {
        const a = worldRng() * 6.28, rr = Math.sqrt(worldRng()) * 0.8;
        const lx = LAKE.x + Math.cos(a) * LAKE.rx * rr, lz = LAKE.z + Math.sin(a) * LAKE.rz * rr;
        if (Math.abs(lz - 50) < 3.2 || Math.abs(lz - 58) < 3.2) continue;
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.04, 10), lam(0x22C55E));
        pad.position.set(lx, 0.08, lz);
        sceneRefs.scene.add(pad);
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 6), lam(0xF472B6));
        fl.position.set(lx + 0.1, 0.13, lz);
        sceneRefs.scene.add(fl);
      }

      // 4. Jalan setapak balok krem menghubungkan semua zona
      const bz1 = riverCenterZ(-20), bz2 = riverCenterZ(24);
      const pathLines = [
        [[0, 0], [-14, -2], [-30, -8], [-46, -12]],              // Desa -> Hutan
        [[0, 0], [1, -12], [-2, -20], [-2, -27]],                // Desa -> Bukit
        [[0, 0], [16, 2], [32, 2], [46, 3], [52, 4]],            // Desa -> Taman Bermain
        [[0, 0], [-8, 12], [-16, 19], [-20, bz1 - 6.8]],         // Desa -> Jembatan 1
        [[0, 0], [10, 12], [20, 22], [24, bz2 - 6.8]],           // Desa -> Jembatan 2
        [[-20, bz1 + 6.8], [-19, 42], [-23, 50]],                // Jembatan 1 -> Danau
        [[24, bz2 + 6.8], [16, 46], [12, 50]]                    // Jembatan 2 -> Danau
      ];
      worldInfo.pathLines = pathLines;
      const tileCenters = [];
      pathLines.forEach(line => {
        for (let i = 0; i < line.length - 1; i++) {
          const [ax, az] = line[i], [bx, bz] = line[i + 1];
          pathSegs.push([ax, az, bx, bz]);
          const len = Math.hypot(bx - ax, bz - az);
          const nx = -(bz - az) / len, nz = (bx - ax) / len;
          const steps = Math.ceil(len / 1.9);
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            for (let side = -1; side <= 1; side += 2) {
              const x = ax + (bx - ax) * t + nx * 0.95 * side;
              const z = az + (bz - az) * t + nz * 0.95 * side;
              if (!insideIsland(x, z, 1.5) || isWaterAt(x, z)) continue;
              tileCenters.push([x, z]);
            }
          }
        }
      });
      {
        const g = new THREE.BoxGeometry(2.2, 0.08, 2.2); g.translate(0, 0.04, 0);
        const m = makeInstanced(g, new THREE.MeshLambertMaterial({ color: 0xFFFFFF }), tileCenters.length, false, true);
        const c1 = new THREE.Color(0xFDE9C0), c2 = new THREE.Color(0xF6D9A3);
        tileCenters.forEach(([x, z], i) => {
          _dummy.position.set(x, 0, z);
          _dummy.rotation.set(0, (worldRng() - 0.5) * 0.3, 0);
          _dummy.scale.set(1, 1, 1);
          _dummy.updateMatrix();
          m.setMatrixAt(i, _dummy.matrix);
          m.setColorAt(i, i % 2 ? c1 : c2);
        });
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }

      // 5. ZONA DESA: 6 rumah warna-warni, pagar, sumur, gerobak
      addHouse(-12, -12, 0xF472B6, 0xFACC15, 0);
      addHouse(13, -11, 0x22D3EE, 0xFB923C, 0);
      addHouse(-17, 8, 0xA78BFA, 0xF472B6, Math.PI / 2);
      addHouse(18, 12, 0xA3E635, 0xEF4444, -Math.PI / 2);
      addHouse(-7, 18, 0xFB923C, 0x3B82F6, Math.PI);
      addHouse(8, 19, 0xEF4444, 0xFDE047, Math.PI);
      addWell(-4, -9);
      addCart(5, -5);
      // Pagar halaman rumah (ada celah pintu gerbang)
      addFence(-17.5, -16.5, -17.5, -5.5); addFence(-17.5, -5.5, -13.5, -5.5);
      addFence(-10.5, -5.5, -6.5, -5.5);   addFence(-6.5, -5.5, -6.5, -16.5);
      addFence(8.5, -16.5, 8.5, -5.5);     addFence(8.5, -5.5, 11.5, -5.5);
      addFence(14.5, -5.5, 18.5, -5.5);    addFence(18.5, -5.5, 18.5, -16.5);
      // Pagar rendah yang harus dilompati (menghadang jalan ke hutan dan bukit)
      addFence(-22, -10, -22, 1);
      addFence(-6, -22, 6, -22);

      // 6. ZONA BUKIT: dataran bertingkat + tangga balok, puncak bisa melihat seluruh pulau
      addTier(-18, 14, -62, -30, 1.8, 0x6EE7A0);
      addTier(-11.5, 7.5, -55.5, -36.5, 3.6, 0x86EFAC);
      addTier(-6.5, 2.5, -50.5, -41.5, 5.4, 0xBBF7D0);
      addStairs('S', -30, -2, 3.6, 1.8, 2, 0xE9B26B);
      addStairs('E', 7.5, -46, 3.6, 3.6, 2, 0xE9B26B);
      addStairs('W', -6.5, -46, 3.6, 5.4, 2, 0xE9B26B);
      // Tiang bendera di puncak
      addBoxMesh(staticGroup, 0.2, 3.2, 0.2, 1.2, 7.0, -43, 0xE5E7EB);
      addBoxMesh(staticGroup, 1.5, 0.9, 0.08, 1.95, 8.2, -43, 0xF472B6);
      addCylCollider(1.2, -43, 0.3, 9, 'pole');

      // 7. ZONA SUNGAI & DANAU: 2 jembatan kayu, batu loncatan, dermaga, 2 rakit
      addBridge(-20);
      addBridge(24);
      addStoneCrossing(-52);
      addStoneCrossing(54);
      addDock(-22.7, -19.5, 48.4, 51.6);
      addDock(-22.7, -19.5, 56.4, 59.6);
      addDock(7.5, 10.7, 48.4, 51.6);
      addDock(7.5, 10.7, 56.4, 59.6);
      addRaft(50, false);
      addRaft(58, true);

      // 8. ZONA TAMAN BERMAIN: trampolin, perosotan, labirin semak
      addTramp(46, 17);
      addTramp(58, 19);
      addTramp(70, 10);
      addTramp(36, 21);
      {
        // Perosotan: tower + tangga + papan luncur miring
        const tx0 = 28.9, tx1 = 31.5, tz0 = 8.7, tz1 = 11.3;
        const tower = addBoxMesh(staticGroup, tx1 - tx0, 3.0, tz1 - tz0, (tx0 + tx1) / 2, 1.5, (tz0 + tz1) / 2, 0xFB923C);
        addBoxMesh(staticGroup, tx1 - tx0 + 0.3, 0.2, tz1 - tz0 + 0.3, (tx0 + tx1) / 2, 3.1, (tz0 + tz1) / 2, 0xFACC15);
        addBoxCollider(tx0, tx1, tz0, tz1, 3.0, 'tower');
        for (let k = 1; k <= 4; k++) {
          const top = 0.6 * k;
          const sx1 = tx0 - (4 - k) * 1.2, sx0 = sx1 - 1.2;
          addBoxMesh(staticGroup, 1.2, top, tz1 - tz0, (sx0 + sx1) / 2, top / 2, (tz0 + tz1) / 2, 0xFDBA74);
          addBoxCollider(sx0, sx1, tz0, tz1, top, 'stair');
        }
        const rampLen = 10, hTop = 3.0, hLow = 0.2;
        const ang = Math.atan2(-(hTop - hLow), rampLen);
        const slope = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(rampLen, hTop - hLow), 0.22, tz1 - tz0), lam(0x38BDF8));
        slope.rotation.z = ang;
        const mx = tx1 + rampLen / 2, my = (hTop + hLow) / 2;
        slope.position.set(mx + Math.sin(ang) * 0.11, my - Math.cos(ang) * 0.11, (tz0 + tz1) / 2);
        slope.castShadow = true; slope.receiveShadow = true;
        staticGroup.add(slope);
        [tz0 - 0.1, tz1 + 0.1].forEach(rz => {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(rampLen, hTop - hLow), 0.4, 0.15), lam(0xFFFFFF));
          rail.rotation.z = ang;
          rail.position.set(mx - Math.sin(ang) * 0.2, my + Math.cos(ang) * 0.2, rz);
          staticGroup.add(rail);
        });
        addBoxCollider(tx1, tx1 + rampLen, tz0, tz1, hTop, 'slide', {
          ramp: { axis: 'x', from: tx1, to: tx1 + rampLen, hFrom: hTop, hTo: hLow },
          slideDir: { x: 1, z: 0 }
        });
      }
      buildMaze();

      // 9. Rintangan kayu tumbang di hutan
      addLog(-34, -9, 'z', 8);
      addLog(-41, -10.5, 'z', 8);
      addLog(-46, -30, 'x', 7);
      addLog(-58, 6, 'z', 6);
      addFence(-30, -20, -30, -14);

      // 10. Pohon rapat (hutan), semak, bunga, batu, pagar: semua InstancedMesh
      scatterTrees(-46, -12, 27, 32, 80, 3.3, 0.8, 1.6, 5);
      scatterTrees(0, 2, 26, 26, 8, 6, 0.9, 1.3, 5);
      scatterTrees(-2, -46, 34, 28, 12, 5, 0.9, 1.4, 5);
      scatterTrees(8, 48, 32, 22, 18, 5, 0.9, 1.4, 5);
      scatterTrees(56, 8, 24, 22, 10, 5, 0.9, 1.4, 5);
      for (let i = 0; i < 26; i++) {
        const t = worldRng() * Math.PI * 2;
        const r = islandRadiusAt(t) - 5.5 - worldRng() * 3;
        const x = Math.cos(t) * r, z = Math.sin(t) * r;
        if (nearWater(x, z, 2.6) || blockedAtGround(x, z, 1.6) || distToPaths(x, z) < 3.4) continue;
        let ok = true;
        for (let k = 0; k < treeSpots.length; k++) {
          if (Math.hypot(x - treeSpots[k].x, z - treeSpots[k].z) < 4.5) { ok = false; break; }
        }
        if (ok) treeSpots.push({ x, z, s: 0.9 + worldRng() * 0.5, sy: 1.0 + worldRng() * 0.2, rot: worldRng() * 3, ci: Math.floor(worldRng() * 4) });
      }
      buildInstancedTrees();
      buildFences();
      buildBushes();
      buildRocks();
      buildFlowers();

      // Bekukan matriks benda diam agar ringan di tablet
      staticGroup.traverse(o => {
        o.updateMatrix();
        o.matrixAutoUpdate = false;
      });
      staticGroup.updateMatrixWorld(true);
    }
