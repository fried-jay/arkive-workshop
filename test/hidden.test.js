const test = require('node:test');
const assert = require('node:assert');
const {
  createHidden, generateRounds, setRounds, joinHidden, startHidden, nextRound,
  tapHidden, resetHidden, clearHiddenParticipants, hiddenSnapshot, hiddenParticipantView,
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
  const rounds = generateRounds(5);
  assert.equal(rounds.length, 5);
  for (const r of rounds) {
    assert.equal(r.cells.length, r.size);
    const targets = r.cells.filter((c) => c === r.target).length;
    assert.ok(targets >= 4 && targets <= 6, `타깃 수 ${targets}`);
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

test('tapHidden: 타깃 맞히면 득점, 배경/중복은 무득점', () => {
  const game = readyGame();
  const p = joinHidden(game, '원');
  assert.throws(() => tapHidden(game, p.id, 0), /WRONG_STATE/); // 시작 전
  startHidden(game);
  const t = targetCell(game);
  let r = tapHidden(game, p.id, t);
  assert.equal(r.correct, true);
  assert.equal(p.score, 1);
  r = tapHidden(game, p.id, t); // 중복
  assert.equal(r.alreadyFound, true);
  assert.equal(p.score, 1);
  const b = bgCell(game);
  r = tapHidden(game, p.id, b); // 배경
  assert.equal(r.correct, false);
  assert.equal(p.score, 1);
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
  assert.equal(snap.participants[0].score, 1);
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
  assert.equal(game.rounds.length, 3);
});

test('clearHiddenParticipants: 참가자만 제거, 라운드 유지', () => {
  const game = readyGame();
  joinHidden(game, '원');
  clearHiddenParticipants(game);
  assert.equal(game.participants.length, 0);
  assert.equal(game.rounds.length, 3);
});
