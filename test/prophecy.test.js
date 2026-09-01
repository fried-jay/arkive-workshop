const test = require('node:test');
const assert = require('node:assert');
const {
  createProphecy, submitProphecy, sealProphecy, revealProphecy, markHit,
  resetProphecy, prophecySnapshot, prophecyParticipantView,
} = require('../lib/prophecy');

function sealedGame() {
  const game = createProphecy();
  const a = submitProphecy(game, '가', '오늘 누군가 커피를 쏟는다');
  const b = submitProphecy(game, '나', '퀴즈 1등은 다다');
  sealProphecy(game);
  return { game, a, b };
}

test('submitProphecy: 이름/내용 필수, 재제출은 수정, collecting에서만', () => {
  const game = createProphecy();
  assert.throws(() => submitProphecy(game, ' ', 'x'), /NAME_REQUIRED/);
  assert.throws(() => submitProphecy(game, '가', '  '), /PROPHECY_REQUIRED/);
  const p = submitProphecy(game, '가', ' 첫 예언 ');
  assert.equal(p.text, '첫 예언');
  const p2 = submitProphecy(game, ' 가 ', '수정된 예언');
  assert.equal(p.id, p2.id);
  assert.equal(game.participants.length, 1);
  assert.equal(p.text, '수정된 예언');
  submitProphecy(game, '나', '둘째 예언');
  sealProphecy(game);
  assert.throws(() => submitProphecy(game, '다', '늦은 예언'), /WRONG_STATE/);
});

test('sealProphecy: 2명 미만 거부, collecting에서만', () => {
  const game = createProphecy();
  submitProphecy(game, '가', '예언');
  assert.throws(() => sealProphecy(game), /NOT_ENOUGH_ENTRIES/);
  submitProphecy(game, '나', '예언2');
  sealProphecy(game);
  assert.equal(game.status, 'sealed');
  assert.throws(() => sealProphecy(game), /WRONG_STATE/);
});

test('revealProphecy: sealed에서만', () => {
  const game = createProphecy();
  assert.throws(() => revealProphecy(game), /WRONG_STATE/);
  const { game: g2 } = sealedGame();
  revealProphecy(g2);
  assert.equal(g2.status, 'revealed');
  assert.throws(() => revealProphecy(g2), /WRONG_STATE/);
});

test('markHit: revealed에서만, 적중 +100, 번복 가능', () => {
  const { game, a } = sealedGame();
  assert.throws(() => markHit(game, a.id, true), /WRONG_STATE/);
  revealProphecy(game);
  assert.throws(() => markHit(game, 'nope', true), /PARTICIPANT_NOT_FOUND/);
  markHit(game, a.id, true);
  assert.equal(a.hit, true);
  assert.equal(a.score, 100);
  markHit(game, a.id, false); // 번복
  assert.equal(a.hit, false);
  assert.equal(a.score, 0);
});

test('prophecySnapshot: 봉인 전/중엔 내용 미노출, 공개 시 전체', () => {
  const { game } = sealedGame();
  let snap = prophecySnapshot(game);
  assert.equal(snap.status, 'sealed');
  assert.equal(snap.participantCount, 2);
  assert.deepEqual(snap.names.sort(), ['가', '나']);
  assert.equal(JSON.stringify(snap).includes('커피'), false, '예언 내용 미노출');
  assert.equal('prophecies' in snap, false);

  revealProphecy(game);
  markHit(game, game.participants[0].id, true);
  snap = prophecySnapshot(game);
  const first = snap.prophecies.find((p) => p.name === '가');
  assert.equal(first.text, '오늘 누군가 커피를 쏟는다');
  assert.equal(first.hit, true);
  assert.equal(first.score, 100);
  assert.equal(snap.prophecies.find((p) => p.name === '나').hit, null, '미판정은 null');
});

test('resetProphecy / participantView', () => {
  const { game, a } = sealedGame();
  let view = prophecyParticipantView(game, a.id);
  assert.equal(view.text, '오늘 누군가 커피를 쏟는다');
  assert.equal(view.hit, null);
  assert.equal(prophecyParticipantView(game, 'nope'), null);

  revealProphecy(game);
  markHit(game, a.id, true);
  view = prophecyParticipantView(game, a.id);
  assert.equal(view.hit, true);
  assert.equal(view.score, 100);

  resetProphecy(game);
  assert.equal(game.status, 'collecting');
  assert.equal(game.participants.length, 0);
});
