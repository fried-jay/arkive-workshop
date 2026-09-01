'use strict';

const statusBox = document.getElementById('status-box');
const judge = document.getElementById('judge');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

const STATUS_LABEL = {
  collecting: '제출 받는 중 — 시작 직후 봉인하세요',
  sealed: '봉인됨 — 마무리 때 대공개',
  revealed: '공개됨 — 하나씩 읽으며 판정하세요',
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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderStatus(snap) {
  statusBox.textContent = `${STATUS_LABEL[snap.status] || snap.status} (제출 ${snap.participantCount}명)`;
  judge.replaceChildren();
  if (snap.status !== 'revealed') return;
  for (const p of snap.prophecies) {
    const li = document.createElement('li');
    const txt = el('div', 'txt', `"${p.text}"`);
    txt.appendChild(el('small', null, `${p.name}의 예언 · ${p.hit === true ? '⭕ 적중' : p.hit === false ? '❌ 실패' : '❓ 미판정'}`));
    const hitBtn = el('button', 'btn mini' + (p.hit === true ? ' on-hit' : ''), '⭕ 적중');
    const missBtn = el('button', 'btn secondary mini' + (p.hit === false ? ' on-miss' : ''), '❌ 실패');
    hitBtn.type = 'button';
    missBtn.type = 'button';
    hitBtn.addEventListener('click', () => mark(p.name, true));
    missBtn.addEventListener('click', () => mark(p.name, false));
    li.append(txt, hitBtn, missBtn);
    judge.appendChild(li);
  }
}

async function mark(name, hit) {
  try {
    await post('/api/prophecy/admin/mark', { name, hit });
    flash(okMsg, `${name}: ${hit ? '적중 ⭕ (+100)' : '실패 ❌'}`);
  } catch {
    flash(errorMsg, '판정에 실패했어요.');
  }
}

const ACTION_ERRORS = {
  WRONG_STATE: '지금 상태에서는 할 수 없는 동작이에요.',
  NOT_ENOUGH_ENTRIES: '예언이 2개 이상 모여야 봉인할 수 있어요.',
};

for (const [id, url, label, confirmMsg] of [
  ['seal-btn', '/api/prophecy/admin/seal', '봉인 완료! 이제 아무도 제출·수정할 수 없어요.', '제출을 마감하고 봉인할까요?'],
  ['reveal-btn', '/api/prophecy/admin/reveal', '대공개! 하나씩 읽으며 판정하세요.', '모두의 예언을 공개할까요?'],
  ['reset-btn', '/api/prophecy/admin/reset', '리셋 완료!', '예언이 모두 삭제됩니다. 리셋할까요?'],
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
  const source = new EventSource('/api/prophecy/events');
  source.onmessage = (e) => renderStatus(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/prophecy/state').then((r) => r.json()).then(renderStatus);
connect();
