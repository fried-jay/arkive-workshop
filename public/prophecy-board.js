'use strict';

const stage = document.getElementById('stage');
const progress = document.getElementById('progress');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(snap) {
  stage.replaceChildren();

  if (snap.status === 'collecting') {
    progress.textContent = `예언 제출 ${snap.participantCount}명`;
    stage.appendChild(el('p', 'muted waiting', '오늘 일어날 일을 몰래 예언하세요! 폰으로 제출하면 봉인됩니다.'));
    const names = el('div', 'names');
    for (const n of snap.names) names.appendChild(el('span', 'name-chip', n));
    stage.appendChild(names);
    return;
  }

  if (snap.status === 'sealed') {
    progress.textContent = `예언 ${snap.participantCount}개 봉인됨`;
    stage.appendChild(el('p', 'waiting', `🔒 ${snap.participantCount}개의 예언이 잠들어 있습니다... 마무리 때 공개!`));
    return;
  }

  // revealed
  progress.textContent = `대공개 · 적중 ${snap.prophecies.filter((p) => p.hit === true).length} / ${snap.prophecies.length}`;
  const list = el('ul', 'list');
  for (const p of snap.prophecies) {
    const li = el('li', p.hit === true ? 'hit' : p.hit === false ? 'miss' : '');
    li.appendChild(el('span', 'verdict', p.hit === true ? '⭕' : p.hit === false ? '❌' : '❓'));
    li.appendChild(el('span', null, `"${p.text}"`));
    li.appendChild(el('span', 'who', `${p.name}의 예언${p.hit === true ? ' · +100' : ''}`));
    list.appendChild(li);
  }
  stage.appendChild(list);
}

function connect() {
  const source = new EventSource('/api/prophecy/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/prophecy/state').then((r) => r.json()).then(render);
connect();
