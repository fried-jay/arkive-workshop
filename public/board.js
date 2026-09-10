'use strict';

const list = document.getElementById('list');
const empty = document.getElementById('empty');
const summary = document.getElementById('summary');

let clockOffset = 0, cdTimer = null, lastSnap = null;
function startCd() {
  clearInterval(cdTimer);
  const cd = document.getElementById('board-cd');
  if (!cd) return;
  function tick() {
    if (!lastSnap || !lastSnap.started) { cd.textContent = ''; cd.classList.remove('over'); return; }
    const c = lastSnap.currentCall;
    if (!c) { cd.textContent = '📢 진행자가 다음 항목을 부르는 중…'; cd.classList.remove('over'); return; }
    const left = Math.ceil((c.deadline - (Date.now() + clockOffset)) / 1000);
    if (left <= 0) { cd.textContent = ''; cd.classList.remove('over'); return; }
    cd.classList.toggle('over', left <= 5);
    cd.textContent = `📢 ${c.text}   ·   ⏱ ${left}초`;
  }
  tick();
  cdTimer = setInterval(tick, 300);
}

function render(snapshot) {
  lastSnap = snapshot;
  if (snapshot.now) clockOffset = snapshot.now - Date.now();
  startCd();
  const started = snapshot.started;
  const total = snapshot.participants.length;
  const players = [...snapshot.participants].sort((a, b) => {
    if (!started) return Number(b.ready) - Number(a.ready) || a.name.localeCompare(b.name, 'ko');
    return b.bingoLines - a.bingoLines || b.markedCount - a.markedCount || a.name.localeCompare(b.name, 'ko');
  });

  if (!snapshot.itemsSet) {
    summary.textContent = '진행자가 빙고 항목을 등록하면 시작할 수 있어요.';
  } else if (!started) {
    summary.textContent = `시작 대기 · 레디 ${snapshot.readyCount} / ${total}명` +
      (total > 0 && snapshot.readyCount === total ? ' · 전원 준비 완료! 🎉' : '');
  } else {
    summary.textContent = `▶ 진행 중 · 참가자 ${total}명 · 실시간 업데이트`;
  }
  empty.classList.toggle('hidden', total > 0);

  list.replaceChildren(...players.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'row' + (started && p.bingoLines > 0 ? ' has-bingo' : '');

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = started ? `${i + 1}` : (p.ready ? '✅' : '⏳');

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;

    const barWrap = document.createElement('span');
    barWrap.className = 'bar-wrap';
    if (started) {
      const bar = document.createElement('span');
      bar.className = 'bar';
      const fill = document.createElement('div');
      fill.style.width = `${(p.markedCount / 25) * 100}%`;
      bar.appendChild(fill);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${p.markedCount}/25`;
      barWrap.append(bar, count);
    } else {
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = p.ready ? '레디 완료' : '대기 중';
      barWrap.append(count);
    }

    const lines = document.createElement('span');
    lines.className = 'lines';
    lines.textContent = started && p.bingoLines > 0 ? `🎉 빙고 ${p.bingoLines}줄` : '';

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
