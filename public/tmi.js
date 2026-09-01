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

  if (snapshot.status === 'collecting') {
    gameView.classList.add('hidden');
    submitView.classList.remove('hidden');
    if (me) {
      myTmiBox.classList.remove('hidden');
      myTmiBox.textContent = `✅ ${me.name}님 제출 완료 — "${me.tmi}"`;
    }
    return;
  }

  // 진행 중인데 제출 안 한 사람은 구경 화면
  submitView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = me ? me.name : '관전 중';
  document.getElementById('my-score').textContent = me ? `${me.score}점` : '';
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
    if (me?.isOwner) stage.appendChild(el('p', 'result-msg waiting', '🤭 내 TMI다! 들키지 않은 척 해주세요.'));
    else if (me?.answeredChoice != null) stage.appendChild(el('p', 'muted waiting', '답 제출 완료! 공개를 기다려주세요.'));
    else if (!me) stage.appendChild(el('p', 'muted waiting', 'TMI를 제출하지 않아 관전만 가능해요.'));
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

(async function init() {
  snapshot = await fetch('/api/tmi/state').then((r) => r.json());
  await refreshMe();
  render();
  connect();
})();
