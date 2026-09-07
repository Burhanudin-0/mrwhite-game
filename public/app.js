// ---- State ----
let state = {
  playerCount: 6,
  undercoverCount: 1,
  whiteCount: 1,
  category: '',
  words: null,       // { civilian, undercover, kategori }
  roles: [],          // array of 'civilian' | 'undercover' | 'white', index-aligned to players
  currentReveal: 0,
};

let usedPairs = JSON.parse(localStorage.getItem('mw_used_pairs') || '[]');

// ---- Elements ----
const screens = {
  setup: document.getElementById('screen-setup'),
  loading: document.getElementById('screen-loading'),
  reveal: document.getElementById('screen-reveal'),
  play: document.getElementById('screen-play'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ---- Setup screen controls ----
const playerCountEl = document.getElementById('player-count');
const undercoverCountEl = document.getElementById('undercover-count');
const whiteCountEl = document.getElementById('white-count');
const setupError = document.getElementById('setup-error');

document.getElementById('btn-inc-players').onclick = () => {
  if (state.playerCount < 20) state.playerCount++;
  playerCountEl.textContent = state.playerCount;
  validateSetup();
};
document.getElementById('btn-dec-players').onclick = () => {
  if (state.playerCount > 3) state.playerCount--;
  playerCountEl.textContent = state.playerCount;
  validateSetup();
};
document.getElementById('btn-inc-undercover').onclick = () => {
  if (state.undercoverCount < 5) state.undercoverCount++;
  undercoverCountEl.textContent = state.undercoverCount;
  validateSetup();
};
document.getElementById('btn-dec-undercover').onclick = () => {
  if (state.undercoverCount > 0) state.undercoverCount--;
  undercoverCountEl.textContent = state.undercoverCount;
  validateSetup();
};
document.getElementById('btn-inc-white').onclick = () => {
  if (state.whiteCount < 3) state.whiteCount++;
  whiteCountEl.textContent = state.whiteCount;
  validateSetup();
};
document.getElementById('btn-dec-white').onclick = () => {
  if (state.whiteCount > 0) state.whiteCount--;
  whiteCountEl.textContent = state.whiteCount;
  validateSetup();
};

function validateSetup() {
  const specialCount = state.undercoverCount + state.whiteCount;
  const civilianCount = state.playerCount - specialCount;
  const btnStart = document.getElementById('btn-start');

  if (civilianCount < 2) {
    setupError.textContent = `Civilian tersisa cuma ${civilianCount}. Kurangi Undercover/Mr. White atau tambah pemain.`;
    btnStart.disabled = true;
    return false;
  }
  setupError.textContent = '';
  btnStart.disabled = false;
  return true;
}
validateSetup();

// ---- Start game: call API, assign roles ----
document.getElementById('btn-start').onclick = async () => {
  if (!validateSetup()) return;

  state.category = document.getElementById('category-input').value.trim();
  showScreen('loading');

  try {
    const res = await fetch('/api/generate-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: state.category, usedPairs: usedPairs.slice(-15) }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server error (${res.status})`);
    }

    const data = await res.json();
    state.words = data;

    usedPairs.push(`${data.civilian}/${data.undercover}`);
    localStorage.setItem('mw_used_pairs', JSON.stringify(usedPairs.slice(-30)));

    assignRoles();
    state.currentReveal = 0;
    renderReveal();
    showScreen('reveal');
  } catch (err) {
    showScreen('setup');
    setupError.textContent = `Gagal generate kata: ${err.message}`;
  }
};

function assignRoles() {
  const roles = [];
  for (let i = 0; i < state.undercoverCount; i++) roles.push('undercover');
  for (let i = 0; i < state.whiteCount; i++) roles.push('white');
  while (roles.length < state.playerCount) roles.push('civilian');

  // shuffle (Fisher-Yates)
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  state.roles = roles;
}

// ---- Reveal screen (pass-the-phone) ----
const revealCard = document.getElementById('reveal-card');
const wordBox = document.getElementById('word-box');
const btnNextPlayer = document.getElementById('btn-next-player');

function renderReveal() {
  const i = state.currentReveal;
  document.getElementById('reveal-progress').textContent =
    `PEMAIN ${i + 1} DARI ${state.playerCount}`;
  document.getElementById('reveal-player-name').textContent = `Pemain ${i + 1}`;

  wordBox.className = 'word-box';
  wordBox.innerHTML = '<span id="tap-hint">👆 Tap untuk lihat kartu</span>';
  btnNextPlayer.disabled = true;
  wordBox.onclick = () => revealCurrentCard();
}

function revealCurrentCard() {
  const role = state.roles[state.currentReveal];
  let roleLabel, wordHtml;

  if (role === 'civilian') {
    roleLabel = 'CIVILIAN';
    wordHtml = `<div class="word-display">${escapeHtml(state.words.civilian)}</div>`;
  } else if (role === 'undercover') {
    roleLabel = 'UNDERCOVER';
    wordHtml = `<div class="word-display">${escapeHtml(state.words.undercover)}</div>`;
  } else {
    roleLabel = 'MR. WHITE';
    wordHtml = `<div class="word-display">??? (tidak dapat kata)</div>`;
  }

  wordBox.classList.add('revealed', `role-${role}`);
  wordBox.innerHTML = `<span class="role-tag role-${role}">${roleLabel}</span>${wordHtml}`;
  wordBox.onclick = null;
  btnNextPlayer.disabled = false;
}

btnNextPlayer.onclick = () => {
  state.currentReveal++;
  if (state.currentReveal >= state.playerCount) {
    renderPlaySummary();
    showScreen('play');
  } else {
    renderReveal();
  }
};

// ---- Play / summary screen ----
function renderPlaySummary() {
  document.getElementById('summary-players').textContent = state.playerCount;
  document.getElementById('summary-undercover').textContent = state.undercoverCount;
  document.getElementById('summary-white').textContent = state.whiteCount;
  document.getElementById('answer-box').classList.add('hidden');
  document.getElementById('answer-box').innerHTML = '';
}

document.getElementById('btn-reveal-answer').onclick = () => {
  const box = document.getElementById('answer-box');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div><span class="label">Kata Civilian:</span> ${escapeHtml(state.words.civilian)}</div>
    <div><span class="label">Kata Undercover:</span> ${escapeHtml(state.words.undercover)}</div>
    <div><span class="label">Kategori:</span> ${escapeHtml(state.words.kategori || '-')}</div>
  `;
};

document.getElementById('btn-new-game').onclick = () => {
  showScreen('setup');
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
