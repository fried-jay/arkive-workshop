'use strict';

const statusBox = document.getElementById('status-box');
const namesBox = document.getElementById('names');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

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
  let text;
  if (snap.status === 'collecting') {
    text = `TMI 수집 중 (제출 ${snap.participantCount}명, 2명 이상이면 시작 가능)`;
  } else if (snap.status === 'finished') {
    text = '게임 종료 — 다시 하려면 진행 리셋';
  } else {
    const step = snap.round.ownerName
      ? '주인 공개됨 — ▶ 다음을 누르면 다음 사람'
      : `힌트 ${snap.round.tmis.length}/${snap.round.totalTmis} 공개됨 — ▶ 다음`;
    text = `${snap.roundIndex + 1}번째 사람 / ${snap.totalRounds}명 · ${step}`;
  }
  statusBox.textContent = text;
  namesBox.replaceChildren(...snap.members.map((name) => {
    const chip = document.createElement('span');
    chip.className = 'name-chip';
    chip.textContent = name;
    return chip;
  }));
}

const ACTION_ERRORS = {
  WRONG_STATE: '지금 상태에서는 할 수 없는 동작이에요.',
  NOT_ENOUGH_ENTRIES: '제출이 2명 이상 모여야 시작할 수 있어요.',
};

for (const [id, url, label, confirmMsg] of [
  ['start-btn', '/api/tmi/admin/start', '게임을 시작했어요! 첫 힌트가 공개됐습니다.', null],
  ['next-btn', '/api/tmi/admin/next', '', null],
  ['reset-btn', '/api/tmi/admin/reset', '진행을 리셋했어요. (제출물 유지)', '진행이 초기화됩니다. (제출물은 유지) 계속할까요?'],
  ['clear-btn', '/api/tmi/admin/clear', '전체 초기화 완료. 수집부터 다시 시작해요.', '제출된 TMI가 전부 삭제됩니다. 계속할까요?'],
]) {
  document.getElementById(id).addEventListener('click', async () => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try {
      await post(url);
      if (label) flash(okMsg, label);
      else flash(okMsg, '');
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
