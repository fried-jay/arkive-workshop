'use strict';

const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const grid = document.getElementById('grid');
const joinError = document.getElementById('join-error');
const gameError = document.getElementById('game-error');

let me = null; // {participantId, name, cells, marked, bingoLines}

const ERROR_MESSAGES = {
  ITEMS_NOT_SET: '아직 게임이 준비되지 않았어요. 진행자를 기다려주세요!',
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
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

function render() {
  joinView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = `${me.name}의 빙고판`;
  grid.replaceChildren(...me.cells.map((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell' + (me.marked[i] ? ' marked' : '');
    btn.textContent = text;
    btn.addEventListener('click', () => toggle(i));
    return btn;
  }));
  const count = me.marked.filter(Boolean).length;
  document.getElementById('marked-count').textContent = `칠한 칸 ${count} / 25`;
  document.getElementById('bingo-count').textContent =
    me.bingoLines > 0 ? `🎉 빙고 ${me.bingoLines}줄!` : '빙고 0줄';
}

async function toggle(i) {
  gameError.textContent = '';
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

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  joinError.textContent = '';
  try {
    me = await api('POST', '/api/join', { name: document.getElementById('name-input').value });
    localStorage.setItem('bingo:participantId', me.participantId);
    render();
  } catch (err) {
    joinError.textContent = messageFor(err.message);
  }
});

(async function restore() {
  const saved = localStorage.getItem('bingo:participantId');
  if (!saved) return;
  try {
    me = await api('GET', `/api/me/${saved}`);
    render();
  } catch {
    localStorage.removeItem('bingo:participantId');
  }
})();
