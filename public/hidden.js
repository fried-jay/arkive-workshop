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
let clockOffset = 0;         // 서버 시각 - 내 시각
let roundEndTimer = null;
const roundEndBox = document.getElementById('round-end');
const clearMsg = document.getElementById('clear-msg');

const MSG = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
  WRONG_STATE: '지금은 찾을 수 없어요. 진행자를 기다려주세요.',
  ROUND_OVER: '이번 라운드는 끝났어요. 잠시 뒤 다음 라운드!',
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
  grid.style.gridTemplateColumns = `repeat(${r.dim}, 1fr)`;
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

const RANK_LABEL = (rank) => (rank === 1 ? '🥇 1등' : rank === 2 ? '🥈 2등' : rank === 3 ? '🥉 3등' : `${rank}등`);

// 1등이 나온 뒤 남은 시간 표시. endsAt이 없으면 숨김.
function showRoundEnd(endsAt, firstClear) {
  clearInterval(roundEndTimer);
  if (!endsAt) { roundEndBox.classList.add('hidden'); return; }
  roundEndBox.classList.remove('hidden');
  const tick = () => {
    const left = Math.max(0, Math.ceil((endsAt - (Date.now() + clockOffset)) / 1000));
    roundEndBox.textContent = `🏆 1등 ${firstClear}! ⏳ ${left}초 뒤 다음 라운드`;
    if (left <= 0) clearInterval(roundEndTimer);
  };
  tick();
  roundEndTimer = setInterval(tick, 250);
}

async function tap(i, btn) {
  playError.textContent = '';
  if (foundSet.has(i)) return;
  try {
    const r = await api('POST', '/api/hidden/tap', { participantId: me.participantId, cellIndex: i });
    if (r.correct) {
      foundSet.add(i);
      btn.className = 'hcell found';
      btn.textContent = '✅';
      if (r.cleared) {
        me.score += r.points;
        me.clearRank = r.rank;
        clearMsg.textContent = `🎉 다 찾았어요! ${RANK_LABEL(r.rank)} +${r.points}점`;
      }
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
  if (v.now) clockOffset = v.now - Date.now();
  if (v.status === 'playing' && v.round) {
    if (renderedRound !== v.currentIndex) {
      foundSet = new Set(v.found || []);
      renderedRound = v.currentIndex;
      clearMsg.textContent = v.clearRank ? `🎉 다 찾았어요! ${RANK_LABEL(v.clearRank)}` : '';
      playError.textContent = '';
    }
    show('play');
    renderGrid();
    showRoundEnd(v.roundEndsAt, v.round.firstClear);
  } else {
    renderedRound = -2;
    showRoundEnd(null);
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
    if (snap.now) clockOffset = snap.now - Date.now();
    // 라운드/상태 변화 시 내 뷰 갱신
    if (snap.status !== me.status || snap.currentIndex !== me.currentIndex) {
      try { applyView(await api('GET', `/api/hidden/me/${me.participantId}`)); } catch {}
      return;
    }
    // 같은 라운드에서 1등이 나오면 카운트다운 표시
    if (snap.status === 'playing' && snap.roundEndsAt !== me.roundEndsAt) {
      me.roundEndsAt = snap.roundEndsAt;
      showRoundEnd(snap.roundEndsAt, snap.round && snap.round.firstClear);
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
