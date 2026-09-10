'use strict';
const statusBox = document.getElementById('status-box');
const roster = document.getElementById('roster');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

const LABEL = { idle: '대기 중 — 라운드를 생성하고 시작하세요', playing: '진행 중', finished: '종료 — 최종 순위 표시 중' };

function flash(el, t) { okMsg.textContent = ''; errorMsg.textContent = ''; el.textContent = t; }
async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!res.ok) throw new Error((await res.json()).error || 'INTERNAL');
  return res.json();
}

function renderStatus(snap) {
  const where = snap.status === 'playing' ? ` (라운드 ${snap.currentIndex + 1}/${snap.totalRounds} · 찾을 그림 ${snap.round ? snap.round.target : ''})`
    : ` (라운드 ${snap.totalRounds}개 · 참가 ${snap.participants.length}명)`;
  const first = snap.status === 'playing' && snap.round && snap.round.firstClear
    ? ` · 🏆 1등 ${snap.round.firstClear} — 5초 뒤 자동 다음 라운드` : '';
  statusBox.textContent = (LABEL[snap.status] || snap.status) + where + first;
  const rows = [...snap.participants]
    .sort((a, b) => b.score - a.score || (a.clearRank || 99) - (b.clearRank || 99) || a.name.localeCompare(b.name, 'ko'))
    .map((p) => ({
      name: p.name, score: p.score,
      status: snap.status !== 'playing' ? null : p.clearRank ? `${p.clearRank}등 클리어` : `이번 ${p.foundInRound}개`,
      statusClass: p.clearRank ? 'done' : 'wait',
    }));
  renderRoster(roster, rows);
}

document.getElementById('gen-btn').addEventListener('click', async () => {
  try { const r = await post('/api/hidden/admin/generate', { count: Number(document.getElementById('count').value) || 5 }); flash(okMsg, `라운드 ${r.rounds}개 생성 완료!`); }
  catch { flash(errorMsg, '생성에 실패했어요.'); }
});

const ERRORS = { HIDDEN_NOT_READY: '먼저 라운드를 생성해주세요.', WRONG_STATE: '지금 상태에서는 할 수 없어요.' };
for (const [id, url, label, confirmMsg] of [
  ['start-btn', '/api/hidden/admin/start', '시작했어요! 참가자 화면이 전환됩니다.', null],
  ['next-btn', '/api/hidden/admin/next', '다음 라운드로 넘어갔어요.', null],
  ['reset-btn', '/api/hidden/admin/reset', '진행 초기화 완료! (라운드·참가자 유지)', '점수·진행을 초기화할까요? (라운드·참가자는 유지)'],
  ['clear-btn', '/api/hidden/admin/clear-participants', '참가자를 초기화했어요. (라운드 유지)', '등록된 참가자를 모두 제거할까요? (라운드 유지)'],
]) {
  document.getElementById(id).addEventListener('click', async () => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try { await post(url); flash(okMsg, label); }
    catch (err) { flash(errorMsg, ERRORS[err.message] || '실패했어요.'); }
  });
}

function connect() {
  const s = new EventSource('/api/hidden/events');
  s.onmessage = (e) => renderStatus(JSON.parse(e.data));
  s.onerror = () => { s.close(); setTimeout(connect, 2000); };
}
fetch('/api/hidden/state').then((r) => r.json()).then(renderStatus);
connect();
