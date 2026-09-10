# 워크숍 게임 서버 (Express + 바닐라 JS, 단일 프로세스)
FROM node:22-alpine
WORKDIR /app

# 의존성 먼저 (레이어 캐시)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 앱 소스
COPY server.js ./
COPY lib ./lib
COPY public ./public

# Fargate 태스크 SG가 8000을 허용하므로 포트 8000으로 리슨
ENV PORT=8000 NODE_ENV=production
EXPOSE 8000

CMD ["node", "server.js"]
