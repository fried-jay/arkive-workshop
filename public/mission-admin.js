'use strict';

const PRESET_MISSIONS = [
  "누군가가 '진짜?'라고 말하게 만들기",
  '세 명 이상과 하이파이브 하기',
  "대화 중에 '옛날에는 말이야…' 자연스럽게 시전하기",
  '누군가의 소지품을 구체적으로 칭찬하기',
  '단체사진 찍자고 제안해서 성사시키기',
  '누군가에게 물이나 음료를 떠다 주기',
  "'혹시 MBTI가 어떻게 되세요?' 물어보기",
  '박수를 유도해서 다 같이 치게 만들기',
  '누군가와 새끼손가락 걸고 약속하기',
  "'오늘 날씨 미쳤다' 말하고 동의 받아내기",
  '누군가를 웃겨서 소리 내어 웃게 만들기',
  "누군가의 말에 '좋은 질문이네요' 라고 답하기",
  '다른 사람 이름을 세 번 연속으로 부르기',
  '누군가에게 간식을 나눠주기',
  '같이 셀카 찍자고 해서 성공하기',
  "서로 다른 세 명에게 '파이팅' 말하기",
  '누군가의 말을 그대로 따라 하며 맞장구 2번 치기',
  '진행자에게 질문 하나 하기',
  "허공에 대고 '우리 팀 최고!' 외치기",
  '누군가와 가위바위보 해서 이기기',
];

const input = document.getElementById('missions-input');
const parseInfo = document.getElementById('parse-info');
const statusBox = document.getElementById('status-box');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

const STATUS_LABEL = {
  idle: '대기 중 — 참가자가 모이면 게임 시작을 누르세요',
  running: '진행 중 — 다들 몰래 미션 수행 중 🕵️',
  revealed: '전체 공개됨 — 리셋하면 새 판',
};

function parsed() {
  return input.value.split('\n').map((s) => s.trim()).filter(Boolean);
}

function updateInfo() {
  parseInfo.textContent = `미션 ${parsed().length}개`;
}
input.addEventListener('input', updateInfo);
updateInfo();

document.getElementById('preset-btn').addEventListener('click', () => {
  input.value = PRESET_MISSIONS.join('\n');
  updateInfo();
});

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

function renderStatus(snap) {
  statusBox.textContent = `${STATUS_LABEL[snap.status] || snap.status} (참가 ${snap.participants.length}명 · 미션 ${snap.missions.length}개 · 성공 ${snap.participants.filter((p) => p.done).length}명)`;
}

document.getElementById('save-btn').addEventListener('click', async () => {
  const missions = parsed();
  if (missions.length === 0) {
    flash(errorMsg, '미션이 없어요.');
    return;
  }
  try {
    await post('/api/mission/admin/missions', { missions });
    flash(okMsg, `미션 ${missions.length}개 등록 완료!`);
  } catch (err) {
    flash(errorMsg, err.message === 'WRONG_STATE' ? '진행 중에는 수정할 수 없어요. 리셋 후 등록하세요.' : '등록에 실패했어요.');
  }
});

const ACTION_ERRORS = {
  WRONG_STATE: '지금 상태에서는 할 수 없는 동작이에요.',
  MISSION_NOT_READY: '참가자 2명 이상 + 미션 1개 이상이어야 시작할 수 있어요.',
};

for (const [id, url, label, confirmMsg] of [
  ['start-btn', '/api/mission/admin/start', '시작! 각자 폰에 비밀미션이 배정됐어요.', null],
  ['reveal-btn', '/api/mission/admin/reveal', '전체 공개했어요. 현황판에서 검증 타임!', '게임을 끝내고 모두의 미션을 공개할까요?'],
  ['reset-btn', '/api/mission/admin/reset', '리셋 완료! (미션 풀은 유지)', '참가자와 점수가 초기화됩니다. 리셋할까요?'],
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
  const source = new EventSource('/api/mission/events');
  source.onmessage = (e) => renderStatus(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/mission/state').then((r) => r.json()).then(renderStatus);
connect();
