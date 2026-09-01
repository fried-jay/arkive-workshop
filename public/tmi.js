'use strict';

const submitView = document.getElementById('submit-view');
const gameView = document.getElementById('game-view');
const stage = document.getElementById('stage');
const submitError = document.getElementById('submit-error');
const gameError = document.getElementById('game-error');
const myTmiBox = document.getElementById('my-tmi');

let me = null;       // {participantId, name, tmi, score, answeredChoice, isOwner}
let snapshot = null;

const ERROR_MESSAGES = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  TMI_REQUIRED: 'TMI를 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 제출해주세요.',
  ALREADY_ANSWERED: '이미 답했어요!',
  OWN_QUESTION: '본인 TMI 문제예요! 구경만 해주세요 😎',
  WRONG_STATE: '지금은 답할 수 없어요. (제출은 수집 중에만 가능해요)',
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
  const collecting = snapshot.status === 'collecting';

  // 수집 중이거나 아직 입장 전이면 입장/제출 화면
  if (collecting || !me) {
    gameView.classList.add('hidden');
    submitView.classList.remove('hidden');
    // 수집이 끝나면 TMI 입력은 잠기고 이름만으로 참가
    document.getElementById('tmi-input').classList.toggle('hidden', !collecting);
    document.getElementById('submit-btn').classList.toggle('hidden', !collecting);
    document.getElementById('join-only-btn').textContent = collecting ? 'TMI 없이 참가만' : '참가하기';
    document.getElementById('join-hint').textContent = collecting
      ? 'TMI를 제출하면 내 문제도 출제돼요. 참가만 하면 맞히기에만 참여합니다.'
      : '수집은 마감됐지만, 이름을 입력하면 지금부터 맞히기에 참여할 수 있어요!';
    if (me) {
      myTmiBox.classList.remove('hidden');
      myTmiBox.textContent = me.submitted
        ? `✅ ${me.name}님 제출 완료 — "${me.tmi}"`
        : `✅ ${me.name}님 참가 완료 (맞히기 전용)`;
    }
    if (collecting) return;
  }
  if (!me) return;

  submitView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = me.name;
  document.getElementById('my-score').textContent = `${me.score}점`;
  stage.replaceChildren();

  if (snapshot.status === 'finished') {
    if (me) {
      const sorted = [...snapshot.participants].sort((a, b) => b.score - a.score);
      const rank = sorted.findIndex((p) => p.name === me.name) + 1;
      stage.appendChild(el('p', 'result-msg waiting', `끝! 최종 ${rank}위 · ${me.score}점 🎊`));
    } else {
      stage.appendChild(el('p', 'muted waiting', '게임이 끝났어요!'));
    }
    return;
  }

  const r = snapshot.round;
  stage.appendChild(el('p', 'muted', `TMI ${snapshot.currentIndex + 1} / ${snapshot.totalRounds} — 이 TMI의 주인은?`));
  stage.appendChild(el('p', 'tmi-text', `"${r.tmi}"`));
  const canPlay = me && !me.isOwner;
  const choices = el('div', 'choices');
  r.choices.forEach((name, i) => {
    const btn = el('button', 'choice', name);
    btn.type = 'button';
    if (snapshot.status === 'question') {
      if (!canPlay || me.answeredChoice != null) {
        btn.disabled = true;
        if (me && me.answeredChoice === i) btn.classList.add('mine');
      } else {
        btn.addEventListener('click', () => answer(i));
      }
    } else { // revealed
      btn.disabled = true;
      if (i === r.answerIndex) btn.classList.add('correct');
      else if (me && me.answeredChoice === i) btn.classList.add('wrong-mine');
    }
    choices.appendChild(btn);
  });
  stage.appendChild(choices);

  if (snapshot.status === 'question') {
    if (me.isOwner) stage.appendChild(el('p', 'result-msg waiting', '🤭 내 TMI다! 들키지 않은 척 해주세요.'));
    else if (me.answeredChoice != null) stage.appendChild(el('p', 'muted waiting', '답 제출 완료! 공개를 기다려주세요.'));
  }
  if (snapshot.status === 'revealed' && me && !me.isOwner) {
    const correct = me.answeredChoice === r.answerIndex;
    stage.appendChild(el('p', 'result-msg',
      me.answeredChoice == null ? '⏰ 이번엔 답하지 못했어요.'
        : correct ? '⭕ 정답입니다!' : `❌ 오답! 주인은 ${r.ownerName}`));
  }
}

async function answer(i) {
  gameError.textContent = '';
  try {
    me = await api('POST', '/api/tmi/answer', { participantId: me.participantId, choiceIndex: i });
    render();
  } catch (err) {
    gameError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
}

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

document.getElementById('submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  submitError.textContent = '';
  try {
    me = await api('POST', '/api/tmi/submit', {
      name: document.getElementById('name-input').value,
      tmi: document.getElementById('tmi-input').value,
    });
    localStorage.setItem('tmi:participantId', me.participantId);
    render();
  } catch (err) {
    submitError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
});

document.getElementById('join-only-btn').addEventListener('click', async () => {
  submitError.textContent = '';
  try {
    me = await api('POST', '/api/tmi/join', { name: document.getElementById('name-input').value });
    localStorage.setItem('tmi:participantId', me.participantId);
    render();
  } catch (err) {
    submitError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
});

(async function init() {
  snapshot = await fetch('/api/tmi/state').then((r) => r.json());
  await refreshMe();
  render();
  connect();
})();
