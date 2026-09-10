'use strict';
const crypto = require('node:crypto');

// 숨은그림찾기(숨은 이모지 찾기): 배경 이모지로 가득 찬 격자 속에 숨은 타깃 이모지를
// 모두 탭해서 찾는 게임. 라운드마다 배경/타깃이 바뀐다. 진행자가 시작·다음을 제어.

const GRID_SIZE = 36;         // 6 x 6
const MIN_TARGETS = 4;
const MAX_TARGETS = 6;

// [배경, 타깃] 쌍 — 시각적으로 섞이되 찾을 수 있는 조합
const THEMES = [
  ['🐶', '🐱'], ['🌲', '🍄'], ['⭐', '🌙'], ['🍎', '🍏'],
  ['🐟', '🐠'], ['🌻', '🐝'], ['❄️', '⛄'], ['🚗', '🚕'],
  ['🧦', '🧤'], ['🍩', '🍪'], ['🐸', '🐢'], ['🌸', '🦋'],
];

function randInt(n) {
  return crypto.randomInt(n);
}

function makeRound(bg, target) {
  const count = MIN_TARGETS + randInt(MAX_TARGETS - MIN_TARGETS + 1);
  const cells = Array.from({ length: GRID_SIZE }, () => bg);
  const idxs = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  for (const idx of idxs.slice(0, count)) cells[idx] = target;
  return { bg, target, size: GRID_SIZE, cells };
}

// count개의 라운드를 서로 다른 테마로 생성
function generateRounds(count) {
  const n = Math.max(1, Math.min(THEMES.length, Number(count) || 5));
  const pool = [...THEMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).map(([bg, target]) => makeRound(bg, target));
}

function createHidden() {
  return { rounds: [], participants: [], status: 'idle', currentIndex: -1 };
}

function setRounds(game, rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) throw new Error('ROUNDS_INVALID');
  game.rounds = rounds;
  game.status = 'idle';
  game.currentIndex = -1;
  for (const p of game.participants) { p.score = 0; p.found = {}; }
}

function joinHidden(game, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  const existing = game.participants.find((p) => p.name === trimmed);
  if (existing) return existing;
  const participant = { id: crypto.randomUUID(), name: trimmed, score: 0, found: {} };
  game.participants.push(participant);
  return participant;
}

function startHidden(game) {
  if (game.rounds.length === 0) throw new Error('HIDDEN_NOT_READY');
  game.status = 'playing';
  game.currentIndex = 0;
  return game;
}

function nextRound(game) {
  if (game.status !== 'playing') throw new Error('WRONG_STATE');
  if (game.currentIndex + 1 >= game.rounds.length) {
    game.status = 'finished';
  } else {
    game.currentIndex += 1;
  }
  return game;
}

function targetCellsOf(round) {
  return round.cells.reduce((acc, c, i) => (c === round.target ? (acc.push(i), acc) : acc), []);
}

function tapHidden(game, participantId, cellIndex) {
  if (game.status !== 'playing') throw new Error('WRONG_STATE');
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
  const round = game.rounds[game.currentIndex];
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= round.size) throw new Error('CELL_INVALID');
  const key = String(game.currentIndex);
  const found = p.found[key] || (p.found[key] = []);
  if (round.cells[cellIndex] !== round.target) return { correct: false, alreadyFound: false };
  if (found.includes(cellIndex)) return { correct: true, alreadyFound: true };
  found.push(cellIndex);
  p.score += 1;
  const targetCount = targetCellsOf(round).length;
  return { correct: true, alreadyFound: false, cleared: found.length === targetCount };
}

function resetHidden(game) {
  game.status = 'idle';
  game.currentIndex = -1;
  for (const p of game.participants) { p.score = 0; p.found = {}; }
}

// 참가자만 제거 (라운드는 유지)
function clearHiddenParticipants(game) {
  game.participants = [];
  game.status = 'idle';
  game.currentIndex = -1;
}

function foundCount(p, roundIndex) {
  return (p.found[String(roundIndex)] || []).length;
}

function hiddenSnapshot(game) {
  const active = game.status === 'playing';
  const round = active ? game.rounds[game.currentIndex] : null;
  return {
    status: game.status,
    currentIndex: game.currentIndex,
    totalRounds: game.rounds.length,
    round: round ? {
      target: round.target,
      bg: round.bg,
      size: round.size,
      cells: round.cells,
      targetCount: targetCellsOf(round).length,
    } : null,
    participants: game.participants.map((p) => ({
      name: p.name,
      score: p.score,
      foundInRound: active ? foundCount(p, game.currentIndex) : 0,
    })),
  };
}

function hiddenParticipantView(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) return null;
  const active = game.status === 'playing';
  const round = active ? game.rounds[game.currentIndex] : null;
  return {
    participantId: p.id,
    name: p.name,
    score: p.score,
    status: game.status,
    currentIndex: game.currentIndex,
    totalRounds: game.rounds.length,
    round: round ? { target: round.target, bg: round.bg, size: round.size, cells: round.cells, targetCount: targetCellsOf(round).length } : null,
    found: active ? [...(p.found[String(game.currentIndex)] || [])] : [],
  };
}

module.exports = {
  createHidden, generateRounds, setRounds, joinHidden, startHidden, nextRound,
  tapHidden, resetHidden, clearHiddenParticipants, hiddenSnapshot, hiddenParticipantView,
  GRID_SIZE,
};
