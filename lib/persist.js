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
