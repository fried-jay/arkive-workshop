'use strict';

const stage = document.getElementById('stage');
const ranking = document.getElementById('ranking');
const rankingTitle = document.getElementById('ranking-title');
const progress = document.getElementById('progress');

let strokes = [];
let builtKey = '';       // 현재 stage 스켈레톤이 어떤 (status:round)로 지어졌는지
let showCanvas = null;   // guessing/revealed 그림 캔버스
let feedEl = null;
let replayCancel = null;
let autoReplayedRound = -1;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function stopReplay() {
  if (replayCancel) { replayCancel(); replayCancel = null; }
}

function startReplay(canvas) {
  stopReplay();
  replayCancel = replayStrokes(canvas, strokes, {
    onDone: () => { replayCancel = null; renderStrokes(canvas, strokes); },
  });
}

async function ensureStrokes(round) {
  strokes = (await (await fetch('/api/catchmind/strokes')).json()).strokes || [];
  return round;
}

function renderFeed(snap) {
  if (!feedEl) return;
  feedEl.replaceChildren(...snap.guesses.slice().reverse().map((g) => el('li', null, `${g.name}: ${g.text}`)));
}

async function render(snap) {
  progress.textContent = `참가자 ${snap.participants.length}명 · ${snap.roundCount}라운드`;
  const key = `${snap.status}:${snap.roundCount}`;
  const rebuilt = key !== builtKey;

  if (snap.status === 'idle') {
    if (rebuilt) {
      stopReplay(); showCanvas = feedEl = null;
      stage.replaceChildren(el('p', 'muted waiting', '진행자가 그릴 사람을 정하는 중... 폰으로 입장해서 기다려주세요!'));
    }
  } else if (snap.status === 'waiting') {
    if (rebuilt) {
      stopReplay(); showCanvas = feedEl = null;
      stage.replaceChildren(el('p', 'muted waiting', `🎨 ${snap.drawerName}님이 그리는 중... 두구두구`));
    }
  } else {
    // guessing / revealed — 완성된 그림 + 영상(리플레이)
    if (rebuilt) {
      stopReplay();
      await ensureStrokes(snap.roundCount);
      stage.replaceChildren();
      stage.appendChild(el('p', 'muted', `${snap.drawerName}님의 그림 — 폰으로 정답을 입력하세요!`));
      showCanvas = document.createElement('canvas');
      stage.appendChild(showCanvas);
      renderStrokes(showCanvas, strokes);

      const controls = el('div');
      controls.style.cssText = 'margin-top:10px;display:flex;gap:8px;';
      const replayBtn = el('button', 'btn secondary small', '▶ 그리는 과정 다시 보기');
      replayBtn.addEventListener('click', () => startReplay(showCanvas));
      controls.appendChild(replayBtn);
      stage.appendChild(controls);

      const revealEl = el('p', 'owner-reveal');
      revealEl.id = 'reveal-line';
      revealEl.classList.add('hidden');
      stage.appendChild(revealEl);

      feedEl = el('ul', 'feed');
      stage.appendChild(feedEl);
    }

    renderFeed(snap);
    if (snap.status === 'revealed') {
      const revealEl = document.getElementById('reveal-line');
      if (revealEl) {
        revealEl.classList.remove('hidden');
        revealEl.textContent = snap.winnerName
          ? `🎉 ${snap.winnerName}님 정답! "${snap.word}"`
          : `아무도 못 맞혔어요… 정답은 "${snap.word}"`;
      }
      // 정답 공개 시 그리는 과정을 한 번 자동 재생
      if (autoReplayedRound !== snap.roundCount && showCanvas) {
        autoReplayedRound = snap.roundCount;
        startReplay(showCanvas);
      }
    }
  }
  builtKey = key;

  // 순위 (stage 밖)
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
