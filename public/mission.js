'use strict';

const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const stage = document.getElementById('stage');
const joinError = document.getElementById('join-error');
const gameError = document.getElementById('game-error');
const okMsg = document.getElementById('ok-msg');

let me = null;       // {participantId, name, score, mission, done, foiled, foiledBy}
let snapshot = null;

const ERROR_MESSAGES = {
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
  ALREADY_DONE: '이미 완료된 미션이에요.',
  MISSION_FOILED: '간파당한 미션은 신고할 수 없어요.',
  SELF_ACCUSE: '자기 자신은 지목할 수 없어요.',
  MISSION_INVALID: '미션을 선택해주세요.',
  WRONG_STATE: '지금은 할 수 없는 동작이에요.',
};

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'INTERNAL');
  return data;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function flash(elm, text) {
  okMsg.textContent = '';
  gameError.textContent = '';
  elm.textContent = text;
}

function missionCard() {
  const card = el('div', 'mission-card' + (me.done ? ' done' : '') + (me.foiled ? ' foiled' : ''));
  card.appendChild(el('span', 'label', '🤫 나의 비밀미션 — 아무에게도 보여주지 마세요'));
  card.appendChild(el('span', null, me.mission));
  return card;
}

function render() {
  if (!me || !snapshot) return;
  joinView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = me.name;
  document.getElementById('my-score').textContent = `${me.score}점`;
  stage.replaceChildren();

  if (snapshot.status === 'idle') {
    stage.appendChild(el('p', 'muted waiting', '입장 완료! 게임이 시작되면 비밀미션이 배정됩니다.'));
    return;
  }

  if (snapshot.status === 'revealed') {
    stage.appendChild(el('p', 'muted', '미션 전체 공개! 현황판을 보세요.'));
    stage.appendChild(missionCard());
    stage.appendChild(el('p', 'waiting', me.done ? '✅ 미션 성공으로 마쳤어요!' : me.foiled ? `❌ ${me.foiledBy}님에게 간파당했어요.` : '⏰ 미션을 완수하지 못했어요.'));
    return;
  }

  // running
  stage.appendChild(missionCard());
  if (me.foiled) {
    stage.appendChild(el('p', 'muted waiting', `❌ ${me.foiledBy}님에게 간파당했어요. 대신 다른 사람 미션을 간파해서 만회하세요!`));
  } else if (me.done) {
    stage.appendChild(el('p', 'muted waiting', '✅ 성공 신고 완료! 이제 다른 사람 미션을 간파해보세요.'));
  } else {
    const btn = el('button', 'btn', '✅ 미션 성공 신고 (+100)');
    btn.type = 'button';
    btn.style.marginTop = '12px';
    btn.addEventListener('click', async () => {
      if (!confirm('정말 수행했죠? 마지막 공개 때 다 같이 검증합니다 👀')) return;
      try {
        me = await api('POST', '/api/mission/report', { participantId: me.participantId });
        render();
      } catch (err) {
        flash(gameError, ERROR_MESSAGES[err.message] || '실패했어요.');
      }
    });
    stage.appendChild(btn);
  }

  // 간파 UI
  const accuseBox = el('div', 'accuse-box');
  accuseBox.appendChild(el('p', null, '🔍 간파하기 — 적중 +50 / 오판 -20'));
  const row = el('div', 'row');
  const personSelect = document.createElement('select');
  personSelect.appendChild(new Option('누구를?', ''));
  for (const p of snapshot.participants) {
    if (p.name !== me.name && !p.done && !p.foiled) personSelect.appendChild(new Option(p.name, p.name));
  }
  const missionSelect = document.createElement('select');
  missionSelect.appendChild(new Option('어떤 미션?', ''));
  snapshot.missions.forEach((m, i) => missionSelect.appendChild(new Option(m, String(i))));
  const accuseBtn = el('button', 'btn secondary', '지목!');
  accuseBtn.type = 'button';
  accuseBtn.addEventListener('click', async () => {
    if (!personSelect.value || missionSelect.value === '') {
      flash(gameError, '사람과 미션을 모두 선택해주세요.');
      return;
    }
    try {
      const result = await api('POST', '/api/mission/accuse', {
        participantId: me.participantId,
        targetName: personSelect.value,
        missionIndex: Number(missionSelect.value),
      });
      flash(okMsg, result.correct ? '🎯 간파 성공! +50' : '🙈 아니었어요… -20');
    } catch (err) {
      flash(gameError, ERROR_MESSAGES[err.message] || '실패했어요.');
    }
  });
  row.append(personSelect, missionSelect, accuseBtn);
  accuseBox.appendChild(row);
  stage.appendChild(accuseBox);

  const details = document.createElement('details');
  details.appendChild(el('summary', null, `📜 돌아다니는 미션 풀 (${snapshot.missions.length}개)`));
  const pool = el('ul', 'pool');
  for (const m of snapshot.missions) pool.appendChild(el('li', null, m));
  details.appendChild(pool);
  stage.appendChild(details);
}

async function refreshMe() {
  if (!me) return;
  try {
    me = await api('GET', `/api/mission/me/${me.participantId}`);
  } catch {
    localStorage.removeItem('mission:participantId');
    me = null;
    gameView.classList.add('hidden');
    joinView.classList.remove('hidden');
  }
}

function connect() {
  const source = new EventSource('/api/mission/events');
  source.onmessage = async (e) => {
    snapshot = JSON.parse(e.data);
    await refreshMe();
    render();
  };
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  joinError.textContent = '';
  try {
    me = await api('POST', '/api/mission/join', { name: document.getElementById('name-input').value });
    localStorage.setItem('mission:participantId', me.participantId);
    render();
  } catch (err) {
    joinError.textContent = ERROR_MESSAGES[err.message] || '문제가 발생했어요.';
  }
});

(async function init() {
  snapshot = await fetch('/api/mission/state').then((r) => r.json());
  const saved = localStorage.getItem('mission:participantId');
  if (saved) {
    try {
      me = await api('GET', `/api/mission/me/${saved}`);
      render();
    } catch {
      localStorage.removeItem('mission:participantId');
    }
  }
  connect();
})();
