const test = require('node:test');
const assert = require('node:assert');
const {
  createGame, setItems, joinGame, reshuffle, setReady, startGame, markCell, resetGame, clearBingoParticipants,
  countBingoLines, publicSnapshot, participantView,
} = require('../lib/game');

const ITEMS = Array.from({ length: 25 }, (_, i) => `항목${i + 1}`);

function gameWithItems() {
  const game = createGame();
  setItems(game, ITEMS);
  return game;
}

test('countBingoLines: 아무것도 안 칠하면 0줄', () => {
  assert.equal(countBingoLines(Array(25).fill(false)), 0);
});

test('countBingoLines: 첫 가로줄', () => {
  const marked = Array(25).fill(false);
  for (let c = 0; c < 5; c++) marked[c] = true;
  assert.equal(countBingoLines(marked), 1);
});

test('countBingoLines: 세로줄', () => {
  const marked = Array(25).fill(false);
  for (let r = 0; r < 5; r++) marked[r * 5 + 2] = true;
  assert.equal(countBingoLines(marked), 1);
});

test('countBingoLines: 대각선 2개', () => {
  const marked = Array(25).fill(false);
  for (const i of [0, 6, 12, 18, 24]) marked[i] = true;
  for (const i of [4, 8, 16, 20]) marked[i] = true; // 12는 이미 true
  assert.equal(countBingoLines(marked), 2);
});

test('countBingoLines: 전부 칠하면 12줄', () => {
  assert.equal(countBingoLines(Array(25).fill(true)), 12);
});

test('setItems: 25개 아니면 거부', () => {
  const game = createGame();
  assert.throws(() => setItems(game, ['a', 'b']), /ITEMS_INVALID/);
});

test('setItems: 빈 문자열 항목 거부', () => {
  const game = createGame();
  const bad = [...ITEMS.slice(0, 24), '   '];
  assert.throws(() => setItems(game, bad), /ITEMS_INVALID/);
});

test('setItems: 항목 trim 저장', () => {
  const game = createGame();
  setItems(game, ITEMS.map((s) => `  ${s}  `));
  assert.deepEqual(game.items, ITEMS);
});

test('joinGame: 항목 설정 전에는 입장 불가', () => {
  const game = createGame();
  assert.throws(() => joinGame(game, '원'), /ITEMS_NOT_SET/);
});

test('joinGame: 빈 이름 거부', () => {
  const game = gameWithItems();
  assert.throws(() => joinGame(game, '  '), /NAME_REQUIRED/);
});

test('joinGame: layout은 0..24의 순열', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  assert.equal(p.layout.length, 25);
  assert.deepEqual([...p.layout].sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
  assert.deepEqual(p.marked, Array(25).fill(false));
  assert.ok(p.id.length > 0);
});

test('joinGame: 같은 이름으로 다시 join하면 기존 참가자 반환', () => {
  const game = gameWithItems();
  const a = joinGame(game, '원');
  const b = joinGame(game, ' 원 ');
  assert.equal(a.id, b.id);
  assert.equal(game.participants.length, 1);
});

test('markCell: 칠하기/해제 (시작 후)', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  startGame(game);
  markCell(game, p.id, 3, true);
  assert.equal(p.marked[3], true);
  markCell(game, p.id, 3, false);
  assert.equal(p.marked[3], false);
});

test('markCell: 시작 전에는 칠할 수 없음', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  assert.throws(() => markCell(game, p.id, 0, true), /NOT_STARTED/);
});

test('markCell: 없는 참가자/잘못된 칸 거부', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  startGame(game);
  assert.throws(() => markCell(game, 'nope', 0, true), /PARTICIPANT_NOT_FOUND/);
  assert.throws(() => markCell(game, p.id, 25, true), /CELL_INVALID/);
  assert.throws(() => markCell(game, p.id, -1, true), /CELL_INVALID/);
  assert.throws(() => markCell(game, p.id, 1.5, true), /CELL_INVALID/);
});

test('reshuffle: layout을 새 순열로 바꾸고 순열 유지', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  const before = [...p.layout];
  reshuffle(game, p.id);
  assert.deepEqual([...p.layout].sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
  // 극히 낮은 확률로 동일할 수 있으나 길이/순열은 항상 보장
  assert.equal(p.layout.length, 25);
  assert.equal(before.length, 25);
});

test('reshuffle: 레디 상태면 거부, 시작 후면 거부', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  setReady(game, p.id, true);
  assert.throws(() => reshuffle(game, p.id), /ALREADY_READY/);
  setReady(game, p.id, false);
  startGame(game);
  assert.throws(() => reshuffle(game, p.id), /ALREADY_STARTED/);
});

test('setReady: 토글, 시작 후 변경 불가', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  assert.equal(p.ready, false);
  setReady(game, p.id, true);
  assert.equal(p.ready, true);
  startGame(game);
  assert.throws(() => setReady(game, p.id, false), /ALREADY_STARTED/);
});

test('startGame: 참가자 없으면 거부, 있으면 started=true', () => {
  const game = gameWithItems();
  assert.throws(() => startGame(game), /NO_PARTICIPANTS/);
  joinGame(game, '원');
  startGame(game);
  assert.equal(game.started, true);
});

test('resetGame: 판·시작 초기화, 참가자·items 유지', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  startGame(game);
  markCell(game, p.id, 0, true);
  resetGame(game);
  assert.equal(game.participants.length, 1);      // 참가자 유지
  assert.equal(game.participants[0].marked[0], false); // 판 초기화
  assert.equal(game.started, false);
  assert.equal(game.items.length, 25);
});

test('clearBingoParticipants: 참가자만 제거, items 유지', () => {
  const game = gameWithItems();
  joinGame(game, '원');
  startGame(game);
  clearBingoParticipants(game);
  assert.equal(game.participants.length, 0);
  assert.equal(game.started, false);
  assert.equal(game.items.length, 25);
});

test('publicSnapshot: 이름/레디/칸수/줄수 노출 (id 없음) + 진행 상태', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  startGame(game);
  for (let c = 0; c < 5; c++) markCell(game, p.id, c, true);
  const snap = publicSnapshot(game);
  assert.equal(snap.itemsSet, true);
  assert.equal(snap.started, true);
  assert.equal(snap.readyCount, 0);
  assert.deepEqual(snap.participants, [{ name: '원', ready: false, markedCount: 5, bingoLines: countBingoLines(p.marked) }]);
  assert.equal('id' in snap.participants[0], false);
});

test('publicSnapshot: readyCount 반영', () => {
  const game = gameWithItems();
  const a = joinGame(game, '원');
  joinGame(game, '투');
  setReady(game, a.id, true);
  const snap = publicSnapshot(game);
  assert.equal(snap.started, false);
  assert.equal(snap.readyCount, 1);
});

test('participantView: 자기 판 복원 (레디/시작 포함)', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  startGame(game);
  markCell(game, p.id, 0, true);
  const view = participantView(game, p.id);
  assert.equal(view.name, '원');
  assert.equal(view.cells.length, 25);
  assert.equal(view.cells[0], ITEMS[p.layout[0]]);
  assert.equal(view.marked[0], true);
  assert.equal(view.ready, false);
  assert.equal(view.started, true);
  assert.equal(typeof view.bingoLines, 'number');
  assert.equal(participantView(game, 'nope'), null);
});
