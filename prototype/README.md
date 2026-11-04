# Rewear Circle — Prototype giao diện

Bản xem thử độc lập, ngày 04/11/2026. Mở `Rewear-Circle-Prototype.html` bằng trình duyệt để dùng ngay, không cần cài thêm gì. Hoặc chạy `node prototype/serve.mjs` từ thư mục dự án và mở http://127.0.0.1:4188.

Thanh **PROTOTYPE → Tất cả màn hình** có 49 màn hình/trạng thái, chia theo chức năng và vai trò. Khi chọn, vai trò mẫu được chuyển tự động. Thanh này là công cụ xem thiết kế, không phải chức năng mới của sản phẩm.

- Khách: Trang chủ (header, hero, 4 sản phẩm mới nhất, 4 món khám phá thêm, footer); listing riêng chứa tìm kiếm/bộ lọc theo danh mục; chi tiết công khai, tin đã bán/đang được giữ.
- Tài khoản: đăng ký, đăng nhập, xác minh email, hồ sơ, thông báo.
- Người mua: giỏ, đặt COD, xác nhận đặt, lịch sử lần đặt, các đơn theo người bán, trạng thái thu COD, hủy trước gửi, xác nhận nhận, khiếu nại giao nhận/món và kết quả.
- Người bán: tủ đồ, đăng tin, sửa/gửi lại, lịch sử phiên bản, ẩn/hiện hợp lệ, đơn bán, vận đơn, ghi nhận thu COD và yêu cầu hàng hoàn.
- Admin: duyệt/từ chối tin, vụ việc, phân công Support, ẩn/hiện tin, quyết định vụ, truy cập liên hệ có lý do, tra cứu ghi nhận COD và quyết định hàng hoàn.
- Support: chỉ đọc vụ đang mở được giao và truy cập liên hệ theo từng lần đọc có lý do.
- Trạng thái: đang tải, rỗng, lỗi kết nối, không tìm thấy, chưa xác minh, bị chặn theo vụ việc.

Các nút/form mô phỏng chuyển trạng thái ngay trong bộ nhớ. Tải lại trang để khôi phục dữ liệu mẫu; biểu tượng ↺ làm điều tương tự. Mã xác minh mẫu: `123456`. Mã Support mẫu: `SUP-01`. Form đăng nhập chấp nhận dữ liệu giả hợp lệ; không dùng tài khoản hoặc mật khẩu thật.

Không kết nối API, MongoDB, dịch vụ email hoặc cổng thanh toán. Không lưu dữ liệu qua lần tải lại; không có giao dịch thật. Giới hạn, quyền và chuyển trạng thái trong prototype phục vụ minh họa giao diện; kiểm soát bảo mật và xử lý cạnh tranh vẫn thuộc backend hiện tại. Ảnh là minh họa SVG cục bộ; không cần ảnh hoặc phông chữ từ dịch vụ ngoài.

VNPAY không xuất hiện như lựa chọn thanh toán vì runtime hiện chỉ nhận COD. Trạng thái RESERVED là bản xem tương thích với chi tiết tin đang có, không mô phỏng tạo giữ chỗ 15 phút. Không bổ sung chat, đánh giá, yêu thích, mã giảm giá, gợi ý cá nhân hóa, tự động theo dõi vận chuyển, hoàn tiền, quản lý người dùng hay báo cáo doanh thu.

Đối chiếu với mã nguồn ở `SOURCE-MAP.md`. Prototype nằm riêng trong thư mục `prototype/`. Ứng dụng đã được cập nhật ngày 04/11/2026 để khách tìm kiếm và lọc mà không cần đăng nhập.

Kiểm tra: `node prototype/verify.mjs`. Bản kiểm tra duyệt 49 màn hình và xác nhận tách đơn theo người bán, trạng thái COD, chặn thao tác khi có Case, quyền Support, bản lưu món, lý do từ chối và việc không gọi backend.
