'use strict';

const statusBox = document.getElementById('status-box');
const namesBox = document.getElementById('names');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

const STATUS_LABEL = {
  collecting: 'TMI 수집 중',
  question: '문제 진행 중 — 답변 대기',
  revealed: '주인 공개됨 — "다음 TMI"로 계속',
  finished: '게임 종료 — 최종 순위 표시 중',
};

function flash(el, text) {
  okMsg.textContent = '';
  errorMsg.textContent = '';
  el.textContent = text;
}

async function post(url) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error((await res.json()).error || 'INTERNAL');
}

function renderStatus(snap) {
  const where = snap.status === 'question' || snap.status === 'revealed'
    ? ` (TMI ${snap.currentIndex + 1}/${snap.totalRounds}, 응답 ${snap.answeredCount}/${snap.entryCount - 1})`
    : ` (제출 ${snap.entryCount}명)`;
  statusBox.textContent = (STATUS_LABEL[snap.status] || snap.status) + where;
  namesBox.replaceChildren(...snap.names.map((name) => {
    const chip = document.createElement('span');
    chip.className = 'name-chip';
    chip.textContent = name;
    return chip;
  }));
}

const ACTION_ERRORS = {
  WRONG_STATE: '지금 상태에서는 할 수 없는 동작이에요.',
  NOT_ENOUGH_ENTRIES: '제출이 4명 이상 모여야 시작할 수 있어요.',
};

for (const [id, url, label, confirmMsg] of [
  ['start-btn', '/api/tmi/admin/start', '게임을 시작했어요!', null],
  ['next-btn', '/api/tmi/admin/next', '다음 TMI를 열었어요.', null],
  ['reveal-btn', '/api/tmi/admin/reveal', '주인을 공개했어요.', null],
  ['reset-btn', '/api/tmi/admin/reset', '진행을 리셋했어요. (제출물 유지)', '점수와 진행이 초기화됩니다. (제출물은 유지) 계속할까요?'],
  ['clear-btn', '/api/tmi/admin/clear', '전체 초기화 완료. 수집부터 다시 시작해요.', '제출된 TMI가 전부 삭제됩니다. 계속할까요?'],
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
  const source = new EventSource('/api/tmi/events');
  source.onmessage = (e) => renderStatus(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/tmi/state').then((r) => r.json()).then(renderStatus);
connect();
