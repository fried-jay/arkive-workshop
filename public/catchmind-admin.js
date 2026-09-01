'use strict';

const statusBox = document.getElementById('status-box');
const peopleBox = document.getElementById('people');
const linkBox = document.getElementById('link-box');
const copyRow = document.getElementById('copy-row');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

let selectedName = null;
let lastSnapshot = null;

const STATUS_LABEL = {
  idle: '대기 중 — 그릴 사람을 선택해 링크를 발급하세요',
  waiting: '그리는 중 — 링크를 받은 사람이 제출하면 시작돼요',
  guessing: '맞추기 진행 중',
  revealed: '정답 공개됨 — 다음 사람에게 링크를 발급하세요',
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'INTERNAL');
  return data;
}

function renderStatus(snap) {
  lastSnapshot = snap;
  const extra = snap.status === 'waiting' ? ` (그리는 사람: ${snap.drawerName})`
    : snap.status === 'guessing' ? ` (${snap.drawerName}님 그림, 오답 ${snap.guesses.length}개)`
    : ` (참가자 ${snap.participants.length}명, ${snap.roundCount}라운드 진행됨)`;
  statusBox.textContent = (STATUS_LABEL[snap.status] || snap.status) + extra;

  peopleBox.replaceChildren(...snap.participants.map((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'person' + (p.name === selectedName ? ' selected' : '');
    btn.textContent = `${p.name} · ${p.score}점${p.isDrawer ? ' 🎨' : ''}`;
    btn.addEventListener('click', () => {
      selectedName = p.name;
      renderStatus(lastSnapshot);
    });
    return btn;
  }));
  if (snap.participants.length === 0) {
    peopleBox.appendChild(Object.assign(document.createElement('p'), {
      className: 'muted', textContent: '아직 참가자가 없어요. /catchmind.html 로 입장하면 여기 나타납니다.',
    }));
  }
}

document.getElementById('assign-btn').addEventListener('click', async () => {
  const person = lastSnapshot?.participants.find((p) => p.name === selectedName);
  if (!person) {
    flash(errorMsg, '먼저 그릴 사람을 선택해주세요.');
    return;
  }
  try {
    // participantId는 스냅샷에 없으므로 이름으로 재조회하지 않고 join을 재사용 (같은 이름 → 같은 참가자)
    const view = await post('/api/catchmind/join', { name: person.name });
    const { key } = await post('/api/catchmind/admin/assign', { participantId: view.participantId });
    const link = `${location.origin}/catchmind-draw.html?key=${key}`;
    linkBox.textContent = link;
    linkBox.classList.remove('hidden');
    copyRow.classList.remove('hidden');
    flash(okMsg, `${person.name}님에게 아래 링크를 보내주세요!`);
  } catch (err) {
    flash(errorMsg, err.message === 'WRONG_STATE'
      ? '맞추기가 진행 중이에요. 정답 공개 후 발급하세요.'
      : '발급에 실패했어요.');
  }
});

document.getElementById('copy-btn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(linkBox.textContent);
    flash(okMsg, '복사했어요! 슬랙으로 보내주세요.');
  } catch {
    flash(errorMsg, '복사에 실패했어요. 링크를 직접 드래그해서 복사해주세요.');
  }
});

document.getElementById('reveal-btn').addEventListener('click', async () => {
  try {
    await post('/api/catchmind/admin/reveal');
    flash(okMsg, '정답을 공개했어요.');
  } catch {
    flash(errorMsg, '맞추기 진행 중일 때만 공개할 수 있어요.');
  }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('참가자와 점수가 모두 초기화됩니다. 리셋할까요?')) return;
  try {
    await post('/api/catchmind/admin/reset');
    linkBox.classList.add('hidden');
    copyRow.classList.add('hidden');
    flash(okMsg, '리셋 완료!');
  } catch {
    flash(errorMsg, '리셋에 실패했어요.');
  }
});

function connect() {
  const source = new EventSource('/api/catchmind/events');
  source.onmessage = (e) => renderStatus(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/catchmind/state').then((r) => r.json()).then(renderStatus);
connect();
