import localFont from "next/font/local";
import "./globals.css";

// high1 원주리체: 자동 프리로드 + 폴백 폰트 크기 보정(adjustFontFallback)으로
// 로딩 중 글자 깜빡임·레이아웃 밀림을 최소화한다
const wonchuri = localFont({
  src: "../../public/font/high1 Wonchuri Body.ttf",
  display: "swap",
  variable: "--font-wonchuri",
});

export const metadata = {
  title: "우리 여행 지도",
  description: "둘이 함께 채워가는 한국 여행 지도",
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf5ec",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={wonchuri.variable}>
      <body>{children}</body>
    </html>
  );
}
