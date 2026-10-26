# 🧟 Zombaca - Game 3D Belajar Membaca & Huruf untuk Anak

**Zombaca (Zombie Baca)** adalah permainan edukatif 3D interaktif berbasis web yang dirancang khusus untuk membantu anak-anak usia dini belajar membaca huruf, suku kata, dan kata dasar dengan cara yang ceria, seru, dan tanpa rasa takut.

Alih-alih menakutkan, zombie di Zombaca berpenampilan lucu dan menggemaskan (*cute blocky style*). Saat pemain mengenai zombie dengan huruf yang tepat, zombie tersebut akan berubah menjadi hewan lucu (seperti kelinci, ayam, atau anak kucing) yang melompat bahagia ke alam bebas!

---

## 🌟 Fitur Utama

### 1. 🏝️ Pulau Luas 3D (~160 x 160 Unit) dengan 5 Zona Tematik
- **Zona Desa (Pusat):** Titik awal dengan 6 rumah warna-warni, sumur desa, gerobak kayu, dan pagar ramah.
- **Zona Hutan:** Pepohonan pinus lebat, semak berbuah, dan rintangan batang kayu tumbang yang harus dilompati.
- **Zona Bukit Bertingkat:** Dataran bertingkat dengan tangga balok. Puncaknya menyuguhkan pemandangan seluruh pulau.
- **Zona Sungai & Danau:** Dilengkapi 2 jembatan kayu melengkung, batu loncatan di atas sungai, serta **2 rakit danau bergerak** yang dapat dinaiki pemain.
- **Zona Taman Bermain:** Dilengkapi trampolin pemantul, menara perosotan luncur, dan labirin semak dengan zombie misteri di tengahnya.

### 2. 🦘 Rintangan Seru & Edukatif (Tanpa Hukuman)
- **Pelampung Bebek Penyelamat:** Jika anak jatuh ke air, pelampung bebek kuning lucu langsung muncul disertai efek suara *"plung"*, lalu pemain otomatis diantarkan kembali ke daratan terdekat tanpa pengurangan skor atau penalti.
- **Trampolin:** Memantulkan karakter tinggi ke udara dengan suara *"boing"*.
- **Perosotan & Tangga Balok:** Navigasi elevasi otomatis dan halus tanpa tersangkut.

### 3. 🎥 Pilihan Mode Kamera Fleksibel
- **🗺️ Kamera Atas (Default):** Kamera tetap dari sudut atas-belakang karakter. Arah gerakan stabil dan intuitif sesuai layar (*screen-relative*), sangat ideal untuk anak-anak agar tidak pusing.
- **🎮 Kamera Bahu (Third-Person):** Kamera bebas ala game petualangan modern dengan rotasi 360°, zoom in/out, dan fitur otomatis kembali ke belakang pemain setelah 2 detik berjalan.
- **Transparansi Halus (Raycaster Occlusion):** Objek seperti pohon atau bangunan yang menghalangi pandangan kamera ke karakter otomatis memudar transparan.

### 4. 🧭 Mini Map Melingkar (140px)
- Terletak di kiri atas layar dengan efek kaca (*glassmorphism*).
- Menampilkan kontur pulau, jalan setapak, lokasi pemain (panah limau), dan sebaran zombie (titik hijau yang berkedip kuning saat mode petunjuk aktif).

### 5. 🎯 Sistem Kurikulum Belajar Membaca
- **Level 1 (Huruf Vokal):** Pengenalan huruf A, I, U, E, O dengan pelafalan fonik Indonesia.
- **Level 2 (Suku Kata):** Penggabungan konsonan-vokal (BA, BO, MA, MI, SU, SA, TE, TI, LA, LU, NA, DA, DU, GI, GO).
- **Level 3 (Kata Dasar Bermakna):** Kata benda 2 suku kata lengkap dengan emoji pendukung (BOLA ⚽, SUSU 🥛, MATA 👁️, SATE 🍢, BATU 🪨, MADU 🍯, GIGI 🦷, DADU 🎲, TALI 🪢, NASI 🍚).
- **3 Tingkat Kecepatan:** Santai (8 zombie, tidak mengejar), Sedang (12 zombie), Seru (16 zombie).
- **Jaminan Pedagogis:** Minimal 2 zombie selalu membawa huruf target yang benar, dengan minimal 1 berada dalam radius dekat pemain.

### 6. 🐾 Koleksi & Kustomisasi Karakter
- **3 Karakter Anak Ceria:** Bima, Dina, dan Kapi.
- **Alat Ajaib Unik:** Pistol Gelembung (jarak jauh), Tongkat Bintang (proyektil cepat), Palu Bantal (pukulan area empuk).
- **Toko Topi Bonus:** Buka topi koboi, bajak laut, mahkota emas, topi koki, dan helm astronot menggunakan bintang hasil belajar.
- **Album Hewan:** Catatan koleksi semua hewan yang berhasil diselamatkan dari sihir zombie.

---

## 🎮 Kontrol Permainan

| Aksi | Keyboard & Mouse (PC/Laptop) | Layar Sentuh (Tablet/HP) |
|---|---|---|
| **Bergerak** | `W`, `A`, `S`, `D` atau Tombol Panah | Joystick Virtual di kiri bawah |
| **Lompat** | Tombol `Space` (Spasi) | Tombol 🦘 di kanan bawah |
| **Gunakan Alat / Tembak** | Tombol `F` atau `Enter` | Tombol 🎯 di kanan bawah |
| **Putar Kamera (Mode Bahu)** | Tahan klik kiri lalu geser mouse / Tombol `Q` & `E` | Geser satu jari di separuh layar kanan |
| **Zoom Kamera (Mode Bahu)** | Roda Putar Mouse (*Scroll Wheel*) | Cubit dua jari (*Pinch to zoom*) |
| **Menu Kamera** | Klik tombol 🎥 di HUD | Ketuk tombol 🎥 di HUD |
| **Ulangi Suara Target** | Klik tombol 📢 di kartu misi | Ketuk tombol 📢 di kartu misi |

---

## 🛠️ Teknologi yang Digunakan
- **HTML5 & Vanilla JavaScript (ES6+):** Single-file architecture tanpa build tools rumit.
- **Three.js (r128):** Rendering 3D WebGL dengan optimasi `InstancedMesh` untuk vegetasi dan properti pulau.
- **Web Audio API & Speech Synthesis API:** Efek suara procedural dan suara artikulasi bahasa Indonesia yang jelas dan natural.
- **CSS3 Glassmorphism:** Tampilan antarmuka modern, responsif untuk desktop, tablet, dan smartphone.

---

## 🚀 Cara Menjalankan

1. Clone repositori ini:
   ```bash
   git clone https://github.com/riyadiambis/Zombaca.git
   ```
2. Buka file `index.html` langsung di peramban web modern manapun (Google Chrome, Microsoft Edge, Safari, Firefox).
3. Tidak memerlukan server backend atau instalasi software tambahan!

---

*Dibuat dengan cinta untuk pendidikan anak Indonesia.*
