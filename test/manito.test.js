const test = require('node:test');
const assert = require('node:assert');
const {
  createManito, joinManito, setNote, startManito, guessManito,
  revealManito, resetManito, manitoSnapshot, manitoParticipantView,
} = require('../lib/manito');

function runningGame(n = 4) {
  const game = createManito();
  const people = ['가', '나', '다', '라'].slice(0, n).map((name) => joinManito(game, name));
  startManito(game);
  return { game, people };
}

// p를 챙기는 사람(p의 마니또)
function guardianOf(game, p) {
  return game.participants.find((x) => x.targetId === p.id);
}

test('joinManito: 빈 이름 거부, 같은 이름 재사용, running 중 입장 불가', () => {
  const game = createManito();
  assert.throws(() => joinManito(game, ' '), /NAME_REQUIRED/);
  const a = joinManito(game, '원');
  assert.equal(joinManito(game, ' 원 ').id, a.id);
  joinManito(game, '둘');
  joinManito(game, '셋');
  startManito(game);
  assert.throws(() => joinManito(game, '늦은사람'), /WRONG_STATE/);
  assert.equal(joinManito(game, '원').id, a.id, '기존 참가자 재입장은 가능');
});

test('startManito: 3명 미만 거부, 한 줄 사이클 배정(자기 자신 X)', () => {
  const game = createManito();
  joinManito(game, '가');
  joinManito(game, '나');
  assert.throws(() => startManito(game), /NOT_ENOUGH_ENTRIES/);

  const { game: g2 } = runningGame(4);
  assert.equal(g2.status, 'running');
  for (const p of g2.participants) {
    assert.notEqual(p.targetId, p.id, '자기 자신을 챙기지 않음');
    assert.ok(g2.participants.some((x) => x.id === p.targetId));
  }
  // 한 줄 사이클: 아무나 시작해서 target을 따라가면 전원을 돌고 돌아옴
  const start = g2.participants[0];
  let cursor = start;
  const seen = new Set();
  for (let i = 0; i < g2.participants.length; i++) {
    seen.add(cursor.id);
    cursor = g2.participants.find((x) => x.id === cursor.targetId);
  }
  assert.equal(seen.size, 4);
  assert.equal(cursor.id, start.id);
  assert.throws(() => startManito(g2), /WRONG_STATE/);
});

test('guessManito: 자기 자신 불가, 변경 가능, running에서만', () => {
  const { game, people } = runningGame();
  const [a, b, c] = people;
  assert.throws(() => guessManito(game, a.id, a.id), /CHOICE_INVALID/);
  assert.throws(() => guessManito(game, a.id, 'nope'), /CHOICE_INVALID/);
  assert.throws(() => guessManito(game, 'nope', b.id), /PARTICIPANT_NOT_FOUND/);
  guessManito(game, a.id, b.id);
  assert.equal(a.guessId, b.id);
  guessManito(game, a.id, c.id); // 변경 가능
  assert.equal(a.guessId, c.id);

  const idle = createManito();
  const p = joinManito(idle, '원');
  assert.throws(() => guessManito(idle, p.id, p.id), /WRONG_STATE/);
});

test('revealManito: 추측 적중자 +100', () => {
  const { game, people } = runningGame();
  const a = people[0];
  const guardian = guardianOf(game, a);
  guessManito(game, a.id, guardian.id); // 적중
  const b = people.find((p) => p.id !== a.id && p.id !== guardian.id);
  const notGuardian = people.find((p) => p.id !== b.id && p.id !== guardianOf(game, b).id);
  guessManito(game, b.id, notGuardian.id); // 오답
  revealManito(game);
  assert.equal(game.status, 'revealed');
  assert.equal(a.score, 100);
  assert.equal(b.score, 0);
  assert.throws(() => revealManito(game), /WRONG_STATE/);
});

test('setNote/resetManito: 안내문 유지, 리셋은 참가자 삭제', () => {
  const { game } = runningGame();
  setNote(game, ' 몰래 칭찬 한 번, 간식 하나 챙겨주기! ');
  assert.equal(game.note, '몰래 칭찬 한 번, 간식 하나 챙겨주기!');
  resetManito(game);
  assert.equal(game.status, 'idle');
  assert.equal(game.participants.length, 0);
  assert.equal(game.note, '몰래 칭찬 한 번, 간식 하나 챙겨주기!');
});

test('manitoSnapshot: 배정은 revealed 전 비공개, 공개 시 사이클+적중', () => {
  const { game, people } = runningGame();
  const a = people[0];
  guessManito(game, a.id, guardianOf(game, a).id);
  let snap = manitoSnapshot(game);
  assert.equal(snap.status, 'running');
  assert.equal(snap.guessedCount, 1);
  assert.deepEqual(snap.participants.find((p) => p.name === '가'), { name: '가', guessed: true });
  assert.equal('pairs' in snap, false, '배정 비공개');
  assert.equal(JSON.stringify(snap).includes('targetId'), false);

  revealManito(game);
  snap = manitoSnapshot(game);
  assert.equal(snap.pairs.length, 4);
  const aPair = snap.pairs.find((x) => x.from === '가');
  assert.equal(aPair.to, game.participants.find((p) => p.id === a.targetId).name);
  assert.equal(snap.pairs.find((x) => x.to === '가').guessedRight, true, '가는 자기 마니또를 맞힘');
});

test('manitoParticipantView: 내 대상은 running부터, 내 마니또는 revealed부터', () => {
  const game = createManito();
  const p = joinManito(game, '가');
  joinManito(game, '나');
  joinManito(game, '다');
  assert.equal(manitoParticipantView(game, 'nope'), null);
  let view = manitoParticipantView(game, p.id);
  assert.equal(view.targetName, null);

  startManito(game);
  view = manitoParticipantView(game, p.id);
  assert.equal(typeof view.targetName, 'string');
  assert.equal(view.myManitoName, null, '공개 전엔 내 마니또 모름');

  const guardian = guardianOf(game, p);
  guessManito(game, p.id, guardian.id);
  revealManito(game);
  view = manitoParticipantView(game, p.id);
  assert.equal(view.myManitoName, guardian.name);
  assert.equal(view.guessedRight, true);
});
