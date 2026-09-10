'use strict';
const crypto = require('node:crypto');

const SIZE = 5;
const CELLS = SIZE * SIZE;

const LINES = (() => {
  const lines = [];
  for (let r = 0; r < SIZE; r++) lines.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
  for (let c = 0; c < SIZE; c++) lines.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + i));
  lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)));
  return lines;
})();

function countBingoLines(marked) {
  return LINES.filter((line) => line.every((i) => marked[i])).length;
}

function createGame() {
  return { items: [], participants: [], started: false };
}

function setItems(game, items) {
  if (!Array.isArray(items) || items.length !== CELLS) throw new Error('ITEMS_INVALID');
  const trimmed = items.map((s) => (typeof s === 'string' ? s.trim() : ''));
  if (trimmed.some((s) => s === '')) throw new Error('ITEMS_INVALID');
  game.items = trimmed;
}

function shuffledLayout() {
  const layout = Array.from({ length: CELLS }, (_, i) => i);
  for (let i = layout.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [layout[i], layout[j]] = [layout[j], layout[i]];
  }
  return layout;
}

function joinGame(game, name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('NAME_REQUIRED');
  if (game.items.length !== CELLS) throw new Error('ITEMS_NOT_SET');
  const existing = game.participants.find((p) => p.name === trimmed);
  if (existing) return existing;
  const participant = {
    id: crypto.randomUUID(),
    name: trimmed,
    layout: shuffledLayout(),
    marked: Array(CELLS).fill(false),
    ready: false,
  };
  game.participants.push(participant);
  return participant;
}

// 참가자가 시작 전에 배치를 다시 무작위로 섞는다. 레디 상태에서는 잠긴다.
function reshuffle(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
  if (game.started) throw new Error('ALREADY_STARTED');
  if (p.ready) throw new Error('ALREADY_READY');
  p.layout = shuffledLayout();
  return p;
}

// 참가자 레디 토글. 시작 후에는 변경 불가.
function setReady(game, participantId, ready) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) throw new Error('PARTICIPANT_NOT_FOUND');
  if (game.started) throw new Error('ALREADY_STARTED');
  p.ready = Boolean(ready);
  return p;
}

// 진행자가 게임을 시작한다. 참가자가 한 명도 없으면 거부.
function startGame(game) {
  if (game.participants.length === 0) throw new Error('NO_PARTICIPANTS');
  game.started = true;
  return game;
}

function markCell(game, participantId, cellIndex, on) {
  const participant = game.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
  if (!game.started) throw new Error('NOT_STARTED');
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= CELLS) throw new Error('CELL_INVALID');
  participant.marked[cellIndex] = Boolean(on);
  return participant;
}

function resetGame(game) {
  game.started = false;
  for (const p of game.participants) { p.marked = Array(CELLS).fill(false); p.ready = false; }
}

// 참가자만 제거 (항목은 유지)
function clearBingoParticipants(game) {
  game.participants = [];
  game.started = false;
}

function publicSnapshot(game) {
  return {
    itemsSet: game.items.length === CELLS,
    started: game.started,
    readyCount: game.participants.filter((p) => p.ready).length,
    participants: game.participants.map((p) => ({
      name: p.name,
      ready: p.ready,
      markedCount: p.marked.filter(Boolean).length,
      bingoLines: countBingoLines(p.marked),
    })),
  };
}

function participantView(game, participantId) {
  const p = game.participants.find((x) => x.id === participantId);
  if (!p) return null;
  return {
    participantId: p.id,
    name: p.name,
    cells: p.layout.map((i) => game.items[i]),
    marked: [...p.marked],
    ready: p.ready,
    started: game.started,
    bingoLines: countBingoLines(p.marked),
  };
}

module.exports = {
  createGame, setItems, joinGame, reshuffle, setReady, startGame, markCell, resetGame, clearBingoParticipants,
  countBingoLines, publicSnapshot, participantView,
};
