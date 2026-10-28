| **Phần** | **Công nghệ đã chốt (26/10/2026)** |
| --- | --- |
| Giao diện | Next.js (App Router, JavaScript) |
| Backend | Node.js 24 LTS, Express; route, controller và middleware |
| Dữ liệu | MongoDB + Mongoose |
| Đăng nhập | bcrypt, express-session, connect-mongo |
| Ảnh sản phẩm | multer; lưu tệp ở nơi có lưu trữ bền vững khi đưa lên mạng |
| Thanh toán | **VNPAY Sandbox + COD mô phỏng**, thu tiền COD thủ công theo từng Order; không tích hợp thu hộ hãng vận chuyển |
| Kiểm thử | node:test và node:assert |
| Quản lý mã | Git/GitHub, .env cho cấu hình và khóa bí mật |

Cập nhật 26/10/2026

Cập nhật 26/10/2026: Next.js App Router JavaScript làm giao diện; Node.js 24 LTS và Express sở hữu toàn bộ /api/v1, xác thực và nghiệp vụ. Next.js rewrite /api/v1 sang Express để dùng session cookie cùng origin.

MongoDB + Mongoose; bcrypt, express-session, connect-mongo; multer cùng kho lưu trữ bền vững; node:test và node:assert; Git/GitHub và .env.

VNPAY Sandbox là cổng trực tuyến mục tiêu qua IPN và QueryDr; COD là phương thức thu thủ công theo Order. Hợp đồng API đã được chốt; cần cấu hình merchant/IPN công khai và kiểm chứng mapping trước khi bật giao dịch. Job nền xử lý hết hạn và đối chiếu VNPAY.

Bảo mật: cookie HttpOnly/Secure/SameSite, CSRF, rate limit, kiểm tra upload, phân quyền theo Order/vụ việc, không lưu dữ liệu thẻ.
