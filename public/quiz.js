'use strict';

const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const stage = document.getElementById('stage');
const joinError = document.getElementById('join-error');
const gameError = document.getElementById('game-error');

let me = null;       // {participantId, name, score, answeredChoice}
let snapshot = null; // /api/quiz/state 형태

const ERROR_MESSAGES = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
  ALREADY_ANSWERED: '이미 답했어요!',
  WRONG_STATE: '지금은 답할 수 없어요.',
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
    stage.appendChild(el('p', 'muted waiting', '퀴즈가 곧 시작됩니다. 잠시만 기다려주세요!'));
    return;
  }

  if (snapshot.status === 'finished') {
    const sorted = [...snapshot.participants].sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex((p) => p.name === me.name) + 1;
    stage.appendChild(el('p', 'result-msg waiting', `퀴즈 끝! 최종 ${rank}위 · ${me.score}점 🎊`));
    return;
  }

  // question / revealed
  const q = snapshot.question;
  stage.appendChild(el('p', 'muted', `문제 ${snapshot.currentIndex + 1} / ${snapshot.totalQuestions}`));
  stage.appendChild(el('p', 'question-text', q.text));
  const choices = el('div', 'choices');
  q.choices.forEach((text, i) => {
    const btn = el('button', 'choice', text);
    btn.type = 'button';
    if (snapshot.status === 'question') {
      if (me.answeredChoice != null) {
        btn.disabled = true;
        if (me.answeredChoice === i) btn.classList.add('mine');
      } else {
        btn.addEventListener('click', () => answer(i));
      }
    } else { // revealed
      btn.disabled = true;
      if (i === q.answerIndex) btn.classList.add('correct');
      else if (me.answeredChoice === i) btn.classList.add('wrong-mine');
    }
    choices.appendChild(btn);
  });
  stage.appendChild(choices);

  if (snapshot.status === 'question' && me.answeredChoice != null) {
    stage.appendChild(el('p', 'muted waiting', '답 제출 완료! 공개를 기다려주세요.'));
  }
  if (snapshot.status === 'revealed') {
    const correct = me.answeredChoice === q.answerIndex;
    stage.appendChild(el('p', 'result-msg',
      me.answeredChoice == null ? '⏰ 이번 문제는 답하지 못했어요.'
        : correct ? '⭕ 정답입니다!' : '❌ 아쉽네요, 오답!'));
  }
}

async function answer(i) {
  gameError.textContent = '';
  try {
    me = await api('POST', '/api/quiz/answer', { participantId: me.participantId, choiceIndex: i });
    render();
  } catch (err) {
    if (err.message === 'PARTICIPANT_NOT_FOUND') localStorage.removeItem('quiz:participantId');
    gameError.textContent = messageFor(err.message);
  }
}

async function refreshMe() {
  if (!me) return;
  try {
    me = await api('GET', `/api/quiz/me/${me.participantId}`);
  } catch {
    // 리셋 등으로 사라진 경우: 입장 화면으로
    localStorage.removeItem('quiz:participantId');
    me = null;
    gameView.classList.add('hidden');
    joinView.classList.remove('hidden');
  }
}

function connect() {
  const source = new EventSource('/api/quiz/events');
  source.onmessage = async (e) => {
    snapshot = JSON.parse(e.data);
    await refreshMe(); // 상태 전환(공개/다음 문제) 시 점수·내 답 동기화
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
    me = await api('POST', '/api/quiz/join', { name: document.getElementById('name-input').value });
    localStorage.setItem('quiz:participantId', me.participantId);
    render();
  } catch (err) {
    joinError.textContent = messageFor(err.message);
  }
});

(async function init() {
  snapshot = await fetch('/api/quiz/state').then((r) => r.json());
  const saved = localStorage.getItem('quiz:participantId');
  if (saved) {
    try {
      me = await api('GET', `/api/quiz/me/${saved}`);
      render();
    } catch {
      localStorage.removeItem('quiz:participantId');
    }
  }
  connect();
})();
