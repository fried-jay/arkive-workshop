'use strict';

const input = document.getElementById('items-input');
const lineCount = document.getElementById('line-count');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

function parsedItems() {
  return input.value.split('\n').map((s) => s.trim()).filter(Boolean);
}

function updateCount() {
  lineCount.textContent = `현재 ${parsedItems().length}개 / 25개`;
}
input.addEventListener('input', updateCount);
updateCount();

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

document.getElementById('save-btn').addEventListener('click', async () => {
  const items = parsedItems();
  if (items.length !== 25) {
    flash(errorMsg, `항목이 ${items.length}개예요. 정확히 25개가 필요해요.`);
    return;
  }
  try {
    await post('/api/admin/items', { items });
    flash(okMsg, '저장했어요! 참가자는 유지됩니다. 새 판은 판 리셋을 눌러주세요.');
  } catch {
    flash(errorMsg, '저장에 실패했어요. 항목을 확인해주세요.');
  }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('모든 참가자의 빙고판을 초기화하고 시작 전으로 되돌릴까요? (참가자 명단은 유지)')) return;
  try {
    await post('/api/admin/reset');
    flash(okMsg, '판 초기화 완료! 참가자는 그대로예요.');
  } catch {
    flash(errorMsg, '리셋에 실패했어요.');
  }
});

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (!confirm('등록된 참가자를 모두 제거할까요? (항목 유지)')) return;
  try {
    await post('/api/admin/clear-participants');
    flash(okMsg, '참가자를 초기화했어요. (항목 유지)');
  } catch {
    flash(errorMsg, '참가자 리셋에 실패했어요.');
  }
});

// ---------- ② 진행: 실시간 현황 + 시작 ----------
const liveStatus = document.getElementById('live-status');
const startBtn = document.getElementById('start-btn');
const forceStartBtn = document.getElementById('force-start-btn');
const roster = document.getElementById('roster');
const startOk = document.getElementById('start-ok');
const startError = document.getElementById('start-error');
const callSecInput = document.getElementById('callsec-input');
const callBoard = document.getElementById('call-board');
const callHead = document.getElementById('callboard-head');
let ITEMS = [];
let liveNow = 0, liveOffset = 0;
fetch('/api/admin/items').then((r) => r.json()).then((d) => { ITEMS = d.items || []; }).catch(() => {});

function renderLive(snap) {
  const total = snap.participants.length;
  const ready = snap.readyCount;
  const allReady = total > 0 && ready === total;

  if (callSecInput && document.activeElement !== callSecInput && snap.callSec) callSecInput.value = snap.callSec;
  liveOffset = snap.now ? snap.now - Date.now() : 0;
  if (snap.started) {
    liveStatus.textContent = `▶ 진행 중 · 참가자 ${total}명 · 호출 ${snap.calledCount}/25` + (snap.currentCall ? ` · 지금 "${snap.currentCall.text}"` : '');
    renderCallBoard(snap);
  } else if (total === 0) {
    liveStatus.textContent = '참가자를 기다리는 중이에요. (0명)';
  } else {
    liveStatus.textContent = `시작 대기 · 레디 ${ready} / ${total}명` + (allReady ? ' · 전원 준비 완료!' : '');
  }

  startBtn.disabled = snap.started || !allReady;
  startBtn.textContent = snap.started ? '이미 시작됨' : (allReady ? '🚀 게임 시작' : `레디 대기 (${ready}/${total})`);
  forceStartBtn.classList.toggle('hidden', snap.started || total === 0);

  // 전체 참가자 상황
  const players = [...snap.participants].sort(
    (a, b) => b.bingoLines - a.bingoLines || b.markedCount - a.markedCount || a.name.localeCompare(b.name, 'ko'),
  );
  roster.replaceChildren(...players.map((p) => {
    const li = document.createElement('li');
    li.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:10px;';
    const left = document.createElement('span');
    left.style.fontWeight = '700';
    const badge = snap.started
      ? (p.bingoLines > 0 ? `🎉 ${p.bingoLines}줄` : '')
      : (p.ready ? '✅ 레디' : '⏳ 대기');
    left.textContent = `${p.name}`;
    const right = document.createElement('span');
    right.className = 'muted';
    right.style.cssText = 'font-variant-numeric:tabular-nums;';
    right.textContent = snap.started ? `${p.markedCount}/25 ${p.bingoLines > 0 ? '· 🎉'+p.bingoLines+'줄' : ''}` : badge;
    li.append(left, right);
    return li;
  }));
}

let lastSnap = null;
function renderCallBoard(snap) {
  lastSnap = snap;
  if (!snap.started) { callBoard.replaceChildren(); callHead.style.display = 'none'; return; }
  callHead.style.display = '';
  const sec = snap.callSec || 15;
  const nowS = Date.now() + liveOffset;
  callBoard.replaceChildren(...ITEMS.map((text, i) => {
    const at = snap.calls ? snap.calls[i] : null;
    const active = at != null && nowS <= at + sec * 1000;
    const done = at != null && !active;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'call-cell' + (active ? ' active' : '') + (done ? ' done' : '');
    b.disabled = at != null;
    b.textContent = active ? `⏱${Math.max(0, Math.ceil((at + sec * 1000 - nowS) / 1000))} ${text}` : text;
    if (at == null) b.addEventListener('click', () => call(i));
    return b;
  }));
}
async function call(i) {
  try { await post('/api/admin/call', { itemIndex: i }); }
  catch (err) { startError.textContent = err.message === 'ALREADY_CALLED' ? '이미 부른 항목이에요.' : '호출 실패.'; }
}
// 카운트다운 갱신 (호출 중일 때 초 표시)
setInterval(() => { if (lastSnap && lastSnap.started) renderCallBoard(lastSnap); }, 500);

async function doStart() {
  startError.textContent = '';
  startOk.textContent = '';
  try {
    await post('/api/admin/start');
    startOk.textContent = '게임을 시작했어요! 참가자 화면이 자동으로 전환됩니다.';
  } catch (err) {
    startError.textContent = err.message === 'NO_PARTICIPANTS'
      ? '참가자가 아직 없어요.'
      : '시작에 실패했어요.';
  }
}
document.getElementById('callsec-btn').addEventListener('click', async () => {
  try {
    await post('/api/admin/call-window', { seconds: Number(callSecInput.value) });
    startOk.textContent = `호출 제한시간 ${Number(callSecInput.value)}초 설정 완료.`;
    startError.textContent = '';
  } catch {
    startError.textContent = '3~120초 사이로 입력해주세요.';
  }
});
startBtn.addEventListener('click', doStart);
forceStartBtn.addEventListener('click', () => {
  if (confirm('전원 레디가 아니어도 지금 바로 시작할까요?')) doStart();
});

function connectLive() {
  const source = new EventSource('/api/events');
  source.onmessage = (e) => renderLive(JSON.parse(e.data));
  source.onerror = () => { source.close(); setTimeout(connectLive, 2000); };
}
fetch('/api/state').then((r) => r.json()).then(renderLive).catch(() => {});
connectLive();
