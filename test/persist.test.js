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
