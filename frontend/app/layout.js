import "./globals.css";

export const metadata = {
  title: "Rewear Circle — Mặc lại điều bạn yêu",
  description: "Khám phá thời trang đã qua sử dụng, được tuyển chọn để tìm thấy người mặc tiếp theo.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
