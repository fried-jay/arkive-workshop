'use strict';
const statusBox = document.getElementById('status-box');
const roster = document.getElementById('roster');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');
const winnerInput = document.getElementById('winner-input');

const LABEL = { collecting: '제출 받는 중', showing: '공개 중', finished: '종료 — 최종 순위' };
function flash(el, t) { okMsg.textContent = ''; errorMsg.textContent = ''; el.textContent = t; }
async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (!res.ok) throw new Error((await res.json()).error || 'INTERNAL');
}

function renderStatus(snap) {
  let where;
  if (snap.status === 'showing') {
    const c = snap.current;
    where = ` (${snap.currentIndex + 1}/${snap.total}` + (c && c.revealed ? ` · 정답 "${c.word}"${c.winnerName ? ' · 정답자 ' + c.winnerName : ''}` : ' · 손들기 대기') + ')';
  } else {
    where = ` (${snap.total}명 제출)`;
  }
  statusBox.textContent = (LABEL[snap.status] || snap.status) + where;
  const rows = (snap.submitters || []).map((n) => ({ name: n, status: '✅ 제출', statusClass: 'done' }));
  renderRoster(roster, rows, '아직 제출한 사람이 없어요.');
  const hb = document.getElementById('hint-btn');
  if (hb) {
    const c = snap.current;
    if (snap.status === 'showing' && c) {
      const shown = c.hintsShown || 0, total = c.hintsTotal || 0;
      hb.textContent = `💡 힌트 공개 (${shown}/${total})`;
      hb.disabled = total === 0 || shown >= total;
    } else {
      hb.textContent = '💡 힌트 공개';
      hb.disabled = true;
    }
  }
}

const ERRORS = { NOT_ENOUGH_ENTRIES: '제출된 그림이 없어요.', WRONG_STATE: '지금 상태에서는 할 수 없어요.', GUESS_REQUIRED: '정답자 이름을 입력하세요.' };
for (const [id, url, label, confirmMsg] of [
  ['start-btn', '/api/catchmind/admin/start', '공개를 시작했어요!', null],
  ['next-btn', '/api/catchmind/admin/next', '다음 그림으로.', null],
  ['reveal-btn', '/api/catchmind/admin/reveal', '정답을 공개했어요. (정답자 없음)', null],
  ['reset-btn', '/api/catchmind/admin/reset', '진행 리셋 완료. (제출물 유지)', '점수·진행을 초기화할까요? (제출물 유지)'],
  ['clear-btn', '/api/catchmind/admin/clear', '제출물을 전부 삭제했어요.', '제출된 그림을 모두 삭제할까요?'],
]) {
  document.getElementById(id).addEventListener('click', async () => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try { await post(url); flash(okMsg, label); }
    catch (err) { flash(errorMsg, ERRORS[err.message] || '실패했어요.'); }
  });
}
document.getElementById('hint-btn').addEventListener('click', async () => {
  try { await post('/api/catchmind/admin/hint'); }
  catch (err) { flash(errorMsg, ERRORS[err.message] || '실패했어요.'); }
});
document.getElementById('winner-btn').addEventListener('click', async () => {
  const name = winnerInput.value.trim();
  if (!name) { flash(errorMsg, '정답자 이름을 입력하세요.'); return; }
  try { await post('/api/catchmind/admin/winner', { name }); flash(okMsg, `${name} 정답 처리! (+100, 그린 사람 +50)`); winnerInput.value = ''; }
  catch (err) { flash(errorMsg, ERRORS[err.message] || '실패했어요.'); }
});

document.getElementById('prompts-btn').addEventListener('click', async () => {
  const prompts = document.getElementById('prompts-input').value.split('\n')
    .map((line) => line.split('|').map((x) => x.trim()))
    .filter((parts) => parts[0])
    .map((parts) => ({ word: parts[0], hints: parts.slice(1, 3).filter(Boolean) }));
  if (prompts.length === 0) { flash(errorMsg, '제시어를 입력하세요.'); return; }
  try {
    const res = await fetch('/api/catchmind/admin/prompts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompts }) });
    if (!res.ok) throw new Error();
    document.getElementById('prompts-ok').textContent = `제시어 ${prompts.length}개 등록 완료!`;
  } catch { flash(errorMsg, '등록에 실패했어요.'); }
});

function connect() {
  const s = new EventSource('/api/catchmind/events');
  s.onmessage = (e) => renderStatus(JSON.parse(e.data));
  s.onerror = () => { s.close(); setTimeout(connect, 2000); };
}
fetch('/api/catchmind/state').then((r) => r.json()).then(renderStatus);
connect();
