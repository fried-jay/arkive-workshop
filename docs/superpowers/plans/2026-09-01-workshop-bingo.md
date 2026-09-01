# 워크숍 빙고 웹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사내 워크숍용 5x5 빙고 웹 — 참가자는 폰으로 이름만 입력해 자기 판을 칠하고, 대시보드가 전원의 진행 상황(칠한 칸 수·빙고 줄 수)을 실시간으로 보여준다.

**Architecture:** Express 단일 프로세스가 정적 프론트(바닐라 JS, 빌드 없음)를 서빙하고 JSON API + SSE로 상태를 푸시한다. 게임 로직은 순수 함수 모듈(`lib/game.js`)로 분리해 `node --test`로 테스트하고, 상태는 인메모리 + `data.json` 디바운스 저장.

**Tech Stack:** Node.js 18+ (node:test, 내장 fetch), Express(유일한 의존성), 바닐라 HTML/CSS/JS, SSE.

**Spec:** `docs/superpowers/specs/2026-09-01-workshop-bingo-design.md`

## Global Constraints

- 런타임: Node.js 18+ (`node:test`, 내장 `fetch`, `crypto.randomUUID` 사용 가능해야 함)
- npm 의존성은 `express` 하나만. devDependency도 추가하지 않는다.
- 프론트는 빌드 스텝 없음 — `public/` 정적 파일 그대로 서빙.
- 빙고판은 5x5 고정, 항목 25개, 빙고 줄 = 가로5+세로5+대각2 = 12줄.
- UI 문구는 한국어.
- 인증 없음(사내용). 참가자 신원은 localStorage의 participantId.
- 상태 파일은 `data.json` (레포 루트, gitignore 대상).
- 테스트 실행: `npm test` (= `node --test test/`).

---

### Task 1: 프로젝트 스캐폴드 + 게임 로직 (`lib/game.js`)

**Files:**
- Create: `package.json`, `.gitignore`
- Create: `lib/game.js`
- Test: `test/game.test.js`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces (이후 태스크가 그대로 사용하는 시그니처):
  - `createGame() -> {items: string[], participants: Participant[]}`
  - `setItems(game, items: string[25]) -> void` — 검증 실패 시 `Error('ITEMS_INVALID')` throw
  - `joinGame(game, name: string) -> Participant` — `Error('NAME_REQUIRED')`, `Error('ITEMS_NOT_SET')` throw. 같은 이름(trim 기준)이 이미 있으면 그 참가자를 반환(재접속 취급)
  - `markCell(game, participantId, cellIndex, on: boolean) -> Participant` — `Error('PARTICIPANT_NOT_FOUND')`, `Error('CELL_INVALID')` throw
  - `resetGame(game) -> void` — participants 비움 (items는 유지)
  - `countBingoLines(marked: boolean[25]) -> number`
  - `publicSnapshot(game) -> {itemsSet: boolean, participants: [{name, markedCount, bingoLines}]}`
  - `participantView(game, participantId) -> {participantId, name, cells: string[25], marked: boolean[25], bingoLines} | null`
  - `Participant = {id: string, name: string, layout: number[25], marked: boolean[25]}`

- [ ] **Step 1: 스캐폴드 작성**

`package.json`:

```json
{
  "name": "arkive-workshop",
  "private": true,
  "version": "1.0.0",
  "description": "사내 워크숍 게임 웹 (빙고)",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/"
  }
}
```

`.gitignore`:

```
node_modules/
data.json
```

Run: `npm install express`
Expected: `express`가 dependencies에 추가됨.

- [ ] **Step 2: 실패하는 테스트 작성**

`test/game.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  createGame, setItems, joinGame, markCell, resetGame,
  countBingoLines, publicSnapshot, participantView,
} = require('../lib/game');

const ITEMS = Array.from({ length: 25 }, (_, i) => `항목${i + 1}`);

function gameWithItems() {
  const game = createGame();
  setItems(game, ITEMS);
  return game;
}

test('countBingoLines: 아무것도 안 칠하면 0줄', () => {
  assert.equal(countBingoLines(Array(25).fill(false)), 0);
});

test('countBingoLines: 첫 가로줄', () => {
  const marked = Array(25).fill(false);
  for (let c = 0; c < 5; c++) marked[c] = true;
  assert.equal(countBingoLines(marked), 1);
});

test('countBingoLines: 세로줄', () => {
  const marked = Array(25).fill(false);
  for (let r = 0; r < 5; r++) marked[r * 5 + 2] = true;
  assert.equal(countBingoLines(marked), 1);
});

test('countBingoLines: 대각선 2개', () => {
  const marked = Array(25).fill(false);
  for (const i of [0, 6, 12, 18, 24]) marked[i] = true;
  for (const i of [4, 8, 16, 20]) marked[i] = true; // 12는 이미 true
  assert.equal(countBingoLines(marked), 2);
});

test('countBingoLines: 전부 칠하면 12줄', () => {
  assert.equal(countBingoLines(Array(25).fill(true)), 12);
});

test('setItems: 25개 아니면 거부', () => {
  const game = createGame();
  assert.throws(() => setItems(game, ['a', 'b']), /ITEMS_INVALID/);
});

test('setItems: 빈 문자열 항목 거부', () => {
  const game = createGame();
  const bad = [...ITEMS.slice(0, 24), '   '];
  assert.throws(() => setItems(game, bad), /ITEMS_INVALID/);
});

test('setItems: 항목 trim 저장', () => {
  const game = createGame();
  setItems(game, ITEMS.map((s) => `  ${s}  `));
  assert.deepEqual(game.items, ITEMS);
});

test('joinGame: 항목 설정 전에는 입장 불가', () => {
  const game = createGame();
  assert.throws(() => joinGame(game, '원'), /ITEMS_NOT_SET/);
});

test('joinGame: 빈 이름 거부', () => {
  const game = gameWithItems();
  assert.throws(() => joinGame(game, '  '), /NAME_REQUIRED/);
});

test('joinGame: layout은 0..24의 순열', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  assert.equal(p.layout.length, 25);
  assert.deepEqual([...p.layout].sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
  assert.deepEqual(p.marked, Array(25).fill(false));
  assert.ok(p.id.length > 0);
});

test('joinGame: 같은 이름으로 다시 join하면 기존 참가자 반환', () => {
  const game = gameWithItems();
  const a = joinGame(game, '원');
  const b = joinGame(game, ' 원 ');
  assert.equal(a.id, b.id);
  assert.equal(game.participants.length, 1);
});

test('markCell: 칠하기/해제', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  markCell(game, p.id, 3, true);
  assert.equal(p.marked[3], true);
  markCell(game, p.id, 3, false);
  assert.equal(p.marked[3], false);
});

test('markCell: 없는 참가자/잘못된 칸 거부', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  assert.throws(() => markCell(game, 'nope', 0, true), /PARTICIPANT_NOT_FOUND/);
  assert.throws(() => markCell(game, p.id, 25, true), /CELL_INVALID/);
  assert.throws(() => markCell(game, p.id, -1, true), /CELL_INVALID/);
  assert.throws(() => markCell(game, p.id, 1.5, true), /CELL_INVALID/);
});

test('resetGame: 참가자만 비우고 items 유지', () => {
  const game = gameWithItems();
  joinGame(game, '원');
  resetGame(game);
  assert.equal(game.participants.length, 0);
  assert.equal(game.items.length, 25);
});

test('publicSnapshot: 이름/칸수/줄수만 노출 (id 없음)', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  for (let c = 0; c < 5; c++) markCell(game, p.id, c, true);
  const snap = publicSnapshot(game);
  assert.equal(snap.itemsSet, true);
  assert.deepEqual(snap.participants, [{ name: '원', markedCount: 5, bingoLines: countBingoLines(p.marked) }]);
  assert.equal('id' in snap.participants[0], false);
});

test('participantView: 자기 판 복원', () => {
  const game = gameWithItems();
  const p = joinGame(game, '원');
  markCell(game, p.id, 0, true);
  const view = participantView(game, p.id);
  assert.equal(view.name, '원');
  assert.equal(view.cells.length, 25);
  assert.equal(view.cells[0], ITEMS[p.layout[0]]);
  assert.equal(view.marked[0], true);
  assert.equal(typeof view.bingoLines, 'number');
  assert.equal(participantView(game, 'nope'), null);
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/game'`

- [ ] **Step 4: 최소 구현 작성**

`lib/game.js`:

```js
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (전체 통과)

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json .gitignore lib/game.js test/game.test.js
git commit -m "feat: 빙고 게임 로직 + 프로젝트 스캐폴드"
```

---

### Task 2: 상태 영속화 (`lib/persist.js`)

**Files:**
- Create: `lib/persist.js`
- Test: `test/persist.test.js`

**Interfaces:**
- Consumes: game 객체 형태 `{items, participants}` (Task 1)
- Produces:
  - `loadState(filePath) -> game | null` — 파일 없거나 파싱 실패 시 null
  - `createSaver(filePath, delayMs = 500) -> (game) => void` — 디바운스된 저장 함수. 마지막 호출 후 delayMs 뒤에 JSON으로 기록

- [ ] **Step 1: 실패하는 테스트 작성**

`test/persist.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { loadState, createSaver } = require('../lib/persist');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-')), 'data.json');
}

test('loadState: 파일 없으면 null', () => {
  assert.equal(loadState(tmpFile()), null);
});

test('loadState: 깨진 JSON이면 null', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{broken');
  assert.equal(loadState(file), null);
});

test('createSaver: 디바운스 후 저장, loadState로 복원', async () => {
  const file = tmpFile();
  const save = createSaver(file, 50);
  const game = { items: ['a'], participants: [{ id: 'x', name: '원', layout: [0], marked: [true] }] };
  save(game);
  save(game); // 디바운스 — 마지막 호출 기준
  assert.equal(fs.existsSync(file), false);
  await sleep(150);
  assert.deepEqual(loadState(file), game);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/persist'` (game 테스트는 계속 PASS)

- [ ] **Step 3: 최소 구현 작성**

`lib/persist.js`:

```js
'use strict';
const fs = require('node:fs');

function loadState(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function createSaver(filePath, delayMs = 500) {
  let timer = null;
  return (game) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.writeFileSync(filePath, JSON.stringify(game));
      } catch (err) {
        console.error('상태 저장 실패:', err.message);
      }
    }, delayMs);
    timer.unref?.();
  };
}

module.exports = { loadState, createSaver };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/persist.js test/persist.test.js
git commit -m "feat: data.json 디바운스 영속화"
```

---

### Task 3: HTTP 서버 + API + SSE (`server.js`)

**Files:**
- Create: `server.js`
- Create: `public/.gitkeep` (정적 디렉토리 자리, Task 4에서 실제 파일로 대체)
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: Task 1의 game 함수 전부, Task 2의 `loadState`/`createSaver`
- Produces:
  - `createServer({ dataFile }) -> { app, game }` — Express app (listen 전 상태). 테스트에서 `app.listen(0)`으로 임의 포트 사용
  - HTTP API (프론트 태스크가 사용):
    - `POST /api/join` body `{name}` → 200 `{participantId, name, cells, marked, bingoLines}` / 400 `{error}`
    - `GET /api/me/:participantId` → 200 동일 형태 / 404 `{error: 'PARTICIPANT_NOT_FOUND'}`
    - `POST /api/mark` body `{participantId, cellIndex, on}` → 200 동일 형태 / 400·404 `{error}`
    - `GET /api/state` → 200 `publicSnapshot`
    - `GET /api/events` → SSE. 연결 즉시 + 상태 변경마다 `data: <publicSnapshot JSON>\n\n`
    - `POST /api/admin/items` body `{items: string[25]}` → 200 `{ok: true}` / 400
    - `POST /api/admin/reset` → 200 `{ok: true}`
  - 직접 실행 시(`require.main === module`) PORT(기본 3000)에서 listen, `data.json` 로드/저장 연결

- [ ] **Step 1: 실패하는 테스트 작성**

`test/server.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

const ITEMS = Array.from({ length: 25 }, (_, i) => `항목${i + 1}`);

function startServer() {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-srv-')), 'data.json');
  const { app } = createServer({ dataFile });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

async function post(base, url, body) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

test('전체 흐름: items 설정 → join → mark → state', async (t) => {
  const { server, base } = startServer();
  t.after(() => server.close());

  // items 설정 전 join 거부
  let res = await post(base, '/api/join', { name: '원' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'ITEMS_NOT_SET');

  // 항목 검증
  res = await post(base, '/api/admin/items', { items: ['하나'] });
  assert.equal(res.status, 400);
  res = await post(base, '/api/admin/items', { items: ITEMS });
  assert.equal(res.status, 200);

  // join
  res = await post(base, '/api/join', { name: '원' });
  assert.equal(res.status, 200);
  const { participantId, cells, marked } = res.body;
  assert.equal(cells.length, 25);
  assert.equal(marked.every((m) => m === false), true);

  // 빈 이름 거부
  res = await post(base, '/api/join', { name: '  ' });
  assert.equal(res.status, 400);

  // mark
  res = await post(base, '/api/mark', { participantId, cellIndex: 0, on: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.marked[0], true);

  res = await post(base, '/api/mark', { participantId: 'nope', cellIndex: 0, on: true });
  assert.equal(res.status, 404);
  res = await post(base, '/api/mark', { participantId, cellIndex: 99, on: true });
  assert.equal(res.status, 400);

  // me 복원
  let getRes = await fetch(`${base}/api/me/${participantId}`);
  assert.equal(getRes.status, 200);
  assert.equal((await getRes.json()).marked[0], true);
  getRes = await fetch(`${base}/api/me/nope`);
  assert.equal(getRes.status, 404);

  // state 스냅샷
  getRes = await fetch(`${base}/api/state`);
  const snap = await getRes.json();
  assert.equal(snap.itemsSet, true);
  assert.deepEqual(snap.participants[0], { name: '원', markedCount: 1, bingoLines: 0 });

  // reset
  res = await post(base, '/api/admin/reset');
  assert.equal(res.status, 200);
  getRes = await fetch(`${base}/api/state`);
  assert.equal((await getRes.json()).participants.length, 0);
});

test('SSE: 연결 즉시 스냅샷 push', async (t) => {
  const { server, base } = startServer();
  t.after(() => server.close());
  await post(base, '/api/admin/items', { items: ITEMS });

  const res = await fetch(`${base}/api/events`);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /^data: /);
  const snap = JSON.parse(text.replace(/^data: /, '').trim());
  assert.equal(snap.itemsSet, true);
  await reader.cancel();
});

test('영속화: 저장된 상태를 재시작 시 로드', async (t) => {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-srv-')), 'data.json');
  const first = createServer({ dataFile, saveDelayMs: 10 });
  const server1 = first.app.listen(0);
  const base1 = `http://127.0.0.1:${server1.address().port}`;
  await post(base1, '/api/admin/items', { items: ITEMS });
  const joinRes = await post(base1, '/api/join', { name: '원' });
  await new Promise((r) => setTimeout(r, 100)); // 디바운스 저장 대기
  server1.close();

  const second = createServer({ dataFile });
  const server2 = second.app.listen(0);
  t.after(() => server2.close());
  const base2 = `http://127.0.0.1:${server2.address().port}`;
  const meRes = await fetch(`${base2}/api/me/${joinRes.body.participantId}`);
  assert.equal(meRes.status, 200);
  assert.equal((await meRes.json()).name, '원');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../server'`

- [ ] **Step 3: 최소 구현 작성**

`server.js`:

```js
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
```

`public/.gitkeep`: 빈 파일.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (game/persist/server 전부)

- [ ] **Step 5: 커밋**

```bash
git add server.js public/.gitkeep test/server.test.js
git commit -m "feat: Express API + SSE 서버"
```

---

### Task 4: 참가자 화면 (`/bingo`) + 공용 스타일

**Files:**
- Create: `public/style.css`, `public/bingo.html`, `public/bingo.js`
- Delete: `public/.gitkeep`
- Test: `test/pages.test.js` (정적 페이지 서빙 스모크 테스트) — 이 태스크에서는 bingo.html만 검사, Task 5·6에서 항목 추가

**Interfaces:**
- Consumes: Task 3의 `/api/join`, `/api/me/:id`, `/api/mark`
- Produces: `public/style.css`의 CSS 변수와 `.card`, `.btn` 클래스 (Task 5·6 페이지가 재사용)

- [ ] **Step 1: 실패하는 스모크 테스트 작성**

`test/pages.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

test('정적 페이지 서빙', async (t) => {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-pg-')), 'data.json');
  const { app } = createServer({ dataFile });
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const p of ['/bingo.html']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, `${p} should be 200`);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npm test`
Expected: FAIL — `/bingo.html` 404

- [ ] **Step 3: 프론트 파일 작성**

`public/style.css`:

```css
:root {
  --bg: #f6f7fb;
  --card: #ffffff;
  --text: #1c2333;
  --muted: #6b7280;
  --accent: #4f46e5;
  --accent-soft: #eef2ff;
  --marked: #4f46e5;
  --marked-text: #ffffff;
  --gold: #f59e0b;
  --border: #e5e7eb;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif;
  background: var(--bg);
  color: var(--text);
}

.wrap { max-width: 560px; margin: 0 auto; padding: 16px; }

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

h1 { font-size: 1.4rem; margin: 0 0 4px; }
.muted { color: var(--muted); font-size: 0.9rem; }

.btn {
  display: inline-block;
  border: none;
  border-radius: 12px;
  padding: 12px 20px;
  font-size: 1rem;
  font-weight: 700;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
.btn:active { transform: scale(0.98); }
.btn.secondary { background: var(--accent-soft); color: var(--accent); }

input[type="text"], textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  font-size: 1rem;
  font-family: inherit;
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-top: 16px;
}

.cell {
  aspect-ratio: 1;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  padding: 2px;
  font-size: clamp(0.55rem, 2.4vw, 0.78rem);
  line-height: 1.15;
  word-break: keep-all;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
  font-family: inherit;
  color: var(--text);
}
.cell.marked {
  background: var(--marked);
  border-color: var(--marked);
  color: var(--marked-text);
  font-weight: 700;
}

.statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  font-weight: 700;
}
.bingo-count { color: var(--accent); }
.error { color: #dc2626; font-size: 0.9rem; min-height: 1.2em; margin-top: 8px; }
.hidden { display: none; }
```

`public/bingo.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>워크숍 빙고</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="wrap">
    <section id="join-view" class="card">
      <h1>🎯 워크숍 빙고</h1>
      <p class="muted">이름을 입력하면 나만의 빙고판이 만들어져요.</p>
      <form id="join-form">
        <input type="text" id="name-input" placeholder="이름" autocomplete="off" maxlength="20">
        <p class="error" id="join-error"></p>
        <button class="btn" type="submit">입장하기</button>
      </form>
    </section>

    <section id="game-view" class="card hidden">
      <h1 id="greeting"></h1>
      <p class="muted">해당하는 칸을 눌러서 칠하세요. 다시 누르면 해제돼요.</p>
      <div class="grid" id="grid"></div>
      <div class="statusbar">
        <span id="marked-count"></span>
        <span class="bingo-count" id="bingo-count"></span>
      </div>
      <p class="error" id="game-error"></p>
    </section>
  </div>
  <script src="/bingo.js"></script>
</body>
</html>
```

`public/bingo.js`:

```js
'use strict';

const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const grid = document.getElementById('grid');
const joinError = document.getElementById('join-error');
const gameError = document.getElementById('game-error');

let me = null; // {participantId, name, cells, marked, bingoLines}

const ERROR_MESSAGES = {
  ITEMS_NOT_SET: '아직 게임이 준비되지 않았어요. 진행자를 기다려주세요!',
  NAME_REQUIRED: '이름을 입력해주세요.',
  PARTICIPANT_NOT_FOUND: '세션이 만료됐어요. 새로고침 후 다시 입장해주세요.',
};

function messageFor(code) {
  return ERROR_MESSAGES[code] || '문제가 발생했어요. 잠시 후 다시 시도해주세요.';
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'INTERNAL');
  return data;
}

function render() {
  joinView.classList.add('hidden');
  gameView.classList.remove('hidden');
  document.getElementById('greeting').textContent = `${me.name}의 빙고판`;
  grid.replaceChildren(...me.cells.map((text, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell' + (me.marked[i] ? ' marked' : '');
    btn.textContent = text;
    btn.addEventListener('click', () => toggle(i));
    return btn;
  }));
  const count = me.marked.filter(Boolean).length;
  document.getElementById('marked-count').textContent = `칠한 칸 ${count} / 25`;
  document.getElementById('bingo-count').textContent =
    me.bingoLines > 0 ? `🎉 빙고 ${me.bingoLines}줄!` : '빙고 0줄';
}

async function toggle(i) {
  gameError.textContent = '';
  try {
    me = await api('POST', '/api/mark', {
      participantId: me.participantId,
      cellIndex: i,
      on: !me.marked[i],
    });
    render();
  } catch (err) {
    if (err.message === 'PARTICIPANT_NOT_FOUND') localStorage.removeItem('bingo:participantId');
    gameError.textContent = messageFor(err.message);
  }
}

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  joinError.textContent = '';
  try {
    me = await api('POST', '/api/join', { name: document.getElementById('name-input').value });
    localStorage.setItem('bingo:participantId', me.participantId);
    render();
  } catch (err) {
    joinError.textContent = messageFor(err.message);
  }
});

(async function restore() {
  const saved = localStorage.getItem('bingo:participantId');
  if (!saved) return;
  try {
    me = await api('GET', `/api/me/${saved}`);
    render();
  } catch {
    localStorage.removeItem('bingo:participantId');
  }
})();
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 수동 확인**

Run: `node server.js` 후 브라우저에서 확인 (또는 curl로 대신):
1. `curl -s -X POST localhost:3000/api/admin/items -H 'content-type: application/json' -d '{"items":["항목1",...25개...]}'` 로 항목 세팅
2. `http://localhost:3000/bingo.html` 접속 → 이름 입력 → 5x5 판 표시
3. 칸 탭 → 보라색으로 칠해짐, 카운트 증가. 5칸 한 줄 → "🎉 빙고 1줄!"
4. 새로고침 → 판 유지

- [ ] **Step 6: 커밋**

```bash
git rm public/.gitkeep
git add public/style.css public/bingo.html public/bingo.js test/pages.test.js
git commit -m "feat: 참가자 빙고 화면"
```

---

### Task 5: 대시보드 (`/board`) + 허브 (`/`)

**Files:**
- Create: `public/board.html`, `public/board.js`, `public/index.html`
- Modify: `test/pages.test.js` (검사 경로에 `/`, `/board.html` 추가)

**Interfaces:**
- Consumes: Task 3의 `GET /api/events` (SSE), `GET /api/state`. 스냅샷 형태 `{itemsSet, participants: [{name, markedCount, bingoLines}]}`. Task 4의 `style.css`
- Produces: 없음 (말단 화면)

- [ ] **Step 1: 스모크 테스트 확장 (실패 확인)**

`test/pages.test.js`의 경로 배열을 수정:

```js
  for (const p of ['/', '/bingo.html', '/board.html']) {
```

Run: `npm test`
Expected: FAIL — `/`, `/board.html` 404

- [ ] **Step 2: 파일 작성**

`public/index.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>워크숍 게임</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>🏕️ 워크숍 게임</h1>
      <p class="muted">참여할 게임을 선택하세요.</p>
      <p><a class="btn" href="/bingo.html">🎯 빙고 참가하기</a></p>
      <p><a class="btn secondary" href="/board.html">📺 빙고 현황판 (진행자용)</a></p>
      <p class="muted">퀴즈는 곧 열립니다 🤫</p>
    </section>
  </div>
</body>
</html>
```

`public/board.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>빙고 현황판</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    .wrap { max-width: 900px; }
    .board-list { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .row {
      display: grid;
      grid-template-columns: 2.2rem 1fr auto auto;
      gap: 12px;
      align-items: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 16px;
      font-size: 1.15rem;
    }
    .row.has-bingo { border-color: var(--gold); background: #fffbeb; }
    .rank { font-weight: 800; color: var(--muted); }
    .name { font-weight: 700; }
    .bar-wrap { display: flex; align-items: center; gap: 10px; min-width: 220px; }
    .bar { flex: 1; height: 10px; border-radius: 5px; background: var(--accent-soft); overflow: hidden; }
    .bar > div { height: 100%; background: var(--accent); border-radius: 5px; transition: width 0.3s; }
    .count { color: var(--muted); font-variant-numeric: tabular-nums; }
    .lines { font-weight: 800; color: var(--gold); min-width: 5.5rem; text-align: right; }
    .empty { text-align: center; padding: 40px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>🎯 빙고 현황판</h1>
    <p class="muted" id="summary"></p>
    <ul class="board-list" id="list"></ul>
    <p class="muted empty hidden" id="empty">아직 참가자가 없어요. 폰으로 접속해서 이름을 입력하면 여기 나타납니다!</p>
  </div>
  <script src="/board.js"></script>
</body>
</html>
```

`public/board.js`:

```js
'use strict';

const list = document.getElementById('list');
const empty = document.getElementById('empty');
const summary = document.getElementById('summary');

function render(snapshot) {
  const players = [...snapshot.participants].sort(
    (a, b) => b.bingoLines - a.bingoLines || b.markedCount - a.markedCount || a.name.localeCompare(b.name, 'ko'),
  );
  summary.textContent = `참가자 ${players.length}명 · 실시간 업데이트`;
  empty.classList.toggle('hidden', players.length > 0);
  list.replaceChildren(...players.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'row' + (p.bingoLines > 0 ? ' has-bingo' : '');

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}`;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;

    const barWrap = document.createElement('span');
    barWrap.className = 'bar-wrap';
    const bar = document.createElement('span');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.style.width = `${(p.markedCount / 25) * 100}%`;
    bar.appendChild(fill);
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${p.markedCount}/25`;
    barWrap.append(bar, count);

    const lines = document.createElement('span');
    lines.className = 'lines';
    lines.textContent = p.bingoLines > 0 ? `🎉 빙고 ${p.bingoLines}줄` : '';

    li.append(rank, name, barWrap, lines);
    return li;
  }));
}

function connect() {
  const source = new EventSource('/api/events');
  source.onmessage = (e) => render(JSON.parse(e.data));
  source.onerror = () => {
    source.close();
    setTimeout(connect, 2000);
  };
}

fetch('/api/state').then((r) => r.json()).then(render);
connect();
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: 수동 확인**

`node server.js` 실행 후:
1. `/board.html` 열어두고, 다른 탭에서 `/bingo.html`로 2명 입장해 칸 칠하기
2. 현황판이 새로고침 없이 즉시 갱신되고, 빙고 줄 완성한 사람이 금색으로 위로 올라오는지 확인

- [ ] **Step 5: 커밋**

```bash
git add public/index.html public/board.html public/board.js test/pages.test.js
git commit -m "feat: 실시간 현황판 + 게임 허브"
```

---

### Task 6: 관리자 화면 (`/admin`) + README

**Files:**
- Create: `public/admin.html`, `public/admin.js`, `README.md`
- Modify: `test/pages.test.js` (검사 경로에 `/admin.html` 추가)

**Interfaces:**
- Consumes: Task 3의 `POST /api/admin/items`, `POST /api/admin/reset`, `GET /api/state`. Task 4의 `style.css`
- Produces: 없음 (말단 화면)

- [ ] **Step 1: 스모크 테스트 확장 (실패 확인)**

`test/pages.test.js`의 경로 배열을 수정:

```js
  for (const p of ['/', '/bingo.html', '/board.html', '/admin.html']) {
```

Run: `npm test`
Expected: FAIL — `/admin.html` 404

- [ ] **Step 2: 파일 작성**

`public/admin.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>빙고 관리자</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    textarea { min-height: 340px; resize: vertical; }
    .actions { display: flex; gap: 10px; margin-top: 12px; }
    .ok { color: #16a34a; font-size: 0.9rem; min-height: 1.2em; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>🛠️ 빙고 관리자</h1>
      <p class="muted">빙고 항목을 한 줄에 하나씩, 정확히 25개 입력하세요. 저장 후에는 <b>게임 리셋</b>을 눌러야 참가자들이 새 항목으로 시작해요.</p>
      <textarea id="items-input" placeholder="예) 아침형 인간이다&#10;MBTI가 E로 시작한다&#10;..."></textarea>
      <p class="muted" id="line-count"></p>
      <div class="actions">
        <button class="btn" id="save-btn">항목 저장</button>
        <button class="btn secondary" id="reset-btn">게임 리셋 (참가자 전원 초기화)</button>
      </div>
      <p class="ok" id="ok-msg"></p>
      <p class="error" id="error-msg"></p>
    </section>
  </div>
  <script src="/admin.js"></script>
</body>
</html>
```

`public/admin.js`:

```js
'use strict';

const input = document.getElementById('items-input');
const lineCount = document.getElementById('line-count');
const okMsg = document.getElementById('ok-msg');
const errorMsg = document.getElementById('error-msg');

function parsedItems() {
  return input.value.split('\n').map((s) => s.trim()).filter(Boolean);
}

function updateCount() {
  lineCount.textContent = `현재 ${parsedItems().length}개 / 25개`;
}
input.addEventListener('input', updateCount);
updateCount();

function flash(el, text) {
  okMsg.textContent = '';
  errorMsg.textContent = '';
  el.textContent = text;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'INTERNAL');
}

document.getElementById('save-btn').addEventListener('click', async () => {
  const items = parsedItems();
  if (items.length !== 25) {
    flash(errorMsg, `항목이 ${items.length}개예요. 정확히 25개가 필요해요.`);
    return;
  }
  try {
    await post('/api/admin/items', { items });
    flash(okMsg, '저장했어요! 새 판을 시작하려면 게임 리셋을 눌러주세요.');
  } catch {
    flash(errorMsg, '저장에 실패했어요. 항목을 확인해주세요.');
  }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('참가자 전원이 초기화됩니다. 리셋할까요?')) return;
  try {
    await post('/api/admin/reset');
    flash(okMsg, '리셋 완료! 참가자들은 다시 입장하면 돼요.');
  } catch {
    flash(errorMsg, '리셋에 실패했어요.');
  }
});
```

`README.md`:

```markdown
# 워크숍 게임 웹

사내 워크숍용 게임 허브. 현재 게임: 5x5 빙고.

## 실행

​```bash
npm install
npm start          # http://localhost:3000 (PORT 환경변수로 변경 가능)
​```

같은 와이파이의 폰에서 접속하려면 서버 실행한 컴퓨터의 IP로 접속:
`http://<내 IP>:3000`

## 워크숍 진행 순서

1. 진행자: `/admin.html` 에서 빙고 항목 25개 입력 → 저장
2. 진행자: `/board.html` 을 빔프로젝터에 띄우기
3. 참가자: `/bingo.html` 접속(허브 `/` 에서 링크) → 이름 입력 → 해당되는 칸 칠하기
4. 현황판에 인원별 칠한 칸 수 / 빙고 줄 수가 실시간 표시

## 개발

​```bash
npm test    # node --test
​```

상태는 `data.json` 에 저장되어 서버 재시작에도 유지. 새 게임은 관리자 화면의 리셋 버튼.
```

(주의: README의 ​``` 는 실제 파일에서는 일반 코드펜스로 작성)

- [ ] **Step 3: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: 수동 확인**

`node server.js` 실행 후 `/admin.html`:
1. 항목 10개만 넣고 저장 → "항목이 10개예요" 에러
2. 25개 입력 → 저장 성공 메시지
3. 리셋 → confirm 후 성공, `/board.html` 참가자 목록 비워짐

- [ ] **Step 5: 커밋**

```bash
git add public/admin.html public/admin.js README.md test/pages.test.js
git commit -m "feat: 관리자 화면 + README"
```

---

## Self-Review 결과

- **Spec coverage:** 화면 4개(허브/참가자/현황판/관리자) → Task 4·5·6, API 7개 → Task 3, 게임 로직·빙고 줄 계산 → Task 1, 영속화 → Task 2, localStorage 복원 → Task 4. 누락 없음.
- **Placeholder scan:** 실제 코드 전부 포함. 통과.
- **Type consistency:** `participantView` 반환 형태(`{participantId, name, cells, marked, bingoLines}`)를 join/mark/me 응답과 프론트(`me` 객체)가 동일하게 사용. `publicSnapshot` 형태를 board.js가 동일하게 사용. 통과.
