# 우리 사이 (MVP) — 설기 & 레이 채팅

스플래시 → (설기/레이 선택, 처음 한 번) → 실시간 채팅방.

## 시작하기

### 1. 설치
```bash
npm install
```

### 2. Firebase 연결
1. https://console.firebase.google.com 프로젝트 생성
2. Firestore Database 만들기
3. 프로젝트 설정 > 웹 앱(</>) 추가 → 설정값 복사
4. `.env.local.example` 를 복사해 `.env.local` 로 이름 변경 후 값 채우기

### 3. 실행
```bash
npm run dev
```
http://localhost:3000

## 출시 전
Firebase 콘솔 > Firestore > 규칙에 아래를 붙여넣고 게시:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{room}/messages/{msg} {
      allow read, create: if true;
      allow update, delete: if false;
    }
  }
}
```

## 메모
- 두 기기에서 각각 설기/레이를 고르면 실시간으로 대화돼요.
- 헤더의 '전환' 버튼으로 내 이름을 다시 고를 수 있어요(테스트용).
