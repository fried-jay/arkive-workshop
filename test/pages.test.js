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
  for (const p of ['/', '/bingo.html', '/board.html', '/admin.html']) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, `${p} should be 200`);
    assert.match(res.headers.get('content-type'), /text\/html/);
  }
});
