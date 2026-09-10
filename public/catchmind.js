'use strict';

const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const stage = document.getElementById('stage');
const joinError = document.getElementById('join-error');
const gameError = document.getElementById('game-error');

let me = null;       // {participantId, name, score, isDrawer}
let snapshot = null;
let loadedRound = -1;
let strokes = [];

const ERROR_MESSAGES = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  GUESS_REQUIRED: '답을 입력해주세요.',
  OWN_DRAW: '본인 그림은 맞출 수 없어요!',
  WRONG_STATE: '지금은 답할 수 없어요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
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

async function ensureStrokes() {
  if (loadedRound === snapshot.roundCount) return;
  strokes = (await api('GET', '/api/catchmind/strokes')).strokes;
  loadedRound = snapshot.roundCount;
}

async function render() {
  if (!me || !snapshot) return;
  joinView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = me.name;
  document.getElementById('my-score').textContent = `${me.score}점`;
  stage.replaceChildren();

  if (snapshot.status === 'idle') {
    stage.appendChild(el('p', 'muted waiting', '진행자가 그릴 사람을 정하고 있어요. 잠시만요!'));
    return;
  }
  if (snapshot.status === 'waiting') {
    stage.appendChild(el('p', 'muted waiting', me.isDrawer
      ? '🎨 당신 차례! 진행자가 보낸 그리기 링크를 열어주세요.'
      : `🎨 ${snapshot.drawerName}님이 그리는 중... 곧 공개됩니다!`));
    return;
  }

  // guessing / revealed: 그림 + 맞추기
  await ensureStrokes();
  stage.appendChild(el('p', 'muted', `${snapshot.drawerName}님의 그림 — 뭘까요?`));
  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  renderStrokes(canvas, strokes);

  if (snapshot.status === 'guessing') {
    if (me.isDrawer) {
      stage.appendChild(el('p', 'muted waiting', '내 그림이에요! 다들 맞추는 중 🤫'));
    } else {
      const row = el('div', 'guess-row');
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '정답 입력';
      input.maxLength = 30;
      input.autocomplete = 'off';
      const btn = el('button', 'btn', '제출');
      btn.type = 'button';
      btn.addEventListener('click', () => guess(input));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') guess(input);
      });
      row.append(input, btn);
      stage.appendChild(row);
    }
  } else { // revealed
    stage.appendChild(el('p', 'owner-reveal', snapshot.winnerName
      ? `🎉 ${snapshot.winnerName}님 정답! "${snapshot.word}"`
      : `아무도 못 맞혔어요… 정답은 "${snapshot.word}"`));
  }

  if (snapshot.guesses.length) {
    const feed = el('ul', 'feed');
    for (const g of snapshot.guesses.slice().reverse()) {
      feed.appendChild(el('li', null, `${g.name}: ${g.text}`));
    }
    stage.appendChild(feed);
  }
}

async function guess(input) {
  gameError.textContent = '';
  try {
    const result = await api('POST', '/api/catchmind/guess', {
      participantId: me.participantId,
      text: input.value,
    });
    if (!result.correct) input.value = '';
  } catch (err) {
    if (err.message === 'PARTICIPANT_NOT_FOUND') localStorage.removeItem('catchmind:participantId');
    gameError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
}

async function refreshMe() {
  if (!me) return;
  try {
    me = await api('GET', `/api/catchmind/me/${me.participantId}`);
  } catch {
    localStorage.removeItem('catchmind:participantId');
    me = null;
    gameView.classList.add('hidden');
    joinView.classList.remove('hidden');
  }
}

function connect() {
  const source = new EventSource('/api/catchmind/events');
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
  stateUrl: '/api/catchmind/state',
  listEl: document.getElementById('roster-list'),
  filterEl: document.getElementById('roster-filter'),
  onPick: async (pickedName) => {
    joinError.textContent = '';
    try {
      me = await api('POST', '/api/catchmind/join', { name: pickedName });
      localStorage.setItem('catchmind:participantId', me.participantId);
      render();
    } catch (err) {
      joinError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
    }
  },
});

(async function init() {
  snapshot = await fetch('/api/catchmind/state').then((r) => r.json());
  const saved = localStorage.getItem('catchmind:participantId');
  if (saved) {
    try {
      me = await api('GET', `/api/catchmind/me/${saved}`);
      render();
    } catch {
      localStorage.removeItem('catchmind:participantId');
    }
  }
  connect();
})();
