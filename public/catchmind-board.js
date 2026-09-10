'use strict';
const stage = document.getElementById('stage');
const ranking = document.getElementById('ranking');
const rankingTitle = document.getElementById('ranking-title');
const progress = document.getElementById('progress');

let strokes = [];
let builtKey = '';
let showCanvas = null;
let replayCancel = null;

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function stopReplay() { if (replayCancel) { replayCancel(); replayCancel = null; } }
function startReplay(c) { stopReplay(); replayCancel = replayStrokes(c, strokes, { onDone: () => { replayCancel = null; renderStrokes(c, strokes); } }); }

async function fetchStrokes() {
  try { strokes = (await (await fetch('/api/catchmind/strokes')).json()).strokes || []; } catch { strokes = []; }
}

function paintShow() { if (showCanvas) renderStrokes(showCanvas, strokes); }
window.addEventListener('resize', paintShow);

async function render(snap) {
  progress.textContent = `제출 ${snap.total}명`;
  const key = `${snap.status}:${snap.currentIndex}:${snap.current ? snap.current.revealed + ':' + snap.current.hints.length : ''}`;
  if (key !== builtKey) {
    builtKey = key;
    stopReplay(); showCanvas = null;
    stage.replaceChildren();

    if (snap.status === 'collecting') {
      stage.appendChild(el('p', 'muted waiting', `🎨 그림 제출 받는 중... (${snap.total}명 제출)`));
      if (snap.submitters.length) {
        const chips = el('div', 'feed');
        snap.submitters.forEach((n) => chips.appendChild(el('li', null, n)));
        stage.appendChild(chips);
      }
    } else if (snap.status === 'finished') {
      stage.appendChild(el('p', 'waiting', '🏁 모두 공개 완료! 최종 순위입니다.'));
    } else if (snap.current) {
      await fetchStrokes();
      stage.appendChild(el('p', 'muted', `${snap.currentIndex + 1} / ${snap.total}번째 그림`));
      showCanvas = document.createElement('canvas');
      stage.appendChild(showCanvas);
      paintShow();
      requestAnimationFrame(paintShow);
      const controls = el('div'); controls.style.cssText = 'margin-top:10px;display:flex;gap:8px;';
      const rb = el('button', 'btn secondary small', '▶ 그리는 과정 다시 보기');
      rb.addEventListener('click', () => startReplay(showCanvas));
      controls.appendChild(rb);
      stage.appendChild(controls);
      if (snap.current.hints && snap.current.hints.length) {
        const hb = el('p', 'muted');
        hb.style.cssText = 'font-weight:800;margin-top:8px';
        hb.textContent = '💡 힌트  ' + snap.current.hints.map((h, i) => `${i + 1}) ${h}`).join('    ');
        stage.appendChild(hb);
      }
      if (!snap.current.revealed) {
        stage.appendChild(el('p', 'owner-reveal', '🙌 손들어 맞혀보세요!'));
      } else {
        stage.appendChild(el('p', 'owner-reveal', snap.current.winnerName
          ? `🎉 ${snap.current.winnerName} 정답! "${snap.current.word}" (그린 사람: ${snap.current.drawerName})`
          : `아무도 못 맞혔어요… 정답은 "${snap.current.word}" (그린 사람: ${snap.current.drawerName})`));
      }
    }
  }

  const showRank = snap.scores.length > 0;
  rankingTitle.classList.toggle('hidden', !showRank);
  ranking.replaceChildren(...snap.scores.map((p, i) => {
    const li = el('li', 'rank-row' + (i < 3 ? ' top' : ''));
    li.append(el('span', 'rank-no', `${i + 1}`), el('span', null, p.name), el('span', 'rank-score', `${p.score}점`));
    return li;
  }));
}

function connect() {
  const s = new EventSource('/api/catchmind/events');
  s.onmessage = (e) => render(JSON.parse(e.data));
  s.onerror = () => { s.close(); setTimeout(connect, 2000); };
}
fetch('/api/catchmind/state').then((r) => r.json()).then(render);
connect();
