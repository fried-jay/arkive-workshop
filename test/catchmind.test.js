const test = require('node:test');
const assert = require('node:assert');
const {
  createCatchmind, setPromptBank, promptForName, submitCatchmind, startShow, nextShow, revealHint, revealCurrent, pickWinner,
  resetCatchmind, clearCatchmind, currentStrokes, catchmindSnapshot,
} = require('../lib/catchmind');

const STROKES = [
  { points: [[0.1, 0.2], [0.3, 0.4]], c: '#000000', w: 4 },
  { points: [[0.5, 0.5]], c: '#e11d48', w: 8 },
];

function withThree() {
  const g = createCatchmind();
  submitCatchmind(g, '가', STROKES, '사과');
  submitCatchmind(g, '나', STROKES, '바나나');
  submitCatchmind(g, '다', STROKES, '포도');
  return g;
}

test('submitCatchmind: 검증 + 같은 이름 덮어쓰기', () => {
  const g = createCatchmind();
  assert.throws(() => submitCatchmind(g, ' ', STROKES, '사과'), /NAME_REQUIRED/);
  assert.throws(() => submitCatchmind(g, '가', STROKES, ' '), /WORD_REQUIRED/);
  assert.throws(() => submitCatchmind(g, '가', [], '사과'), /STROKE_INVALID/);
  submitCatchmind(g, '가', STROKES, '사과');
  assert.equal(g.submissions.length, 1);
  submitCatchmind(g, '가', STROKES, '수박'); // 덮어쓰기
  assert.equal(g.submissions.length, 1);
  assert.equal(g.submissions[0].word, '수박');
});

test('startShow: 제출 없으면 거부, 있으면 showing', () => {
  const empty = createCatchmind();
  assert.throws(() => startShow(empty), /NOT_ENOUGH_ENTRIES/);
  const g = withThree();
  startShow(g);
  assert.equal(g.status, 'showing');
  assert.equal(g.currentIndex, 0);
  assert.throws(() => submitCatchmind(g, '라', STROKES, '귤'), /WRONG_STATE/); // 공개 시작 후 제출 불가
});

test('pickWinner: 정답자 +100, 그린 사람 +50, 정답 공개', () => {
  const g = withThree();
  startShow(g);
  const drawer = g.submissions[0].name;
  pickWinner(g, '심판관');
  assert.equal(g.submissions[0].revealed, true);
  assert.equal(g.submissions[0].winnerName, '심판관');
  assert.equal(g.scores['심판관'], 100);
  assert.equal(g.scores[drawer], 50);
  assert.throws(() => pickWinner(g, ''), /GUESS_REQUIRED/);
});

test('revealCurrent: 정답자 없이 공개', () => {
  const g = withThree();
  startShow(g);
  revealCurrent(g);
  assert.equal(g.submissions[0].revealed, true);
  assert.equal(g.submissions[0].winnerName, null);
});

test('nextShow: 마지막 다음은 finished', () => {
  const g = withThree();
  startShow(g);
  nextShow(g); nextShow(g);
  assert.equal(g.currentIndex, 2);
  nextShow(g);
  assert.equal(g.status, 'finished');
  assert.throws(() => nextShow(g), /WRONG_STATE/);
});

test('catchmindSnapshot: 수집/공개 상태, 정답은 공개 전 미노출', () => {
  const g = withThree();
  let snap = catchmindSnapshot(g);
  assert.equal(snap.status, 'collecting');
  assert.equal(snap.total, 3);
  assert.deepEqual(snap.submitters.sort(), ['가', '나', '다']);
  startShow(g);
  snap = catchmindSnapshot(g);
  assert.equal(snap.status, 'showing');
  assert.equal(snap.current.revealed, false);
  assert.equal(snap.current.word, null);       // 공개 전 정답 미노출
  assert.equal(snap.current.drawerName, null);  // 공개 전 그린 사람 미노출
  assert.deepEqual(currentStrokes(g), g.submissions[0].strokes);
  pickWinner(g, '심판관');
  snap = catchmindSnapshot(g);
  assert.equal(snap.current.word, g.submissions[0].word);
  assert.equal(snap.scores[0].score, 100);
});

test('제시어 뱅크: 자동 배정 + 힌트 반영', () => {
  const g = createCatchmind();
  setPromptBank(g, [{ word: '회의', hints: ['여러 명', '길어짐'] }, { word: '야근', hints: ['밤', '늦게'] }]);
  const p = promptForName(g, '가');
  assert.ok(['회의', '야근'].includes(p.word));
  assert.equal(promptForName(g, '가').word, p.word); // 결정적
  submitCatchmind(g, '가', STROKES, '무시될단어');   // 뱅크가 있으면 제공 단어 무시
  assert.equal(g.submissions[0].word, p.word);
  assert.deepEqual(g.submissions[0].hints, p.hints);
  startShow(g);
  assert.deepEqual(catchmindSnapshot(g).current.hints, []); // 공개 전엔 힌트 숨김
  revealHint(g);
  assert.deepEqual(catchmindSnapshot(g).current.hints, [p.hints[0]]); // 1개 공개
  revealHint(g);
  assert.deepEqual(catchmindSnapshot(g).current.hints, p.hints); // 2개 공개
  revealHint(g); // 더 이상 없음
  assert.equal(catchmindSnapshot(g).current.hintsShown, 2);
});

test('resetCatchmind: 제출물 유지, 진행/점수 초기화 · clearCatchmind: 전부 삭제', () => {
  const g = withThree();
  startShow(g);
  pickWinner(g, '심판관');
  resetCatchmind(g);
  assert.equal(g.status, 'collecting');
  assert.equal(g.submissions.length, 3);
  assert.deepEqual(g.scores, {});
  assert.equal(g.submissions[0].revealed, false);
  clearCatchmind(g);
  assert.equal(g.submissions.length, 0);
});
