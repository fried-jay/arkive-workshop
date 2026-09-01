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

  if (snap.status === 'idle') {
    progress.textContent = `모집 중 · ${snap.participantCount}명`;
    stage.appendChild(el('p', 'muted waiting', '폰으로 입장해주세요! 시작되면 마니또가 비밀 배정됩니다.'));
    const names = el('div', 'names');
    for (const p of snap.participants) names.appendChild(el('span', 'name-chip', p.name));
    stage.appendChild(names);
    if (snap.note) stage.appendChild(el('p', 'note-box', `📋 마니또 미션: ${snap.note}`));
    return;
  }

  if (snap.status === 'running') {
    progress.textContent = `진행 중 · ${snap.participantCount}명 · 마니또 추측 제출 ${snap.guessedCount}/${snap.participantCount}`;
    stage.appendChild(el('p', 'muted waiting', '🤫 각자 자기 마니또 대상을 몰래 챙겨주세요. 공개 전에 "나를 챙긴 사람" 추측도 잊지 말기!'));
    if (snap.note) stage.appendChild(el('p', 'note-box', `📋 마니또 미션: ${snap.note}`));
    const names = el('div', 'names');
    for (const p of snap.participants) names.appendChild(el('span', 'name-chip', `${p.name}${p.guessed ? ' ✓' : ''}`));
    stage.appendChild(names);
    return;
  }

  // revealed
  progress.textContent = `공개! · ${snap.participantCount}명`;
  stage.appendChild(el('p', 'waiting', '💝 마니또 대공개!'));
  const list = el('ul', 'pairs');
  for (const pair of snap.pairs) {
    const li = document.createElement('li');
    li.appendChild(el('span', null, pair.from));
    li.appendChild(el('span', 'arrow', '→ 챙겨줌 →'));
    li.appendChild(el('span', null, pair.to));
    li.appendChild(el('span', 'right', pair.guessedRight ? `🎯 ${pair.to}이(가) 맞힘!` : ''));
    list.appendChild(li);
  }
  stage.appendChild(list);
}

function connect() {
  const source = new EventSource('/api/manito/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/manito/state').then((r) => r.json()).then(render);
connect();
