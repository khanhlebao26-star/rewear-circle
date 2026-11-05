# Đối chiếu phạm vi prototype với dự án hiện tại

Mốc rà soát: 04/11/2026. Căn cứ quyết định là route đang được gắn trong `backend/src/app.js`, sau đó đến điều kiện trong route/service/domain. Tài liệu dùng để giải thích quy tắc; chức năng chỉ có trong đề xuất hoặc mã chưa nối runtime không được coi là chức năng đang hoạt động.

Đã lập danh mục toàn bộ cây dự án: frontend, backend (routes, models, services, domain, middleware, workers, jobs, scripts, kiểm thử), tài liệu sản phẩm, vai trò, nghiệp vụ, kiến trúc, báo cáo triển khai, workflow và cấu hình Docker/vận hành. Không quét nội dung bí mật của `.env`, dữ liệu MongoDB hoặc dữ liệu cá nhân; không coi `node_modules`, `.next`, lockfile hay tệp sinh tự động là màn hình sản phẩm.

| Nhóm giao diện | Bằng chứng chính | Phạm vi được thể hiện |
|---|---|---|
| Nhận diện & khám phá | `frontend/features/home/HomePage.jsx`, `frontend/features/listings/CatalogPage.jsx`, `frontend/components/layout/SiteHeader.jsx`, `frontend/components/layout/SiteFooter.jsx`; `routes/commerce.js`, `domain/discoveryRules.js` | Kem–xanh; prototype tách Trang chủ (4 sản phẩm mới nhất + 4 món tiếp theo không trùng) và trang listing chứa tìm kiếm/bộ lọc. Header/hero/footer giữ nguyên thiết kế; đây là điều chỉnh riêng của prototype. 4 danh mục, size theo loại, từ khóa tên/mô tả, tình trạng, khoảng giá, phân trang 20. Khách xem feed, tìm kiếm, lọc và xem chi tiết công khai mà không cần đăng nhập. |
| Chi tiết món | `frontend/app/listings/[id]/page.js`; `GET /listings/:id`, `domain/commerceRules.js` | Tên, ảnh, giá VND, mô tả, lỗi, cỡ, tình trạng, nơi gửi; SOLD có watermark và không mua; RESERVED không thêm giỏ; tin ẩn/chờ duyệt không mở công khai. |
| Tài khoản | `routes/auth.js`, `models/User.js`, `domain/passwordRules.js`, `middleware/requireAuth.js` | Đăng ký, đăng nhập/xuất, mã email 6 số, gửi lại mã, hồ sơ chỉ sửa displayName. USER dùng chung mua/bán; ADMIN/SUPPORT riêng. Không thêm quên mật khẩu, đổi email hay avatar vì chưa có thao tác tương ứng. |
| Thông báo | `routes/listings.js` (`/me/notifications`, `/:id/read`), `models/Notification.js` | Danh sách, đã/chưa đọc, đọc từng thông báo, lý do từ chối tin và tóm tắt kết quả vụ. Không thêm đánh dấu tất cả đã đọc. |
| Tin người bán | `routes/listings.js`, `domain/listingRules.js`, `models/Listing.js`, `routes/media.js` | Đăng tin, quản lý, bản sửa đầy đủ, lịch sử phiên bản, gửi lại tối đa 5 lượt, ẩn/hiện có điều kiện. Không có xóa tin/lưu nháp. 1–5 ảnh JPEG/PNG/WebP, 5 MB/ảnh; giá 20.000–5.000.000 VND. |
| Giỏ & đặt hàng | `routes/commerce.js`, `services/checkout.js`, `models/commerce.js` | Thêm/xóa món, giỏ không giữ món; tên/điện thoại/địa chỉ nhận; xác nhận giá, COD, tách Order theo Seller; tổng cộng giá món, phí gửi nằm trong giá. Không nhập số lượng >1, phí gửi thêm hoặc mã giảm giá. |
| Lần đặt & đơn | `GET /me/checkouts`, `/checkouts/:id`, `/:id/payment`, `/me/orders`, `/me/sales`, `/orders/:id`; `domain/orderDTO.js` | Danh sách lần đặt, đơn mua/bán, chi tiết và bản lưu món lúc đặt, trạng thái giao nhận tách trạng thái thu COD. Các bộ lọc khớp trạng thái đã có. |
| Giao nhận, thu & hoàn COD | `services/codOrders.js`, các route `/shipment`, `/receipt-confirmation`, `/cancel`, `/cod-collection`, `/cod-return-requests`, `/admin/orders/:id/cod-return-decisions` | Người bán tự ghi vận đơn, người mua tự xác nhận nhận; hủy trước gửi/chưa thu; người bán khai báo thu đúng tổng đơn; yêu cầu hàng hoàn; Admin chấp nhận/từ chối có lý do. Vụ Order đang mở chặn các thao tác theo điều kiện backend. |
| Báo cáo tin | `POST /reports/listings`, `domain/moderationRules.js`, `models/Report.js`, `models/Case.js` | 7 lý do đã định nghĩa, mô tả, 0–5 ảnh bằng chứng, tối đa 5 báo cáo/24 giờ; thông báo tiếp nhận và kết quả. Không thêm trang công khai xem điều tra nội bộ. |
| Khiếu nại đơn | `routes/commerce.js`, `services/complaints.js`, `domain/moderationRules.js` | DELIVERY cho toàn Order; ITEM sau COMPLETED chọn đúng OrderItem; lý do theo loại; chi tiết 10–2.000 ký tự, bằng chứng tùy chọn, xem bản đã gửi và tóm tắt kết quả. Giới hạn 3 bản/active Case, 5 bản mới/24 giờ, chờ 24 giờ khi gửi lại cùng loại sau đóng. |
| Admin | `routes/listings.js` (`/admin/listing-versions`, `/decision`, `/visibility`), `routes/moderation.js`, `routes/commerce.js` | Hàng chờ, chi tiết phiên bản, duyệt/từ chối có lý do; vụ REPORT/DELIVERY/ITEM; phân công theo Support ID; OPEN → IN_REVIEW → CLOSED; kết quả, ghi chú nội bộ, truy vết, contact-access; tra cứu thu COD và hoàn COD. Không quản lý tài khoản, sửa tin thay Seller hoặc tự đánh dấu trả tiền. |
| Support | `routes/moderation.js` (`/support/cases`, `/:caseId`, `/contact-access`), `services/caseAccess.js` | Chỉ vụ active được giao; mất quyền khi đóng/gỡ/đổi giao; xem bằng chứng và timeline; lý do mỗi lần đọc liên hệ (10–500 ký tự). Không nút ghi chú nội bộ, sửa đơn, phân công hoặc đóng vụ. |
| Trạng thái & responsive | Frontend hiện tại; `docs/Non-functional Requirements/Usability & Accessibility.md` | Bố cục máy tính/điện thoại, bàn phím, nhãn form, focus, hộp thoại, trạng thái rỗng/tải/lỗi/không tìm thấy. |

## Những phần không biến thành chức năng giao diện

- `routes/vnpay.js`, worker và các service giao thức tồn tại nhưng không được gắn trong `app.js`. `readCheckoutInput()` chỉ chấp nhận `paymentMethod: COD`. README và báo cáo giao nhận cũng xác nhận VNPAY runtime tắt. Vì vậy không có lựa chọn thanh toán VNPAY, tạo payment attempt, nút retry, thanh toán online hay tự đối soát.
- `/checkouts/:id/confirm` đã retired (410); prototype xác nhận khi tạo Checkout, không thêm bước gọi confirm sau tạo.
- Backup/restore, migration, retention, health, logging, seed tài khoản nhân viên và Docker là vận hành kỹ thuật. Không có API quản trị giao diện cho các thao tác đó, nên không dựng dashboard hay nút vận hành giả.
- Các liên kết hướng dẫn/pháp lý trong header/footer chưa có trang triển khai. Không tự viết nội dung chính sách hoặc biến chúng thành các chức năng mới.

## Ghi nhận kiểm tra

- 49 màn hình/trạng thái dựng được trong kiểm tra ngoại tuyến và trên trình duyệt; không có lỗi JavaScript ở lượt duyệt toàn bộ.
- Màn hình desktop 1440 px không tràn ngang; các màn hình đại diện trên mobile 390 px được kiểm tra lại qua công cụ chọn màn hình (khám phá, chi tiết, checkout, đăng bán, Admin/Support).
- Đã bấm thử giỏ → checkout COD → xác nhận thành công bằng dữ liệu mẫu. Các kiểm tra tự động độc lập bao phủ tách đơn theo Seller, chặn Case, quyền Support, thu COD, bản lưu và từ chối tin.
- Đây là kiểm tra prototype; không phải nghiệm thu backend, tích hợp email hay cổng thanh toán thật.
