# 🎭 Mr. White & Undercover — Web Game

Game party sosial deduksi. Kata-katanya digenerate AI setiap main, jadi tidak itu-itu saja. Dimainkan dengan cara **oper HP** (pass-the-phone) ke tiap pemain untuk lihat kartu masing-masing secara diam-diam.

## Struktur Project

```
mrwhite-game/
├── api/
│   └── generate-words.js   ← serverless function, panggil Anthropic API (key aman di server)
├── public/
│   ├── index.html           ← halaman utama
│   ├── style.css             ← tampilan (tema noir/detektif)
│   └── app.js                 ← logic game (bagi role, reveal kartu)
├── vercel.json
├── package.json
└── .gitignore
```

**Kenapa lewat Vercel, bukan GitHub Pages?** GitHub Pages cuma bisa hosting file statis, tidak bisa menjalankan kode server. Kalau API key AI ditaruh langsung di `app.js`, siapapun yang buka website bisa lihat & pakai key kamu. Vercel menyediakan **serverless function** (`api/generate-words.js`) yang jalan di server mereka — API key disimpan sebagai *Environment Variable*, tidak pernah dikirim ke browser pemain.

---

## Langkah 1 — Push ke GitHub

1. Buat repository baru di GitHub (bisa public atau private), misal namanya `mrwhite-game`.
2. Di folder project ini, jalankan:

```bash
git init
git add .
git commit -m "Initial commit: Mr White & Undercover game"
git branch -M main
git remote add origin https://github.com/USERNAME/mrwhite-game.git
git push -u origin main
```

Ganti `USERNAME` dengan username GitHub kamu.

---

## Langkah 2 — Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) → daftar/login pakai akun GitHub kamu (gratis, Hobby plan).
2. Klik **Add New → Project**.
3. Pilih repository `mrwhite-game` yang tadi di-push.
4. Vercel otomatis mendeteksi ini sebagai project statis + serverless function — biarkan setting default, klik **Deploy**.
5. Tunggu ± 30 detik, nanti dapat URL semacam `https://mrwhite-game.vercel.app`.

**Catatan:** deploy pertama ini akan **gagal saat dipakai generate kata** karena API key belum diset. Lanjut ke Langkah 3.

---

## Langkah 3 — Set API Key (WAJIB)

1. Punya API key dari [console.anthropic.com](https://console.anthropic.com) (menu **API Keys**). Kalau belum punya akun, daftar dulu — ada free credit awal untuk akun baru.
2. Di dashboard Vercel, buka project kamu → tab **Settings → Environment Variables**.
3. Tambahkan:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** (paste API key kamu, dimulai dengan `sk-ant-...`)
   - **Environment:** centang semua (Production, Preview, Development)
4. Klik **Save**.
5. Buka tab **Deployments**, klik deployment paling atas → titik tiga (⋯) → **Redeploy** (supaya environment variable baru terbaca).

Setelah ini, website kamu sudah bisa generate kata lewat AI. Setiap push baru ke `main` di GitHub akan otomatis re-deploy.

---

## Cara Main

1. Buka website di HP.
2. Atur jumlah pemain, jumlah Undercover, jumlah Mr. White. Kategori kata opsional (misal "makanan", "hewan") — kosongkan kalau mau bebas.
3. Tekan **Mulai Permainan** → AI generate satu pasang kata baru.
4. HP dioper ke setiap pemain satu-satu. Tiap pemain tap kartu untuk lihat rolenya sendiri (diam-diam), lalu oper ke pemain berikutnya.
5. Setelah semua kebagian, ikuti aturan main seperti biasa: deskripsi kata → diskusi → voting.
6. Wasit/salah satu pemain bisa buka tombol **Lihat Jawaban** di layar terakhir untuk mengecek kata civilian & undercover kalau perlu memverifikasi tebakan Mr. White.
7. Tekan **Main Ronde Baru** untuk generate pasangan kata baru lagi.

---

## Biaya

- **Vercel Hobby plan**: gratis selamanya untuk pemakaian pribadi/non-komersial. Limit bulanan jauh di atas kebutuhan game kecil-kecilan seperti ini.
- **Anthropic API**: dibayar per pemakaian (per generate kata), tapi biayanya sangat kecil karena request pendek — perkiraan jauh di bawah $1 untuk ratusan kali generate. Cek sisa credit di [console.anthropic.com](https://console.anthropic.com).

---

## Kustomisasi Lanjutan (opsional)

- **Ganti model AI (tetap di Anthropic)**: edit `model: 'claude-sonnet-4-6'` di `api/generate-words.js` kalau ingin pakai model Claude lain.
- **Ubah jumlah Civilian minimum**: edit fungsi `validateSetup()` di `public/app.js`.
- **Ubah tema warna**: edit variabel di bagian atas `public/style.css` (`:root { ... }`).

### Ganti provider AI ke Google Gemini

Project ini sudah disiapkan versi alternatifnya di `api/generate-words.gemini.js`, tinggal ganti:

1. **Ambil API key Gemini** gratis di [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (Google AI Studio, ada free tier).
2. **Ganti file aktif**: hapus `api/generate-words.js` (versi Claude), lalu rename `api/generate-words.gemini.js` menjadi `api/generate-words.js`.
   ```bash
   rm api/generate-words.js
   mv api/generate-words.gemini.js api/generate-words.js
   ```
3. **Push perubahan** ke GitHub (`git add . && git commit -m "Switch to Gemini" && git push`).
4. **Set Environment Variable baru** di Vercel Settings → Environment Variables:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** API key Gemini kamu
   - (Boleh hapus `ANTHROPIC_API_KEY` yang lama kalau sudah tidak dipakai)
5. **Redeploy** dari tab Deployments seperti biasa.

**Perbedaan teknis Gemini vs Claude yang perlu diketahui:**

| Aspek | Anthropic (Claude) | Google (Gemini) |
|---|---|---|
| Endpoint | `api.anthropic.com/v1/messages` | `generativelanguage.googleapis.com/.../generateContent` |
| Auth | Header `x-api-key` | Query param `?key=...` |
| Format request | `messages: [{role, content}]` | `contents: [{role, parts:[{text}]}]` |
| Paksa output JSON | Manual (strip markdown fence) | Native lewat `responseMimeType: "application/json"` |
| Model dipakai di sini | `claude-sonnet-4-6` | `gemini-2.5-flash` (cepat & murah; bisa ganti ke `gemini-2.5-pro`) |
| Free tier | Credit awal saat daftar akun | Ada free tier request/menit di Google AI Studio |

Sisa kode (`public/index.html`, `style.css`, `app.js`) **tidak perlu diubah sama sekali** — keduanya sama-sama dipanggil lewat endpoint `/api/generate-words` yang formatnya konsisten (`{civilian, undercover, kategori}`), jadi frontend tidak peduli provider AI apa yang dipakai di baliknya.
