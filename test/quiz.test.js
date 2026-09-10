const test = require('node:test');
const assert = require('node:assert');
const {
  createQuiz, setQuestions, joinQuiz, openNext, answerQuestion,
  reveal, resetQuiz, clearQuizParticipants, quizSnapshot, quizParticipantView,
} = require('../lib/quiz');

const QUESTIONS = [
  { text: '우리 회사 창립연도는?', choices: ['2019', '2020', '2021', '2022'], answerIndex: 1 },
  { text: '대표님 MBTI는?', choices: ['ENFP', 'ISTJ'], answerIndex: 0 },
];

function readyQuiz() {
  const quiz = createQuiz();
  setQuestions(quiz, QUESTIONS);
  return quiz;
}

test('setQuestions: 검증 — 빈 배열/보기 부족/정답 인덱스 범위 밖 거부', () => {
  const quiz = createQuiz();
  assert.throws(() => setQuestions(quiz, []), /QUESTIONS_INVALID/);
  assert.throws(() => setQuestions(quiz, [{ text: 'q', choices: ['하나'], answerIndex: 0 }]), /QUESTIONS_INVALID/);
  assert.throws(() => setQuestions(quiz, [{ text: 'q', choices: ['a', 'b', 'c', 'd', 'e'], answerIndex: 0 }]), /QUESTIONS_INVALID/);
  assert.throws(() => setQuestions(quiz, [{ text: 'q', choices: ['a', 'b'], answerIndex: 2 }]), /QUESTIONS_INVALID/);
  assert.throws(() => setQuestions(quiz, [{ text: '  ', choices: ['a', 'b'], answerIndex: 0 }]), /QUESTIONS_INVALID/);
});

test('setQuestions: 등록하면 진행/점수는 초기화, 참가자는 유지', () => {
  const quiz = readyQuiz();
  const p = joinQuiz(quiz, '원');
  openNext(quiz);
  p.score = 50;
  setQuestions(quiz, QUESTIONS);
  assert.equal(quiz.status, 'idle');
  assert.equal(quiz.currentIndex, -1);
  assert.equal(quiz.participants.length, 1);
  assert.equal(quiz.participants[0].score, 0);
});

test('joinQuiz: 빈 이름 거부, 같은 이름은 기존 참가자 반환', () => {
  const quiz = readyQuiz();
  assert.throws(() => joinQuiz(quiz, ' '), /NAME_REQUIRED/);
  const a = joinQuiz(quiz, '원');
  const b = joinQuiz(quiz, ' 원 ');
  assert.equal(a.id, b.id);
  assert.equal(a.score, 0);
});

test('joinQuiz: 문제 등록 전에도 입장 가능 (대기)', () => {
  const quiz = createQuiz();
  const p = joinQuiz(quiz, '원');
  assert.equal(p.name, '원');
});

test('openNext: 문제 없으면 거부, 상태 전이 question→(reveal)→question→finished', () => {
  const empty = createQuiz();
  assert.throws(() => openNext(empty), /QUIZ_NOT_READY/);

  const quiz = readyQuiz();
  openNext(quiz);
  assert.equal(quiz.status, 'question');
  assert.equal(quiz.currentIndex, 0);
  assert.throws(() => openNext(quiz), /WRONG_STATE/); // 공개 전 다음 문제 불가
  reveal(quiz);
  openNext(quiz);
  assert.equal(quiz.currentIndex, 1);
  reveal(quiz);
  openNext(quiz);
  assert.equal(quiz.status, 'finished');
  assert.throws(() => openNext(quiz), /WRONG_STATE/);
});

test('answerQuestion: question 상태에서만, 문제당 1회, 보기 범위 검증', () => {
  const quiz = readyQuiz();
  const p = joinQuiz(quiz, '원');
  assert.throws(() => answerQuestion(quiz, p.id, 0), /WRONG_STATE/); // idle
  openNext(quiz);
  assert.throws(() => answerQuestion(quiz, 'nope', 0), /PARTICIPANT_NOT_FOUND/);
  assert.throws(() => answerQuestion(quiz, p.id, 4), /CHOICE_INVALID/);
  assert.throws(() => answerQuestion(quiz, p.id, -1), /CHOICE_INVALID/);
  assert.throws(() => answerQuestion(quiz, p.id, 0.5), /CHOICE_INVALID/);
  answerQuestion(quiz, p.id, 1);
  assert.throws(() => answerQuestion(quiz, p.id, 2), /ALREADY_ANSWERED/);
  reveal(quiz);
  assert.throws(() => answerQuestion(quiz, p.id, 1), /WRONG_STATE/); // revealed
});

test('reveal: 정답 100점 + 선착순 보너스 30/20/10', () => {
  const quiz = readyQuiz();
  const [a, b, c, d, e] = ['가', '나', '다', '라', '마'].map((n) => joinQuiz(quiz, n));
  openNext(quiz); // 정답 1
  answerQuestion(quiz, a.id, 1); // 정답 1등 → 130
  answerQuestion(quiz, b.id, 0); // 오답 → 0
  answerQuestion(quiz, c.id, 1); // 정답 2등 → 120
  answerQuestion(quiz, d.id, 1); // 정답 3등 → 110
  answerQuestion(quiz, e.id, 1); // 정답 4등 → 100
  reveal(quiz);
  assert.equal(a.score, 130);
  assert.equal(b.score, 0);
  assert.equal(c.score, 120);
  assert.equal(d.score, 110);
  assert.equal(e.score, 100);
  assert.throws(() => reveal(quiz), /WRONG_STATE/); // 이중 공개 불가
});

test('reveal: 점수는 문제마다 누적', () => {
  const quiz = readyQuiz();
  const p = joinQuiz(quiz, '원');
  openNext(quiz);
  answerQuestion(quiz, p.id, 1);
  reveal(quiz);
  openNext(quiz); // 두 번째 문제, 정답 0
  answerQuestion(quiz, p.id, 0);
  reveal(quiz);
  assert.equal(p.score, 260); // 130 + 130
});

test('resetQuiz: 진행/점수 초기화, 참가자·문제 유지', () => {
  const quiz = readyQuiz();
  const p = joinQuiz(quiz, '원');
  openNext(quiz);
  p.score = 30;
  resetQuiz(quiz);
  assert.equal(quiz.status, 'idle');
  assert.equal(quiz.currentIndex, -1);
  assert.equal(quiz.participants.length, 1);
  assert.equal(quiz.participants[0].score, 0);
  assert.equal(quiz.questions.length, 2);
});

test('clearQuizParticipants: 참가자만 제거, 문제 유지', () => {
  const quiz = readyQuiz();
  joinQuiz(quiz, '원');
  clearQuizParticipants(quiz);
  assert.equal(quiz.participants.length, 0);
  assert.equal(quiz.questions.length, 2);
});

test('quizSnapshot: question 상태에서 answerIndex 미노출', () => {
  const quiz = readyQuiz();
  const p = joinQuiz(quiz, '원');
  let snap = quizSnapshot(quiz);
  assert.equal(snap.status, 'idle');
  assert.equal(snap.question, null);
  assert.equal(snap.totalQuestions, 2);

  openNext(quiz);
  answerQuestion(quiz, p.id, 1);
  snap = quizSnapshot(quiz);
  assert.equal(snap.status, 'question');
  assert.equal(snap.question.text, QUESTIONS[0].text);
  assert.deepEqual(snap.question.choices, QUESTIONS[0].choices);
  assert.equal('answerIndex' in snap.question, false);
  assert.equal(snap.answeredCount, 1);
  assert.deepEqual(snap.participants, [{ name: '원', score: 0, answered: true }]);
});

test('quizSnapshot: revealed 상태에서 answerIndex + 보기별 응답 수 노출', () => {
  const quiz = readyQuiz();
  const a = joinQuiz(quiz, '가');
  const b = joinQuiz(quiz, '나');
  openNext(quiz);
  answerQuestion(quiz, a.id, 1);
  answerQuestion(quiz, b.id, 0);
  reveal(quiz);
  const snap = quizSnapshot(quiz);
  assert.equal(snap.question.answerIndex, 1);
  assert.deepEqual(snap.question.counts, [1, 1, 0, 0]);
  assert.equal(snap.participants.find((x) => x.name === '가').score, 130);
});

test('quizParticipantView: 현재 문제에 대한 내 답 복원', () => {
  const quiz = readyQuiz();
  const p = joinQuiz(quiz, '원');
  assert.equal(quizParticipantView(quiz, 'nope'), null);
  let view = quizParticipantView(quiz, p.id);
  assert.equal(view.answeredChoice, null);
  openNext(quiz);
  answerQuestion(quiz, p.id, 2);
  view = quizParticipantView(quiz, p.id);
  assert.equal(view.participantId, p.id);
  assert.equal(view.name, '원');
  assert.equal(view.answeredChoice, 2);
  assert.equal(view.score, 0);
});
