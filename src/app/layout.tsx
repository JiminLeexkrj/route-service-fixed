import "leaflet/dist/leaflet.css";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "제시간 | TIME QUEST",
  description:
    "오늘의 미션, 제시간에 도착. 구간별 승하차 안내와 달리기 경로로 정시 도착에 도전하세요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0e15",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

