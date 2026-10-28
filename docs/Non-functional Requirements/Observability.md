# **Observability**

Cập nhật 26/10/2026: bổ sung sự kiện xác minh email, vận đơn, DELIVERY/ITEM và IPN VNPAY.

## **1. Mục tiêu và phạm vi**

Observability giúp nhóm phát triển và Admin theo dõi hoạt động của hệ thống, tìm nguyên nhân khi xảy ra lỗi và kiểm tra lịch sử thay đổi của tin đăng, đơn hàng, thanh toán và các vụ việc.

Khi Buyer, Seller hoặc Admin nhìn thấy trạng thái khác nhau, hệ thống cần cung cấp đủ thông tin để xác định chuyện gì đã xảy ra, ai thực hiện, vào thời điểm nào và kết quả ra sao.

**Nguyên tắc quan trọng:** Log hệ thống chỉ phục vụ theo dõi và điều tra. Việc xác định thanh toán thành công phải dựa trên kết quả được xác minh từ cổng thanh toán, không chỉ dựa vào log.

Các yêu cầu bên dưới đều là **đề xuất cho MVP**, cần được xem xét và thống nhất trước khi triển khai.

## **2. Ghi nhận và truy vết hoạt động**

### **NFR-OBS-01 — Liên kết thông tin giao dịch**

Mỗi yêu cầu gửi đến hệ thống cần có một request_id. Các hoạt động liên quan đến giao dịch cần có thêm những mã định danh phù hợp:

- checkout_id: mã của một lần checkout.
- order_id: mã của đơn hàng thuộc một Seller.
- attempt_id: mã của một lần thử thanh toán.
- gateway_reference: mã tham chiếu do cổng thanh toán cung cấp.
Các mã này cần được liên kết với nhau để có thể tra cứu toàn bộ quá trình từ khi Buyer bắt đầu checkout đến khi đơn hàng được cập nhật trạng thái thanh toán.

### **NFR-OBS-02 — Lưu lịch sử thay đổi tin đăng và đơn hàng**

Hệ thống cần ghi lại thời gian và người thực hiện các hoạt động quan trọng, bao gồm:

- Seller gửi tin đăng mới hoặc gửi yêu cầu chỉnh sửa tin.
- Admin duyệt, từ chối, ẩn hoặc hiển thị lại tin đăng.
- Buyer xác nhận đặt hàng.
- Hệ thống giữ hoặc giải phóng món hàng.
- Admin xử lý báo cáo hoặc khiếu nại DELIVERY/ITEM; Seller nhập vận đơn; Buyer xác nhận Đã nhận; ACC xác minh email.
Đối với đơn hàng, hệ thống cần lưu lại thông tin và giá của món hàng tại thời điểm đặt. Những thay đổi về tin đăng sau đó không được làm thay đổi thông tin của đơn hàng đã tạo.

### **NFR-OBS-03 — Ghi nhận hoạt động thanh toán**

Khi nhận callback/webhook hoặc kiểm tra kết quả từ cổng thanh toán, hệ thống cần lưu các thông tin cần thiết để đối chiếu, bao gồm:

- Mã tham chiếu của giao dịch.
- Số tiền và thời điểm giao dịch.
- Kết quả xác minh thanh toán.
- Kết quả xử lý IPN GET/QueryDr, gồm áp dụng kết quả hoặc bỏ qua thông báo trùng.
- Trạng thái đơn hàng trước và sau khi xử lý.
Hệ thống không được ghi vào log thông tin thẻ thanh toán, mã bảo mật, mật khẩu, token xác thực hoặc các bí mật khác.

### **NFR-OBS-04 — Quản lý vụ việc và theo dõi truy cập dữ liệu**

Khi một tin đăng bị báo cáo hoặc một đơn hàng bị khiếu nại, hệ thống tạo hoặc liên kết hồ sơ vụ việc tương ứng để Admin xử lý. Không tự tạo vụ việc cho mọi tin đăng và đơn hàng.

Nếu nhiều người báo cáo cùng một tin hoặc đơn, hệ thống nhóm chúng trong danh sách Admin nhưng vẫn giữ riêng từng bản gốc, người gửi, lý do và bằng chứng.

Khi nhân viên hỗ trợ truy cập thông tin nhạy cảm như địa chỉ giao hàng hoặc thông tin liên hệ, hệ thống cần ghi lại người truy cập, thời gian và thông tin được truy cập ở mức cần thiết.

## **3. Theo dõi chỉ số và cảnh báo**

### **NFR-OBS-05 — Theo dõi chỉ số hoạt động**

Hệ thống cần theo dõi các chỉ số quan trọng để phát hiện lỗi và các trạng thái bất thường, bao gồm:

- Tỷ lệ lỗi và thời gian phản hồi p95 của các trang/API.
- Số lần checkout được tạo, thanh toán thành công, thất bại hoặc chưa xác định được kết quả.
- Số món hàng bị giữ quá thời hạn quy định.
- Số callback/webhook bị lỗi hoặc bị gửi trùng.
- Số vụ việc OPEN và IN_REVIEW chờ Admin xử lý; thống kê riêng báo cáo tin trước mua và khiếu nại đơn sau nhận.
- Số lần gửi hoặc xử lý biểu mẫu duyệt tin bị lỗi.
Các chỉ số này giúp xác định khu vực đang gặp vấn đề và ưu tiên xử lý.

### **NFR-OBS-06 — Kiểm tra sức khỏe hệ thống và phát cảnh báo**

Hệ thống cần có cơ chế kiểm tra trạng thái hoạt động của:

- Ứng dụng Rewear Circle.
- Cơ sở dữ liệu.
- Kết nối với cổng thanh toán sandbox.
Hệ thống nên phát cảnh báo khi phát hiện một trong các tình huống sau:

- Lỗi checkout hoặc webhook tăng bất thường.
- Món hàng đã bị giữ quá 15 phút nhưng chưa được đối chiếu và xử lý.
- Checkout có kết quả chưa rõ sau mốc tra cứu 1, 3, 5 phút hoặc có kết quả muộn xung đột với Checkout khác: cảnh báo NEEDS_REVIEW, khóa bán/giao món và giao vụ điều tra. PAY vẫn ghi đúng SUCCESS nếu khoản tiền đã được cổng xác minh.
Việc cảnh báo phải giúp phát hiện vấn đề kịp thời, đặc biệt khi có nguy cơ bán trùng một món hàng hoặc cập nhật sai trạng thái thanh toán.

### **NFR-OBS-07 — Công cụ điều tra giao dịch cho Admin**

Admin cần giao diện tra cứu giao dịch có phân quyền, cho phép tìm bằng order_id hoặc mã tham chiếu cổng; có thể giao vụ cho Support nhưng không đánh dấu Đã thanh toán thủ công.

Kết quả tra cứu cần hiển thị tối thiểu:

- Số tiền của giao dịch.
- Các mã định danh liên quan.
- Thời điểm xảy ra những sự kiện quan trọng.
- Lịch sử thay đổi trạng thái đơn hàng và thanh toán.
- Kết quả xác minh thanh toán và thông tin cần thiết để tiếp tục điều tra.
Admin không được có thao tác thủ công để chuyển đơn hàng sang trạng thái “Đã thanh toán”. Trạng thái này chỉ được cập nhật dựa trên kết quả thanh toán đã được xác minh theo quy trình tích hợp.

## **4. Bảo vệ dữ liệu và thời gian lưu trữ**

### **NFR-OBS-08 — Quy định lưu trữ và quyền truy cập log**

Hệ thống cần giới hạn quyền xem log và chỉ cho phép những người có nhiệm vụ phù hợp truy cập dữ liệu.

Các mốc lưu trữ đã chốt và đang đề xuất cho MVP:

- **Log kỹ thuật:** 30 ngày trong môi trường demo.
- **Hồ sơ vụ việc và bằng chứng:** 12 tháng kể từ ngày vụ việc được đóng.
- **Hồ sơ tài chính:** Áp dụng chính sách lưu trữ riêng, phù hợp với yêu cầu quản lý và quy định liên quan.
Log không được chứa mật khẩu, token xác thực, dữ liệu thẻ thanh toán hoặc thông tin riêng tư không cần thiết.

Thời gian lưu hồ sơ vụ việc và bằng chứng **12 tháng sau khi đóng vụ đã được chốt**. Thời gian lưu log kỹ thuật **30 ngày vẫn là đề xuất** và cần xác nhận theo môi trường triển khai. Hồ sơ tài chính có chính sách lưu trữ riêng, chưa chốt trong tài liệu này.

## **5. Kiểm chứng tối thiểu**

Cần thực hiện ít nhất bốn tình huống kiểm thử sau:

- **Callback bị gửi trùng:** Xác nhận hệ thống ghi nhận được thông báo trùng và không xử lý thanh toán hai lần.
- **Kết quả thanh toán đến muộn: kiểm tra hệ thống lưu thời điểm nhận, đối chiếu trạng thái cổng và xử lý trùng một lần. Nếu không xung đột thì cập nhật PAID/SOLD; nếu có Checkout khác thì giữ SUCCESS trong PAY nhưng Checkout/đơn NEEDS_REVIEW và món paymentReviewHold. Không tự giao hai Buyer hoặc hoàn tiền.**
- **Tin đăng bị Admin ẩn:** Xác nhận có thể tra cứu người thực hiện, thời điểm và lịch sử thay đổi trạng thái.
- **Nhiều báo cáo cùng một món hàng:** Xác nhận các báo cáo được liên kết đúng vụ việc nhưng vẫn giữ riêng người gửi, lý do và bằng chứng.
**Tiêu chí đạt:** Với các mã định danh liên quan, có thể giải thích được ai đã thực hiện hành động gì, vào thời điểm nào và hệ thống đã xử lý ra sao. Quá trình điều tra không được làm lộ dữ liệu nhạy cảm.

## **6. Tài liệu tham khảo**

OWASP Logging Cheat Sheet:[ ](<https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>)[https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html](<https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>)

Tài liệu hướng dẫn các nguyên tắc ghi log phục vụ giám sát và điều tra sự cố, đồng thời hạn chế việc lưu trữ dữ liệu nhạy cảm không cần thiết.

QUYẾT ĐỊNH VỤ VIỆC ĐÃ CHỐT

Vụ việc đi qua OPEN → IN_REVIEW → CLOSED, lưu kết quả xử lý và thông báo tiếp nhận/kết quả tóm tắt cho người gửi; người gửi không được xem dữ liệu điều tra nội bộ. Nhiều báo cáo cùng mục tiêu được gom trong danh sách nhưng mỗi bản gốc vẫn được lưu. Thời gian lưu hồ sơ/bằng chứng 12 tháng sau đóng vụ đã chốt; thời gian giữ log kỹ thuật 30 ngày và dữ liệu thanh toán sandbox còn cần xác nhận riêng.
