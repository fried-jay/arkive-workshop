'use strict';

const input = document.getElementById('rounds-input');
const parseInfo = document.getElementById('parse-info');
const statusBox = document.getElementById('status-box');
const roster = document.getElementById('roster');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

const STATUS_LABEL = {
  idle: '대기 중 — "다음 라운드"로 시작하세요',
  voting: '투표 진행 중',
  revealed: '결과 공개됨 — "다음 라운드"로 계속',
  finished: '게임 종료 — 최종 순위 표시 중',
};

function parseRounds(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
    const [a, ...rest] = line.split(/\s+vs\s+/i);
    return { a: (a || '').trim(), b: rest.join(' vs ').trim() };
  });
}

function validate(rounds) {
  if (rounds.length === 0) return '라운드가 없어요.';
  const bad = rounds.findIndex((r) => !r.a || !r.b);
  if (bad >= 0) return `${bad + 1}번째 줄: "A vs B" 형식이 아니에요.`;
  return null;
}

function updateParseInfo() {
  const rounds = parseRounds(input.value);
  const problem = input.value.trim() ? validate(rounds) : null;
  parseInfo.textContent = problem ? `⚠️ ${problem}` : `라운드 ${rounds.length}개 인식됨`;
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
  const where = snap.status === 'voting' || snap.status === 'revealed'
    ? ` (라운드 ${snap.currentIndex + 1}/${snap.totalRounds}, 투표 ${snap.votedCount}/${snap.participants.length})`
    : ` (등록된 라운드 ${snap.totalRounds}개, 참가자 ${snap.participants.length}명)`;
  statusBox.textContent = (STATUS_LABEL[snap.status] || snap.status) + where;

  const active = snap.status === 'voting' || snap.status === 'revealed';
  const rows = [...snap.participants]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'))
    .map((p) => ({
      name: p.name,
      score: p.score,
      status: active ? (p.voted ? '✅ 투표' : '⏳ 대기') : null,
      statusClass: p.voted ? 'done' : 'wait',
    }));
  renderRoster(roster, rows);
}

document.getElementById('save-btn').addEventListener('click', async () => {
  const rounds = parseRounds(input.value);
  const problem = validate(rounds);
  if (problem) {
    flash(errorMsg, problem);
    return;
  }
  if (!confirm(`라운드 ${rounds.length}개를 등록합니다. 진행/점수는 초기화되고 참가자는 유지돼요. 계속할까요?`)) return;
  try {
    await post('/api/balance/admin/rounds', { rounds });
    flash(okMsg, `라운드 ${rounds.length}개 등록 완료!`);
  } catch {
    flash(errorMsg, '등록에 실패했어요.');
  }
});

const ACTION_ERRORS = {
  WRONG_STATE: '지금 상태에서는 할 수 없는 동작이에요.',
  BALANCE_NOT_READY: '먼저 라운드를 등록해주세요.',
};

for (const [id, url, label] of [
  ['next-btn', '/api/balance/admin/next', '다음 라운드를 열었어요.'],
  ['reveal-btn', '/api/balance/admin/reveal', '결과를 공개했어요.'],
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
  if (!confirm('점수·진행을 초기화할까요? (라운드·참가자는 유지)')) return;
  try {
    await post('/api/balance/admin/reset');
    flash(okMsg, '리셋 완료!');
  } catch {
    flash(errorMsg, '리셋에 실패했어요.');
  }
});

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (!confirm('등록된 참가자를 모두 제거할까요? (라운드 유지)')) return;
  try {
    await post('/api/balance/admin/clear-participants');
    flash(okMsg, '참가자를 초기화했어요. (라운드 유지)');
  } catch {
    flash(errorMsg, '참가자 리셋에 실패했어요.');
  }
});


function connect() {
  const source = new EventSource('/api/balance/events');
  source.onmessage = (e) => renderStatus(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/balance/state').then((r) => r.json()).then(renderStatus);
connect();
