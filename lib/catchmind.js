'use strict';
const crypto = require('node:crypto');

const CORRECT_SCORE = 100;
const DRAWER_SCORE = 50;
const MAX_GUESS_FEED = 8;
const MAX_STROKES = 2000;
const MAX_POINTS_PER_STROKE = 500;

// 진행자가 참가자 한 명에게 그리기 링크(key)를 발급 → 그 사람이 그림+정답 제출 →
// 나머지가 텍스트로 맞추는 게임. 그림은 제출 시 한 번에 공개 (실시간 중계 없음).
function createCatchmind() {
  return {
    participants: [],   // [{id, name, score}]
    status: 'idle',     // idle → waiting(그리는 중) → guessing ⇄ revealed
    drawerId: null,
    drawKey: null,      // 그리기 링크 토큰 (스냅샷 미노출)
    strokes: [],
    word: null,
    guesses: [],
    winnerName: null,
    roundCount: 0,
  };
}

function joinCatchmind(game, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  const existing = game.participants.find((p) => p.name === trimmed);
  if (existing) return existing;
  const participant = { id: crypto.randomUUID(), name: trimmed, score: 0 };
  game.participants.push(participant);
  return participant;
}

// 링크 발급. 그리는 사람이 잠수일 때를 대비해 waiting 중 재발급(교체) 허용.
function assignDrawer(game, participantId) {
  if (game.status === 'guessing') throw new Error('WRONG_STATE');
  const participant = game.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
  game.drawerId = participant.id;
  game.drawKey = crypto.randomBytes(12).toString('hex');
  game.strokes = [];
  game.word = null;
  game.guesses = [];
  game.winnerName = null;
  game.status = 'waiting';
  return game.drawKey;
}

function drawerByKey(game, key) {
  if (!key || key !== game.drawKey) return null;
  return game.participants.find((p) => p.id === game.drawerId) ?? null;
}

function validStroke(s) {
  return s && Array.isArray(s.points) && s.points.length > 0 &&
    s.points.length <= MAX_POINTS_PER_STROKE &&
    s.points.every((pt) => Array.isArray(pt) && pt.length === 2 &&
      pt.every((n) => typeof n === 'number' && n >= 0 && n <= 1)) &&
    typeof s.c === 'string' && s.c.length <= 20 &&
    typeof s.w === 'number' && s.w > 0 && s.w <= 40;
}

function submitDrawing(game, key, strokes, word) {
  if (game.status !== 'waiting') throw new Error('WRONG_STATE');
  if (!drawerByKey(game, key)) throw new Error('DRAW_KEY_INVALID');
  const trimmedWord = typeof word === 'string' ? word.trim() : '';
  if (!trimmedWord) throw new Error('WORD_REQUIRED');
  if (!Array.isArray(strokes) || strokes.length === 0 ||
    strokes.length > MAX_STROKES || !strokes.every(validStroke)) {
    throw new Error('STROKE_INVALID');
  }
  game.strokes = strokes;
  game.word = trimmedWord;
  game.roundCount += 1;
  game.status = 'guessing';
}

function normalize(text) {
  return text.replace(/\s+/g, '').toLowerCase();
}

function submitGuess(game, participantId, text) {
  if (game.status !== 'guessing') throw new Error('WRONG_STATE');
  const participant = game.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
  if (participant.id === game.drawerId) throw new Error('OWN_DRAW');
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) throw new Error('GUESS_REQUIRED');
  if (normalize(trimmed) === normalize(game.word)) {
    participant.score += CORRECT_SCORE;
    const drawer = game.participants.find((p) => p.id === game.drawerId);
    if (drawer) drawer.score += DRAWER_SCORE;
    game.winnerName = participant.name;
    game.status = 'revealed';
    return { correct: true };
  }
  game.guesses.push({ name: participant.name, text: trimmed });
  if (game.guesses.length > MAX_GUESS_FEED) game.guesses.shift();
  return { correct: false };
}

// 아무도 못 맞힐 때 진행자가 스킵 (점수 없음)
function revealRound(game) {
  if (game.status !== 'guessing') throw new Error('WRONG_STATE');
  game.status = 'revealed';
}

function resetCatchmind(game) {
  Object.assign(game, createCatchmind());
}

function catchmindSnapshot(game) {
  const done = game.status === 'revealed';
  return {
    status: game.status,
    roundCount: game.roundCount,
    drawerName: game.participants.find((p) => p.id === game.drawerId)?.name ?? null,
    word: done ? game.word : null,
    winnerName: game.winnerName,
    guesses: [...game.guesses],
    participants: game.participants.map((p) => ({
      name: p.name,
      score: p.score,
      isDrawer: p.id === game.drawerId,
    })),
  };
}

function catchmindParticipantView(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) return null;
  return {
    participantId: p.id,
    name: p.name,
    score: p.score,
    isDrawer: p.id === game.drawerId,
  };
}

module.exports = {
  createCatchmind, joinCatchmind, assignDrawer, drawerByKey, submitDrawing,
  submitGuess, revealRound, resetCatchmind, catchmindSnapshot, catchmindParticipantView,
};
