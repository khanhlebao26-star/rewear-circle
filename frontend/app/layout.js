import AppShell from "@/components/layout/AppShell";
import "./globals.css";

export const metadata = {
  title: "Rewear Circle — Mặc lại điều bạn yêu",
  description:
    "Khám phá thời trang đã qua sử dụng, được tuyển chọn để tìm thấy người mặc tiếp theo.",
  icons: {
    icon: { url: "/rewear-circle-mark.png", type: "image/png", sizes: "640x640" },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
