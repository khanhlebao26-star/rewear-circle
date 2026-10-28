# API & DATA CONVENTIONS — REWEAR CIRCLE (MVP)

Cập nhật 26/10/2026: chốt giới hạn form, dữ liệu nhận hàng và ranh giới API.

Ngày cập nhật: 24/10/2026

Trạng thái: Đề xuất kỹ thuật để nhóm phê duyệt. Các route và mã lỗi chi tiết tiếp tục theo API Contracts & Error Conventions và API Routes hiện có.

# 1. Phạm vi và quy tắc nghiệp vụ đã chốt

Một tài khoản xác minh email thông thường có thể mua và gửi tin bán. Guest chỉ xem nội dung công khai; không có giỏ Guest. Mỗi tin tương ứng một món, số lượng 1. Một Checkout có thể gồm nhiều món, tách đơn theo Seller và thanh toán một tổng tiền.

Giá và thông tin món trong đơn là bản lưu tại lúc đặt. Chỉ kết quả cổng đã xác minh mới làm đơn PAID và món SOLD. Giữ món bắt đầu khi Buyer xác nhận mua, ban đầu 15 phút. Kết quả chưa rõ tiếp tục chặn món; sau 1, 3 và 5 phút tra cứu lại, còn chưa rõ thì NEEDS_REVIEW. Nếu thanh toán đến muộn xung đột với Checkout khác, ghi đúng kết quả tài chính, chặn món/giao và đưa các Checkout/đơn liên quan vào điều tra; không tự giao hai Buyer hoặc tự hoàn tiền.

Mục tiêu tài liệu này là đề xuất cách thực hiện kỹ thuật cho các quy tắc đó. VNPAY Sandbox là cổng mục tiêu; bảng ánh xạ mã kết quả được kiểm chứng khi có khóa thử nghiệm.

# 2. Xác thực, phiên và phân quyền

Đề xuất dùng cơ chế phiên phía máy chủ của giải pháp xác thực nhóm chọn. Cookie trên HTTPS có Secure, HttpOnly và SameSite=Lax; không lưu session ID hoặc token xác thực trong localStorage. Đề xuất hết phiên sau 30 phút không hoạt động và tối đa 7 ngày từ lúc đăng nhập; máy chủ kiểm tra thời hạn, đăng xuất vô hiệu hóa phiên. Các API thay đổi dữ liệu dùng biện pháp chống CSRF phù hợp với cơ chế cookie.

Backend kiểm tra quyền ở mọi route: Buyer chỉ xem Checkout/đơn của mình; Seller chỉ quản lý tin và xem đơn liên quan của mình; Admin thao tác kiểm duyệt/điều tra theo quyền; Support chỉ xem vụ được giao. Không nhận userId, sellerId hoặc vai trò từ trình duyệt làm căn cứ cấp quyền. Không có API cho Admin tự đánh dấu PAID.

Thời hạn 30 phút/7 ngày là đề xuất cấu hình, cần xác nhận với thư viện xác thực và trải nghiệm thực tế.

# 3. Quy ước request/response

Đề xuất tiền tố /api/v1, JSON UTF-8, thời điểm ISO 8601 UTC và giá VND là số nguyên không âm. Mọi response lỗi theo cùng cấu trúc/mã đã định nghĩa trong API Contracts; trả requestId để đối chiếu log. Với giới hạn yêu cầu trả HTTP 429 và Retry-After.

Đối với webhook: kiểm tra chữ ký theo tài liệu nhà cung cấp, mã tham chiếu, số tiền, tiền tệ và trạng thái; chỉ sau đó chuẩn hóa thành kết quả PAY. Không coi URL Buyer quay về từ cổng là bằng chứng đã trả tiền. Mã sự kiện/giao dịch đã xử lý được lưu để bỏ qua thông báo lặp.

# 4. Giới hạn yêu cầu đề xuất

Đăng nhập sai: tối đa 5 lần trong 15 phút theo kết hợp tài khoản và IP.

API đọc: tối đa 120 lần/phút theo IP. API thay đổi dữ liệu: tối đa 30 lần/phút theo tài khoản.

Tạo Checkout: tối đa 3 lần/phút theo tài khoản. Gửi báo cáo: tối đa 5 lần/ngày theo tài khoản.

Không áp giới hạn thông thường của Buyer lên webhook; bảo vệ webhook bằng chữ ký, chống lặp và giới hạn riêng sau khi biết đặc điểm cổng. Các ngưỡng này cần điều chỉnh từ kiểm thử tải 20 người dùng đồng thời.

# 5. Chống gửi lặp và xử lý đồng thời

Bắt buộc Idempotency-Key cho tạo Checkout và khởi tạo thanh toán; đề xuất áp dụng thêm cho hủy Checkout và xác nhận Đã nhận. Lưu khóa theo tài khoản + route + khóa, dấu vân tay của request và kết quả trong 24 giờ. Cùng khóa/cùng nội dung trả cùng kết quả; cùng khóa/nội dung khác trả IDEMPOTENCY_CONFLICT. Webhook dùng mã sự kiện/mã giao dịch cổng để xử lý đúng một lần, không dùng khóa của Buyer.

Giữ món phải là thao tác có điều kiện: chỉ chuyển AVAILABLE sang RESERVED nếu bản tin đã duyệt, còn bán, không ẩn và không có reservation hiệu lực. Với Checkout nhiều món, tạo các reservation và đơn như một đơn vị nhất quán; nếu không giữ được đủ món, không tạo Checkout thanh toán dở dang. Không gọi cổng bên ngoài khi transaction database còn mở.

# 6. Phân trang và tìm kiếm

Mặc định 20 kết quả/trang đã chốt; đề xuất limit tối đa 100. Feed sắp xếp mới nhất, dùng cursor gồm createdAt và ID để thứ tự ổn định khi có tin mới. Tài khoản đăng nhập tìm theo tên/mô tả; Guest chỉ xem feed/trang chi tiết công khai và không dùng tìm kiếm/lọc theo quyết định sản phẩm.

Không trả tin PENDING/REJECTED/ẩn vào API công khai. Tin SOLD chỉ đọc qua liên kết trực tiếp với watermark và không có hành động mua.

# 7. MongoDB: dữ liệu và chỉ mục đề xuất

users: chỉ mục unique trên email đã chuẩn hóa.

carts: unique userId; cart_items: unique (cartId, listingId).

listings: chỉ mục phục vụ feed theo trạng thái duyệt, saleStatus, lý do ẩn và createdAt; có thể thêm chỉ mục tìm kiếm tên/mô tả sau khi đo truy vấn.

listing_versions: unique có điều kiện cho một bản PENDING trên mỗi listing; dùng version để từ chối ghi đè bản sửa đồng thời.

reservations: unique có điều kiện trên listingId khi reservation đang hiệu lực; lưu checkoutId, expiresAt, gatewayCheckedAt và trạng thái xử lý.

orders: unique (checkoutId, sellerId); order_items lưu listingId, giá và productSnapshot lúc đặt.

payment_attempts: unique (provider, providerReference) khi có mã; lưu trạng thái và sự kiện đã xử lý. cases/reports: chỉ mục theo target, status, assignedSupportId và thời gian.

Bản ghi paymentReviewHold hoặc khóa bán tương đương phải ngăn món đang điều tra xuất hiện như có thể mua; đây là điều kiện độc lập với Seller/Admin ẩn. Chỉ xóa khóa khi đã xác minh không còn xung đột và ghi lại quyết định.

Chỉ mục cuối cùng phải kiểm bằng truy vấn thực tế và kết quả đo; không tạo nhiều chỉ mục chỉ vì sơ đồ có trường đó.

# 8. Lưu ảnh và bằng chứng

Ảnh sản phẩm và bằng chứng vụ việc lưu ngoài MongoDB; database giữ object key, loại, kích thước, chủ sở hữu, thời điểm và trạng thái. Ảnh tin chỉ công khai khi tin được phép hiển thị; bản gốc và bằng chứng vụ việc để riêng tư, chỉ truy cập qua kiểm tra quyền hoặc URL ký ngắn hạn.

Máy chủ kiểm tra 1–5 ảnh/tin, tối đa 5 MB/ảnh, chỉ JPEG/PNG/WebP; kiểm tra cả nội dung tệp, không chỉ đuôi hoặc Content-Type do trình duyệt gửi. Bằng chứng vụ việc tùy chọn 0–5 ảnh JPEG/PNG/WebP, tối đa 5 MB/ảnh; lưu riêng tư và kiểm tra quyền đọc.

Không lưu số thẻ, CVV, mật khẩu hoặc token trong database/log. Sao lưu database và kho tệp theo cùng kế hoạch triển khai; hồ sơ/bằng chứng vụ việc giữ 12 tháng sau khi đóng vụ.

# 9. Kiểm thử chấp nhận

Gửi lại cùng Idempotency-Key không tạo Checkout/payment attempt thứ hai; khóa cũ với nội dung khác bị từ chối. Hai Buyer mua cùng món đồng thời chỉ một người giữ được. Checkout nhiều món hoặc tạo đầy đủ reservation/đơn, hoặc không tạo khoản thanh toán. Webhook trùng/sai chữ ký/thiếu số tiền không đánh dấu PAID. Tin đang paymentReviewHold không hiện sẵn mua. Support không xem được bằng chứng của vụ chưa được giao. Đo tác động chỉ mục với 1.000 tin mẫu và tải đã chốt.

# 10. Quyết định kỹ thuật còn cần phê duyệt

Cấu hình phiên 30 phút/7 ngày; các ngưỡng rate limit; thời hạn Idempotency-Key 24 giờ; limit tối đa 100; cấu trúc cursor; chỉ mục/chế độ transaction phù hợp nơi chạy MongoDB; kho tệp và thời hạn URL ký. VNPAY Sandbox là cổng mục tiêu; IPN dùng GET, QueryDr dùng đối chiếu; mã kết quả cần xác minh khi có khóa thử nghiệm.

# Nguồn tham khảo kỹ thuật

OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

OWASP File Upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

MongoDB Transactions: https://www.mongodb.com/docs/manual/core/transactions/

MongoDB Partial Indexes: https://www.mongodb.com/docs/manual/core/index-partial/

Cập nhật 26/10/2026

Giới hạn form dùng chung: category TOP/BOTTOM/SHOES/ACCESSORY; size theo BR-LISTING-008; priceVnd 20.000–5.000.000; title 5–100 ký tự; description 20–2.000; defectDescription tối đa 1.000. Seller location là khu vực gửi hàng, recipientAddress là nơi Buyer nhận.

Mỗi Order lưu recipientSnapshot cùng carrierName/trackingCode. Complaint ITEM có affectedOrderItemIds là tập con không rỗng của OrderItem; DELIVERY không cần chọn món. Email verification token chỉ lưu hash và hạn dùng.

Next.js rewrite /api/v1 sang Express cùng origin; cookie HttpOnly/Secure/SameSite, session lưu MongoDB, chống CSRF cho request đổi dữ liệu.
