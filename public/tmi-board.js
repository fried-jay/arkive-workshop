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
    progress.textContent = `제출 ${snap.participantCount}명`;
    stage.appendChild(el('p', 'muted waiting', 'TMI 수집 중! 폰으로 접속해서 나만 아는 TMI 3개를 제출해주세요.'));
    const names = el('div', 'names');
    for (const name of snap.members) names.appendChild(el('span', 'name-chip', name));
    stage.appendChild(names);
    return;
  }
  if (snap.status === 'finished') {
    progress.textContent = '';
    stage.appendChild(el('p', 'waiting', '🎊 모든 TMI의 주인이 공개됐습니다. 끝!'));
    return;
  }

  progress.textContent = `${snap.roundIndex + 1}번째 사람 / ${snap.totalRounds}명`;
  const hints = el('div', 'hints');
  snap.round.tmis.forEach((t, i) => {
    const h = el('div', 'hint');
    h.appendChild(el('span', 'no', `힌트 ${i + 1} / ${snap.round.totalTmis}`));
    h.appendChild(el('span', null, `"${t}"`));
    hints.appendChild(h);
  });
  stage.appendChild(hints);

  if (snap.round.ownerName) {
    stage.appendChild(el('p', 'owner-reveal', `주인공은... ${snap.round.ownerName}! 🎉`));
  } else {
    stage.appendChild(el('p', 'prompt', '누구일까요? 🤔'));
    const names = el('div', 'names');
    for (const name of snap.members) names.appendChild(el('span', 'name-chip', name));
    stage.appendChild(names);
  }
}

function connect() {
  const source = new EventSource('/api/tmi/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/tmi/state').then((r) => r.json()).then(render);
connect();
