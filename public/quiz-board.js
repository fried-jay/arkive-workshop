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
  progress.textContent = `참가자 ${snap.participants.length}명`;

  if (snap.status === 'idle') {
    stage.appendChild(el('p', 'muted waiting',
      snap.totalQuestions > 0 ? '퀴즈가 곧 시작됩니다!' : '진행자가 문제를 준비하고 있어요.'));
  } else if (snap.status === 'finished') {
    stage.appendChild(el('p', 'waiting', '🎊 퀴즈 종료! 최종 순위입니다.'));
  } else {
    progress.textContent = `문제 ${snap.currentIndex + 1} / ${snap.totalQuestions} · 참가자 ${snap.participants.length}명`;
    answered.textContent = `응답 ${snap.answeredCount} / ${snap.participants.length}`;
    stage.appendChild(el('p', 'question-text', snap.question.text));
    const choices = el('div', 'choices');
    snap.question.choices.forEach((text, i) => {
      const div = el('div', 'choice');
      div.appendChild(el('span', null, `${i + 1}. ${text}`));
      if (snap.status === 'revealed') {
        if (i === snap.question.answerIndex) div.classList.add('correct');
        div.appendChild(el('span', 'cnt', `${snap.question.counts[i]}명`));
      }
      choices.appendChild(div);
    });
    stage.appendChild(choices);
  }

  // 순위는 revealed/finished에서만 (문제 푸는 중엔 집중)
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
  const source = new EventSource('/api/quiz/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/quiz/state').then((r) => r.json()).then(render);
connect();
