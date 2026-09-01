const test = require('node:test');
const assert = require('node:assert');
const {
  createTmi, submitTmi, startTmi, answerTmi, revealTmi, nextTmi,
  resetTmi, clearTmi, tmiSnapshot, tmiParticipantView,
} = require('../lib/tmi');

const NAMES = ['가', '나', '다', '라', '마'];

function collectedTmi(n = 5) {
  const game = createTmi();
  const people = NAMES.slice(0, n).map((name) => submitTmi(game, name, `${name}의 비밀`));
  return { game, people };
}

function currentRound(game) {
  return game.rounds[game.currentIndex];
}

function ownerOf(game) {
  return game.entries.find((e) => e.id === currentRound(game).ownerId);
}

function nonOwner(game, people) {
  return people.find((p) => p.id !== currentRound(game).ownerId);
}

test('submitTmi: 이름/내용 필수, 같은 이름 재제출은 수정', () => {
  const game = createTmi();
  assert.throws(() => submitTmi(game, ' ', 'x'), /NAME_REQUIRED/);
  assert.throws(() => submitTmi(game, '원', '  '), /TMI_REQUIRED/);
  const a = submitTmi(game, '원', '첫 비밀');
  const b = submitTmi(game, ' 원 ', '수정된 비밀');
  assert.equal(a.id, b.id);
  assert.equal(game.entries.length, 1);
  assert.equal(game.entries[0].tmi, '수정된 비밀');
});

test('startTmi: 4건 미만 거부, 시작하면 라운드 생성(주인 포함 4명 보기)', () => {
  const { game } = collectedTmi(3);
  assert.throws(() => startTmi(game), /NOT_ENOUGH_ENTRIES/);
  const { game: g2 } = collectedTmi(5);
  startTmi(g2);
  assert.equal(g2.status, 'question');
  assert.equal(g2.currentIndex, 0);
  assert.equal(g2.rounds.length, 5);
  // 라운드 = 엔트리 순열
  const owners = g2.rounds.map((r) => r.ownerId).sort();
  assert.deepEqual(owners, g2.entries.map((e) => e.id).sort());
  for (const r of g2.rounds) {
    assert.equal(r.choiceIds.length, 4);
    assert.ok(r.choiceIds.includes(r.ownerId), '보기에 주인 포함');
    assert.equal(new Set(r.choiceIds).size, 4, '보기 중복 없음');
  }
  // 진행 중 재시작/제출 불가
  assert.throws(() => startTmi(g2), /WRONG_STATE/);
  assert.throws(() => submitTmi(g2, '새사람', 'x'), /WRONG_STATE/);
});

test('answerTmi: 본인 문제 답변 불가, 문제당 1회, 보기 범위 검증', () => {
  const { game, people } = collectedTmi(5);
  const anyone = people[0];
  assert.throws(() => answerTmi(game, anyone.id, 0), /WRONG_STATE/); // collecting
  startTmi(game);
  const owner = ownerOf(game);
  const guesser = nonOwner(game, people);
  assert.throws(() => answerTmi(game, owner.id, 0), /OWN_QUESTION/);
  assert.throws(() => answerTmi(game, 'nope', 0), /PARTICIPANT_NOT_FOUND/);
  assert.throws(() => answerTmi(game, guesser.id, 4), /CHOICE_INVALID/);
  answerTmi(game, guesser.id, 0);
  assert.throws(() => answerTmi(game, guesser.id, 1), /ALREADY_ANSWERED/);
});

test('revealTmi: 정답 100점 + 선착순 보너스, nextTmi로 끝까지 진행', () => {
  const { game, people } = collectedTmi(5);
  startTmi(game);
  const round = currentRound(game);
  const correctIndex = round.choiceIds.indexOf(round.ownerId);
  const guessers = people.filter((p) => p.id !== round.ownerId);
  answerTmi(game, guessers[0].id, correctIndex);                 // 정답 1등 → 130
  answerTmi(game, guessers[1].id, (correctIndex + 1) % 4);       // 오답 → 0
  answerTmi(game, guessers[2].id, correctIndex);                 // 정답 2등 → 120
  revealTmi(game);
  assert.equal(game.entries.find((e) => e.id === guessers[0].id).score, 130);
  assert.equal(game.entries.find((e) => e.id === guessers[1].id).score, 0);
  assert.equal(game.entries.find((e) => e.id === guessers[2].id).score, 120);
  assert.throws(() => revealTmi(game), /WRONG_STATE/);

  // 남은 라운드 소진 → finished
  for (let i = 0; i < 4; i++) {
    nextTmi(game);
    revealTmi(game);
  }
  nextTmi(game);
  assert.equal(game.status, 'finished');
  assert.throws(() => nextTmi(game), /WRONG_STATE/);
});

test('tmiSnapshot: collecting은 이름만, question은 주인 미노출, revealed는 공개', () => {
  const { game, people } = collectedTmi(4);
  let snap = tmiSnapshot(game);
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.entryCount, 4);
  assert.deepEqual(snap.names.sort(), NAMES.slice(0, 4).sort());
  assert.equal(snap.round, null);
  assert.equal(JSON.stringify(snap).includes('비밀'), false, 'TMI 내용 미노출');

  startTmi(game);
  snap = tmiSnapshot(game);
  assert.equal(snap.status, 'question');
  assert.equal(typeof snap.round.tmi, 'string');
  assert.equal(snap.round.choices.length, 4);
  assert.equal('answerIndex' in snap.round, false);
  assert.equal('ownerName' in snap.round, false);

  const guesser = nonOwner(game, people);
  const round = currentRound(game);
  answerTmi(game, guesser.id, round.choiceIds.indexOf(round.ownerId));
  revealTmi(game);
  snap = tmiSnapshot(game);
  assert.equal(snap.round.answerIndex, round.choiceIds.indexOf(round.ownerId));
  assert.equal(snap.round.ownerName, ownerOf(game).name);
  assert.equal(snap.round.counts.reduce((s, c) => s + c, 0), 1);
  assert.equal(snap.participants.find((p) => p.name === guesser.name).score, 130);
});

test('resetTmi: 제출물 유지하고 진행만 초기화 / clearTmi: 전부 삭제', () => {
  const { game } = collectedTmi(4);
  startTmi(game);
  resetTmi(game);
  assert.equal(game.status, 'collecting');
  assert.equal(game.entries.length, 4);
  assert.equal(game.entries.every((e) => e.score === 0), true);
  clearTmi(game);
  assert.equal(game.entries.length, 0);
});

test('tmiParticipantView: 내 제출/답 복원', () => {
  const { game, people } = collectedTmi(4);
  assert.equal(tmiParticipantView(game, 'nope'), null);
  let view = tmiParticipantView(game, people[0].id);
  assert.equal(view.name, '가');
  assert.equal(view.tmi, '가의 비밀');
  assert.equal(view.answeredChoice, null);
  assert.equal(view.isOwner, false);

  startTmi(game);
  const owner = ownerOf(game);
  const guesser = nonOwner(game, people);
  answerTmi(game, guesser.id, 1);
  view = tmiParticipantView(game, guesser.id);
  assert.equal(view.answeredChoice, 1);
  assert.equal(tmiParticipantView(game, owner.id).isOwner, true);
});
