import "./globals.css";

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
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
