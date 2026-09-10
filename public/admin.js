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
const timerInput = document.getElementById('timer-input');

function renderLive(snap) {
  const total = snap.participants.length;
  const ready = snap.readyCount;
  const allReady = total > 0 && ready === total;

  if (timerInput && document.activeElement !== timerInput && snap.timerSec != null) timerInput.value = snap.timerSec;
  if (snap.started) {
    const limit = snap.timerSec > 0 ? ` · 제한 ${snap.timerSec}초` : '';
    liveStatus.textContent = `▶ 진행 중 · 참가자 ${total}명${limit}`;
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
document.getElementById('timer-btn').addEventListener('click', async () => {
  try {
    await post('/api/admin/timer', { seconds: Number(timerInput.value) });
    startOk.textContent = Number(timerInput.value) > 0 ? `제한시간 ${Number(timerInput.value)}초 설정 완료.` : '제한시간 없음으로 설정.';
    startError.textContent = '';
  } catch {
    startError.textContent = '0~3600초 사이로 입력해주세요.';
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
