'use strict';

const stage = document.getElementById('stage');
const ranking = document.getElementById('ranking');
const rankingTitle = document.getElementById('ranking-title');
const progress = document.getElementById('progress');
const answered = document.getElementById('answered');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function render(snap) {
  stage.replaceChildren();
  answered.textContent = '';
  progress.textContent = `참가 ${snap.participantCount}명 · TMI 제출 ${snap.submittedCount}명`;

  if (snap.status === 'collecting') {
    stage.appendChild(el('p', 'muted waiting', 'TMI 수집 중! 폰으로 접속해서 나만 아는 TMI를 제출해주세요. (제출 없이 참가만도 가능)'));
    const names = el('div', 'names');
    for (const m of snap.members) names.appendChild(el('span', 'name-chip', m.submitted ? `✓ ${m.name}` : m.name));
    stage.appendChild(names);
  } else if (snap.status === 'finished') {
    stage.appendChild(el('p', 'waiting', '🎊 게임 종료! 최종 순위입니다.'));
  } else {
    progress.textContent = `TMI ${snap.currentIndex + 1} / ${snap.totalRounds} · 참가자 ${snap.participantCount}명`;
    answered.textContent = `응답 ${snap.answeredCount} / ${snap.participantCount - 1}`;
    stage.appendChild(el('p', 'tmi-text', `"${snap.round.tmi}"`));
    const choices = el('div', 'choices');
    snap.round.choices.forEach((name, i) => {
      const div = el('div', 'choice');
      div.appendChild(el('span', null, `${i + 1}. ${name}`));
      if (snap.status === 'revealed') {
        if (i === snap.round.answerIndex) div.classList.add('correct');
        div.appendChild(el('span', 'cnt', `${snap.round.counts[i]}명`));
      }
      choices.appendChild(div);
    });
    stage.appendChild(choices);
    if (snap.status === 'revealed') {
      stage.appendChild(el('p', 'owner-reveal', `주인공은... ${snap.round.ownerName}! 🎉`));
    }
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
  const source = new EventSource('/api/tmi/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/tmi/state').then((r) => r.json()).then(render);
connect();
