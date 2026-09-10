'use strict';
const crypto = require('node:crypto');

const MIN_CHOICES = 2;
const MAX_CHOICES = 4;
const CORRECT_SCORE = 100;
const SPEED_BONUS = [30, 20, 10];

function createQuiz() {
  return { questions: [], status: 'idle', currentIndex: -1, participants: [], timerSec: 15, questionStart: 0 };
}

function validQuestion(q) {
  return (
    q && typeof q.text === 'string' && q.text.trim() !== '' &&
    Array.isArray(q.choices) &&
    q.choices.length >= MIN_CHOICES && q.choices.length <= MAX_CHOICES &&
    q.choices.every((c) => typeof c === 'string' && c.trim() !== '') &&
    Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.choices.length
  );
}

function setQuestions(quiz, questions) {
  if (!Array.isArray(questions) || questions.length === 0 || !questions.every(validQuestion)) {
    throw new Error('QUESTIONS_INVALID');
  }
  quiz.questions = questions.map((q) => ({
    text: q.text.trim(),
    choices: q.choices.map((c) => c.trim()),
    answerIndex: q.answerIndex,
  }));
  quiz.status = 'idle';
  quiz.currentIndex = -1;
  for (const p of quiz.participants) { p.score = 0; p.answers = {}; }
}

function joinQuiz(quiz, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  const existing = quiz.participants.find((p) => p.name === trimmed);
  if (existing) return existing;
  const participant = { id: crypto.randomUUID(), name: trimmed, score: 0, answers: {} };
  quiz.participants.push(participant);
  return participant;
}

function openNext(quiz) {
  if (quiz.questions.length === 0) throw new Error('QUIZ_NOT_READY');
  if (quiz.status !== 'idle' && quiz.status !== 'revealed') throw new Error('WRONG_STATE');
  quiz.currentIndex += 1;
  quiz.status = quiz.currentIndex >= quiz.questions.length ? 'finished' : 'question';
  if (quiz.status === 'question') quiz.questionStart = Date.now();
}

function answerQuestion(quiz, participantId, choiceIndex) {
  if (quiz.status !== 'question') throw new Error('WRONG_STATE');
  if (Date.now() > quiz.questionStart + (quiz.timerSec || 15) * 1000) throw new Error('TIME_UP');
  const participant = quiz.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
  const question = quiz.questions[quiz.currentIndex];
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= question.choices.length) {
    throw new Error('CHOICE_INVALID');
  }
  if (participant.answers[quiz.currentIndex]) throw new Error('ALREADY_ANSWERED');
  const order = quiz.participants.filter((p) => p.answers[quiz.currentIndex]).length;
  participant.answers[quiz.currentIndex] = { choiceIndex, order };
  return participant;
}

function setQuizTimer(quiz, seconds) {
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n) || n < 3 || n > 120) throw new Error('TIMER_INVALID');
  quiz.timerSec = n;
}

function reveal(quiz) {
  if (quiz.status !== 'question') throw new Error('WRONG_STATE');
  const question = quiz.questions[quiz.currentIndex];
  const correct = quiz.participants
    .filter((p) => p.answers[quiz.currentIndex]?.choiceIndex === question.answerIndex)
    .sort((a, b) => a.answers[quiz.currentIndex].order - b.answers[quiz.currentIndex].order);
  correct.forEach((p, rank) => {
    p.score += CORRECT_SCORE + (SPEED_BONUS[rank] ?? 0);
  });
  quiz.status = 'revealed';
}

function resetQuiz(quiz) {
  quiz.status = 'idle';
  quiz.currentIndex = -1;
  for (const p of quiz.participants) { p.score = 0; p.answers = {}; }
}

// 참가자만 제거 (문제는 유지)
function clearQuizParticipants(quiz) {
  quiz.status = 'idle';
  quiz.currentIndex = -1;
  quiz.participants = [];
}

function quizSnapshot(quiz) {
  const current = quiz.status === 'question' || quiz.status === 'revealed'
    ? quiz.questions[quiz.currentIndex]
    : null;
  let question = null;
  if (current) {
    question = { text: current.text, choices: current.choices };
    if (quiz.status === 'revealed') {
      question.answerIndex = current.answerIndex;
      question.counts = current.choices.map((_, choice) =>
        quiz.participants.filter((p) => p.answers[quiz.currentIndex]?.choiceIndex === choice).length);
    }
  }
  return {
    status: quiz.status,
    currentIndex: quiz.currentIndex,
    totalQuestions: quiz.questions.length,
    timerSec: quiz.timerSec || 15,
    deadline: quiz.status === 'question' ? quiz.questionStart + (quiz.timerSec || 15) * 1000 : null,
    now: Date.now(),
    question,
    answeredCount: current
      ? quiz.participants.filter((p) => p.answers[quiz.currentIndex]).length
      : 0,
    participants: quiz.participants.map((p) => ({
      name: p.name,
      score: p.score,
      answered: current ? Boolean(p.answers[quiz.currentIndex]) : false,
    })),
  };
}

function quizParticipantView(quiz, participantId) {
  const p = quiz.participants.find((x) => x.id === participantId);
  if (!p) return null;
  const inQuestion = quiz.status === 'question' || quiz.status === 'revealed';
  return {
    participantId: p.id,
    name: p.name,
    score: p.score,
    answeredChoice: inQuestion ? (p.answers[quiz.currentIndex]?.choiceIndex ?? null) : null,
  };
}

module.exports = {
  createQuiz, setQuestions, joinQuiz, openNext, answerQuestion,
  reveal, resetQuiz, clearQuizParticipants, setQuizTimer, quizSnapshot, quizParticipantView,
};
