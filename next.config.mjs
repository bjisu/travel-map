/** @type {import('next').NextConfig} */
const nextConfig = {
  // 썸네일을 클라이언트에서 직접 생성하므로 Next 이미지 최적화(sharp)는 사용하지 않음
  images: { unoptimized: true },
  // 같은 와이파이의 다른 기기(폰 등)에서 개발 서버 접속 허용
  // (기본값은 localhost만 허용 — 다른 주소로 접속하면 JS가 차단되어 버튼이 무반응이 됨)
  allowedDevOrigins: ["172.30.1.95", "172.30.1.*", "192.168.*.*"],
};

export default nextConfig;
