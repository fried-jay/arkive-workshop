'use strict';

const list = document.getElementById('list');
const empty = document.getElementById('empty');
const summary = document.getElementById('summary');

function render(snapshot) {
  const players = [...snapshot.participants].sort(
    (a, b) => b.bingoLines - a.bingoLines || b.markedCount - a.markedCount || a.name.localeCompare(b.name, 'ko'),
  );
  summary.textContent = `참가자 ${players.length}명 · 실시간 업데이트`;
  empty.classList.toggle('hidden', players.length > 0);
  list.replaceChildren(...players.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'row' + (p.bingoLines > 0 ? ' has-bingo' : '');

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}`;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;

    const barWrap = document.createElement('span');
    barWrap.className = 'bar-wrap';
    const bar = document.createElement('span');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.style.width = `${(p.markedCount / 25) * 100}%`;
    bar.appendChild(fill);
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${p.markedCount}/25`;
    barWrap.append(bar, count);

    const lines = document.createElement('span');
    lines.className = 'lines';
    lines.textContent = p.bingoLines > 0 ? `🎉 빙고 ${p.bingoLines}줄` : '';

    li.append(rank, name, barWrap, lines);
    return li;
  }));
}

function connect() {
  const source = new EventSource('/api/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/state').then((r) => r.json()).then(render);
connect();
