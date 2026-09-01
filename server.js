'use strict';
const path = require('node:path');
const express = require('express');
const {
  createGame, setItems, joinGame, markCell, resetGame,
  publicSnapshot, participantView,
} = require('./lib/game');
const { loadState, createSaver } = require('./lib/persist');

const ERROR_STATUS = {
  NAME_REQUIRED: 400,
  ITEMS_NOT_SET: 400,
  ITEMS_INVALID: 400,
  CELL_INVALID: 400,
  PARTICIPANT_NOT_FOUND: 404,
};

function createServer({ dataFile, saveDelayMs = 500 }) {
  const game = loadState(dataFile) ?? createGame();
  const save = createSaver(dataFile, saveDelayMs);
  const sseClients = new Set();

  function broadcast() {
    save(game);
    const payload = `data: ${JSON.stringify(publicSnapshot(game))}\n\n`;
    for (const res of sseClients) res.write(payload);
  }

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  function handle(res, fn) {
    try {
      fn();
    } catch (err) {
      const status = ERROR_STATUS[err.message] ?? 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: status === 500 ? 'INTERNAL' : err.message });
    }
  }

  app.post('/api/join', (req, res) => handle(res, () => {
    const p = joinGame(game, req.body?.name);
    broadcast();
    res.json(participantView(game, p.id));
  }));

  app.get('/api/me/:participantId', (req, res) => {
    const view = participantView(game, req.params.participantId);
    if (!view) return res.status(404).json({ error: 'PARTICIPANT_NOT_FOUND' });
    res.json(view);
  });

  app.post('/api/mark', (req, res) => handle(res, () => {
    const { participantId, cellIndex, on } = req.body ?? {};
    const p = markCell(game, participantId, cellIndex, on);
    broadcast();
    res.json(participantView(game, p.id));
  }));

  app.get('/api/state', (_req, res) => res.json(publicSnapshot(game)));

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(publicSnapshot(game))}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  app.post('/api/admin/items', (req, res) => handle(res, () => {
    setItems(game, req.body?.items);
    broadcast();
    res.json({ ok: true });
  }));

  app.post('/api/admin/reset', (_req, res) => handle(res, () => {
    resetGame(game);
    broadcast();
    res.json({ ok: true });
  }));

  return { app, game };
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { app } = createServer({ dataFile: path.join(__dirname, 'data.json') });
  app.listen(port, () => console.log(`빙고 서버 실행 중: http://localhost:${port}`));
}
