'use strict';

const stage = document.getElementById('stage');
const progress = document.getElementById('progress');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function peopleList(snap) {
  const list = el('ul', 'people');
  const sorted = [...snap.participants].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
  for (const p of sorted) {
    const li = el('li', p.done ? 'done' : p.foiled ? 'foiled' : '');
    li.appendChild(el('span', null, p.name));
    li.appendChild(el('span', null, p.done ? '✅ 성공' : p.foiled ? '❌ 간파당함' : '🕵️ 수행 중'));
    li.appendChild(el('span', 'pt', `${p.score}점`));
    list.appendChild(li);
  }
  return list;
}

function render(snap) {
  progress.textContent = `참가자 ${snap.participants.length}명 · 미션 풀 ${snap.missions.length}개`;
  stage.replaceChildren();

  if (snap.status === 'idle') {
    stage.appendChild(el('p', 'muted waiting', snap.missions.length
      ? '곧 비밀미션이 배정됩니다. 폰으로 입장해두세요!'
      : '진행자가 미션을 준비하고 있어요.'));
    if (snap.participants.length) stage.appendChild(peopleList(snap));
    return;
  }

  if (snap.status === 'revealed') {
    stage.appendChild(el('p', 'waiting', '🎊 미션 전체 공개!'));
    const table = document.createElement('table');
    const head = document.createElement('tr');
    for (const h of ['이름', '비밀미션', '결과']) head.appendChild(el('th', null, h));
    table.appendChild(head);
    for (const a of snap.assignments) {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', null, a.name));
      tr.appendChild(el('td', null, a.mission ?? '-'));
      tr.appendChild(el('td', null, a.done ? '✅ 성공 (진짜 했는지 검증 타임!)' : a.foiled ? `❌ ${a.foiledBy}에게 간파당함` : '⏰ 미완수'));
      table.appendChild(tr);
    }
    stage.appendChild(table);
    stage.appendChild(el('h2', null, '🏆 점수'));
    stage.appendChild(peopleList(snap));
    return;
  }

  // running
  const cols = el('div', 'cols');
  const left = el('div');
  left.appendChild(el('h2', null, '📜 돌아다니는 미션들 (누가 갖고 있을까?)'));
  const pool = el('ul', 'pool');
  for (const m of snap.missions) pool.appendChild(el('li', null, m));
  left.appendChild(pool);
  const right = el('div');
  right.appendChild(el('h2', null, '🕵️ 요원 현황'));
  right.appendChild(peopleList(snap));
  cols.append(left, right);
  stage.appendChild(cols);
}

function connect() {
  const source = new EventSource('/api/mission/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/mission/state').then((r) => r.json()).then(render);
connect();
