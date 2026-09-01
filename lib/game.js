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
  return { items: [], participants: [] };
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
  };
  game.participants.push(participant);
  return participant;
}

function markCell(game, participantId, cellIndex, on) {
  const participant = game.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= CELLS) throw new Error('CELL_INVALID');
  participant.marked[cellIndex] = Boolean(on);
  return participant;
}

function resetGame(game) {
  game.participants = [];
}

function publicSnapshot(game) {
  return {
    itemsSet: game.items.length === CELLS,
    participants: game.participants.map((p) => ({
      name: p.name,
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
    bingoLines: countBingoLines(p.marked),
  };
}

module.exports = {
  createGame, setItems, joinGame, markCell, resetGame,
  countBingoLines, publicSnapshot, participantView,
};
