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
- Draw call adalah nilai `renderer.info.render.calls` (termasuk pass bayangan).

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

## FASE 3-6

(diisi di bawah setelah perbaikan)
