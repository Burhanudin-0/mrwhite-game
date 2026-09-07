// Serverless function (Vercel). API key dibaca dari Environment Variable di server,
// TIDAK PERNAH dikirim ke browser. Client cuma manggil endpoint /api/generate-words.
// Versi Google Gemini API — sudah termasuk:
//   1) Riwayat kata anti-duplikat (disimpan sementara di server, /tmp)
//   2) Parsing yang lebih tahan banting terhadap respons Gemini (strip markdown fence dkk)

import fs from 'fs/promises';

const HISTORY_FILE = '/tmp/used-words.json';
const MAX_HISTORY = 200;
const MAX_RETRY = 3;

async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveHistory(history) {
  const trimmed = history.slice(-MAX_HISTORY);
  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(trimmed), 'utf-8');
  } catch {
    // gagal nulis /tmp bukan fatal error buat game -> diamkan
  }
}

function normalize(word) {
  return String(word || '').trim().toLowerCase();
}

function buildPrompt(category, historyWords, attempt) {
  const avoidList = historyWords.length
    ? `Kata-kata berikut SUDAH PERNAH dipakai, JANGAN pakai lagi (baik sebagai civilian maupun undercover): ${historyWords.join(', ')}.`
    : '';

  const strictNote = attempt > 1
    ? `\nPERINGATAN: percobaan sebelumnya gagal atau mengulang kata lama. Pastikan kali ini benar-benar kata baru dan format balasan HARUS persis JSON tanpa teks lain.`
    : '';

  return `Kamu membantu membuat pasangan kata untuk game sosial "Mr. White / Undercover" (mirip game impostor tapi berbasis kata).

Tugas: buatkan SATU pasangan kata dalam Bahasa Indonesia yang:
- Berhubungan / mirip secara kategori, tapi jelas berbeda satu sama lain
- Cukup umum dikenal orang Indonesia (makanan, hewan, profesi, tempat, benda sehari-hari, dll)
- Tidak terlalu mudah ditebak instan, tapi juga tidak terlalu obscure
- Kata pertama untuk role "Civilian" (mayoritas pemain), kata kedua untuk role "Undercover" (minoritas)
${category ? `- Kategori yang diinginkan: ${category}` : ''}
${avoidList}${strictNote}

Balas HANYA dengan JSON murni, tanpa markdown code fence (jangan pakai \`\`\`), tanpa penjelasan apapun, persis format ini:
{"civilian": "kata1", "undercover": "kata2", "kategori": "nama kategori singkat"}`;
}

// Membersihkan respons Gemini dari kemungkinan markdown fence / teks tambahan
// sebelum di-JSON.parse, dan mencoba ekstrak blok {...} kalau masih ada noise di sekitarnya.
function extractJson(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

async function callGemini(apiKey, prompt) {
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  // Kalau Gemini berhenti karena limit token / safety filter, kasih pesan yang jelas
  const finishReason = data.candidates?.[0]?.finishReason;
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

  if (!rawText) {
    throw new Error(
      `Respons Gemini kosong (finishReason: ${finishReason || 'unknown'}). Kemungkinan diblokir safety filter atau kehabisan token.`
    );
  }

  const cleaned = extractJson(rawText);

  let wordPair;
  try {
    wordPair = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gagal parse respons AI. Teks mentah dari Gemini: ${rawText.slice(0, 300)}`);
  }

  if (!wordPair.civilian || !wordPair.undercover) {
    throw new Error(`Respons AI tidak lengkap (kurang field civilian/undercover). Diterima: ${JSON.stringify(wordPair)}`);
  }

  return wordPair;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { category, resetHistory } = req.body || {};

  if (resetHistory) {
    await saveHistory([]);
    return res.status(200).json({ ok: true, message: 'Riwayat kata sudah direset' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY belum diset di server' });
  }

  const history = await loadHistory();

  let wordPair = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      const prompt = buildPrompt(category, history, attempt);
      const candidate = await callGemini(apiKey, prompt);

      const isDuplicate =
        history.includes(normalize(candidate.civilian)) ||
        history.includes(normalize(candidate.undercover));

      if (!isDuplicate) {
        wordPair = candidate;
        break;
      }
      lastError = new Error('AI mengulang kata yang sudah pernah dipakai');
    } catch (err) {
      lastError = err;
    }
  }

  if (!wordPair) {
    return res.status(502).json({
      error: lastError?.message || 'AI gagal menghasilkan kata setelah beberapa percobaan',
    });
  }

  history.push(normalize(wordPair.civilian), normalize(wordPair.undercover));
  await saveHistory(history);

  return res.status(200).json(wordPair);
}
