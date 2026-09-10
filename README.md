# 아카이브 워크숍 게임

사내 워크숍용 실시간 미니게임 웹. Express + 바닐라 JS, 의존성은 `express` 하나뿐입니다.
참가자는 폰으로 접속해 이름을 고르고, 진행자는 스태프 콘솔에서 게임을 진행합니다.

## 게임

빙고 · 퀴즈 · TMI 주인 찾기 · 밸런스 게임 · 캐치마인드(그리기+리플레이) · 마니또 · 몰래 예언 · 숨은그림찾기

## 요구사항

- Node.js 22+
- (선택) 상시 실행용 `pm2`, 공개 주소용 `cloudflared`

## 실행

```bash
npm install
npm start            # http://localhost:3000  (PORT 환경변수로 변경 가능)
```

또는 한 번에:

```bash
./run.sh
```

- 참가자 허브: `http://<주소>:3000/`
- 스태프 콘솔: `http://<주소>:3000/host.html`  (진행자 암호 필요)
- 진행 매뉴얼: `http://<주소>:3000/manual.html`

## 맥미니에서 상시 실행

```bash
npm i -g pm2
pm2 start server.js --name workshop
pm2 save
pm2 startup          # 출력되는 sudo 명령 실행 → 재부팅 후 자동 실행
```

맥미니가 잠들면 서버도 멈춥니다. 시스템 설정에서 잠자기를 끄거나 `caffeinate -s`를 함께 실행하세요.

## 참가자 폰 접속

- **같은 WiFi**: `ipconfig getifaddr en0` 로 맥미니 IP 확인 → 참가자는 `http://<그 IP>:3000`
- **다른 망(셀룰러 등)**: `brew install cloudflared` 후 `cloudflared tunnel --url http://localhost:3000` → 임시 공개 https 주소 발급

## 진행자 콘솔 암호

스태프 콘솔·관리자 페이지는 접근 시 암호를 묻습니다(참가자 우발 접근 차단용 가벼운 게이트).
기본값 **8210**. 변경하려면 `public/staff-gate.js`의 `PW` 값을 수정하세요.
클라이언트 측 차단이라 진짜 보안이 아닙니다. 링크를 진행자만 알고 있는 전제로 쓰세요.

## 상태 저장

각 게임 상태는 실행 폴더의 `*-data.json`에 저장되어 재시작해도 유지됩니다(gitignore 처리됨).
새 판을 시작하려면 각 관리자 화면의 리셋을 사용하세요.
