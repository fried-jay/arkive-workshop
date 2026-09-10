'use strict';
const stage = document.getElementById('stage');
const ranking = document.getElementById('ranking');
const rankingTitle = document.getElementById('ranking-title');
const progress = document.getElementById('progress');
const clearBanner = document.getElementById('clear-banner');
let builtKey = '';
let clockOffset = 0;
let endTimer = null;

const RANK_LABEL = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}등`);

// 1등이 나온 뒤: 1등 이름 + 남은 시간 + 뒤따라 클리어한 사람들
function renderClearBanner(snap) {
  clearInterval(endTimer);
  const endsAt = snap.status === 'playing' ? snap.roundEndsAt : null;
  if (!endsAt) { clearBanner.classList.add('hidden'); return; }
  clearBanner.classList.remove('hidden');
  const clears = snap.round.clears || [];
  const tick = () => {
    const left = Math.max(0, Math.ceil((endsAt - (Date.now() + clockOffset)) / 1000));
    clearBanner.replaceChildren(el('span', null, `🏆 1등 ${clears[0]}! ⏳ ${left}초 뒤 다음 라운드`));
    if (clears.length > 1) {
      clearBanner.appendChild(el('span', 'others', clears.slice(1).map((n, i) => `${RANK_LABEL(i + 2)} ${n}`).join(' · ')));
    }
    if (left <= 0) clearInterval(endTimer);
  };
  tick();
  endTimer = setInterval(tick, 250);
}

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

function render(snap) {
  if (snap.now) clockOffset = snap.now - Date.now();
  progress.textContent = `참가자 ${snap.participants.length}명 · ${snap.totalRounds}라운드`;
  const key = `${snap.status}:${snap.currentIndex}`;
  if (key !== builtKey) {
    stage.replaceChildren();
    if (snap.status === 'playing' && snap.round) {
      const banner = el('div', 'target-banner');
      banner.append(el('span', null, `라운드 ${snap.currentIndex + 1} / ${snap.totalRounds} · 이 그림을 찾아라!`), el('span', 'big', snap.round.target));
      stage.appendChild(banner);
      const g = el('div', 'hgrid');
      g.style.gridTemplateColumns = `repeat(${snap.round.dim}, 1fr)`;
      g.replaceChildren(...snap.round.cells.map((e) => el('div', 'hcell', e)));
      stage.appendChild(g);
    } else if (snap.status === 'finished') {
      stage.appendChild(el('p', 'waiting', '🏁 모든 라운드 종료! 최종 순위를 확인하세요.'));
    } else {
      stage.appendChild(el('p', 'muted waiting', '진행자가 시작하길 기다리는 중... 폰으로 입장해 주세요!'));
    }
    builtKey = key;
  }
  renderClearBanner(snap);

  const showRank = snap.participants.some((p) => p.score > 0) || snap.status !== 'idle';
  rankingTitle.classList.toggle('hidden', !showRank || snap.participants.length === 0);
  const sorted = [...snap.participants].sort((a, b) => b.score - a.score || (a.clearRank || 99) - (b.clearRank || 99) || b.foundInRound - a.foundInRound || a.name.localeCompare(b.name, 'ko'));
  ranking.replaceChildren(...sorted.map((p, i) => {
    const li = el('li', 'rank-row' + (i < 3 && p.score > 0 ? ' top' : ''));
    li.append(el('span', 'rank-no', `${i + 1}`), el('span', null, p.name));
    if (snap.status === 'playing' && p.clearRank) li.append(el('span', 'rank-clear', `${RANK_LABEL(p.clearRank)} 클리어`));
    else li.append(el('span', 'rank-found', snap.status === 'playing' ? `이번 ${p.foundInRound}개` : ''));
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
