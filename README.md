# 우리 여행 지도 🗺️

둘이 함께 채워가는 한국 여행 지도. 코드로 커플을 연결하고, 17개 시·도 지도를 사진으로 채워가는 커플 여행 기록 앱입니다.

## 주요 기능

- **간편 시작** — 가입 없이 "새로 시작하기"를 누르면 바로 내 지도가 생기고, 6자리 연결 코드가 발급돼요.
- **커플 연결** — 상대 코드를 입력하면 두 사람의 지도가 하나로 합쳐지고, 이후 모든 기록이 실시간으로 공유됩니다. 연결되면 타이틀이 "닉네임 ♥ 닉네임"으로 바뀌어요.
- **사진으로 채우는 지도** — 지역을 탭해 사진(지역당 최대 3장, 다중 선택 지원)과 캡션·여행 날짜를 기록하면, 대표 사진이 지도 위 지역 모양대로 채워집니다.
- **여러 장의 지도** — 17곳을 모두 채우면 새 지도를 펼칠 수 있고, 좌우 스와이프로 넘겨볼 수 있어요.
- **모바일 제스처** — 핀치 줌(1~4배), 확대 상태 드래그 이동 지원.

## 기술 구조

- **Next.js 16** (App Router) — 프론트엔드 + API 라우트
- **Neon Postgres** — 데이터 저장 (Vercel 대시보드에서 무료로 연결)
- **Vercel Blob** — 업로드 사진 저장

## 실행 방법

```bash
npm install
vercel env pull .env.local   # Vercel 프로젝트에서 DATABASE_URL 등 환경변수 받아오기
npm run dev
```

http://localhost:3000 접속. 필요한 환경변수는 `.env.example`을 참고하세요.

같은 와이파이의 폰에서 테스트하려면 `next.config.mjs`의 `allowedDevOrigins`에 내 컴퓨터의 LAN IP를 추가한 뒤 `http://<내IP>:3000`으로 접속하세요.

## 배포 (Vercel)

1. [Vercel](https://vercel.com)에서 이 GitHub 저장소를 import
2. 프로젝트 → **Storage** 탭에서 **Neon**(Postgres)과 **Blob** 스토어를 생성·연결
   → `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` 환경변수가 자동 주입됩니다
3. Deploy — 끝. 테이블은 첫 요청 때 자동 생성됩니다.

## 지도 데이터 출처

KOSTAT(통계청) — [southkorea/southkorea-maps](https://github.com/southkorea/southkorea-maps)
