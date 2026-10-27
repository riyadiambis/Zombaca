# AUDIT PERFORMA ZOMBACA

Dokumen kerja audit performa dan perbaikan Zombaca (Three.js r128, ES modules).
Ditulis supaya pekerjaan bisa dilanjutkan orang/model lain kalau terputus.
Branch kerja: `perf-audit`.

## Cara mengukur

1. Jalankan server statis di root proyek: `python -m http.server 8000`
   (selama audit dipakai varian yang mengirim `Cache-Control: no-store` agar modul tidak ter-cache).
2. Buka `http://127.0.0.1:8000/index.html?debug=1`. Panel debug muncul di kiri bawah
   (FPS rata-rata, FPS 1% terendah, waktu frame, waktu CPU per frame, draw call, triangles,
   geometries, textures, programs, jumlah objek scene, partikel aktif, JS heap).
3. Skenario standar bisa dijalankan dari console (muat ulang halaman sebelum tiap skenario):
   - `await __zombaca.run('s1')` menu (dunia 3D berputar di belakang), 15 detik
   - `await __zombaca.run('s2')` main di Desa, Kamera Atas, mode Seru, 15 detik
   - `await __zombaca.run('s3')` main di Hutan, Kamera Bahu (kamera diputar terus dengan Q), 15 detik
   - `await __zombaca.run('s4')` 3 ronde berturut-turut dengan "Main Lagi" (3 target, Level 1,
     zombie benar "dikenai" otomatis), mencatat memori awal/akhir tiap ronde, lalu mengukur ronde ke-4 15 detik
4. Hasil dengan `frames` jauh di bawah ~900 per 15 detik berarti jendela browser ter-throttle
   (tertutup jendela lain). Ulangi dengan tab browser terlihat.

Catatan metrik:
- "CPU ms" = waktu kerja JavaScript per frame di dalam game loop (logika + submit render). Ini proksi
  terbaik untuk perangkat lemah, karena di laptop uji FPS sudah mentok di vsync 60.
- Draw call adalah nilai `renderer.info.render.calls`. Di r128 info di-reset **setelah** pass bayangan,
  jadi angka ini hanya pass utama; jumlah mesh yang ikut pass bayangan dicatat terpisah.

Perangkat uji: laptop Windows 11, GPU AMD Radeon (integrated, ANGLE D3D11), Chrome,
viewport 2400x1318 CSS px dengan devicePixelRatio 0.8 (kanvas 1920x1054 px), layar 60 Hz.

## FASE 1: BASELINE

### Baseline A: kode asli (commit `25d84f6`) + panel debug

| Skenario | FPS rata2 | FPS 1% low | Frame ms | Draw call | Triangles | Geometries | Textures | Programs | Objek | Partikel | Heap MB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1. Menu | 59.7 | 38.1 | 16.75 | 206 | 29 793 | 241 | 5 | 8 | 378 | 40 | 22.3 |
| 2. Desa, Kamera Atas, Seru | 59.2* | 21.3 | 16.9 | (208)* | (29 928)* | 241 | 5 | 8 | 667 | 101 | 19.2 |
| 3. Hutan, Kamera Bahu | tidak bisa diukur | | | | | | | | | | |
| 4. Setelah 3 ronde | tidak bisa diukur | | | | | | | | | | |

\* **Temuan terpenting:** pada kode asli game loop melempar `TypeError: Cannot create property 'z' on number '0'`
setiap frame begitu permainan dimulai (946 error dalam 16 detik, juga terjadi di versi online
riyadiambis.github.io/Zombaca). Akibatnya `renderer.render()` tidak pernah dipanggil saat bermain:
layar 3D membeku/patah-patah, zombie tidak bisa dikenai, ronde tidak bisa diselesaikan.
Angka draw call/triangles di baris 2 hanyalah sisa frame menu terakhir. Skenario 3 dan 4 tidak
mungkin diukur. Karena itu crash diperbaiki dulu (commit `e8f4600`) lalu diukur ulang sebagai Baseline B.

### Baseline B: setelah perbaikan crash, sebelum optimasi (commit `e8f4600`)

| Skenario | FPS rata2 | FPS 1% low | Frame ms | CPU ms | Draw call rata2 (maks) | Triangles | Geometries | Textures | Programs | Objek | Partikel | Heap MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1. Menu | 59.9 | 45.6 | 16.69 | 4.39 | 211 (220) | 30 103 | 251 | 4 | 8 | 378 | 40 | 44.6 |
| 2. Desa, Kamera Atas, Seru | 59.7 | 32.0 | 16.75 | 5.74 | 290 (305) | 39 992 | 489 | 14 | 8 | 566 | 0 | 21.4 |
| 3. Hutan, Kamera Bahu | 59.9 | 40.7 | 16.69 | 4.06 | 122 (395) | 27 850 | 461 | 14 | 9 | 566 | 0 | 32.1 |
| 4. Ronde ke-4 setelah 3x "Main Lagi" | 59.9 | 46.6 | 16.69 | 5.79 | 292 (306) | 40 036 | **1 685** | **16** | 8 | 566 | 0 | 27.3 |

Memori per ronde (skenario 4, Baseline B):

| Ronde | Geometries awal | Geometries akhir | Textures awal | Textures akhir |
|---|---|---|---|---|
| 1 | 490 | 490* | 11 | 11 |
| 2 | 490 | 942 | 11 | 15 |
| 3 | 1 239 | 1 443 | 15 | 16 |
| Ronde ke-4 berjalan | | 1 685 | | 16 |

\* ronde 1 pada run ini sempat ter-throttle sehingga renderer.info belum diperbarui. Polanya jelas:
geometries naik ratusan setiap ronde dan tidak pernah turun (kebocoran).

Draw call per kategori (Baseline B, saat bermain mode Seru, sebelum frustum culling):

| Kategori | Draw call | Ikut pass bayangan |
|---|---|---|
| Benda statis non-instanced (rumah, sumur, gerobak, bukit, tangga, jembatan, batu loncatan, dermaga, kayu, perosotan, bendera, petak tanah) | 165 | ~117 |
| InstancedMesh (pohon x3, semak x2, bunga x2, batu, pagar x2, jalan, labirin) | 12 | 7 |
| Rakit + trampolin (dynGroup) | 32 | 24 |
| 16 zombie (12 mesh/zombie: kaki, badan, kepala, 2 mata, 2 pupil, senyum, 2 tangan, papan; + cincin bantuan) | 197 | 64 |
| Karakter pemain | 12 | 6 |
| Laut, riak, pasir, rumput, sungai, danau, daun teratai (masing-masing mesh terpisah) | 11 | 0 |
| **Total potensi** | **~429** | **~218** |

## FASE 2: TEMUAN AUDIT

Dampak: **T** = tinggi, **S** = sedang, **R** = rendah.

### A. Game loop

| # | Temuan | Lokasi | Dampak |
|---|---|---|---|
| A1 | Game loop melempar TypeError setiap frame saat bermain (`resolveColliders`/`getSupport` dipanggil dengan signature lama `(x, y, z, r, h, step)` padahal fungsi menerima `(pos, feetY, r)` / `(x, z, feetY)`; di ES module (strict mode) menulis properti ke angka melempar error). Render tidak pernah tercapai: layar beku. | `main.js` `animate()`, `zombies.js` `updateZombies()` | **T** (penyebab utama "lag") |
| A2 | `startTarget()` memakai `helpArrowGroup` dan `reshuffleAllZombieLetters` yang tidak di-import: ReferenceError, ubin huruf misi tidak pernah dirender. | `ui.js` `startTarget()` | **T** (bug terlihat) |
| A3 | Hanya ada satu `requestAnimationFrame` (dipanggil sekali dari `initGame`), "Main Lagi"/kembali ke menu tidak membuat loop ganda. | `main.js` | - (aman) |
| A4 | Render tetap berjalan penuh saat tab tersembunyi tidak terjadi (browser menghentikan rAF), tetapi musik latar `setInterval` tetap berbunyi/berjalan, dan setelah tab dibuka lagi tidak ada reset jam. Saat dijeda (modal "Mau berhenti main?") scene tetap dirender 60x/detik di balik modal ber-blur. | `main.js`, `audio.js` | S |
| A5 | Delta time sudah dibatasi `Math.min(dt, 0.05)`. | `main.js` | - (aman) |
| A6 | Layar menu dirender 60 fps penuh plus 3 renderer WebGL preview karakter (masing-masing antialias). | `main.js`, `characters.js` | S |
| A7 | Rakit, trampolin, perosotan, animasi ombak, dan panah bantuan tidak pernah jalan (loop memakai array `rafts`/`trampolines`/`sceneRefs.oceanMesh` yang kosong, sisa refactor). | `main.js`, `world.js` | S (fungsi hilang) |

### B. Rendering

| # | Temuan | Lokasi | Dampak |
|---|---|---|---|
| B1 | `setPixelRatio(min(dpr, 2))` + `antialias: true`: di tablet dpr 2 berarti 4x piksel + MSAA. | `main.js` | **T** (tablet/HP) |
| B2 | `PCFSoftShadowMap` 1024, area bayangan tetap ±42 unit di sekitar pusat pulau (tidak mengikuti pemain: di Hutan/Taman tidak ada bayangan sama sekali, padahal semua objek tetap dirender ke shadow map). | `main.js` | S |
| B3 | ~218 draw call ikut pass bayangan: rumah, pagar, semak, batu, labirin, tangga, jembatan, rakit, trampolin semuanya `castShadow`. | `world.js` | **T** |
| B4 | Material sudah `MeshLambertMaterial` dengan cache `lam(color)` untuk sebagian besar benda statis, tetapi setiap benda tetap mesh terpisah: 165 draw call benda statis. Rumah 6 mesh, tingkat bukit memakai multi-material (2 draw call per mesh). | `world.js` | **T** |
| B5 | InstancedMesh sudah dipakai untuk pohon, semak, bunga, batu, pagar, jalan, labirin (12 draw call untuk ~1 600 instance). `frustumCulled = false` sehingga selalu digambar, tetapi geometrinya sangat ringan. | `world.js` | R |
| B6 | Tiap zombie membuat ~9 geometry + ~8 material baru (tidak dipakai bersama) dan 12 mesh: 16 zombie = 197 draw call. Papan huruf punya material sendiri per zombie dan `needsUpdate = true` setiap ganti huruf. | `zombies.js` `createCuteZombieMesh()` | **T** |
| B7 | `camera.far` 240, kabut 55-175. Satu HemisphereLight + satu DirectionalLight, tanpa PointLight. | `main.js` | R (wajar) |
| B8 | Objek transparan: 16 papan huruf, sungai, danau, 2 riak, proyektil gelembung. Wajar. | - | R |
| B9 | Efek penghalang transparan: material rumah/bukit di-clone **sekali** saat build (bukan per frame) - aman. Tetapi pohon & labirin (`instOccluders`, 179 entri) tidak pernah dipakai: di Kamera Bahu kamera masuk ke dalam pohon dan layar tertutup daun. | `world.js`, `camera.js` | S |
| B10 | Daun teratai & bunganya (16 mesh) ditambahkan langsung ke scene, masing-masing dengan geometry baru. | `world.js` `buildWorld()` | R |

### C. Pekerjaan CPU per frame

| # | Temuan | Lokasi | Dampak |
|---|---|---|---|
| C1 | Raycast penghalang kamera: 3 ray per frame terhadap 39 mesh rumah/bukit (tidak rekursif, sudah dibatasi daftar). Ringan, tetapi tetap tiap frame. | `camera.js` `updateCameraOcclusion()` | R |
| C2 | Tabrakan: `resolveColliders` dan `getSupport` memeriksa **semua 262 collider** untuk pemain dan tiap zombie setiap frame (16 zombie x 2 x 262 = ~8 400 cek/frame). | `world.js` | S |
| C3 | Zombie di dekat air memanggil `findNearestLand()` **setiap frame**: pencarian spiral sampai radius 70 x (10..150 titik) x `isFreeSpot` (cek air 9 titik + 262 collider). Satu panggilan bisa ribuan operasi; di mode Seru zombie sering mengejar ke tepi sungai. | `zombies.js` `updateZombies()` | **T** (lonjakan frame) |
| C4 | Alokasi per frame: `new THREE.Vector3` 2-3x di `updateCamera`, array `[0.7, 1.5, 2.3]` di occlusion, `zombies.filter(...)` di `ensureCorrectLetterAmongZombies()` (dipanggil tiap frame), `getElementById` 2x per frame. | `camera.js`, `zombies.js`, `main.js` | S (GC) |
| C5 | `alignBillboardToCamera` memanggil `parent.updateMatrixWorld()` untuk tiap zombie tiap frame (menghitung ulang matriks seluruh anak zombie, lalu renderer menghitungnya lagi). | `zombies.js` | S |
| C6 | Texture papan huruf sudah dibuat sekali per huruf dan disimpan (`letterTextures`). Tidak ada `needsUpdate` per frame. | `zombies.js` | - (aman) |
| C7 | Mini map: pulau statis sudah digambar sekali ke canvas cadangan, tetapi titik-titik digambar ulang setiap frame (60x/detik, termasuk clip & drawImage 140x140). Juga tetap dirender di layar menu walau HUD tersembunyi. | `ui.js` `renderMinimap()`, `main.js` | S |
| C8 | HUD: `btn-shoot.classList.add/remove('in-range')` dipanggil setiap frame. Panel misi hanya dirender saat ada event (aman). | `main.js` | R |
| C9 | Air: laut dianimasikan dengan menggeser `position.y` mesh, riak dengan `scale` (tidak mengubah vertex, tidak `computeVertexNormals`). | `main.js` | - (aman) |
| C10 | Di layar menu `updateParticles` tidak dipanggil: 40 kubus puff membeku selamanya di udara. | `main.js` | R |

### D. Kebocoran memori

| # | Temuan | Lokasi | Dampak |
|---|---|---|---|
| D1 | Zombie yang dihapus (`clearAllZombies`, zombie berubah jadi hewan) tidak di-dispose: ~9 geometry + 8 material per zombie. | `zombies.js`, `weapons.js` | **T** |
| D2 | Setiap partikel puff (10-20 per kejadian) dan confetti (38 per target) membuat BoxGeometry + material baru dan tidak pernah di-dispose. | `weapons.js` | **T** |
| D3 | Proyektil gelembung/tongkat: geometry + material baru per tembakan, tidak di-dispose. | `weapons.js` `useMagicTool()` | S |
| D4 | Hewan lompat: 3-4 geometry + material baru per hewan, tidak di-dispose. | `weapons.js`, `zombies.js` | S |
| D5 | `rebuildPlayerModel()` tiap ronde membuat ~15 geometry + material baru tanpa dispose model lama; `refreshPreviewHatsAndTools()` juga. | `characters.js` | S |
| D6 | Event listener: semua dipasang sekali (`initControls`, `initUI`), tidak bertambah per ronde. | - | - (aman) |
| D7 | Web Audio: tiap nada membuat Oscillator + Gain yang tetap tersambung ke `destination` setelah selesai (tidak `disconnect`). Musik latar 2,6 nada/detik. | `audio.js` `playTone()` | R |

### E. CSS dan HUD

| # | Temuan | Lokasi | Dampak |
|---|---|---|---|
| E1 | 15 selektor memakai `backdrop-filter` (26 deklarasi termasuk prefix -webkit-). Saat bermain ada ~12 area blur di atas kanvas WebGL yang berubah tiap frame: pil bintang, mini map (seluruhnya tertutup canvas, blur tidak terlihat sama sekali), panel misi + tombol suara di dalamnya (blur bertingkat), 3 tombol bulat, joystick, tombol lompat, petunjuk keyboard, petunjuk kamera, toast dan perayaan (keduanya opacity 0 tetapi tetap ber-blur). | `css/style.css` | **T** (tablet/HP) |
| E2 | Di menu: `.glass-panel` ber-blur ditambah setiap `.choice-card` dan `.btn-secondary` di dalamnya ber-blur lagi (blur bertingkat di atas kanvas yang beranimasi). | `css/style.css` | S |
| E3 | `#menu-backdrop` disembunyikan dengan `opacity: 0` saja; 3 bulatan `filter: blur(90px)` 340-420 px tetap beranimasi tanpa henti selama bermain. | `css/style.css`, `ui.js` `showScreen()` | S |
| E4 | Animasi `box-shadow` tak berujung saat bermain: `.letter-tile.next-target` (pulseTile) dan `#btn-shoot.in-range` (shootPulse) memaksa repaint setiap frame. | `css/style.css` | S |
| E5 | Tidak ada `will-change` berlebihan. Beberapa keyframes dirujuk tetapi tidak didefinisikan (`popIn`, `fadeIn`, `floatSlow`, `popupEnter`) - tidak berdampak performa. | `css/style.css` | R |

## FASE 3: PERBAIKAN (urut dampak tertinggi)

| Commit | Perbaikan | Temuan |
|---|---|---|
| `e8f4600` | Crash game loop diperbaiki: pemanggilan `resolveColliders`/`getSupport` disesuaikan dengan API `world.js`; `startTarget` memakai `sceneRefs.helpArrowGroup` dan meng-import `reshuffleAllZombieLetters`; rakit (`updateRafts`), trampolin (`updateTramps`), perosotan, animasi ombak, panah bantuan 15 detik disambungkan lagi; zombie labirin dikunci dengan `clampToMaze` (dulu dilempar ke koordinat danau). | A1, A2, A7 |
| `47f1c9d` | Satu loop rAF terjaga (`startLoop`/`stopLoop`), berhenti saat `document.hidden` dan AudioContext di-suspend; menu & layar akhir 30 fps; saat dijeda dirender sekali saja; mini map 10x/detik dan tidak dirender di menu; cache elemen DOM; kelas `in-range` hanya diubah saat berubah; partikel tetap diperbarui di menu; node Web Audio di-disconnect setelah selesai. | A4, A6, C7, C8, C10, D7 |
| `0f5ef23` | `setPixelRatio(min(dpr, 1.5))`, MSAA hanya bila dpr < 1.5; `PCFShadowMap`; kotak bayangan ±28 unit mengikuti pemain (dibulatkan ke texel agar tidak berkedip); hanya pohon, karakter, zombie yang `castShadow`; hanya tanah (rumput, pasir, petak zona, jalan, bukit, tangga, dermaga, jembatan, lantai labirin) yang `receiveShadow`. Mesh di pass bayangan 218 -> 77. | B1, B2, B3 |
| `a2d40bd` | Penggabung mesh statis (`js/merge.js`, vertex color, tanpa library tambahan). Tiap rumah & tingkat bukit = 1 mesh (tetap bisa memudar). Benda statis polos lain = 2 mesh (tanah / lainnya). Rakit = 1 mesh per rakit. | B4, B10 |
| `eb1f0f0` | Zombie memakai geometry/material bersama; badan+kepala 1 mesh, wajah 1 mesh (12 -> 7 draw call per zombie); material papan huruf satu per huruf; billboard tanpa `updateMatrixWorld`; `ensureCorrectLetterAmongZombies` jalur cepat tanpa alokasi; `findNearestLand` paling sering 1x/detik per zombie (zombie yang hendak masuk tepi air dikembalikan ke posisi sebelumnya dan berbalik); hewan di-clone dari cetakan. | B6, C3, C4, C5, D4 |
| `16cbac9` | Puff & confetti: object pool + 2 InstancedMesh (semua partikel = 2 draw call); proyektil: pool mesh dengan geometry/material bersama; model pemain dan topi/alat preview lama di-dispose. | D1, D2, D3, D5 |
| `5e179e7` | Spatial grid collider (sel 8 unit, rentang -112..112): `resolveColliders`, `getSupport`, `blockedAtGround` hanya memeriksa collider di sel sekitar; rakit selalu ikut diperiksa. | C2 |
| `9a18963` | Kamera tanpa `new Vector3` per frame; raycast rumah/bukit tiap 100 ms dengan array hasil dipakai ulang; Kamera Bahu maju mendekat (min 2,2 unit) bila garis pandang terhalang pohon/dinding labirin (`instOccluders`, cek lingkaran 2D tiap 100 ms). | B9, C1, C4 |
| `f22a4ae` | `backdrop-filter` dari 15 selektor tinggal 4 (panel menu, panel misi, popup kamera, modal). Saat bermain hanya panel misi yang ber-blur. Toast & perayaan `visibility:hidden` saat tidak tampil. Animasi `pulseTile`/`shootPulse` tidak lagi menganimasikan `box-shadow` (cincin denyut di pseudo-element dengan transform+opacity). `#menu-backdrop` `display:none` setelah memudar. | E1, E2, E3, E4 |
| `249c641` | (temuan saat tes Fase 7) Timer perayaan ronde lama bisa melompati target pertama ronde baru bila pemain keluar lalu cepat main lagi. Timer kini memeriksa `roundState.roundId`. | - |

Catatan keputusan:
- **BufferGeometryUtils tidak dipakai.** Helper `merge.js` (~60 baris) cukup untuk kebutuhan ini dan menghindari satu request CDN tambahan.
- **Spatial grid untuk zombie terdekat tidak dibuat.** Jumlah zombie maksimal 16; bidik otomatis dan pemisahan antar-zombie (120 pasang) jauh lebih murah daripada membangun grid tiap frame. Grid dipakai untuk collider (262 buah).
- **Pohon tidak dibuat transparan** saat menghalangi kamera (InstancedMesh); sesuai arahan, Kamera Bahu memakai cara "kamera maju". Di Kamera Atas pohon besar masih bisa menutupi pemain sesaat (sama seperti versi asli).
- Rumah dan dekorasi kecil kini tidak membuat bayangan (sesuai arahan "hanya karakter, zombie, dan pohon").

## FASE 4: PENGATURAN KUALITAS GRAFIS (`851102b`)

File: `js/quality.js`, tombol di popup 🎥 (`index.html`), gaya di `css/style.css`, kunci localStorage `zombaca_grafis_v1`.

| Pilihan | Isi |
|---|---|
| Otomatis (bawaan) | Mulai dari Tinggi. Selama 5 detik pertama bermain (setelah 0,5 detik pemanasan) FPS diukur; bila < 45 pindah ke Ringan + toast "Grafis disesuaikan supaya lancar". Hasil berlaku untuk sesi itu. |
| Ringan | Tanpa bayangan, pixel ratio 1, tanpa backdrop-filter (latar semi-solid), bunga & semak setengahnya (slot instance berselang-seling agar tetap merata di semua zona), kabut 38-115 dan `camera.far` 140. |
| Tinggi | Kualitas penuh setelah optimasi: bayangan, pixel ratio maks 1,5, kabut 55-175, `camera.far` 240. |

MSAA (antialias) hanya bisa ditentukan saat renderer dibuat: aktif untuk Tinggi, mati untuk Ringan,
dan untuk Otomatis aktif hanya bila dpr < 1,5. Perubahan MSAA berlaku setelah muat ulang.

Dites: memaksa ambang Otomatis (`__zombaca.quality.qualityState.autoThreshold = 1000`) membuat
grafis turun ke Ringan setelah 5,5 detik dengan toast yang benar; tombol Tinggi mengembalikan bayangan.

## FASE 5: BUG YANG TERLIHAT (`e8f4600`, `0c0d671`)

- **Ubin huruf panel misi hilang.** Penyebab: `startTarget()` di `ui.js` melempar
  `ReferenceError: helpArrowGroup is not defined` sebelum `renderMissionHUD()` dipanggil
  (sisa refactor dari single-file; `reshuffleAllZombieLetters` juga tidak di-import).
  Teks "Target 1 dari 5" yang terlihat hanyalah isi statis HTML. Setelah diperbaiki, dicek di
  Level 1 (`A`), Level 2 (`NI`), Level 3 (`TOGA` + emoji 🎓).
- **Kontras "Target X dari N".** Teks kini putih tebal (800, 0.9rem) dengan bayangan teks, dan panel
  misi memakai latar gelap pekat `rgba(20,16,45,0.58)` (Ringan: 0.82) alih-alih putih 14%.

## FASE 6: SESUDAH vs SEBELUM

Diukur di laptop yang sama, grafis Otomatis (tetap Tinggi karena FPS 60), commit `0c0d671`.
"Sebelum" = Baseline B (setelah fix crash, sebelum optimasi). Baseline A tidak bisa dibandingkan
karena layar membeku saat bermain.

| Skenario | Metrik | Sebelum | Sesudah |
|---|---|---|---|
| 1. Menu | FPS rata2 / 1% low | 59.9 / 45.6 | 29.3 / 16.0 (sengaja dibatasi 30 fps) |
| | CPU ms per frame | 4.39 | **1.65** |
| | Draw call | 211 | **77** |
| | Triangles | 30 103 | 31 140 |
| | Geometries / Textures / Programs | 251 / 4 / 8 | **46** / 5 / 11 |
| | Objek scene | 378 | **160** |
| 2. Desa, Kamera Atas, Seru | FPS rata2 / 1% low | 59.7 / 32.0 | 59.9 / 39.4 |
| | CPU ms per frame | 5.74 | **2.54** |
| | Draw call rata2 (maks) | 290 (305) | **157 (165)** |
| | Triangles | 39 992 | 41 938 |
| | Geometries / Textures | 489 / 14 | **51** / 15 |
| | Objek scene | 566 | **316** |
| 3. Hutan, Kamera Bahu | FPS rata2 / 1% low | 59.9 / 40.7 | 59.8 / 34.9 |
| | CPU ms per frame | 4.06 | **1.94** |
| | Draw call rata2 (maks) | 122 (395) | **62 (176)** |
| | Geometries / Textures | 461 / 14 | **64** / 16 |
| 4. Ronde ke-4 setelah 3x "Main Lagi" | FPS rata2 / 1% low | 59.9 / 46.6 | 59.9 / 48.1 |
| | CPU ms per frame | 5.79 | **2.54** |
| | Draw call rata2 (maks) | 292 (306) | **155 (159)** |
| | Geometries / Textures | **1 685 / 16** (terus naik) | **59 / 16** (datar) |
| | Heap MB | 27.3 | 33.1 (naik-turun karena GC, tidak menumpuk) |

Memori per ronde sesudah optimasi (skenario 4, lalu dilanjutkan 3 ronde lagi di halaman yang sama):

| Ronde | Geometries awal -> akhir | Textures akhir |
|---|---|---|
| 1 | 47 -> 56 | 16 |
| 2 | 56 -> 56 | 16 |
| 3 | 56 -> 56 | 16 |
| 5 | 60 -> 60 | 17 |
| 6 | 60 -> 60 | 17 |
| 7 | 60 -> 60 | 17 |

Kenaikan kecil di awal (47 -> 60) bukan kebocoran: itu sumber daya **bersama** yang di-upload ke GPU
saat pertama dipakai (texture huruf yang baru muncul, cetakan hewan per jenis, mesh partikel).
Setelah semua varian pernah muncul, angkanya datar.

Status target:
- **Laptop stabil 60 fps**: tercapai (59.8-59.9 fps rata-rata saat bermain). Laptop uji sudah mentok
  vsync sejak sebelum optimasi, jadi perbaikan terlihat pada waktu CPU per frame yang turun 2-2,5x
  (ruang lega untuk tablet/HP).
- **Draw call saat bermain < 250**: tercapai (maks 165 di Desa mode Seru, maks 176 di Hutan).
- **Geometries/textures setelah 3 ronde tidak terus naik**: tercapai (datar di 56-60 / 16-17).

Catatan pengukuran: nilai "1% low" di laptop ini dipengaruhi gangguan dari alat otomasi
(screenshot yang diambil untuk menjaga jendela tetap aktif menahan compositor sesaat). Bandingkan
CPU ms dan draw call untuk melihat dampak optimasi; ukur ulang 1% low di perangkat nyata tanpa alat.

## FASE 7: TES

Tes dijalankan otomatis lewat `?debug=1` + skrip di console, ditambah pengecekan visual screenshot.
Tidak ada error di console selama seluruh tes.

| Fitur | Hasil |
|---|---|
| Semua layar menu (mulai, pilih karakter, alat, level, album, akhir ronde, modal keluar) | OK |
| 3 karakter (Bima, Dina, Kapi) + preview 3D berputar | OK |
| 3 alat ajaib: gelembung & tongkat (proyektil mengenai zombie benar, huruf maju), palu bantal (pukulan area) | OK |
| 3 level (ubin + emoji Level 3) | OK |
| Jumlah target 3 dan 20 ("Target 1 dari 3", "... dari 20") | OK |
| Mode Santai 8 / Sedang 12 / Seru 16 zombie | OK |
| Kamera Atas & Kamera Bahu (petunjuk geser hanya di Bahu) | OK |
| Mini map (titik pemain & zombie tergambar, 10x/detik) | OK |
| Air: jatuh ke sungai -> pelampung bebek -> kembali ke darat | OK |
| Trampolin: memantul (vy 16,1, tinggi 5,6) + toast "Boing!" | OK (dulu tidak berfungsi) |
| Rakit: pemain ikut terbawa rakit | OK (dulu rakit diam) |
| Suara: AudioContext `running` setelah klik pertama, tombol musik nyala/mati | OK |
| Album hewan (jumlah tersimpan) | OK |
| Topi (pesta, mahkota, koboi, tanpa topi) di preview dan di karakter saat main | OK |
| Grafis Otomatis/Ringan/Tinggi | OK |
| Tanpa `?debug=1`: panel & `window.__zombaca` tidak ada | OK |

Belum dites di perangkat sentuh nyata (joystick, geser kamera dua jari) karena tidak tersedia di
lingkungan kerja ini; kode kontrol sentuh tidak diubah.

## 5 PENYEBAB LAG TERBESAR

1. **Game loop crash setiap frame saat bermain** (`resolveColliders`/`getSupport` dengan signature lama di ES module strict mode): 60 exception/detik, `renderer.render()` tidak pernah tercapai, layar membeku/patah-patah. Juga terjadi di versi online.
2. **Terlalu banyak draw call**: 16 zombie x 12 mesh + ~165 benda statis terpisah (~430 mesh), plus ~218 mesh di pass bayangan.
3. **Kebocoran GPU**: geometry & material baru untuk setiap zombie, partikel, confetti, proyektil, hewan, dan model pemain tanpa dispose; geometries 490 -> 1 685 setelah 3 ronde.
4. **`backdrop-filter` di ~12 area HUD** di atas kanvas WebGL yang berubah tiap frame (termasuk mini map yang blur-nya tertutup canvas sepenuhnya, dan toast/perayaan yang tak terlihat), plus latar menu dengan bulatan blur beranimasi yang hanya disembunyikan dengan opacity.
5. **Pekerjaan CPU per frame yang tidak perlu**: `findNearestLand` (pencarian spiral ribuan cek) setiap frame untuk zombie di tepi air, tabrakan ke seluruh 262 collider per zombie, `updateMatrixWorld` per zombie, alokasi Vector3/array per frame, mini map 60x/detik, render 60 fps di menu dan saat dijeda.

## SISA PEKERJAAN / SARAN LANJUTAN

- Ukur di tablet & HP kelas menengah sungguhan (target utama). Bila Otomatis sering memilih Ringan,
  pertimbangkan menyimpan hasil Otomatis ke localStorage agar sesi berikutnya langsung Ringan.
- Kamera Atas: pohon yang menutupi pemain belum ditangani (bisa dengan menyembunyikan instance
  mahkota pohon terdekat atau memakai shader dither berdasar jarak).
- Zombie masih 7 draw call masing-masing; bila perlu lebih ringan, kaki/tangan bisa dijadikan
  InstancedMesh bersama (animasi lewat matriks instance).
- `state.js` masih menyimpan array `rafts` & `trampolines` yang tidak dipakai (sisa refactor).
- Keyframes `popIn`, `fadeIn`, `floatSlow`, `popupEnter` dirujuk CSS tetapi tidak didefinisikan.
- Semua zombie awal ronde muncul di zona Desa (`spawnZombie(false)`, perilaku asli dipertahankan);
  README menyebut zombie tersebar di 5 zona. Perlu keputusan desain.

---

## REVIEW ZOMBIE KABUR + VERSI HP

Kondisi awal review: run agent sebelumnya dibatalkan sebelum commit. Semua perubahannya (9 file:
`css/style.css`, `index.html`, `js/config.js`, `js/controls.js`, `js/main.js`, `js/state.js`, `js/ui.js`,
`js/weapons.js`, `js/zombies.js`) masih di working tree, tidak ada sisa lain, jadi tidak ada yang di-stash.
Review dilakukan langsung dari working tree.

| Commit | Isi |
|---|---|
| `f5d653b` | Hasil run sebelumnya + perbaikan AI zombie dari review ini |
| `2222830` | JS versi HP: deteksi perangkat sentuh, joystick, ajakan putar HP |
| `0f338d2` | CSS versi HP: tampilan laptop dikembalikan, HUD & menu layar pendek |

### Checklist (status akhir)

| # | Permintaan | Status | Catatan |
|---|---|---|---|
| A1 | State JALAN-JALAN, KABUR, CAPEK, lalu jeda sebelum kabur lagi | BERES | Diperbaiki: zombie huruf benar dulu terkunci CAPEK 999 detik setelah bantuan selesai |
| A2 | Kabur menghindari air, pohon, rumah, tepi pulau, tidak mentok di sudut | BERES | Diperbaiki: dulu hanya 2 arah samping, undakan/tangga dihitung tembok. Sekarang 9 sudut, 8x/detik; terpojok -> langsung CAPEK |
| A3 | CAPEK: diam terengah (badan naik-turun + keringat), bisa dikenai Palu Bantal | BERES | Dites: Palu Bantal mengenai zombie CAPEK |
| A4 | Tidak pernah mendekati/mengejar pemain, mekanik menggelitik dihapus | BERES | Diperbaiki: jalan-jalan acak dulu bisa mengarah ke pemain; sekarang berbelok menjauh dalam jarak waspada + 6 |
| A5 | Separation < 4 unit; spawn >= 15 dari pemain, >= 8 dari zombie lain | BERES | Diperbaiki: spawn cadangan dulu 6,5 unit |
| A6 | Angka mode Santai / Sedang / Seru di `config.js`, kabur tidak melebihi pemain, deskripsi kartu | BERES | Terukur: kabur 2/3/4 s, capek 4/3/2 s, kecepatan maks 4,6 / 6,9 / 8,3 (pemain 9,2) |
| A7 | Huruf benar: 80% kecepatan, capek +1 s, berhenti kabur saat bantuan 15 detik; jaminan 2 zombie benar & 1 dalam 40 unit | BERES | `ensureCorrectLetterAmongZombies` tidak diubah |
| B1 | Meta viewport, 100dvh, safe-area, cegah zoom/scroll/menu tekan lama | BERES | Ditambah `gesturestart` untuk zoom cubit Safari iOS |
| B2 | Layar "Putar HP-mu ke samping ya!" + jeda + lanjut otomatis, tidak di desktop | BERES | Diperbaiki: laptop layar sentuh (`maxTouchPoints > 0`) dulu dianggap HP; sekarang `pointer: coarse`. Game selalu lanjut saat layar ditutup |
| B3 | Layar penuh + kunci landscape saat Mulai Main, tombol ⛶ hanya perangkat sentuh | BERES | Diperbaiki: laptop layar sentuh masuk layar penuh & tombol ⛶ tampil; panggilan ganda di `startNewRound` dihapus |
| B4 | HUD layar pendek: tidak tumpuk, mini map 96px, tombol kanan 44px, joystick kiri bawah, Tembak 88px + Lompat 64px melengkung, geser kamera kanan | BERES | Diperbaiki: tombol 84/60px -> 88/64px; panel misi menabrak tombol ⛶ di 667px; toast di atas panel misi; petunjuk geser kamera menabrak panel misi; joystick tak terlihat sebelum disentuh |
| B5 | Menu muat di HP landscape, tombol lanjut selalu terlihat | BERES | Diperbaiki: Level 540px & Teman 390px di ruang 350px. Sekarang 361 & 311px (sisa gulir 11px) |
| B6 | Getaran saat huruf benar dan target selesai | BERES | Terukur: `40` per huruf, `[40,60,40]` per target |
| C1 | Tampilan & kontrol laptop sama seperti sebelumnya | BERES | Diperbaiki: ukuran/tata letak tombol Tembak & Lompat di laptop ikut berubah; `backdrop-filter` baru (6 selektor) dikembalikan ke 4 |

### Bug yang diperbaiki

1. Zombie huruf benar terkunci CAPEK 999 detik setelah bantuan 15 detik selesai (zombie kedua yang membawa huruf benar diam ~17 menit).
2. Arah kabur hanya mencoba lurus atau belok 81 derajat; bila keduanya terhalang selalu belok kiri, bisa mentok dan bolak-balik di sudut. Cek pakai `isFreeSpot`, yang menganggap undakan, tangga, dermaga dan trampolin sebagai tembok, sehingga zombie di atas undakan "terhalang" ke segala arah. Sekarang `blockedForWalker` (pijakan setinggi STEP_H boleh), 9 sudut, dicek 8x/detik.
3. Jalan-jalan acak bisa mengarah ke pemain (melanggar "tidak pernah mendekati").
4. Lengan kanan tetap miring setelah zombie melambai.
5. Laptop layar sentuh (laptop pengujian, `maxTouchPoints = 2`) diperlakukan sebagai HP: masuk layar penuh saat Mulai Main, tombol ⛶ tampil, bisa muncul ajakan putar.
6. Ajakan putar HP: bila perangkat berhenti dianggap sentuh saat layar tampil, layar hilang tetapi game tetap dijeda.
7. Tampilan laptop berubah: tombol Tembak 104 -> 88px, Lompat 78 -> 64px, tata letak melengkung juga di laptop. Dikembalikan; lengkungan hanya di `max-height: 500px`.
8. `backdrop-filter` baru di overlay putar HP (latar sudah 95% pekat) dan baris tombol menu dihapus.
9. HUD 667x375: panel misi menabrak tombol kanan saat ⛶ tampil, toast menutupi panel misi, petunjuk geser kamera menabrak panel misi.
10. Menu Level & Teman tidak muat di HP landscape (Level butuh 540px di ruang 350px; pilihan mode tertutup baris tombol).
11. Joystick tidak terlihat sampai disentuh. Sekarang diam di kiri bawah dan pindah ke titik jari saat disentuh.

### Angka performa terbaru

Chrome di laptop pengujian sangat dibatasi saat jendela tidak di depan (s2 hanya 22 frame dalam 15 detik),
jadi FPS tidak bisa diukur. Sebagai gantinya kedua versi diukur dengan cara yang sama: game dijeda lalu
`updateZombies + updateParticles + updateCamera` dan `renderer.render` dipanggil 600x berturut-turut
(rata-rata per frame). Versi sebelum = `ee2d661` (angka terakhir AUDIT), sesudah = `0f338d2`. Kanvas 1920x1110.

| Skenario | Draw call | CPU update (ms) | CPU render (ms) |
|---|---|---|---|
| s2 Desa, Kamera Atas, Seru: sebelum | 155 | 0,41 | 5,81 |
| s2: sesudah | 82 | 0,45 | 4,69 |
| s3 Hutan, Kamera Bahu: sebelum | 35 | 0,40 | 2,52 |
| s3: sesudah | 58 | 0,54 | 4,37 |
| Kasus terburuk: 16 zombie kabur bersamaan (sesudah) | 65 | 0,81 | 5,66 |

- Draw call s2 turun dan s3 naik karena sebaran spawn, bukan karena rendering. Aturan jarak 15/8 unit
  membuat 16 zombie tidak muat di Desa, jadi sebagian muncul di zona lain. Ini juga menjawab catatan
  "semua zombie muncul di Desa" di SISA PEKERJAAN. Semua masih jauh di bawah target 250.
- AI kabur menambah ~0,05 ms per frame dalam keadaan normal, ~0,4 ms bila semua 16 zombie kabur.

Memori (s4: Level 1, 3 target, "Main Lagi"):

| Ronde | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Geometries di akhir ronde | 52 | 55 | 58 | 58 | 58 | 58 | 58 |
| Textures | 14 | 15 | 16 | 16 | 16 | 16 | 16 |

Naik sedikit di 3 ronde pertama (aset bersama dipakai pertama kali: hewan, huruf baru), lalu datar. Tidak ada kebocoran.

### Tes yang dijalankan

| Tes | Hasil |
|---|---|
| Simulasi AI 60-90 detik per mode (pemain mengejar zombie terdekat dengan kecepatan penuh, dt 1/60) | 0 frame mendekati pemain, 0 zombie di air, 0% kabur macet di Seru & Sedang (Santai 1%: terdorong separation) |
| Waktu state terukur Santai / Sedang / Seru | kabur 2,0 / 3,0 / 4,0 s; capek sesuai mode (+1 s untuk huruf benar) |
| Bantuan 15 detik | Semua zombie huruf benar CAPEK; 2 detik setelah bantuan selesai kembali jalan-jalan |
| Satu ronde penuh: Gelembung + Santai + Level 1, Bintang + Sedang + Level 2, Palu + Seru + Level 3 (3 target, tombol Tembak) | Semua sampai ROUND_END, 0 error |
| Laptop (layar sentuh): ukuran tombol, layar penuh, ⛶ | Tembak 104px, Lompat 78px, joystick 140px kiri bawah (sama seperti sebelumnya), tidak layar penuh, ⛶ tersembunyi |
| HUD 667x375 (iPhone SE), 915x412 (Pixel 7), 1024x768 (iPad) dengan ⛶ tampil, Kamera Bahu + toast | 0 tumpang tindih, semua di dalam layar |
| Menu Teman / Alat / Level di 667x375 | Muat (Level sisa gulir 11px), tombol lanjut selalu terlihat |
| Portrait: ajakan putar + jeda, kembali landscape, modal "berhenti" terbuka, perangkat hybrid | Tampil & jeda; lanjut otomatis; tetap jeda bila modal terbuka; tidak macet jeda |
| Sentuhan sintetis: joystick kiri + kamera kanan bersamaan, Lompat | Joystick ke titik jari, `joyVector` 1,0; kamera berputar; kembali ke kiri bawah saat dilepas; lompat vy 11,2 |
| Console | 0 error di semua tes |

Catatan cara tes: ukuran HP dites dengan iframe seukuran perangkat (jendela Chrome tidak bisa di-resize
dari otomasi), `pointer: coarse` disimulasikan dengan mengganti `matchMedia` di iframe, dan sentuhan dengan
`TouchEvent` sintetis. Laptop pengujian memakai `prefers-reduced-motion`, jadi animasi CSS tidak tampak di sini.

### Masih perlu dites di HP / tablet sungguhan

- FPS nyata di HP kelas menengah dengan `?debug=1` (s2, s3), terutama Seru saat banyak zombie kabur.
- Layar penuh + kunci landscape (Android Chrome). iOS Safari tidak mendukung keduanya untuk halaman
  biasa, jadi di iPhone hanya ajakan putar yang bekerja.
- Rasa joystick mengambang & ukuran area sentuh untuk jari anak; geser kamera satu jari + cubit dua jari di Kamera Bahu.
- Getaran (Android saja; iOS tidak mendukung `navigator.vibrate`).
- Notch / safe-area di iPhone landscape (`viewport-fit=cover`) dan bilah alamat yang muncul-hilang (`100dvh`).
- Suara ajakan "Putar HP-mu ke samping ya!" (speechSynthesis butuh sentuhan pertama di iOS).
- Keyframes `fadeIn`/`popIn` yang dipakai overlay putar HP memang tidak didefinisikan (lihat catatan
  sebelumnya), jadi overlay muncul tanpa animasi. Tidak mengganggu.
