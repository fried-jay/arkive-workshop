'use strict';
const crypto = require('node:crypto');

// 숨은그림찾기(순발력): 배경 이모지로 가득 찬 NxN 격자 속 숨은 타깃 이모지를 모두 탭.
// 라운드가 진행될수록 격자가 한 단계씩 커진다(5x5 → 6x6 → 7x7 → 8x8). 타깃 수 = 격자 한 변.

const DIMS = [5, 6, 7, 8];      // 라운드별 격자 한 변 (다음 라운드마다 +1, 8에서 상한)
const MAX_DIM = 8;

// 점수: 타깃을 모두 찾은(클리어) 순서로만 득점. 1등 100 / 2등 70 / 3등 50 / 이후 30.
// 1등이 나오면 ROUND_END_DELAY_MS 뒤 라운드가 자동 종료된다(그 사이 2~3등 가능).
const CLEAR_POINTS = [100, 70, 50];
const LATE_CLEAR_POINTS = 30;
const ROUND_END_DELAY_MS = 5000;

// [배경, 타깃] 쌍 — 시각적으로 섞이되 찾을 수 있는 조합
const THEMES = [
  ['🐶', '🐱'], ['🌲', '🍄'], ['⭐', '🌙'], ['🍎', '🍏'],
  ['🐟', '🐠'], ['🌻', '🐝'], ['❄️', '⛄'], ['🚗', '🚕'],
  ['🧦', '🧤'], ['🍩', '🍪'], ['🐸', '🐢'], ['🌸', '🦋'],
];

function randInt(n) {
  return crypto.randomInt(n);
}

function makeRound(bg, target, dim) {
  const total = dim * dim;
  const targetCount = dim;                 // 정답 수 = 격자 한 변 (5,6,7,8)
  const cells = Array.from({ length: total }, () => bg);
  const idxs = Array.from({ length: total }, (_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  for (const idx of idxs.slice(0, targetCount)) cells[idx] = target;
  return { bg, target, dim, size: total, cells };
}

// count개의 라운드 생성 — 격자가 5,6,7,8… 단계로 커진다(8 상한).
function generateRounds(count) {
  const n = Math.max(1, Math.min(THEMES.length, Number(count) || DIMS.length));
  const pool = [...THEMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: n }, (_, i) => {
    const dim = Math.min(DIMS[0] + i, MAX_DIM);
    const [bg, target] = pool[i % pool.length];
    return makeRound(bg, target, dim);
  });
}

function createHidden() {
  return { rounds: [], participants: [], status: 'idle', currentIndex: -1, clears: {}, roundEndsAt: null };
}

// 라운드별 클리어 순서(참가자 id 배열). 구버전 저장 상태에는 clears가 없을 수 있다.
function clearsOf(game, roundIndex) {
  if (!game.clears) game.clears = {};
  const key = String(roundIndex);
  return game.clears[key] || (game.clears[key] = []);
}

function resetProgress(game) {
  game.status = 'idle';
  game.currentIndex = -1;
  game.clears = {};
  game.roundEndsAt = null;
}

function setRounds(game, rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) throw new Error('ROUNDS_INVALID');
  game.rounds = rounds;
  resetProgress(game);
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
  game.clears = {};
  game.roundEndsAt = null;
  return game;
}

function nextRound(game) {
  if (game.status !== 'playing') throw new Error('WRONG_STATE');
  game.roundEndsAt = null;
  if (game.currentIndex + 1 >= game.rounds.length) {
    game.status = 'finished';
  } else {
    game.currentIndex += 1;
  }
  return game;
}

// 1등 이후 예약된 종료 시각이 지났으면 다음 라운드로. 넘겼으면 true.
function finishRoundIfDue(game, now = Date.now()) {
  if (game.status !== 'playing' || !game.roundEndsAt || now < game.roundEndsAt) return false;
  nextRound(game);
  return true;
}

function targetCellsOf(round) {
  return round.cells.reduce((acc, c, i) => (c === round.target ? (acc.push(i), acc) : acc), []);
}

function tapHidden(game, participantId, cellIndex, now = Date.now(), roundEndDelayMs = ROUND_END_DELAY_MS) {
  if (game.status !== 'playing') throw new Error('WRONG_STATE');
  if (game.roundEndsAt && now >= game.roundEndsAt) throw new Error('ROUND_OVER');
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
  const round = game.rounds[game.currentIndex];
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= round.size) throw new Error('CELL_INVALID');
  const key = String(game.currentIndex);
  const found = p.found[key] || (p.found[key] = []);
  if (round.cells[cellIndex] !== round.target) return { correct: false, alreadyFound: false, cleared: false };
  if (found.includes(cellIndex)) return { correct: true, alreadyFound: true, cleared: false };
  found.push(cellIndex);
  if (found.length < targetCellsOf(round).length) return { correct: true, alreadyFound: false, cleared: false };

  // 클리어: 순서대로 득점, 1등이면 라운드 종료 예약
  const clears = clearsOf(game, game.currentIndex);
  clears.push(p.id);
  const rank = clears.length;
  const points = CLEAR_POINTS[rank - 1] ?? LATE_CLEAR_POINTS;
  p.score += points;
  if (rank === 1) game.roundEndsAt = now + roundEndDelayMs;
  return { correct: true, alreadyFound: false, cleared: true, rank, points };
}

function resetHidden(game) {
  resetProgress(game);
  for (const p of game.participants) { p.score = 0; p.found = {}; }
}

// 참가자만 제거 (라운드는 유지)
function clearHiddenParticipants(game) {
  game.participants = [];
  resetProgress(game);
}

function foundCount(p, roundIndex) {
  return (p.found[String(roundIndex)] || []).length;
}

function clearRankOf(game, p, roundIndex) {
  const i = clearsOf(game, roundIndex).indexOf(p.id);
  return i === -1 ? null : i + 1;
}

function nameOf(game, id) {
  const p = game.participants.find((x) => x.id === id);
  return p ? p.name : '?';
}

function roundView(game, round) {
  const clears = clearsOf(game, game.currentIndex).map((id) => nameOf(game, id));
  return {
    target: round.target,
    bg: round.bg,
    dim: round.dim,
    size: round.size,
    cells: round.cells,
    targetCount: targetCellsOf(round).length,
    clears,
    firstClear: clears[0] ?? null,
  };
}

function hiddenSnapshot(game) {
  const active = game.status === 'playing';
  const round = active ? game.rounds[game.currentIndex] : null;
  return {
    status: game.status,
    currentIndex: game.currentIndex,
    totalRounds: game.rounds.length,
    round: round ? roundView(game, round) : null,
    roundEndsAt: active ? game.roundEndsAt ?? null : null,
    now: Date.now(),
    participants: game.participants.map((p) => ({
      name: p.name,
      score: p.score,
      foundInRound: active ? foundCount(p, game.currentIndex) : 0,
      clearRank: active ? clearRankOf(game, p, game.currentIndex) : null,
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
    round: round ? roundView(game, round) : null,
    roundEndsAt: active ? game.roundEndsAt ?? null : null,
    now: Date.now(),
    found: active ? [...(p.found[String(game.currentIndex)] || [])] : [],
    clearRank: active ? clearRankOf(game, p, game.currentIndex) : null,
  };
}

module.exports = {
  createHidden, generateRounds, setRounds, joinHidden, startHidden, nextRound,
  tapHidden, finishRoundIfDue, resetHidden, clearHiddenParticipants, hiddenSnapshot, hiddenParticipantView,
  DIMS, CLEAR_POINTS, LATE_CLEAR_POINTS, ROUND_END_DELAY_MS,
};
