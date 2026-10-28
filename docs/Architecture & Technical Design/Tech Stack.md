| **Phần** | **Công nghệ đã chốt (26/10/2026)** |
| --- | --- |
| Giao diện | Next.js (App Router, JavaScript) |
| Backend | Node.js 24 LTS, Express; route, controller và middleware |
| Dữ liệu | MongoDB + Mongoose |
| Đăng nhập | bcrypt, express-session, connect-mongo |
| Ảnh sản phẩm | multer; lưu tệp ở nơi có lưu trữ bền vững khi đưa lên mạng |
| Thanh toán | **VNPAY Sandbox ** |
| Kiểm thử | node:test và node:assert |
| Quản lý mã | Git/GitHub, .env cho cấu hình và khóa bí mật |

Cập nhật 26/10/2026

Cập nhật 26/10/2026: Next.js App Router JavaScript làm giao diện; Node.js 24 LTS và Express sở hữu toàn bộ /api/v1, xác thực và nghiệp vụ. Next.js rewrite /api/v1 sang Express để dùng session cookie cùng origin.

MongoDB + Mongoose; bcrypt, express-session, connect-mongo; multer cùng kho lưu trữ bền vững; node:test và node:assert; Git/GitHub và .env.

VNPAY Sandbox là cổng mục tiêu qua IPN và QueryDr. Cần khóa thử nghiệm, IPN công khai và kiểm chứng mapping trước khi khóa hợp đồng API. Job nền xử lý hết hạn và đối chiếu.

Bảo mật: cookie HttpOnly/Secure/SameSite, CSRF, rate limit, kiểm tra upload, phân quyền theo Order/vụ việc, không lưu dữ liệu thẻ.
