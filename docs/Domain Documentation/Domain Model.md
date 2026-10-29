# **Mô hình miền — Rewear Circle**

Cập nhật 26/10/2026: bổ sung dữ liệu nhận hàng, vận đơn, xác minh email và món bị khiếu nại.

## **1. Mục đích**

Tài liệu này xác định các thực thể miền chính và mối quan hệ giữa chúng cho sản phẩm tối thiểu khả thi (MVP) của Rewear Circle. Đây là mô hình miền khái niệm, không phải là lược đồ cơ sở dữ liệu cuối cùng.

## **2. Các thực thể cốt lõi**

### **Người dùng**

Đại diện cho người dùng đã đăng ký sử dụng Rewear Circle.

Các thuộc tính tiềm năng:

- nhận dạng
- tên_hiển_danh
- email (nếu được thu thập bằng phương thức xác thực đã chọn)
- ảnh đại diện (tùy chọn)
- created_at
- trạng thái tài khoản (giá trị chính xác sẽ được xác định sau)
- Vai trò/quyền hạn (phương pháp triển khai sẽ được xác định sau)
Người dùng có thể tạo tin đăng và cũng có thể đặt hàng với tư cách người mua. Quyền quản trị viên phải được cấp phép riêng.

### **Tin đăng**

Hình ảnh này thể hiện một món đồ thời trang đường phố đã qua sử dụng được người bán rao bán.

Các thuộc tính tiềm năng:

- nhận dạng
- seller_id
- tiêu đề
- Sự miêu tả
- loại mặt hàng/danh mục
- kích cỡ
- tình trạng
- khuyết tật
- giá
- khu vực đón khách
- trạng thái
- created_at
- updated_at
Một danh sách cần cung cấp hình ảnh. Việc hình ảnh được lưu trữ dưới dạng một thực thể/bảng riêng biệt hay dưới dạng các bản ghi phương tiện liên quan là một quyết định thiết kế kỹ thuật.

### **Hình ảnh tin đăng**

Thể hiện hình ảnh liên quan đến một tin đăng, nếu được mô hình hóa riêng biệt.

Các thuộc tính tiềm năng:

- nhận dạng
- listing_id
- URL hình ảnh hoặc tham chiếu lưu trữ
- hiển thị_thứ_hàng
- created_at
### **Lượt mua chung (Checkout) **

Một lần Buyer xác nhận mua các món đã chọn. Checkout lưu Buyer, tổng tiền, tiền tệ và danh sách các đơn được tạo trong lần mua này.” Thuộc tính gợi ý: checkout_id, buyer_id, total_amount, currency, status, created_at.

### **Đơn hàng**

Phần của một Checkout thuộc về **một Seller**. Một đơn có thể gồm nhiều món của Seller đó.

Các thuộc tính tiềm năng:

- order_id
- checkout_id
- buyer_id
- seller_id
- order_total
- status
- created_at
Đề xuất này yêu cầu một mã số đơn hàng duy nhất trước khi chuyển hướng đến trang thanh toán. Việc mã số đơn hàng công khai có trùng với mã số nội bộ hay không là một quyết định kỹ thuật.

### **Món trong đơn **

Một món cụ thể thuộc đơn, tham chiếu một tin đăng bán. Số lượng luôn bằng 1. Lưu giá và thông tin món tại thời điểm Buyer xác nhận mua.

Thuộc tính gợi ý:

- order_item_id
- order_id
- listing_id
- quantity = 1
- price_at_order
- product_snapshot
### **Thanh toán**

Khoản thanh toán tổng cho một Checkout.

Các thuộc tính tiềm năng:

- checkout_id
- amount
- currency
- provider_reference
- status
- created_at
- updated_at
Không lưu trữ số thẻ hoặc mã bảo mật thẻ. Các trường thông tin phải hoàn toàn phù hợp với nhà cung cấp đã chọn và các yêu cầu bảo mật.

### **Báo cáo tin đăng**

Ghi nhận phản ánh về tin bán trước khi mua. Vụ việc gắn với listing_id và reporter_id, không yêu cầu đã có đơn mua.

Các thuộc tính tiềm năng:

- nhận dạng
- listing_id
- reporter_id
- lý do
- Chi tiết (tùy chọn)
- trạng thái
- created_at
- được đánh giá bởi (tùy chọn)
- reviewed_at (tùy chọn)
Lý do báo cáo tin trước mua đã chốt: ảnh/mô tả sai hoặc thiếu lỗi, nghi hàng giả, hàng cấm, nội dung phản cảm, tin trùng/spam, dấu hiệu lừa đảo, và lý do khác. Khiếu nại DELIVERY hoặc ITEM là loại vụ việc riêng, gắn với đơn và bản lưu thông tin món lúc đặt.

### **Hành động kiểm duyệt của quản trị viên**

Ghi nhận Admin, thời điểm, lý do, quyết định ẩn/giữ nguyên/cho sửa và kết quả áp dụng. Lịch sử này cần được lưu để truy vết vụ việc và kiểm tra điều kiện hiện lại tin.

Các thuộc tính tiềm năng:

- nhận dạng
- admin_id
- listing_id
- hoạt động
- lý do
- created_at
Việc này có cần phải là một thực thể riêng biệt hay không là một quyết định trong quá trình thực hiện.

## **3. Mối quan hệ khái niệm**

- Một người dùng có thể tạo không hoặc nhiều bản ghi Tin đăng.
- Mỗi tin đăng đều có một người bán (Người dùng) sở hữu.
- Một tin đăng có thể có một hoặc nhiều bản ghi hình ảnh tin đăng.
- Một người dùng có thể đặt không hoặc nhiều đơn hàng với tư cách là người mua.
- Một lượt mua có thể gồm nhiều món; hệ thống tách thành đơn theo từng người bán. Mỗi món thuộc đúng một tin bán và chỉ có số lượng 1; đơn lưu giá và thông tin món tại thời điểm đặt.
- Một Checkout thuộc một Buyer và tạo một hoặc nhiều đơn, mỗi đơn ứng với một Seller. Một đơn chứa một hoặc nhiều món trong đơn. Mỗi món trong đơn tham chiếu đúng một tin đăng bán và có số lượng 1. Khoản thanh toán tổng thuộc Checkout, không thuộc riêng một đơn của Seller.
- Một người dùng có thể gửi nhiều báo cáo tin trước mua; Buyer của đơn có thể gửi khiếu nại sau khi nhận hàng.
- Mỗi báo cáo trước mua gắn với một tin và người báo. Mỗi khiếu nại DELIVERY/ITEM gắn với một đơn, Buyer và bản lưu thông tin món của đơn.
- Admin xem một danh sách vụ việc và xử lý từng tin hoặc từng đơn. Các báo cáo về cùng mục tiêu được gom để xem xét nhưng từng báo cáo gốc, lý do và người báo vẫn được giữ.
## **5. Các ràng buộc toàn vẹn quan trọng**

- Tin đăng phải đề cập đến người bán hiện có.
- Đơn phải thuộc một Checkout và một Seller; từng món trong đơn mới tham chiếu tin đăng hiện có.
- Khoản thanh toán phải tham chiếu Checkout hiện có; số tiền thanh toán bằng tổng tiền của tất cả đơn thuộc Checkout.
- Báo cáo trước mua phải gắn với tin và người báo đã đăng nhập; khiếu nại DELIVERY/ITEM phải gắn với đơn và Buyer của đơn.
- Người dùng không thể chỉnh sửa hoặc ẩn thông tin của người dùng khác trừ khi có sự cho phép của quản trị viên.
- Số tiền được sử dụng để bắt đầu quá trình thanh toán phải được xác định và kiểm tra bởi hệ thống quản trị, chứ không chỉ dựa vào thông tin do khách hàng nhập vào.
- Thông báo cho nhà cung cấp phải được liên kết với khoản thanh toán/đơn đặt hàng chính xác và được xử lý một cách nhất quán.
- Mỗi món chỉ được giữ sau khi Buyer xác nhận mua, ban đầu 15 phút. Hết hạn tra cứu cổng: thành công thì SOLD/PAID nếu không xung đột; thất bại/hết hạn đã xác minh thì giải phóng nếu đủ điều kiện; chưa rõ thì tra cứu lại sau 1, 3, 5 phút. Vẫn chưa rõ hoặc xung đột Checkout khác thì paymentReviewHold chặn bán/giao và Checkout/đơn NEEDS_REVIEW. Khóa này độc lập với lý do Seller/Admin ẩn.
## **6. Các quyết định cần hoàn thiện**

- Liệu Listing Image có phải là một bảng/thực thể riêng biệt hay không.
- Đã chốt: mỗi tin bán có một món; một lượt mua có thể gồm nhiều món và được tách thành đơn theo từng người bán.
- Đã chốt cho MVP: không tạo lần thử thanh toán thứ hai trên cùng Checkout. Sau khi cổng xác minh thất bại và món được giải phóng an toàn, Buyer chỉ có thể đặt lại bằng Checkout mới nếu món vẫn đủ điều kiện bán.
- MVP không quản lý khoản chi trả cho Seller hoặc thỏa thuận chuyển tiền riêng giữa Buyer và Seller. PAY vẫn phải ghi nhận, xác minh và cho phép tra cứu giao dịch thanh toán tổng của Checkout.
- Đã chốt: phải lưu lịch sử quyết định kiểm duyệt và truy cập dữ liệu hỗ trợ để điều tra, với quyền xem giới hạn theo vụ việc.
- Các trường, kiểu dữ liệu, chỉ mục và ràng buộc chính xác của cơ sở dữ liệu. Những điều này thuộc về mô hình dữ liệu kỹ thuật.
## BỔ SUNG MÔ HÌNH VỤ VIỆC — ĐÃ CHỐT 23/10/2026

Một danh sách xử lý của Admin chứa hai loại mục: (1) tin bán bị báo cáo trước mua; (2) đơn bị Buyer khiếu nại sau khi nhận hàng. Mỗi mục trỏ đến tin hoặc đơn tương ứng; nhiều báo cáo về cùng mục tiêu hiện chung một mục nhưng các bản ghi báo cáo gốc vẫn độc lập.

Khiếu nại ITEM cần mã đơn, Buyer, lý do, mô tả, thời điểm, bằng chứng được gửi và bản lưu giá/thông tin món lúc đặt. Lý do đã chốt: sai món; tình trạng khác mô tả/lỗi không khai báo; thiếu phụ kiện; nghi hàng giả; hư hại khi nhận; lý do khác. Vụ việc có trạng thái OPEN → IN_REVIEW → CLOSED, lưu kết quả xử lý và thông báo tóm tắt cho người gửi.

Quyền hỗ trợ chỉ áp dụng cho vụ được giao: mã vụ, tin/đơn, bản lưu thông tin món, số tiền, mốc thời gian, trạng thái vận chuyển, mã tham chiếu và trạng thái thanh toán, bằng chứng. Việc xem thông tin liên hệ/địa chỉ phải có lý do và được ghi lại; không xem mật khẩu, số thẻ hoặc các đơn không liên quan.

Hồ sơ và bằng chứng vụ việc lưu 12 tháng sau khi đóng; sau đó xóa hoặc ẩn danh dữ liệu không còn cần thiết, giữ thống kê vô danh nếu cần. Lịch sử giao dịch tài chính được quản lý riêng.

QUYẾT ĐỊNH MVP ĐÃ CHỐT — DỮ LIỆU VÀ VÒNG ĐỜI

Một tài khoản xác minh email thông thường có thể mua và gửi tin bán; không cần email trường hoặc duyệt hồ sơ Seller riêng. Hồ sơ cơ bản gồm tên hiển thị, email và ảnh đại diện tùy chọn.

Tin bán gồm tên, danh mục, kích cỡ, tình trạng, mô tả lỗi, giá VND, khu vực gửi hàng và 1–5 ảnh JPEG/PNG/WebP, mỗi ảnh tối đa 5 MB. Danh mục, giới hạn giá và độ dài trường theo BR-LISTING-008.

Mỗi tin chỉ có một bản sửa đang chờ Admin duyệt. Seller có thể gửi form sửa khi món RESERVED; đơn đã tạo vẫn dùng bản lưu lúc đặt. Món SOLD không cho sửa; số phiên bản ngăn bản sửa đồng thời ghi đè.

PAY xác minh thành công thì món chuyển SOLD. Buyer xác nhận “Đã nhận” sau khi Seller tự đặt vận chuyển ngoài hệ thống và món được giao thì đơn chuyển COMPLETED; không tự hoàn tất khi Buyer chưa xác nhận. Buyer chỉ tự hủy trước khi tạo lần thử thanh toán đầu tiên; Seller không tự hủy đơn. Sau đó dùng vụ việc hỗ trợ.

Tin SOLD có trang chi tiết qua liên kết trực tiếp với watermark “Đã bán”, không có nút mua và không xuất hiện trong feed món còn bán. Tin pending/rejected/ẩn không công khai. Tìm kiếm cho tài khoản đăng nhập theo tên/mô tả, mới nhất trước, mặc định 20 kết quả/trang.

Các chuyển tiếp chính của Listing, Checkout, Order, Payment và Case đồng bộ với Enum, API, database và workflow. Kết quả đến muộn/mâu thuẫn đã chốt theo State Lifecycles; IPN GET/QueryDr của VNPAY đã chọn; checksum và ánh xạ mã kết quả cần kiểm chứng với khóa sandbox.

Cập nhật 26/10/2026

User có emailVerifiedAt (ban đầu rỗng). EmailVerificationToken chỉ lưu hash mã, hạn dùng, thời điểm sử dụng và số lần gửi; không lưu token thuần.

Checkout lưu recipientName, recipientPhone và recipientAddress do Buyer nhập. Mỗi Order theo Seller có recipientSnapshot riêng, carrierName, trackingCode, shippedAt và receivedAt; Seller chỉ thấy Order của mình.

Complaint gắn orderId, buyerId, type DELIVERY hoặc ITEM. DELIVERY áp dụng PAID và toàn Order. ITEM áp dụng COMPLETED, có affectedOrderItemIds không rỗng; mọi ID phải thuộc Order. Điều tra dùng OrderItem snapshot, không dùng Listing đang thay đổi.

OrderStatus có PAYMENT_FAILED bên cạnh EXPIRED. Checkout PAYMENT_FAILED/EXPIRED và các Order PENDING cùng Checkout cập nhật nhất quán sau khi kết quả chưa trả được xác minh.

## Bổ sung mô hình COD — 28/10/2026

Checkout/Order bắt buộc paymentMethod=VNPAY|COD, cố định từ lúc đặt. Các quy tắc attempt tổng, giữ 15 phút và SOLD sau xác minh cổng trong mô hình trên áp dụng VNPAY. COD chốt SOLD/CONFIRMED/UNPAID khi đặt, expiresAt=null và không tạo Payment VNPAY.

COD có collection theo Order (tối đa một hiệu lực): amount/currency, Seller ghi nhận, source=SELLER_DECLARATION, recordedAt, requestId và idempotency. Yêu cầu hoàn có Order/Seller/reason, thời điểm và quyết định Admin; một yêu cầu mở/Order. Order có CONFIRMED/RETURNED và paymentStatus riêng; Checkout tổng hợp collectibleAmount/collectedAmount/outstandingAmount từ các Order mà không ghi đè tổng snapshot gốc. Schema Mongoose cho collection/return đã được thêm; route ghi nhận/ra quyết định thuộc các bước sau.

Seller chỉ đọc địa chỉ đơn COD của mình khi được giao, không đọc Checkout/Order Seller khác. Shipment/receipt hỗ trợ COD CONFIRMED; DELIVERY nhận cả đơn COD chưa nhận, ITEM sau COMPLETED. Mọi quy tắc thu/hủy/hoàn và hold theo [hợp đồng A-09](../report/backend-orders-vnpay-sandbox-master-report.md).

## Bổ sung schema thanh toán — 28/10/2026

`PaymentAttempt` là hồ sơ VNPAY duy nhất cho một Checkout, có unique Checkout/merchantReference/idempotency key và thông tin checkpoint/lease đối chiếu. `PaymentEvent` lưu field đã lọc cùng kết quả kiểm tra và hash payload; không lưu callback thô. `Order.items` có `_id` ổn định cho khiếu nại. Listing giữ `soldCheckoutId` và danh sách Checkout đang payment review. AuditEvent phân biệt actor USER/PROVIDER/SYSTEM.

Checkout/Order hỗ trợ `contractVersion=1` để đọc và ghi tương thích trong lúc chuyển đổi; Checkout/Order version 2 kiểm tra bắt buộc các trường hợp đồng mới. Các schema/index definitions và migration plan đã có trong repo; chưa xác nhận index tạo trên MongoDB, chưa backfill hoặc thay đổi dữ liệu cũ.
