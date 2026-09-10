'use strict';

const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const stage = document.getElementById('stage');
const joinError = document.getElementById('join-error');
const gameError = document.getElementById('game-error');

let me = null;       // {participantId, name, score, votedChoice}
let snapshot = null;

const ERROR_MESSAGES = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
  ALREADY_VOTED: '이미 투표했어요!',
  WRONG_STATE: '지금은 투표할 수 없어요.',
};

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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render() {
  if (!me || !snapshot) return;
  joinView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = me.name;
  document.getElementById('my-score').textContent = `${me.score}점`;
  stage.replaceChildren();

  if (snapshot.status === 'idle') {
    stage.appendChild(el('p', 'muted waiting', '밸런스 게임이 곧 시작됩니다!'));
    return;
  }
  if (snapshot.status === 'finished') {
    const sorted = [...snapshot.participants].sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex((p) => p.name === me.name) + 1;
    stage.appendChild(el('p', 'result-msg waiting', `게임 끝! 최종 ${rank}위 · ${me.score}점 🎊`));
    return;
  }

  const r = snapshot.round;
  stage.appendChild(el('p', 'muted', `라운드 ${snapshot.currentIndex + 1} / ${snapshot.totalRounds}`));
  const wrap = el('div', 'vs-wrap');
  const total = r.counts ? r.counts[0] + r.counts[1] : 0;
  [r.a, r.b].forEach((text, i) => {
    const btn = el('button', 'side', text);
    btn.type = 'button';
    if (snapshot.status === 'voting') {
      if (me.votedChoice != null) {
        btn.disabled = true;
        if (me.votedChoice === i) btn.classList.add('mine');
      } else {
        btn.addEventListener('click', () => vote(i));
      }
    } else { // revealed
      btn.disabled = true;
      if (me.votedChoice === i) btn.classList.add('mine');
      if (r.majority === i) btn.classList.add('majority');
      const pct = total ? Math.round((r.counts[i] / total) * 100) : 0;
      btn.appendChild(el('span', 'pct', `${r.counts[i]}명 · ${pct}%`));
    }
    wrap.appendChild(btn);
    if (i === 0) wrap.appendChild(el('div', 'vs-label', 'VS'));
  });
  stage.appendChild(wrap);

  if (snapshot.status === 'voting' && me.votedChoice != null) {
    stage.appendChild(el('p', 'muted waiting', '투표 완료! 공개를 기다려주세요.'));
  }
  if (snapshot.status === 'revealed') {
    let msg;
    if (me.votedChoice == null) msg = '⏰ 이번 라운드는 투표하지 못했어요.';
    else if (r.majority === null) msg = '🤝 동률! 투표한 모두 +10점';
    else msg = me.votedChoice === r.majority ? '🎉 다수파! +10점' : '🥲 소수파였어요.';
    stage.appendChild(el('p', 'result-msg', msg));
  }
}

async function vote(i) {
  gameError.textContent = '';
  try {
    me = await api('POST', '/api/balance/vote', { participantId: me.participantId, choice: i });
    render();
  } catch (err) {
    if (err.message === 'PARTICIPANT_NOT_FOUND') localStorage.removeItem('balance:participantId');
    gameError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
}

async function refreshMe() {
  if (!me) return;
  try {
    me = await api('GET', `/api/balance/me/${me.participantId}`);
  } catch {
    localStorage.removeItem('balance:participantId');
    me = null;
    gameView.classList.add('hidden');
    joinView.classList.remove('hidden');
  }
}

function connect() {
  const source = new EventSource('/api/balance/events');
  source.onmessage = async (e) => {
    snapshot = JSON.parse(e.data);
    await refreshMe();
    render();
  };
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

setupRosterJoin({
  stateUrl: '/api/balance/state',
  listEl: document.getElementById('roster-list'),
  filterEl: document.getElementById('roster-filter'),
  onPick: async (pickedName) => {
    joinError.textContent = '';
    try {
      me = await api('POST', '/api/balance/join', { name: pickedName });
      localStorage.setItem('balance:participantId', me.participantId);
      render();
    } catch (err) {
      joinError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
    }
  },
});

(async function init() {
  snapshot = await fetch('/api/balance/state').then((r) => r.json());
  const saved = localStorage.getItem('balance:participantId');
  if (saved) {
    try {
      me = await api('GET', `/api/balance/me/${saved}`);
      render();
    } catch {
      localStorage.removeItem('balance:participantId');
    }
  }
  connect();
})();
