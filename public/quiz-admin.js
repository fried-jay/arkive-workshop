'use strict';

const input = document.getElementById('questions-input');
const parseInfo = document.getElementById('parse-info');
const statusBox = document.getElementById('status-box');
const roster = document.getElementById('roster');
const timerInput = document.getElementById('timer-input');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

const STATUS_LABEL = {
  idle: '대기 중 — "다음 문제"로 시작하세요',
  question: '문제 진행 중 — 참가자 답변 대기',
  revealed: '정답 공개됨 — "다음 문제"로 계속',
  finished: '퀴즈 종료 — 최종 순위 표시 중',
};

function parseQuestions(text) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n').map((s) => s.trim()).filter(Boolean);
    const [text, ...rawChoices] = lines;
    let answerIndex = -1;
    const choices = rawChoices.map((line, i) => {
      if (line.startsWith('*')) {
        answerIndex = i;
        return line.slice(1).trim();
      }
      return line;
    });
    return { text, choices, answerIndex };
  });
}

function validate(questions) {
  if (questions.length === 0) return '문제가 없어요.';
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.choices.length < 2 || q.choices.length > 4) return `문제 ${i + 1}: 보기는 2~4개여야 해요.`;
    if (q.answerIndex < 0) return `문제 ${i + 1}: 정답 보기 앞에 *를 붙여주세요.`;
  }
  return null;
}

function updateParseInfo() {
  const questions = parseQuestions(input.value);
  const problem = input.value.trim() ? validate(questions) : null;
  parseInfo.textContent = problem ? `⚠️ ${problem}` : `문제 ${questions.length}개 인식됨`;
}
input.addEventListener('input', updateParseInfo);
updateParseInfo();

function flash(el, text) {
  okMsg.textContent = '';
  errorMsg.textContent = '';
  el.textContent = text;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'INTERNAL');
}

function renderStatus(snap) {
  const where = snap.status === 'question' || snap.status === 'revealed'
    ? ` (문제 ${snap.currentIndex + 1}/${snap.totalQuestions}, 응답 ${snap.answeredCount}/${snap.participants.length})`
    : ` (등록된 문제 ${snap.totalQuestions}개, 참가자 ${snap.participants.length}명)`;
  statusBox.textContent = (STATUS_LABEL[snap.status] || snap.status) + where;

  if (timerInput && document.activeElement !== timerInput && snap.timerSec) timerInput.value = snap.timerSec;
  const active = snap.status === 'question' || snap.status === 'revealed';
  const rows = [...snap.participants]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'))
    .map((p) => ({
      name: p.name,
      score: p.score,
      status: active ? (p.answered ? '✅ 응답' : '⏳ 대기') : null,
      statusClass: p.answered ? 'done' : 'wait',
    }));
  renderRoster(roster, rows);
}

document.getElementById('save-btn').addEventListener('click', async () => {
  const questions = parseQuestions(input.value);
  const problem = validate(questions);
  if (problem) {
    flash(errorMsg, problem);
    return;
  }
  if (!confirm(`문제 ${questions.length}개를 등록합니다. 진행/점수는 초기화되고 참가자는 유지돼요. 계속할까요?`)) return;
  try {
    await post('/api/quiz/admin/questions', { questions });
    flash(okMsg, `문제 ${questions.length}개 등록 완료!`);
  } catch {
    flash(errorMsg, '등록에 실패했어요. 형식을 확인해주세요.');
  }
});

const ACTION_ERRORS = {
  WRONG_STATE: '지금 상태에서는 할 수 없는 동작이에요.',
  QUIZ_NOT_READY: '먼저 문제를 등록해주세요.',
};

for (const [id, url, label] of [
  ['next-btn', '/api/quiz/admin/next', '다음 문제를 열었어요.'],
  ['reveal-btn', '/api/quiz/admin/reveal', '정답을 공개했어요.'],
]) {
  document.getElementById(id).addEventListener('click', async () => {
    try {
      await post(url);
      flash(okMsg, label);
    } catch (err) {
      flash(errorMsg, ACTION_ERRORS[err.message] || '실패했어요.');
    }
  });
}

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('점수·진행을 초기화할까요? (문제·참가자는 유지)')) return;
  try {
    await post('/api/quiz/admin/reset');
    flash(okMsg, '리셋 완료!');
  } catch {
    flash(errorMsg, '리셋에 실패했어요.');
  }
});

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (!confirm('등록된 참가자를 모두 제거할까요? (문제 유지)')) return;
  try {
    await post('/api/quiz/admin/clear-participants');
    flash(okMsg, '참가자를 초기화했어요. (문제 유지)');
  } catch {
    flash(errorMsg, '참가자 리셋에 실패했어요.');
  }
});


document.getElementById('timer-btn').addEventListener('click', async () => {
  try {
    await post('/api/quiz/admin/timer', { seconds: Number(timerInput.value) });
    flash(okMsg, `문제당 제한시간을 ${Number(timerInput.value)}초로 설정했어요.`);
  } catch {
    flash(errorMsg, '3~120초 사이로 입력해주세요.');
  }
});

function connect() {
  const source = new EventSource('/api/quiz/events');
  source.onmessage = (e) => renderStatus(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/quiz/state').then((r) => r.json()).then(renderStatus);
connect();
