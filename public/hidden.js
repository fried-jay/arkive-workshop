'use strict';
const joinView = document.getElementById('join-view');
const waitView = document.getElementById('wait-view');
const playView = document.getElementById('play-view');
const grid = document.getElementById('grid');
const joinError = document.getElementById('join-error');
const playError = document.getElementById('play-error');

let me = null;               // 참가자 뷰
let foundSet = new Set();
let renderedRound = -2;

const MSG = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
  WRONG_STATE: '지금은 찾을 수 없어요. 진행자를 기다려주세요.',
};
const msg = (c) => MSG[c] || '문제가 발생했어요. 잠시 후 다시 시도해주세요.';

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'INTERNAL');
  return data;
}

function show(view) {
  joinView.classList.toggle('hidden', view !== 'join');
  waitView.classList.toggle('hidden', view !== 'wait');
  playView.classList.toggle('hidden', view !== 'play');
}

function renderGrid() {
  const r = me.round;
  document.getElementById('target-emoji').textContent = r.target;
  grid.replaceChildren(...r.cells.map((emoji, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hcell' + (foundSet.has(i) ? ' found' : '');
    b.textContent = foundSet.has(i) ? '✅' : emoji;
    b.addEventListener('click', () => tap(i, b));
    return b;
  }));
  updateProgress();
}

function updateProgress() {
  document.getElementById('progress').textContent = `찾은 그림 ${foundSet.size} / ${me.round.targetCount}`;
  document.getElementById('my-score').textContent = `총 ${me.score}점`;
}

async function tap(i, btn) {
  playError.textContent = '';
  if (foundSet.has(i)) return;
  try {
    const r = await api('POST', '/api/hidden/tap', { participantId: me.participantId, cellIndex: i });
    if (r.correct) {
      foundSet.add(i);
      me.score += r.alreadyFound ? 0 : 1;
      btn.className = 'hcell found';
      btn.textContent = '✅';
      updateProgress();
    } else {
      btn.animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 150 });
    }
  } catch (err) {
    if (err.message === 'PARTICIPANT_NOT_FOUND') localStorage.removeItem('hidden:participantId');
    playError.textContent = msg(err.message);
  }
}

function applyView(v) {
  me = v;
  if (v.status === 'playing' && v.round) {
    if (renderedRound !== v.currentIndex) {
      foundSet = new Set(v.found || []);
      renderedRound = v.currentIndex;
    }
    show('play');
    renderGrid();
  } else {
    renderedRound = -2;
    document.getElementById('wait-title').textContent = v.status === 'finished' ? '🏁 끝났어요!' : '🔍 숨은그림찾기';
    document.getElementById('wait-msg').textContent = v.status === 'finished'
      ? `수고했어요! 최종 ${v.score}점. 현황판에서 순위를 확인하세요.`
      : '진행자가 시작하길 기다리는 중...';
    show('wait');
  }
}

setupRosterJoin({
  stateUrl: '/api/hidden/state',
  listEl: document.getElementById('roster-list'),
  filterEl: document.getElementById('roster-filter'),
  onPick: async (pickedName) => {
    joinError.textContent = '';
    try {
      const v = await api('POST', '/api/hidden/join', { name: pickedName });
      localStorage.setItem('hidden:participantId', v.participantId);
      applyView(v);
      connect();
    } catch (err) { joinError.textContent = msg(err.message); }
  },
});

function connect() {
  const source = new EventSource('/api/hidden/events');
  source.onmessage = async (e) => {
    const snap = JSON.parse(e.data);
    if (!me) return;
    // 라운드/상태 변화 시 내 뷰 갱신
    if (snap.status !== me.status || snap.currentIndex !== me.currentIndex) {
      try { applyView(await api('GET', `/api/hidden/me/${me.participantId}`)); } catch {}
    }
  };
  source.onerror = () => { source.close(); setTimeout(connect, 2000); };
}

(async function restore() {
  const saved = localStorage.getItem('hidden:participantId');
  if (!saved) return;
  try { applyView(await api('GET', `/api/hidden/me/${saved}`)); connect(); }
  catch { localStorage.removeItem('hidden:participantId'); }
})();
