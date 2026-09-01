'use strict';

const stage = document.getElementById('stage');
const ranking = document.getElementById('ranking');
const rankingTitle = document.getElementById('ranking-title');
const progress = document.getElementById('progress');

let loadedRound = -1;
let strokes = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

async function ensureStrokes(snap) {
  if (loadedRound === snap.roundCount) return;
  strokes = (await (await fetch('/api/catchmind/strokes')).json()).strokes;
  loadedRound = snap.roundCount;
}

async function render(snap) {
  progress.textContent = `참가자 ${snap.participants.length}명 · ${snap.roundCount}라운드`;
  stage.replaceChildren();

  if (snap.status === 'idle') {
    stage.appendChild(el('p', 'muted waiting', '진행자가 그릴 사람을 정하는 중... 폰으로 입장해서 기다려주세요!'));
  } else if (snap.status === 'waiting') {
    stage.appendChild(el('p', 'muted waiting', `🎨 ${snap.drawerName}님이 그리는 중... 두구두구`));
  } else {
    await ensureStrokes(snap);
    stage.appendChild(el('p', 'muted', `${snap.drawerName}님의 그림 — 폰으로 정답을 입력하세요!`));
    const canvas = document.createElement('canvas');
    stage.appendChild(canvas);
    renderStrokes(canvas, strokes);
    if (snap.status === 'revealed') {
      stage.appendChild(el('p', 'owner-reveal', snap.winnerName
        ? `🎉 ${snap.winnerName}님 정답! "${snap.word}"`
        : `아무도 못 맞혔어요… 정답은 "${snap.word}"`));
    }
    if (snap.guesses.length) {
      const feed = el('ul', 'feed');
      for (const g of snap.guesses.slice().reverse()) {
        feed.appendChild(el('li', null, `${g.name}: ${g.text}`));
      }
      stage.appendChild(feed);
    }
  }

  const showRanking = snap.participants.length > 0 && snap.participants.some((p) => p.score > 0);
  rankingTitle.classList.toggle('hidden', !showRanking);
  if (showRanking) {
    const sorted = [...snap.participants].sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'),
    );
    ranking.replaceChildren(...sorted.map((p, i) => {
      const li = el('li', 'rank-row' + (i < 3 && p.score > 0 ? ' top' : ''));
      li.appendChild(el('span', 'rank-no', `${i + 1}`));
      li.appendChild(el('span', null, p.name + (p.isDrawer ? ' 🎨' : '')));
      li.appendChild(el('span', 'rank-score', `${p.score}점`));
      return li;
    }));
  } else {
    ranking.replaceChildren();
  }
}

function connect() {
  const source = new EventSource('/api/catchmind/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/catchmind/state').then((r) => r.json()).then(render);
connect();
