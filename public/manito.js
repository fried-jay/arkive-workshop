'use strict';

const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const stage = document.getElementById('stage');
const joinError = document.getElementById('join-error');
const gameError = document.getElementById('game-error');
const okMsg = document.getElementById('ok-msg');

let me = null;       // {participantId, name, targetName, guessName, myManitoName, guessedRight, score}
let snapshot = null;

const ERROR_MESSAGES = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  WRONG_STATE: '이미 시작돼서 새로 입장할 수 없어요. (기존 참가자는 같은 이름으로 복귀 가능)',
  CHOICE_INVALID: '다른 사람을 골라주세요.',
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

function render() {
  if (!me || !snapshot) return;
  joinView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = `💌 ${me.name}의 마니또`;
  stage.replaceChildren();

  if (snapshot.status === 'idle') {
    stage.appendChild(el('p', 'muted waiting', `입장 완료! 지금 ${snapshot.participantCount}명 모였어요. 시작되면 챙겨줄 사람이 배정됩니다.`));
    return;
  }

  if (snapshot.status === 'revealed') {
    stage.appendChild(el('p', 'result-msg', `나를 몰래 챙겨준 사람은... ${me.myManitoName} 💝`));
    stage.appendChild(el('p', 'muted waiting',
      me.guessName == null ? '추측을 제출하지 않았어요.'
        : me.guessedRight ? `🎯 "${me.guessName}" — 정확히 맞혔어요! +100` : `🙈 "${me.guessName}"라고 생각했지만 아니었네요.`));
    stage.appendChild(el('p', 'muted', '전체 매칭은 현황판에서 공개 중!'));
    return;
  }

  // running
  const card = el('div', 'target-card');
  card.appendChild(el('span', 'label', '🤫 당신이 몰래 챙길 사람'));
  card.appendChild(el('span', 'name', me.targetName));
  stage.appendChild(card);
  if (snapshot.note) stage.appendChild(el('p', 'note-box', `📋 미션: ${snapshot.note}`));

  const guessBox = el('div', 'guess-box');
  guessBox.appendChild(el('p', null, '🔮 나를 챙겨주는 사람은 누구일까요? (공개 전까지 변경 가능, 맞히면 +100)'));
  const row = el('div', 'row');
  const select = document.createElement('select');
  select.appendChild(new Option('선택...', ''));
  for (const p of snapshot.participants) {
    if (p.name !== me.name) select.appendChild(new Option(p.name, p.name, false, p.name === me.guessName));
  }
  const btn = el('button', 'btn', '제출');
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    okMsg.textContent = '';
    gameError.textContent = '';
    if (!select.value) {
      gameError.textContent = '사람을 선택해주세요.';
      return;
    }
    try {
      me = await api('POST', '/api/manito/guess', { participantId: me.participantId, guessName: select.value });
      okMsg.textContent = `"${select.value}" 로 제출했어요!`;
    } catch (err) {
      gameError.textContent = ERROR_MESSAGES[err.message] || '실패했어요.';
    }
  });
  row.append(select, btn);
  guessBox.appendChild(row);
  if (me.guessName) guessBox.appendChild(el('p', 'muted', `현재 내 추측: ${me.guessName}`));
  stage.appendChild(guessBox);
}

async function refreshMe() {
  if (!me) return;
  try {
    me = await api('GET', `/api/manito/me/${me.participantId}`);
  } catch {
    localStorage.removeItem('manito:participantId');
    me = null;
    gameView.classList.add('hidden');
    joinView.classList.remove('hidden');
  }
}

function connect() {
  const source = new EventSource('/api/manito/events');
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

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  joinError.textContent = '';
  try {
    me = await api('POST', '/api/manito/join', { name: document.getElementById('name-input').value });
    localStorage.setItem('manito:participantId', me.participantId);
    render();
  } catch (err) {
    joinError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
});

(async function init() {
  snapshot = await fetch('/api/manito/state').then((r) => r.json());
  const saved = localStorage.getItem('manito:participantId');
  if (saved) {
    try {
      me = await api('GET', `/api/manito/me/${saved}`);
      render();
    } catch {
      localStorage.removeItem('manito:participantId');
    }
  }
  connect();
})();
