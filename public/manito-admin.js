'use strict';

const statusBox = document.getElementById('status-box');
const roster = document.getElementById('roster');
const noteInput = document.getElementById('note-input');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

const STATUS_LABEL = {
  idle: '모집 중 — 3명 이상 모이면 시작 가능',
  running: '진행 중 — 각자 몰래 챙기는 중 🤫',
  revealed: '공개됨 — 리셋하면 새 판',
};

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

let noteLoaded = false;

function renderStatus(snap) {
  statusBox.textContent = `${STATUS_LABEL[snap.status] || snap.status} (참가 ${snap.participantCount}명 · 추측 제출 ${snap.guessedCount}명)`;
  if (!noteLoaded) {
    noteInput.value = snap.note || '';
    noteLoaded = true;
  }

  let rows;
  if (snap.status === 'revealed' && snap.scores) {
    rows = [...snap.scores]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'))
      .map((p) => ({ name: p.name, score: p.score }));
  } else {
    rows = [...snap.participants]
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map((p) => ({
        name: p.name,
        status: snap.status === 'running' ? (p.guessed ? '✅ 추측 완료' : '⏳ 대기') : null,
        statusClass: p.guessed ? 'done' : 'wait',
      }));
  }
  renderRoster(roster, rows);
}

document.getElementById('note-btn').addEventListener('click', async () => {
  try {
    await post('/api/manito/admin/note', { text: noteInput.value });
    flash(okMsg, '안내문을 저장했어요.');
  } catch {
    flash(errorMsg, '저장에 실패했어요.');
  }
});

const ACTION_ERRORS = {
  WRONG_STATE: '지금 상태에서는 할 수 없는 동작이에요.',
  NOT_ENOUGH_ENTRIES: '참가자가 3명 이상이어야 시작할 수 있어요.',
};

for (const [id, url, label, confirmMsg] of [
  ['start-btn', '/api/manito/admin/start', '배정 완료! 각자 폰에서 챙길 사람을 확인하세요.', '시작하면 새 참가자는 못 들어옵니다. 시작할까요?'],
  ['reveal-btn', '/api/manito/admin/reveal', '대공개! 현황판을 보세요.', '전체 매칭을 공개할까요?'],
  ['reset-btn', '/api/manito/admin/reset', '리셋 완료!', '참가자가 모두 초기화됩니다. 리셋할까요?'],
]) {
  document.getElementById(id).addEventListener('click', async () => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try {
      await post(url);
      flash(okMsg, label);
    } catch (err) {
      flash(errorMsg, ACTION_ERRORS[err.message] || '실패했어요.');
    }
  });
}

function connect() {
  const source = new EventSource('/api/manito/events');
  source.onmessage = (e) => renderStatus(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/manito/state').then((r) => r.json()).then(renderStatus);
connect();
