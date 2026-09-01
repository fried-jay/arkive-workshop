const test = require('node:test');
const assert = require('node:assert');
const {
  createTmi, submitTmi, joinTmi, startTmi, answerTmi, revealTmi, nextTmi,
  resetTmi, clearTmi, reviveTmi, tmiSnapshot, tmiParticipantView,
} = require('../lib/tmi');

const NAMES = ['가', '나', '다', '라', '마'];

// 제출자 n명 + 추리 전용 참가자 m명
function collectedTmi(n = 5, m = 0) {
  const game = createTmi();
  const people = NAMES.slice(0, n).map((name) => submitTmi(game, name, `${name}의 비밀`));
  for (let i = 0; i < m; i++) people.push(joinTmi(game, `관전${i + 1}`));
  return { game, people };
}

function currentRound(game) {
  return game.rounds[game.currentIndex];
}

function ownerOf(game) {
  return game.participants.find((p) => p.id === currentRound(game).ownerId);
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
  assert.equal(game.participants.length, 1);
  assert.equal(game.participants[0].tmi, '수정된 비밀');
});

test('joinTmi: 이름만으로 참가(tmi 없음), 제출자와 이름 겹치면 같은 사람', () => {
  const game = createTmi();
  assert.throws(() => joinTmi(game, ' '), /NAME_REQUIRED/);
  const a = joinTmi(game, '원');
  assert.equal(a.tmi, null);
  const b = submitTmi(game, '원', '비밀'); // 나중에 제출하면 같은 참가자에 tmi 추가
  assert.equal(a.id, b.id);
  assert.equal(b.tmi, '비밀');
  assert.equal(joinTmi(game, '원').id, a.id);
});

test('joinTmi: 게임 진행 중에도 참가 가능', () => {
  const { game } = collectedTmi(5);
  startTmi(game);
  const late = joinTmi(game, '늦은사람');
  assert.equal(late.tmi, null);
  assert.equal(game.participants.length, 6);
});

test('startTmi: 참가자 4명 미만 또는 제출 0건이면 거부', () => {
  const { game } = collectedTmi(3); // 참가자 3명
  assert.throws(() => startTmi(game), /NOT_ENOUGH_ENTRIES/);

  const noSubmit = createTmi(); // 참가자 4명, 제출 0건
  for (const n of NAMES.slice(0, 4)) joinTmi(noSubmit, n);
  assert.throws(() => startTmi(noSubmit), /NOT_ENOUGH_ENTRIES/);

  const mixed = createTmi(); // 제출 1건 + 참가 3명 = 시작 가능
  submitTmi(mixed, '가', '가의 비밀');
  for (const n of ['나', '다', '라']) joinTmi(mixed, n);
  startTmi(mixed);
  assert.equal(mixed.status, 'question');
  assert.equal(mixed.rounds.length, 1); // 라운드는 제출자 수만큼
});

test('startTmi: 보기는 전체 참가자 풀에서, 주인 포함 4명 중복 없이', () => {
  const { game } = collectedTmi(2, 3); // 제출 2 + 관전 3 = 참가자 5
  startTmi(game);
  assert.equal(game.rounds.length, 2);
  const submitterIds = game.participants.filter((p) => p.tmi).map((p) => p.id).sort();
  assert.deepEqual(game.rounds.map((r) => r.ownerId).sort(), submitterIds);
  const allIds = new Set(game.participants.map((p) => p.id));
  for (const r of game.rounds) {
    assert.equal(r.choiceIds.length, 4);
    assert.ok(r.choiceIds.includes(r.ownerId), '보기에 주인 포함');
    assert.equal(new Set(r.choiceIds).size, 4, '보기 중복 없음');
    assert.ok(r.choiceIds.every((id) => allIds.has(id)), '보기는 참가자 중에서');
  }
  // 진행 중 재시작/제출 불가
  assert.throws(() => startTmi(game), /WRONG_STATE/);
  assert.throws(() => submitTmi(game, '새사람', 'x'), /WRONG_STATE/);
});

test('answerTmi: 본인 문제 답변 불가, 문제당 1회, 보기 범위 검증, 미제출자도 답변 가능', () => {
  const { game, people } = collectedTmi(4, 1);
  const anyone = people[0];
  assert.throws(() => answerTmi(game, anyone.id, 0), /WRONG_STATE/); // collecting
  startTmi(game);
  const owner = ownerOf(game);
  const watcher = game.participants.find((p) => !p.tmi); // 추리 전용 참가자
  assert.throws(() => answerTmi(game, owner.id, 0), /OWN_QUESTION/);
  assert.throws(() => answerTmi(game, 'nope', 0), /PARTICIPANT_NOT_FOUND/);
  assert.throws(() => answerTmi(game, watcher.id, 4), /CHOICE_INVALID/);
  answerTmi(game, watcher.id, 0);
  assert.throws(() => answerTmi(game, watcher.id, 1), /ALREADY_ANSWERED/);
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
  assert.equal(guessers[0].score, 130);
  assert.equal(guessers[1].score, 0);
  assert.equal(guessers[2].score, 120);
  assert.throws(() => revealTmi(game), /WRONG_STATE/);

  for (let i = 0; i < 4; i++) {
    nextTmi(game);
    revealTmi(game);
  }
  nextTmi(game);
  assert.equal(game.status, 'finished');
  assert.throws(() => nextTmi(game), /WRONG_STATE/);
});

test('tmiSnapshot: collecting은 이름/제출여부만, question은 주인 미노출, revealed는 공개', () => {
  const { game, people } = collectedTmi(4, 1);
  let snap = tmiSnapshot(game);
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.participantCount, 5);
  assert.equal(snap.submittedCount, 4);
  assert.deepEqual(
    snap.members.map((m) => m.name).sort(),
    [...NAMES.slice(0, 4), '관전1'].sort(),
  );
  assert.equal(snap.members.find((m) => m.name === '가').submitted, true);
  assert.equal(snap.members.find((m) => m.name === '관전1').submitted, false);
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
  const { game } = collectedTmi(4, 1);
  startTmi(game);
  resetTmi(game);
  assert.equal(game.status, 'collecting');
  assert.equal(game.participants.length, 5);
  assert.equal(game.participants.every((p) => p.score === 0), true);
  clearTmi(game);
  assert.equal(game.participants.length, 0);
});

test('reviveTmi: 구버전(entries) 저장 파일 마이그레이션', () => {
  const old = {
    entries: [{ id: 'x', name: '원', tmi: '비밀', score: 0, answers: {} }],
    status: 'collecting', currentIndex: -1, rounds: [],
  };
  const game = reviveTmi(old);
  assert.equal(game.participants.length, 1);
  assert.equal(game.participants[0].tmi, '비밀');
  assert.equal(reviveTmi(null), null);
  const fresh = reviveTmi({ participants: [], status: 'collecting', currentIndex: -1, rounds: [] });
  assert.deepEqual(fresh.participants, []);
});

test('tmiParticipantView: 내 제출/답 복원, 미제출자는 submitted=false', () => {
  const { game, people } = collectedTmi(4);
  const watcher = joinTmi(game, '관전1');
  assert.equal(tmiParticipantView(game, 'nope'), null);
  let view = tmiParticipantView(game, people[0].id);
  assert.equal(view.name, '가');
  assert.equal(view.tmi, '가의 비밀');
  assert.equal(view.submitted, true);
  assert.equal(view.answeredChoice, null);
  assert.equal(view.isOwner, false);
  assert.equal(tmiParticipantView(game, watcher.id).submitted, false);

  startTmi(game);
  const owner = ownerOf(game);
  const guesser = nonOwner(game, people);
  answerTmi(game, guesser.id, 1);
  view = tmiParticipantView(game, guesser.id);
  assert.equal(view.answeredChoice, 1);
  assert.equal(tmiParticipantView(game, owner.id).isOwner, true);
});
