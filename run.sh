#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 필요합니다. 설치: brew install node@22"
  exit 1
fi
[ -d node_modules ] || npm install
echo "실행: http://localhost:${PORT:-3000}  (Ctrl+C 로 종료)"
exec node server.js
