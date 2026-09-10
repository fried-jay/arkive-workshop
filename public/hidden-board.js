'use strict';
const stage = document.getElementById('stage');
const ranking = document.getElementById('ranking');
const rankingTitle = document.getElementById('ranking-title');
const progress = document.getElementById('progress');
let builtKey = '';

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

function render(snap) {
  progress.textContent = `참가자 ${snap.participants.length}명 · ${snap.totalRounds}라운드`;
  const key = `${snap.status}:${snap.currentIndex}`;
  if (key !== builtKey) {
    stage.replaceChildren();
    if (snap.status === 'playing' && snap.round) {
      const banner = el('div', 'target-banner');
      banner.append(el('span', null, `라운드 ${snap.currentIndex + 1} / ${snap.totalRounds} · 이 그림을 찾아라!`), el('span', 'big', snap.round.target));
      stage.appendChild(banner);
      const g = el('div', 'hgrid');
      g.replaceChildren(...snap.round.cells.map((e) => el('div', 'hcell', e)));
      stage.appendChild(g);
    } else if (snap.status === 'finished') {
      stage.appendChild(el('p', 'waiting', '🏁 모든 라운드 종료! 최종 순위를 확인하세요.'));
    } else {
      stage.appendChild(el('p', 'muted waiting', '진행자가 시작하길 기다리는 중... 폰으로 입장해 주세요!'));
    }
    builtKey = key;
  }

  const showRank = snap.participants.some((p) => p.score > 0) || snap.status !== 'idle';
  rankingTitle.classList.toggle('hidden', !showRank || snap.participants.length === 0);
  const sorted = [...snap.participants].sort((a, b) => b.score - a.score || b.foundInRound - a.foundInRound || a.name.localeCompare(b.name, 'ko'));
  ranking.replaceChildren(...sorted.map((p, i) => {
    const li = el('li', 'rank-row' + (i < 3 && p.score > 0 ? ' top' : ''));
    li.append(el('span', 'rank-no', `${i + 1}`), el('span', null, p.name));
    li.append(el('span', 'rank-found', snap.status === 'playing' ? `이번 ${p.foundInRound}개` : ''));
    li.append(el('span', 'rank-score', `${p.score}점`));
    return li;
  }));
}

function connect() {
  const s = new EventSource('/api/hidden/events');
  s.onmessage = (e) => render(JSON.parse(e.data));
  s.onerror = () => { s.close(); setTimeout(connect, 2000); };
}
fetch('/api/hidden/state').then((r) => r.json()).then(render);
connect();
