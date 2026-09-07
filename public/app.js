// ---- State ----
let state = {
  playerCount: 6,
  playerNames: [],     // string[], index-aligned ke playerCount
  undercoverCount: 1,
  whiteCount: 1,
  category: '',
  words: null,           // { civilian, undercover, kategori }
  players: [],            // [{ name, role, alive: bool }]
  currentReveal: 0,
  selectedVoteIndex: null,
  selectedGuess: null,     // 'undercover' | 'white'
  pendingEliminatedIndex: null,
  winner: null,             // 'civilian' | 'undercover' | 'white'
};

const STATS_KEY = 'mw_stats_v1';

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    return {
      total: raw.total || 0,
      civilian: raw.civilian || 0,
      undercover: raw.undercover || 0,
      white: raw.white || 0,
    };
  } catch {
    return { total: 0, civilian: 0, undercover: 0, white: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function recordWin(winnerKey) {
  const stats = loadStats();
  stats.total += 1;
  stats[winnerKey] += 1;
  saveStats(stats);
  return stats;
}

function renderStatsInto(prefix) {
  const stats = loadStats();
  document.getElementById(`${prefix}-total`).textContent = stats.total;
  document.getElementById(`${prefix}-civilian`).textContent = stats.civilian;
  document.getElementById(`${prefix}-undercover`).textContent = stats.undercover;
  document.getElementById(`${prefix}-white`).textContent = stats.white;
}

// ---- Elements ----
const screens = {
  setup: document.getElementById('screen-setup'),
  loading: document.getElementById('screen-loading'),
  reveal: document.getElementById('screen-reveal'),
  play: document.getElementById('screen-play'),
  vote: document.getElementById('screen-vote'),
  gameover: document.getElementById('screen-gameover'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Setup screen: player count & names ----
const playerCountEl = document.getElementById('player-count');
const undercoverCountEl = document.getElementById('undercover-count');
const whiteCountEl = document.getElementById('white-count');
const setupError = document.getElementById('setup-error');
const playerNamesList = document.getElementById('player-names-list');

function renderPlayerNameInputs() {
  // Pertahankan nama yang sudah diketik kalau jumlah pemain berubah
  const prevNames = state.playerNames.slice();
  playerNamesList.innerHTML = '';
  for (let i = 0; i < state.playerCount; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'player-name-input';
    input.placeholder = `Pemain ${i + 1}`;
    input.value = prevNames[i] || '';
    input.dataset.index = i;
    input.oninput = () => {
      state.playerNames[i] = input.value;
    };
    playerNamesList.appendChild(input);
  }
}

function getPlayerName(i) {
  const typed = (state.playerNames[i] || '').trim();
  return typed || `Pemain ${i + 1}`;
}

document.getElementById('btn-inc-players').onclick = () => {
  if (state.playerCount < 20) state.playerCount++;
  playerCountEl.textContent = state.playerCount;
  renderPlayerNameInputs();
  validateSetup();
};
document.getElementById('btn-dec-players').onclick = () => {
  if (state.playerCount > 3) state.playerCount--;
  playerCountEl.textContent = state.playerCount;
  renderPlayerNameInputs();
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

renderPlayerNameInputs();
validateSetup();
renderStatsInto('stat');

document.getElementById('btn-reset-stats').onclick = () => {
  saveStats({ total: 0, civilian: 0, undercover: 0, white: 0 });
  renderStatsInto('stat');
};

// ---- Start game: call API, assign roles ----
document.getElementById('btn-start').onclick = async () => {
  if (!validateSetup()) return;

  state.category = document.getElementById('category-input').value.trim();
  showScreen('loading');

  try {
    const res = await fetch('/api/generate-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: state.category }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server error (${res.status})`);
    }

    const data = await res.json();
    state.words = data;

    assignRolesAndPlayers();
    state.currentReveal = 0;
    renderReveal();
    showScreen('reveal');
  } catch (err) {
    showScreen('setup');
    setupError.textContent = `Gagal generate kata: ${err.message}`;
  }
};

function assignRolesAndPlayers() {
  const roles = [];
  for (let i = 0; i < state.undercoverCount; i++) roles.push('undercover');
  for (let i = 0; i < state.whiteCount; i++) roles.push('white');
  while (roles.length < state.playerCount) roles.push('civilian');

  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  state.players = roles.map((role, i) => ({
    name: getPlayerName(i),
    role,
    alive: true,
  }));
  state.winner = null;
}

// ---- Reveal screen (pass-the-phone) ----
const wordBox = document.getElementById('word-box');
const btnNextPlayer = document.getElementById('btn-next-player');

function renderReveal() {
  const i = state.currentReveal;
  const name = state.players[i].name;
  document.getElementById('reveal-progress').textContent =
    `PEMAIN ${i + 1} DARI ${state.playerCount}`;
  document.getElementById('reveal-player-name').textContent = name;

  wordBox.className = 'word-box';
  wordBox.innerHTML = '<span id="tap-hint">👆 Tap untuk lihat kartu</span>';
  btnNextPlayer.disabled = true;
  wordBox.onclick = () => revealCurrentCard();
}

function revealCurrentCard() {
  const role = state.players[state.currentReveal].role;
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

// ---- Play / discussion screen ----
function renderPlaySummary() {
  document.getElementById('summary-players').textContent = state.playerCount;
  document.getElementById('summary-undercover').textContent = state.undercoverCount;
  document.getElementById('summary-white').textContent = state.whiteCount;
}

document.getElementById('btn-goto-vote').onclick = () => {
  renderVoteScreen();
  showScreen('vote');
};

// ---- Vote screen ----
const votePlayerList = document.getElementById('vote-player-list');
const voteRoleCard = document.getElementById('vote-role-card');
const voteResultBox = document.getElementById('vote-result-box');
const whiteGuessCard = document.getElementById('white-guess-card');
const btnContinueRound = document.getElementById('btn-continue-round');

function alivePlayers() {
  return state.players.filter(p => p.alive);
}

function renderVoteScreen() {
  state.selectedVoteIndex = null;
  state.selectedGuess = null;
  state.pendingEliminatedIndex = null;

  voteRoleCard.style.display = 'none';
  voteResultBox.classList.add('hidden');
  whiteGuessCard.style.display = 'none';
  btnContinueRound.classList.add('hidden');
  document.getElementById('white-guess-input').value = '';

  const aliveCiv = alivePlayers().filter(p => p.role === 'civilian').length;
  const aliveUnd = alivePlayers().filter(p => p.role === 'undercover').length;
  const aliveWhite = alivePlayers().filter(p => p.role === 'white').length;
  document.getElementById('vote-alive-hint').textContent =
    `Tersisa: ${aliveCiv} Civilian, ${aliveUnd} Undercover, ${aliveWhite} Mr. White`;

  votePlayerList.innerHTML = '';
  state.players.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'vote-player-btn' + (p.alive ? '' : ' eliminated');
    btn.disabled = !p.alive;
    btn.innerHTML = `<span>${escapeHtml(p.name)}</span>` +
      (!p.alive ? `<span class="role-reveal-tag">${roleLabelOf(p.role)}</span>` : '');
    btn.onclick = () => selectVotePlayer(i, btn);
    votePlayerList.appendChild(btn);
  });
}

function roleLabelOf(role) {
  if (role === 'civilian') return 'CIVILIAN';
  if (role === 'undercover') return 'UNDERCOVER';
  return 'MR. WHITE';
}

function selectVotePlayer(index, btnEl) {
  state.selectedVoteIndex = index;
  state.selectedGuess = null;
  [...votePlayerList.children].forEach(c => c.classList.remove('selected'));
  btnEl.classList.add('selected');

  voteRoleCard.style.display = 'block';
  voteResultBox.classList.add('hidden');
  whiteGuessCard.style.display = 'none';
  btnContinueRound.classList.add('hidden');

  [...document.querySelectorAll('.vote-role-btn')].forEach(b => {
    b.classList.remove('selected', 'guess-undercover', 'guess-white');
  });
}

document.querySelectorAll('.vote-role-btn').forEach(btn => {
  btn.onclick = () => {
    if (state.selectedVoteIndex === null) return;
    state.selectedGuess = btn.dataset.guess;
    [...document.querySelectorAll('.vote-role-btn')].forEach(b => {
      b.classList.remove('selected', 'guess-undercover', 'guess-white');
    });
    btn.classList.add('selected', `guess-${state.selectedGuess}`);
    processVote();
  };
});

function processVote() {
  const idx = state.selectedVoteIndex;
  const guess = state.selectedGuess;
  const player = state.players[idx];
  const correct = player.role === guess;

  voteResultBox.classList.remove('hidden');

  if (!correct) {
    // Tebakan meleset -> pemain yang ditunjuk dieliminasi (role dibuka)
    player.alive = false;
    voteResultBox.innerHTML = `
      <div><strong>Tebakan meleset!</strong></div>
      <div>${escapeHtml(player.name)} sebenarnya <span class="role-tag role-${player.role}" style="margin:0;">${roleLabelOf(player.role)}</span></div>
      <div style="margin-top:8px;">${escapeHtml(player.name)} dieliminasi dari permainan.</div>
    `;
    whiteGuessCard.style.display = 'none';
    afterElimination();
    return;
  }

  // Tebakan benar -> role terungkap, pemain dieliminasi
  player.alive = false;
  voteResultBox.innerHTML = `
    <div><strong>Tebakan tepat!</strong></div>
    <div>${escapeHtml(player.name)} memang <span class="role-tag role-${player.role}" style="margin:0;">${roleLabelOf(player.role)}</span> dan dieliminasi.</div>
  `;

  if (player.role === 'white') {
    // Mr. White dapat kesempatan menebak kata civilian
    whiteGuessCard.style.display = 'block';
    state.pendingEliminatedIndex = idx;
    document.getElementById('btn-white-correct').onclick = () => resolveWhiteGuess(true);
    document.getElementById('btn-white-wrong').onclick = () => resolveWhiteGuess(false);
  } else {
    whiteGuessCard.style.display = 'none';
    afterElimination();
  }
}

function resolveWhiteGuess(isCorrect) {
  whiteGuessCard.style.display = 'none';
  if (isCorrect) {
    endGame('white');
    return;
  }
  // Tebakan kata salah -> Mr. White gugur biasa, lanjut cek kondisi menang normal
  afterElimination();
}

function afterElimination() {
  const result = checkWinCondition();
  if (result) {
    endGame(result);
    return;
  }
  btnContinueRound.classList.remove('hidden');
}

function checkWinCondition() {
  const civ = alivePlayers().filter(p => p.role === 'civilian').length;
  const und = alivePlayers().filter(p => p.role === 'undercover').length;
  const wht = alivePlayers().filter(p => p.role === 'white').length;

  // Semua Undercover & Mr. White gugur -> Civilian menang
  if (und === 0 && wht === 0) return 'civilian';

  // Kasus khusus: sisa tepat 1 Civilian + 1 Mr. White (tanpa Undercover) -> Civilian menang
  if (civ === 1 && wht === 1 && und === 0) return 'civilian';

  // Kasus khusus: 1 Civilian + 1 Mr. White + 1 Undercover -> permainan masih lanjut
  if (civ === 1 && wht === 1 && und === 1) return null;

  // Sisa Undercover >= sisa Civilian -> Undercover menang
  if (und >= civ && und > 0) return 'undercover';

  return null; // belum ada pemenang, lanjut ronde
}

btnContinueRound.onclick = () => {
  renderPlaySummary();
  showScreen('play');
};

// ---- Game over screen ----
function endGame(winnerKey) {
  state.winner = winnerKey;
  const stats = recordWin(winnerKey);

  const title = {
    civilian: 'Civilian Menang! 🎉',
    undercover: 'Undercover Menang! 🕵️',
    white: 'Mr. White Menang! 🎭',
  }[winnerKey];

  document.getElementById('gameover-title').textContent = 'Ronde Selesai';

  const aliveNames = alivePlayers().map(p => `${escapeHtml(p.name)} (${roleLabelOf(p.role)})`).join(', ') || '-';
  const eliminatedNames = state.players.filter(p => !p.alive).map(p => `${escapeHtml(p.name)} (${roleLabelOf(p.role)})`).join(', ') || '-';

  document.getElementById('gameover-summary').innerHTML = `
    <div class="winner-banner win-${winnerKey}">${title}</div>
    <p><strong>Masih bertahan:</strong> ${aliveNames}</p>
    <p><strong>Sudah gugur:</strong> ${eliminatedNames}</p>
  `;

  document.getElementById('final-answer-box').classList.add('hidden');
  document.getElementById('final-answer-box').innerHTML = '';

  renderStatsInto('go-stat');
  showScreen('gameover');
}

document.getElementById('btn-show-final-answer').onclick = () => {
  const box = document.getElementById('final-answer-box');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div><span class="label">Kata Civilian:</span> ${escapeHtml(state.words.civilian)}</div>
    <div><span class="label">Kata Undercover:</span> ${escapeHtml(state.words.undercover)}</div>
    <div><span class="label">Kategori:</span> ${escapeHtml(state.words.kategori || '-')}</div>
  `;
};

document.getElementById('btn-new-game').onclick = () => {
  showScreen('setup');
  renderStatsInto('stat');
};

// ---- Reset riwayat kata (server) ----
document.getElementById('btn-reset-history').onclick = async () => {
  const statusEl = document.getElementById('reset-status');
  statusEl.textContent = 'Mereset...';
  try {
    const res = await fetch('/api/generate-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetHistory: true }),
    });
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    statusEl.textContent = 'Riwayat kata sudah direset — kata lama boleh muncul lagi.';
  } catch (err) {
    statusEl.textContent = `Gagal reset: ${err.message}`;
  }
};
