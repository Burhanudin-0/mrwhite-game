// Serverless function (Vercel). API key dibaca dari Environment Variable di server,
// TIDAK PERNAH dikirim ke browser. Client cuma manggil endpoint /api/generate-words.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diset di server' });
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

PENTING: Balas HANYA dalam format JSON murni, tanpa markdown code fence, tanpa teks tambahan apapun, persis seperti ini:
{"civilian": "kata1", "undercover": "kata2", "kategori": "nama kategori singkat"}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Anthropic API error: ${errText}` });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text?.trim() || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let wordPair;
    try {
      wordPair = JSON.parse(cleaned);
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
