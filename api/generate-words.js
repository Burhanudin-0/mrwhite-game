// Serverless function (Vercel). API key dibaca dari Environment Variable di server,
// TIDAK PERNAH dikirim ke browser. Client cuma manggil endpoint /api/generate-words.
// Versi ini pakai Google Gemini API (Google AI Studio).
//
// CARA PAKAI:
// 1. Hapus/rename file api/generate-words.js yang lama (versi Claude/Anthropic)
// 2. Rename file ini (generate-words.gemini.js) jadi generate-words.js
// 3. Set Environment Variable di Vercel: GEMINI_API_KEY (bukan ANTHROPIC_API_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY belum diset di server' });
  }

  const { category, usedPairs = [] } = req.body || {};

  const avoidList = usedPairs.length
    ? `Jangan gunakan pasangan kata berikut (sudah pernah dipakai): ${usedPairs.join(', ')}.`
    : '';

  const prompt = `Kamu membantu membuat pasangan kata untuk game sosial "Mr. White / Undercover" (mirip game impostor tapi berbasis kata).

Tugas: buatkan SATU pasangan kata dalam Bahasa Indonesia yang:
- Berhubungan / mirip secara kategori, tapi jelas berbeda satu sama lain
- Cukup umum dikenal orang Indonesia (makanan, hewan, profesi, tempat, benda sehari-hari, dll)
- Tidak terlalu mudah ditebak instan, tapi juga tidak terlalu obscure
- Kata pertama untuk role "Civilian" (mayoritas pemain), kata kedua untuk role "Undercover" (minoritas)
${category ? `- Kategori yang diinginkan: ${category}` : ''}
${avoidList}

Balas dalam format JSON dengan struktur:
{"civilian": "kata1", "undercover": "kata2", "kategori": "nama kategori singkat"}`;

  // gemini-2.5-flash: cepat & murah, cocok untuk task pendek seperti ini.
  // Bisa diganti ke 'gemini-2.5-pro' kalau mau kualitas lebih tinggi (lebih lambat & lebih mahal).
  const model = 'gemini-3.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 200,
          // Gemini bisa dipaksa balas JSON murni lewat parameter ini,
          // jadi tidak perlu strip markdown code-fence secara manual.
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Gemini API error: ${errText}` });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    let wordPair;
    try {
      wordPair = JSON.parse(rawText);
    } catch (parseErr) {
      return res.status(502).json({ error: 'Gagal parse respons AI', raw: rawText });
    }

    if (!wordPair.civilian || !wordPair.undercover) {
      return res.status(502).json({ error: 'Respons AI tidak lengkap', raw: rawText });
    }

    return res.status(200).json(wordPair);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan pada server' });
  }
}
