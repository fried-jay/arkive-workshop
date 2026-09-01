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
    flash(okMsg, '저장했어요! 새 판을 시작하려면 게임 리셋을 눌러주세요.');
  } catch {
    flash(errorMsg, '저장에 실패했어요. 항목을 확인해주세요.');
  }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('참가자 전원이 초기화됩니다. 리셋할까요?')) return;
  try {
    await post('/api/admin/reset');
    flash(okMsg, '리셋 완료! 참가자들은 다시 입장하면 돼요.');
  } catch {
    flash(errorMsg, '리셋에 실패했어요.');
  }
});
