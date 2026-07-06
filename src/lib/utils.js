// Firestore는 네트워크/설정 문제 시 요청이 실패하지 않고 무한 재시도하므로,
// 사용자 대기 화면이 걸리는 호출은 타임아웃으로 감싼다.
export function withTimeout(promise, ms = 15000, message = "요청 시간이 초과됐어요. 네트워크 상태를 확인해 주세요.") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// 헷갈리는 0/O/1/I 제외한 6자리 코드
export function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
