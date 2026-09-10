'use strict';

const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const setupView = document.getElementById('setup-view');
const playView = document.getElementById('play-view');
const grid = document.getElementById('grid');
const playGrid = document.getElementById('play-grid');
const joinError = document.getElementById('join-error');
const gameError = document.getElementById('game-error');
const shuffleBtn = document.getElementById('shuffle-btn');
const readyBtn = document.getElementById('ready-btn');
const readyStatus = document.getElementById('ready-status');
const readyCountEl = document.getElementById('ready-count');

let me = null; // {participantId, name, cells, marked, ready, started, bingoLines}
let clockOffset = 0;
let bingoTimer = null;

const ERROR_MESSAGES = {
  ITEMS_NOT_SET: '아직 게임이 준비되지 않았어요. 진행자를 기다려주세요!',
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
  NOT_STARTED: '아직 시작 전이에요. 진행자가 시작하면 칠할 수 있어요.',
  ALREADY_STARTED: '이미 게임이 시작됐어요.',
  ALREADY_READY: '레디 상태에서는 배치를 바꿀 수 없어요. 레디를 취소하고 다시 섞어주세요.',
  TIME_UP: '⏰ 시간이 끝났어요!',
};

function messageFor(code) {
  return ERROR_MESSAGES[code] || '문제가 발생했어요. 잠시 후 다시 시도해주세요.';
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'INTERNAL');
  return data;
}

function renderBoard(target, markable) {
  target.replaceChildren(...me.cells.map((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell' + (me.marked[i] ? ' marked' : '');
    btn.textContent = text;
    if (markable) btn.addEventListener('click', () => toggle(i));
    return btn;
  }));
}

function bingoRemaining() {
  return me && me.deadline ? me.deadline - (Date.now() + clockOffset) : Infinity;
}

function startBingoCountdown() {
  clearInterval(bingoTimer);
  const cd = document.getElementById('bingo-countdown');
  if (!me.deadline) { if (cd) cd.textContent = ''; return; }
  function tick() {
    const left = bingoRemaining();
    if (left <= 0) {
      if (cd) { cd.textContent = '⏰ 시간 종료'; cd.classList.add('over'); }
      playGrid.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      clearInterval(bingoTimer);
      return;
    }
    if (cd) cd.textContent = `⏱ ${Math.ceil(left / 1000)}초`;
  }
  tick();
  bingoTimer = setInterval(tick, 250);
}

function render() {
  if (me && me.now) clockOffset = me.now - Date.now();
  clearInterval(bingoTimer);
  joinView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = `${me.name}의 빙고판`;

  if (me.started) {
    // 진행 중: 마킹 화면
    setupView.classList.add('hidden');
    playView.classList.remove('hidden');
    renderBoard(playGrid, true);
    const count = me.marked.filter(Boolean).length;
    document.getElementById('marked-count').textContent = `칠한 칸 ${count} / 25`;
    document.getElementById('bingo-count').textContent =
      me.bingoLines > 0 ? `🎉 빙고 ${me.bingoLines}줄!` : '빙고 0줄';
    startBingoCountdown();
  } else {
    // 시작 전: 배치 조정 + 레디
    playView.classList.add('hidden');
    setupView.classList.remove('hidden');
    renderBoard(grid, false);
    shuffleBtn.classList.toggle('hidden', me.ready);
    readyBtn.textContent = me.ready ? '레디 취소' : '✅ 레디';
    readyBtn.className = me.ready ? 'btn secondary' : 'btn';
    readyStatus.textContent = me.ready ? '✅ 레디 완료 · 진행자를 기다리는 중' : '레디 대기 중';
  }
}

async function toggle(i) {
  gameError.textContent = '';
  if (!me.started) { gameError.textContent = messageFor('NOT_STARTED'); return; }
  if (bingoRemaining() <= 0) { gameError.textContent = messageFor('TIME_UP'); return; }
  try {
    me = await api('POST', '/api/mark', {
      participantId: me.participantId,
      cellIndex: i,
      on: !me.marked[i],
    });
    render();
  } catch (err) {
    if (err.message === 'PARTICIPANT_NOT_FOUND') localStorage.removeItem('bingo:participantId');
    gameError.textContent = messageFor(err.message);
  }
}

shuffleBtn.addEventListener('click', async () => {
  gameError.textContent = '';
  try {
    me = await api('POST', '/api/shuffle', { participantId: me.participantId });
    render();
  } catch (err) {
    gameError.textContent = messageFor(err.message);
  }
});

readyBtn.addEventListener('click', async () => {
  gameError.textContent = '';
  try {
    me = await api('POST', '/api/ready', { participantId: me.participantId, ready: !me.ready });
    render();
  } catch (err) {
    gameError.textContent = messageFor(err.message);
  }
});

setupRosterJoin({
  stateUrl: '/api/state',
  listEl: document.getElementById('roster-list'),
  filterEl: document.getElementById('roster-filter'),
  onPick: async (pickedName) => {
    joinError.textContent = '';
    try {
      me = await api('POST', '/api/join', { name: pickedName });
      localStorage.setItem('bingo:participantId', me.participantId);
      render();
      connect();
    } catch (err) {
      joinError.textContent = messageFor(err.message);
    }
  },
});

// 진행자의 시작/다른 참가자의 레디를 실시간 반영
function connect() {
  const source = new EventSource('/api/events');
  source.onmessage = async (e) => {
    const snap = JSON.parse(e.data);
    if (readyCountEl) {
      readyCountEl.textContent = `레디 ${snap.readyCount} / ${snap.participants.length}명`;
    }
    // 시작되면 내 화면을 마킹 모드로 전환
    if (snap.started && me && !me.started) {
      try {
        me = await api('GET', `/api/me/${me.participantId}`);
        render();
      } catch {}
    }
  };
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

(async function restore() {
  const saved = localStorage.getItem('bingo:participantId');
  if (!saved) return;
  try {
    me = await api('GET', `/api/me/${saved}`);
    render();
    connect();
  } catch {
    localStorage.removeItem('bingo:participantId');
  }
})();
