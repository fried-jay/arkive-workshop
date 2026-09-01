const test = require('node:test');
const assert = require('node:assert');
const {
  createCatchmind, joinCatchmind, assignDrawer, drawerByKey, submitDrawing,
  submitGuess, revealRound, resetCatchmind, catchmindSnapshot, catchmindParticipantView,
} = require('../lib/catchmind');

const STROKES = [
  { points: [[0.1, 0.2], [0.3, 0.4]], c: '#000000', w: 4 },
  { points: [[0.5, 0.5]], c: '#e11d48', w: 8 },
];

function readyGame() {
  const game = createCatchmind();
  const people = ['가', '나', '다'].map((name) => joinCatchmind(game, name));
  return { game, people };
}

// 발급 → 제출까지 진행한 게임
function guessingGame(word = '맥북') {
  const { game, people } = readyGame();
  const key = assignDrawer(game, people[0].id);
  submitDrawing(game, key, STROKES, word);
  return { game, people, key };
}

test('joinCatchmind: 빈 이름 거부, 같은 이름 재사용', () => {
  const game = createCatchmind();
  assert.throws(() => joinCatchmind(game, ' '), /NAME_REQUIRED/);
  const a = joinCatchmind(game, '원');
  assert.equal(joinCatchmind(game, ' 원 ').id, a.id);
});

test('assignDrawer: 링크 키 발급, 재발급 시 이전 키 무효, guessing 중엔 불가', () => {
  const { game, people } = readyGame();
  assert.throws(() => assignDrawer(game, 'nope'), /PARTICIPANT_NOT_FOUND/);
  const key1 = assignDrawer(game, people[0].id);
  assert.equal(game.status, 'waiting');
  assert.equal(drawerByKey(game, key1).name, '가');

  const key2 = assignDrawer(game, people[1].id); // 그리는 중 재발급 허용(잠수 대비)
  assert.notEqual(key1, key2);
  assert.equal(drawerByKey(game, key1), null, '이전 키 무효');
  assert.equal(drawerByKey(game, key2).name, '나');

  submitDrawing(game, key2, STROKES, '회식');
  assert.throws(() => assignDrawer(game, people[0].id), /WRONG_STATE/); // 맞추는 중
});

test('submitDrawing: 키/단어/스트로크 검증, 제출하면 guessing', () => {
  const { game, people } = readyGame();
  const key = assignDrawer(game, people[0].id);
  assert.throws(() => submitDrawing(game, 'bad-key', STROKES, '맥북'), /DRAW_KEY_INVALID/);
  assert.throws(() => submitDrawing(game, key, STROKES, '  '), /WORD_REQUIRED/);
  assert.throws(() => submitDrawing(game, key, [], '맥북'), /STROKE_INVALID/);
  assert.throws(() => submitDrawing(game, key, [{ points: [[2, 0]], c: '#000', w: 4 }], '맥북'), /STROKE_INVALID/);
  submitDrawing(game, key, STROKES, ' 맥북 ');
  assert.equal(game.status, 'guessing');
  assert.equal(game.word, '맥북');
  assert.equal(game.roundCount, 1);
  assert.throws(() => submitDrawing(game, key, STROKES, '맥북'), /WRONG_STATE/); // 이중 제출
});

test('submitGuess: 정답 판정(공백/대소문자 무시), 점수, 오답 피드, 출제자 금지', () => {
  const { game, people } = guessingGame('맥북');
  const [d, g] = people;
  assert.throws(() => submitGuess(game, d.id, '맥북'), /OWN_DRAW/);
  assert.throws(() => submitGuess(game, g.id, ' '), /GUESS_REQUIRED/);

  let result = submitGuess(game, g.id, '아이패드');
  assert.equal(result.correct, false);
  assert.deepEqual(game.guesses.at(-1), { name: '나', text: '아이패드' });

  result = submitGuess(game, g.id, ' 맥 북 ');
  assert.equal(result.correct, true);
  assert.equal(game.status, 'revealed');
  assert.equal(game.winnerName, '나');
  assert.equal(g.score, 100);
  assert.equal(d.score, 50);
  assert.throws(() => submitGuess(game, g.id, '맥북'), /WRONG_STATE/);
});

test('revealRound(스킵): guessing에서만, 점수 없이 공개 / resetCatchmind', () => {
  const { game } = readyGame();
  assert.throws(() => revealRound(game), /WRONG_STATE/); // idle
  const { game: g2 } = guessingGame();
  revealRound(g2);
  assert.equal(g2.status, 'revealed');
  assert.equal(g2.winnerName, null);
  assert.equal(g2.participants.every((p) => p.score === 0), true);
  resetCatchmind(g2);
  assert.equal(g2.status, 'idle');
  assert.equal(g2.participants.length, 0);
});

test('revealed 후 다시 발급 → 새 라운드 (그림/피드 초기화)', () => {
  const { game, people } = guessingGame();
  revealRound(game);
  const key = assignDrawer(game, people[2].id);
  assert.equal(game.status, 'waiting');
  assert.equal(game.strokes.length, 0);
  assert.equal(game.guesses.length, 0);
  assert.equal(game.winnerName, null);
  submitDrawing(game, key, STROKES, '텀블러');
  assert.equal(game.roundCount, 2);
});

test('catchmindSnapshot: 정답 단어·strokes·키 미노출, revealed에서 단어 공개', () => {
  const { game, people } = guessingGame('맥북');
  submitGuess(game, people[1].id, '오답이다');
  let snap = catchmindSnapshot(game);
  assert.equal(snap.status, 'guessing');
  assert.equal(snap.drawerName, '가');
  assert.equal(snap.roundCount, 1);
  assert.equal(snap.word, null);
  const json = JSON.stringify(snap);
  assert.equal(json.includes('맥북'), false, '정답 미노출');
  assert.equal(json.includes('points'), false, 'strokes 미노출');
  assert.equal(json.includes(game.drawKey), false, '키 미노출');
  assert.deepEqual(snap.guesses, [{ name: '나', text: '오답이다' }]);
  assert.equal(snap.participants.find((p) => p.name === '가').isDrawer, true);

  submitGuess(game, people[1].id, '맥북');
  snap = catchmindSnapshot(game);
  assert.equal(snap.word, '맥북');
  assert.equal(snap.winnerName, '나');
});

test('catchmindParticipantView: 점수/출제자 여부 복원', () => {
  const { game, people } = guessingGame();
  assert.equal(catchmindParticipantView(game, 'nope'), null);
  const view = catchmindParticipantView(game, people[0].id);
  assert.equal(view.name, '가');
  assert.equal(view.isDrawer, true);
  assert.equal(catchmindParticipantView(game, people[1].id).isDrawer, false);
});
