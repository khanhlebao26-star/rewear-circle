# Rewear Circle frontend

Giao diện Next.js triển khai từ prototype trong `../prototype`, kết nối API hiện có qua `/api/v1`. Không dùng bản ghi hoặc tài khoản giả trong giao diện.

## Cấu trúc thư mục

- `app/` chứa các tuyến Next.js. Mỗi `page.js` nhận tham số tuyến và gọi màn hình tương ứng.
- `features/` chứa màn hình và CSS theo nhóm trang chủ, sản phẩm, tài khoản, thanh toán, đơn hàng, người bán và kiểm duyệt.
- `components/layout/` chứa header, footer, bố cục tài khoản và quản trị cùng lớp kiểm tra quyền. `components/ui/` chứa các thành phần dùng chung như biểu mẫu, hộp thoại và thư viện ảnh.
- `hooks/` chứa logic tải và cập nhật dữ liệu. `lib/` chứa hợp đồng API và hàm xử lý đường dẫn.
- `styles/` chứa CSS nền và kiểu dùng chung. `app/globals.css` quy định thứ tự nạp các stylesheet toàn cục. CSS riêng của component hoặc màn hình nằm cạnh file JSX.

## Các tuyến trang

- Trang chủ `/`: header, hero, tối đa 4 món mới nhất và 4 món tiếp theo, footer. Hai nhóm không trùng món. Khi thiếu dữ liệu, hiển thị trạng thái trống.
- `/listings`: tìm kiếm, danh mục, kích cỡ, tình trạng, khoảng giá và phân trang. Trang này và `/listings/:id` mở cho khách chưa đăng nhập.
- `/login`, `/register`, `/verify-email`, `/me`, `/me/notifications`: tài khoản và thông báo.
- `/cart`, `/checkout`, `/me/checkouts`, `/checkouts/:id`: giỏ, đặt hàng, lịch sử, chi tiết và thu COD.
- `/me/orders`, `/orders/:id`, `/orders/:id/complaints`: đơn mua, giao nhận và khiếu nại.
- `/sell`, `/me/listings`, `/me/listings/:id`, `/seller/orders`: đăng bán, sửa/ẩn tin, lịch sử phiên bản và đơn bán. Bộ lọc tủ đồ áp dụng trong trang kết quả hiện tại do API tủ đồ chỉ cung cấp phân trang.
- `/admin/listings`, `/admin/cases`, `/admin/cod-collections`, `/admin/cod-returns`: kiểm duyệt, vụ việc và vận hành COD.
- `/support/cases`: chỉ đọc vụ đang mở được giao. Liên hệ người nhận chỉ tồn tại trong hộp thoại của từng lượt đọc.

Màn hình và thao tác tuân theo vai trò, xác minh email và điều kiện từ API. Thông tin món trong đơn dùng bản lưu lúc đặt. Xác nhận nhận hàng và ghi nhận thu COD là hai thao tác riêng.

## Chạy và kiểm tra

Từ thư mục gốc, dùng môi trường Docker có sẵn của dự án:

```powershell
docker compose -f compose.yaml -f compose.operations.yaml build frontend
docker compose -f compose.yaml -f compose.operations.yaml up -d --no-deps --wait frontend
docker compose -f compose.yaml -f compose.operations.yaml up -d --no-deps --force-recreate --wait gateway
```

Mở `http://localhost:3001`. Môi trường Docker cần cấu hình gốc theo hướng dẫn của dự án.

```powershell
npm test --prefix frontend
```

Kiểm tra frontend đối chiếu tuyến trang, chuyển hướng đăng nhập, bộ lọc và dữ liệu gửi khi đặt hàng/khiếu nại với quy tắc backend. Các luồng ghi dữ liệu nên thử trong cơ sở dữ liệu riêng; không chạy seed để lấp đầy trang chủ trên dữ liệu đang dùng.
