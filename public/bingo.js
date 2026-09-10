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
const callBanner = document.getElementById('call-banner');

let me = null; // {participantId, name, cells, marked, ready, started, callSec, cellCalls, currentCall, ...}
let clockOffset = 0;
let tick = null;

const ERROR_MESSAGES = {
  ITEMS_NOT_SET: '아직 게임이 준비되지 않았어요. 진행자를 기다려주세요!',
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
  NOT_STARTED: '아직 시작 전이에요. 진행자가 시작하면 진행됩니다.',
  ALREADY_STARTED: '이미 게임이 시작됐어요.',
  ALREADY_READY: '레디 상태에서는 배치를 바꿀 수 없어요. 레디를 취소하고 다시 섞어주세요.',
  NOT_CALLED: '아직 안 부른 항목이에요. 진행자가 부른 항목만 칠할 수 있어요.',
  TIME_UP: '⏰ 시간이 지나 잠긴 항목이에요.',
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

const now = () => Date.now() + clockOffset;

// 각 칸 상태: wait(대기) / active(칠 수 있음) / locked(잠김)
function cellState(i) {
  const at = me.cellCalls ? me.cellCalls[i] : null;
  if (at == null) return 'wait';
  if (now() <= at + me.callSec * 1000) return 'active';
  return 'locked';
}

function renderPlayGrid() {
  playGrid.replaceChildren(...me.cells.map((text, i) => {
    const st = cellState(i);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell ' + st + (me.marked[i] ? ' marked' : '');
    btn.textContent = text;
    btn.addEventListener('click', () => toggle(i));
    return btn;
  }));
}

function renderSetupGrid() {
  grid.replaceChildren(...me.cells.map((text) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell';
    btn.textContent = text;
    return btn;
  }));
}

function updateBanner() {
  if (!callBanner) return;
  const c = me.currentCall;
  if (c) {
    const left = Math.max(0, Math.ceil((c.deadline - now()) / 1000));
    callBanner.className = 'call-banner on';
    callBanner.textContent = `📢 지금: ${c.text}  ·  ⏱ ${left}초`;
  } else {
    callBanner.className = 'call-banner';
    callBanner.textContent = '진행자가 항목을 부르길 기다려요…';
  }
}

// 초 단위로 칸 잠금/카운트다운 갱신 (호출 만료를 반영)
function startTick() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (!me || !me.started) return;
    updateBanner();
    // active/locked 상태만 반영 (마킹 상태는 유지)
    const buttons = playGrid.querySelectorAll('.cell');
    buttons.forEach((btn, i) => {
      const st = cellState(i);
      btn.className = 'cell ' + st + (me.marked[i] ? ' marked' : '');
    });
  }, 300);
}

function render() {
  if (me && me.now) clockOffset = me.now - Date.now();
  joinView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = `${me.name}의 빙고판`;

  if (me.started) {
    setupView.classList.add('hidden');
    playView.classList.remove('hidden');
    renderPlayGrid();
    updateBanner();
    const count = me.marked.filter(Boolean).length;
    document.getElementById('marked-count').textContent = `칠한 칸 ${count} / 25`;
    document.getElementById('bingo-count').textContent =
      me.bingoLines > 0 ? `🎉 빙고 ${me.bingoLines}줄!` : '빙고 0줄';
    startTick();
  } else {
    clearInterval(tick);
    playView.classList.add('hidden');
    setupView.classList.remove('hidden');
    renderSetupGrid();
    shuffleBtn.classList.toggle('hidden', me.ready);
    readyBtn.textContent = me.ready ? '레디 취소' : '✅ 레디';
    readyBtn.className = me.ready ? 'btn secondary' : 'btn';
    readyStatus.textContent = me.ready ? '✅ 레디 완료 · 진행자를 기다리는 중' : '레디 대기 중';
  }
}

async function toggle(i) {
  gameError.textContent = '';
  const st = cellState(i);
  if (st === 'wait') { gameError.textContent = messageFor('NOT_CALLED'); return; }
  if (st === 'locked') { gameError.textContent = messageFor('TIME_UP'); return; }
  try {
    me = await api('POST', '/api/mark', { participantId: me.participantId, cellIndex: i, on: !me.marked[i] });
    render();
  } catch (err) {
    if (err.message === 'PARTICIPANT_NOT_FOUND') localStorage.removeItem('bingo:participantId');
    gameError.textContent = messageFor(err.message);
  }
}

shuffleBtn.addEventListener('click', async () => {
  gameError.textContent = '';
  try { me = await api('POST', '/api/shuffle', { participantId: me.participantId }); render(); }
  catch (err) { gameError.textContent = messageFor(err.message); }
});

readyBtn.addEventListener('click', async () => {
  gameError.textContent = '';
  try { me = await api('POST', '/api/ready', { participantId: me.participantId, ready: !me.ready }); render(); }
  catch (err) { gameError.textContent = messageFor(err.message); }
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
    } catch (err) { joinError.textContent = messageFor(err.message); }
  },
});

// 진행자의 시작/호출을 실시간 반영: 스냅샷 받으면 내 뷰(cellCalls 포함)를 새로 가져와 렌더
function connect() {
  const source = new EventSource('/api/events');
  source.onmessage = async (e) => {
    const snap = JSON.parse(e.data);
    if (readyCountEl) readyCountEl.textContent = `레디 ${snap.readyCount} / ${snap.participants.length}명`;
    if (!me) return;
    try { me = await api('GET', `/api/me/${me.participantId}`); render(); } catch {}
  };
  source.onerror = () => { source.close(); setTimeout(connect, 2000); };
}

(async function restore() {
  const saved = localStorage.getItem('bingo:participantId');
  if (!saved) return;
  try { me = await api('GET', `/api/me/${saved}`); render(); connect(); }
  catch { localStorage.removeItem('bingo:participantId'); }
})();
