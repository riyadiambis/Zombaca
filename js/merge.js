/*************************************************************************
 * MERGE.JS - Penggabung Mesh Statis (warna disimpan per vertex)
 * Banyak mesh kecil berwarna polos digabung jadi satu geometry agar
 * cukup satu draw call. Pengganti ringan BufferGeometryUtils.
 *************************************************************************/

const _rel = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

// Gabungkan daftar mesh (material polos, boleh multi-material) menjadi satu
// BufferGeometry non-indexed dengan atribut position, normal, dan color.
// Posisi dihitung relatif terhadap objek `relativeTo` (null = koordinat dunia).
export function mergeMeshes(meshes, relativeTo) {
  _inv.identity();
  if (relativeTo) {
    relativeTo.updateMatrixWorld(true);
    _inv.copy(relativeTo.matrixWorld).invert();
  }

  const parts = [];
  let total = 0;
  for (let k = 0; k < meshes.length; k++) {
    const mesh = meshes[k];
    mesh.updateMatrixWorld(true);
    _rel.multiplyMatrices(_inv, mesh.matrixWorld);
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(_rel);
    parts.push({ g, material: mesh.material });
    total += g.attributes.position.count;
  }

  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let off = 0;
  for (let k = 0; k < parts.length; k++) {
    const { g, material } = parts[k];
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, off * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
    const mats = Array.isArray(material) ? material : null;
    for (let i = 0; i < n; i++) {
      let m = material;
      if (mats) {
        m = mats[0];
        for (let gi = 0; gi < g.groups.length; gi++) {
          const grp = g.groups[gi];
          if (i >= grp.start && i < grp.start + grp.count) { m = mats[grp.materialIndex]; break; }
        }
      }
      const c = m.color;
      const o = (off + i) * 3;
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
    off += n;
    g.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// Material Lambert berwarna vertex (satu per kebutuhan: bersama atau per objek)
export function vertexColorLambert() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}
