'use strict';

const submitView = document.getElementById('submit-view');
const gameView = document.getElementById('game-view');
const stage = document.getElementById('stage');
const submitError = document.getElementById('submit-error');
const myCard = document.getElementById('my-card');

let me = null;       // {participantId, name, text, hit, score}
let snapshot = null;

const ERROR_MESSAGES = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  PROPHECY_REQUIRED: '예언을 입력해주세요.',
  WRONG_STATE: '예언이 이미 봉인됐어요. 다음 기회에!',
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

function cardFor(container, extraClass = '') {
  container.className = `prophecy-card ${extraClass}`;
  container.replaceChildren(
    el('span', 'label', '🤫 나의 예언 — 아무에게도 말하지 마세요'),
    el('span', null, `"${me.text}"`),
  );
  container.classList.remove('hidden');
}

function render() {
  if (!snapshot) return;

  if (snapshot.status === 'collecting') {
    gameView.classList.add('hidden');
    submitView.classList.remove('hidden');
    if (me) cardFor(myCard);
    return;
  }

  if (!me) {
    // 제출 안 한 사람: 상태만 안내
    gameView.classList.add('hidden');
    submitView.classList.remove('hidden');
    submitError.textContent = '예언이 봉인돼서 이번 판엔 참여할 수 없어요. 공개를 구경하세요!';
    return;
  }

  submitView.classList.add('hidden');
  gameView.classList.remove('hidden');
  stage.replaceChildren();

  if (snapshot.status === 'sealed') {
    document.getElementById('title').textContent = '🔒 예언 봉인됨';
    const c = el('div', 'prophecy-card');
    c.append(el('span', 'label', '🤫 나의 예언 — 아무에게도 말하지 마세요'), el('span', null, `"${me.text}"`));
    stage.appendChild(c);
    stage.appendChild(el('p', 'muted waiting', `예언 ${snapshot.participantCount}개가 봉인됐어요. 마무리 공개 때까지 조용히 이뤄지길 기다리거나... 몰래 만들어 가세요 😏`));
    return;
  }

  // revealed
  document.getElementById('title').textContent = '🔮 예언 대공개!';
  const c = el('div', 'prophecy-card' + (me.hit === true ? ' hit' : me.hit === false ? ' miss' : ''));
  c.append(el('span', 'label', '나의 예언'), el('span', null, `"${me.text}"`));
  stage.appendChild(c);
  stage.appendChild(el('p', 'result-msg',
    me.hit === true ? '⭕ 적중! +100 🔮 당신은 예언자입니다'
      : me.hit === false ? '❌ 빗나갔어요. 세상일은 알 수 없죠.'
        : '⏳ 판정 대기 중... 현황판을 보세요!'));
}

document.getElementById('submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  submitError.textContent = '';
  try {
    me = await api('POST', '/api/prophecy/submit', {
      name: document.getElementById('name-input').value,
      text: document.getElementById('text-input').value,
    });
    localStorage.setItem('prophecy:participantId', me.participantId);
    render();
  } catch (err) {
    submitError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
});

async function refreshMe() {
  const saved = localStorage.getItem('prophecy:participantId');
  if (!saved) return;
  try {
    me = await api('GET', `/api/prophecy/me/${saved}`);
  } catch {
    localStorage.removeItem('prophecy:participantId');
    me = null;
  }
}

function connect() {
  const source = new EventSource('/api/prophecy/events');
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

(async function init() {
  snapshot = await fetch('/api/prophecy/state').then((r) => r.json());
  await refreshMe();
  render();
  connect();
})();
