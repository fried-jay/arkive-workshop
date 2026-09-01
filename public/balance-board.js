'use strict';

const stage = document.getElementById('stage');
const ranking = document.getElementById('ranking');
const rankingTitle = document.getElementById('ranking-title');
const progress = document.getElementById('progress');
const voted = document.getElementById('voted');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(snap) {
  stage.replaceChildren();
  voted.textContent = '';
  progress.textContent = `참가자 ${snap.participants.length}명`;

  if (snap.status === 'idle') {
    stage.appendChild(el('p', 'muted waiting',
      snap.totalRounds > 0 ? '밸런스 게임이 곧 시작됩니다!' : '진행자가 라운드를 준비하고 있어요.'));
  } else if (snap.status === 'finished') {
    stage.appendChild(el('p', 'waiting', '🎊 게임 종료! 최종 순위입니다.'));
  } else {
    progress.textContent = `라운드 ${snap.currentIndex + 1} / ${snap.totalRounds} · 참가자 ${snap.participants.length}명`;
    voted.textContent = `투표 ${snap.votedCount} / ${snap.participants.length}`;
    const grid = el('div', 'vs-grid');
    const r = snap.round;
    const total = r.counts ? r.counts[0] + r.counts[1] : 0;
    [r.a, r.b].forEach((text, i) => {
      const side = el('div', 'side');
      side.appendChild(el('span', null, text));
      if (snap.status === 'revealed') {
        if (r.majority === i) side.classList.add('majority');
        const pct = total ? Math.round((r.counts[i] / total) * 100) : 0;
        side.appendChild(el('span', 'pct', `${r.counts[i]}명 · ${pct}%`));
        const bar = el('div', 'bar');
        const fill = el('div');
        fill.style.width = `${pct}%`;
        bar.appendChild(fill);
        side.appendChild(bar);
      } else {
        side.appendChild(el('span', 'pct', '투표 중... 🤫'));
      }
      grid.appendChild(side);
      if (i === 0) grid.appendChild(el('div', 'vs', 'VS'));
    });
    stage.appendChild(grid);
  }

  const showRanking = snap.status === 'revealed' || snap.status === 'finished';
  rankingTitle.classList.toggle('hidden', !showRanking || snap.participants.length === 0);
  if (showRanking) {
    const sorted = [...snap.participants].sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'),
    );
    ranking.replaceChildren(...sorted.map((p, i) => {
      const li = el('li', 'rank-row' + (i < 3 && p.score > 0 ? ' top' : ''));
      li.appendChild(el('span', 'rank-no', `${i + 1}`));
      li.appendChild(el('span', null, p.name));
      li.appendChild(el('span', 'rank-score', `${p.score}점`));
      return li;
    }));
  } else {
    ranking.replaceChildren();
  }
}

function connect() {
  const source = new EventSource('/api/balance/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/balance/state').then((r) => r.json()).then(render);
connect();
