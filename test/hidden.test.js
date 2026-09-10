const test = require('node:test');
const assert = require('node:assert');
const {
  createHidden, generateRounds, setRounds, joinHidden, startHidden, nextRound,
  tapHidden, resetHidden, clearHiddenParticipants, hiddenSnapshot, hiddenParticipantView,
  finishRoundIfDue, ROUND_END_DELAY_MS,
} = require('../lib/hidden');

function readyGame(count = 3) {
  const game = createHidden();
  setRounds(game, generateRounds(count));
  return game;
}

function targetCell(game) {
  const r = game.rounds[game.currentIndex];
  return r.cells.findIndex((c) => c === r.target);
}
function bgCell(game) {
  const r = game.rounds[game.currentIndex];
  return r.cells.findIndex((c) => c === r.bg);
}

test('generateRounds: 요청 수만큼, 각 라운드에 타깃이 존재', () => {
  const rounds = generateRounds(4);
  assert.equal(rounds.length, 4);
  assert.deepEqual(rounds.map((r) => r.dim), [5, 6, 7, 8]); // 단계별 격자 증가
  for (const r of rounds) {
    assert.equal(r.cells.length, r.dim * r.dim);
    const targets = r.cells.filter((c) => c === r.target).length;
    assert.equal(targets, r.dim); // 타깃 수 = 격자 한 변
    assert.notEqual(r.bg, r.target);
  }
});

test('setRounds: 빈 배열 거부', () => {
  const game = createHidden();
  assert.throws(() => setRounds(game, []), /ROUNDS_INVALID/);
});

test('startHidden: 라운드 없으면 거부, 있으면 playing', () => {
  const empty = createHidden();
  assert.throws(() => startHidden(empty), /HIDDEN_NOT_READY/);
  const game = readyGame();
  startHidden(game);
  assert.equal(game.status, 'playing');
  assert.equal(game.currentIndex, 0);
});

test('joinHidden: 빈 이름 거부, 같은 이름 재사용', () => {
  const game = readyGame();
  assert.throws(() => joinHidden(game, ' '), /NAME_REQUIRED/);
  const a = joinHidden(game, '원');
  assert.equal(joinHidden(game, ' 원 ').id, a.id);
});

function clearRound(game, p, now) {
  const r = game.rounds[game.currentIndex];
  let last;
  r.cells.forEach((c, i) => { if (c === r.target) last = tapHidden(game, p.id, i, now); });
  return last;
}

test('tapHidden: 찾기만으로는 무득점, 배경/중복은 무반응', () => {
  const game = readyGame();
  const p = joinHidden(game, '원');
  assert.throws(() => tapHidden(game, p.id, 0), /WRONG_STATE/); // 시작 전
  startHidden(game);
  const t = targetCell(game);
  let r = tapHidden(game, p.id, t);
  assert.equal(r.correct, true);
  assert.equal(r.cleared, false);
  assert.equal(p.score, 0);            // 개수 점수 없음 — 클리어 순위로만 득점
  r = tapHidden(game, p.id, t); // 중복
  assert.equal(r.alreadyFound, true);
  const b = bgCell(game);
  r = tapHidden(game, p.id, b); // 배경
  assert.equal(r.correct, false);
  assert.equal(p.score, 0);
});

test('tapHidden: 클리어 순서대로 100/70/50/30점, 1등 나오면 라운드 종료 예약', () => {
  const game = readyGame();
  const ps = ['a', 'b', 'c', 'd', 'e'].map((n) => joinHidden(game, n));
  startHidden(game);
  assert.equal(game.roundEndsAt, null);
  const r1 = clearRound(game, ps[0], 1000);
  assert.deepEqual([r1.cleared, r1.rank, r1.points], [true, 1, 100]);
  assert.equal(game.roundEndsAt, 1000 + ROUND_END_DELAY_MS);
  assert.equal(clearRound(game, ps[1], 2000).points, 70);
  assert.equal(clearRound(game, ps[2], 3000).points, 50);
  assert.equal(clearRound(game, ps[3], 4000).points, 30);
  assert.equal(game.roundEndsAt, 1000 + ROUND_END_DELAY_MS); // 1등 시점 기준 유지
  assert.deepEqual(ps.map((p) => p.score), [100, 70, 50, 30, 0]);
  // 종료 시각 이후 탭은 잠김
  assert.throws(() => tapHidden(game, ps[4].id, targetCell(game), 1000 + ROUND_END_DELAY_MS), /ROUND_OVER/);
  const snap = hiddenSnapshot(game);
  assert.equal(snap.round.firstClear, 'a');
  assert.deepEqual(snap.round.clears, ['a', 'b', 'c', 'd']);
  assert.equal(snap.roundEndsAt, game.roundEndsAt);
  assert.equal(snap.participants.find((x) => x.name === 'b').clearRank, 2);
  assert.equal(snap.participants.find((x) => x.name === 'e').clearRank, null);
  assert.equal(hiddenParticipantView(game, ps[1].id).clearRank, 2);
});

test('finishRoundIfDue: 예약 시각 전엔 무시, 지나면 다음 라운드로 넘기고 예약 해제', () => {
  const game = readyGame(2);
  const p = joinHidden(game, '원');
  startHidden(game);
  clearRound(game, p, 1000);
  assert.equal(finishRoundIfDue(game, 1000 + ROUND_END_DELAY_MS - 1), false);
  assert.equal(game.currentIndex, 0);
  assert.equal(finishRoundIfDue(game, 1000 + ROUND_END_DELAY_MS), true);
  assert.equal(game.currentIndex, 1);
  assert.equal(game.roundEndsAt, null);
  assert.equal(finishRoundIfDue(game, 99999), false); // 예약 없으면 무시
  // 새 라운드에서 다시 1등 → 점수 누적, 마지막 라운드 종료 시 finished
  clearRound(game, p, 5000);
  assert.equal(p.score, 200);
  finishRoundIfDue(game, 5000 + ROUND_END_DELAY_MS);
  assert.equal(game.status, 'finished');
});

test('구버전 저장 상태(clears 없음)에서도 탭 동작', () => {
  const game = readyGame();
  const p = joinHidden(game, '원');
  startHidden(game);
  delete game.clears; delete game.roundEndsAt;
  assert.equal(clearRound(game, p, 1000).points, 100);
});

test('tapHidden: 잘못된 칸/없는 참가자 거부', () => {
  const game = readyGame();
  const p = joinHidden(game, '원');
  startHidden(game);
  assert.throws(() => tapHidden(game, 'nope', 0), /PARTICIPANT_NOT_FOUND/);
  assert.throws(() => tapHidden(game, p.id, 999), /CELL_INVALID/);
});

test('nextRound: 마지막 다음은 finished', () => {
  const game = readyGame(2);
  startHidden(game);
  assert.equal(game.currentIndex, 0);
  nextRound(game);
  assert.equal(game.currentIndex, 1);
  nextRound(game);
  assert.equal(game.status, 'finished');
});

test('hiddenSnapshot: 진행 중 라운드/점수 노출', () => {
  const game = readyGame();
  const p = joinHidden(game, '원');
  startHidden(game);
  tapHidden(game, p.id, targetCell(game));
  const snap = hiddenSnapshot(game);
  assert.equal(snap.status, 'playing');
  assert.equal(snap.totalRounds, 3);
  assert.ok(snap.round.cells.length === snap.round.size);
  assert.equal(snap.participants[0].score, 0);
  assert.equal(snap.participants[0].foundInRound, 1);
});

test('hiddenParticipantView: 내 진행 복원', () => {
  const game = readyGame();
  const p = joinHidden(game, '원');
  startHidden(game);
  const t = targetCell(game);
  tapHidden(game, p.id, t);
  const view = hiddenParticipantView(game, p.id);
  assert.equal(view.name, '원');
  assert.ok(view.found.includes(t));
  assert.equal(view.round.target, game.rounds[0].target);
  assert.equal(hiddenParticipantView(game, 'nope'), null);
});

test('resetHidden: 진행/점수 초기화, 참가자·라운드 유지', () => {
  const game = readyGame();
  const p = joinHidden(game, '원');
  startHidden(game);
  p.score = 5;
  resetHidden(game);
  assert.equal(game.participants.length, 1);   // 참가자 유지
  assert.equal(game.participants[0].score, 0); // 점수 초기화
  assert.equal(game.status, 'idle');
  assert.equal(game.roundEndsAt, null);
  assert.equal(game.rounds.length, 3);
});

test('clearHiddenParticipants: 참가자만 제거, 라운드 유지', () => {
  const game = readyGame();
  joinHidden(game, '원');
  clearHiddenParticipants(game);
  assert.equal(game.participants.length, 0);
  assert.equal(game.rounds.length, 3);
});
