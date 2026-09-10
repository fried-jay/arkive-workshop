'use strict';

const submitView = document.getElementById('submit-view');
const gameView = document.getElementById('game-view');
const stage = document.getElementById('stage');
const submitError = document.getElementById('submit-error');
const myTmiBox = document.getElementById('my-tmi');

let me = null;       // {participantId, name, tmis}
let snapshot = null;

// 개인화 링크(?name=)면 이름 자동 채움·고정
const qName = new URLSearchParams(location.search).get('name');
if (qName) {
  const ni = document.getElementById('name-input');
  if (ni) { ni.value = qName; ni.readOnly = true; }
}

const ERROR_MESSAGES = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  TMI_REQUIRED: 'TMI 3개를 모두 채워주세요.',
  WRONG_STATE: '지금은 제출할 수 없어요. (수집 중에만 제출 가능)',
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
  if (!snapshot) return;

  if (snapshot.status === 'collecting') {
    gameView.classList.add('hidden');
    submitView.classList.remove('hidden');
    if (me) {
      myTmiBox.classList.remove('hidden');
      myTmiBox.replaceChildren(el('span', null, `✅ ${me.name}님 제출 완료 — 수정하려면 다시 제출하세요.`));
      const list = document.createElement('ol');
      for (const t of me.tmis) list.appendChild(el('li', null, t));
      myTmiBox.appendChild(list);
    }
    return;
  }

  // 진행/종료: 현황판 미러 (답변 없음 — 입으로 추리!)
  submitView.classList.add('hidden');
  gameView.classList.remove('hidden');
  stage.replaceChildren();

  if (snapshot.status === 'finished') {
    document.getElementById('round-title').textContent = '🎊 끝!';
    document.getElementById('round-sub').textContent = '';
    stage.appendChild(el('p', 'muted waiting', '모든 TMI의 주인이 공개됐어요. 수고하셨습니다!'));
    return;
  }

  document.getElementById('round-title').textContent = '🤫 이 TMI의 주인은?';
  document.getElementById('round-sub').textContent =
    `${snapshot.roundIndex + 1}번째 사람 / ${snapshot.totalRounds}명 · 힌트 ${snapshot.round.tmis.length} / ${snapshot.round.totalTmis}`;
  const hints = el('div', 'hints');
  snapshot.round.tmis.forEach((t, i) => {
    const h = el('div', 'hint');
    h.appendChild(el('span', 'no', `힌트 ${i + 1}`));
    h.appendChild(el('span', null, t));
    hints.appendChild(h);
  });
  stage.appendChild(hints);
  if (snapshot.round.ownerName) {
    stage.appendChild(el('p', 'owner-reveal', `주인공은... ${snapshot.round.ownerName}! 🎉`));
  } else if (me && snapshot.round.tmis[0] === me.tmis[0]) {
    stage.appendChild(el('p', 'muted waiting', '🤭 내 TMI네요. 들키지 않은 척!'));
  } else {
    stage.appendChild(el('p', 'muted waiting', '누구일까요? 다 같이 외쳐보세요!'));
  }
}

document.getElementById('submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  submitError.textContent = '';
  try {
    me = await api('POST', '/api/tmi/submit', {
      name: document.getElementById('name-input').value,
      tmis: [1, 2, 3].map((i) => document.getElementById(`tmi-${i}`).value),
    });
    localStorage.setItem('tmi:participantId', me.participantId);
    render();
  } catch (err) {
    submitError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
});

async function refreshMe() {
  const saved = localStorage.getItem('tmi:participantId');
  if (!saved) return;
  try {
    me = await api('GET', `/api/tmi/me/${saved}`);
  } catch {
    localStorage.removeItem('tmi:participantId');
    me = null;
  }
}

function connect() {
  const source = new EventSource('/api/tmi/events');
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
  snapshot = await fetch('/api/tmi/state').then((r) => r.json());
  await refreshMe();
  render();
  connect();
})();
