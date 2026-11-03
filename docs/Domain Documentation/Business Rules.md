# **Quy tắc nghiệp vụ — Rewear Circle**

Cập nhật 26/10/2026: giao nhận thủ công, khiếu nại DELIVERY/ITEM, xác minh email và trạng thái thanh toán.

## **1. Mục đích**

Tài liệu này ghi lại các ràng buộc kinh doanh đối với thị trường quần áo đường phố cũ C2C của Rewear Circle.

Các quy tắc được phân loại như sau:

- **Đề xuất được định nghĩa như sau:**Được đề xuất trong dự án hỗ trợ một cách rõ ràng.
- **Đề xuất quy tắc MVP:**Một quy tắc được đề xuất mà nhóm nên xác nhận trước khi thực hiện.
- **Sẽ được thông báo sau:**Một quyết định chưa được nêu rõ trong đề xuất.
## **2. Quy tắc người dùng và vai trò**

### **BR-USER-001 — Tài khoản người mua/người bán dùng chung**

**Phân loại:**Đã chốt-định nghĩa

Người dùng đã đăng ký có thể đóng vai trò là người mua hoặc người bán tùy thuộc vào hoạt động. Việc mua và bán không yêu cầu tài khoản riêng biệt.

### **BR-USER-002 — Quyền truy cập quản trị bị hạn chế**

**Phân loại:**Quy tắc MVP được đề xuất

Chỉ những tài khoản Quản trị viên được ủy quyền mới có thể thực hiện các thao tác kiểm duyệt quản trị. Người dùng thông thường không được phép giành quyền Quản trị viên bằng cách thay đổi dữ liệu phía máy khách.

### **BR-USER-003 — Điều kiện đủ điều kiện tài khoản**

**Phân loại: Đã chốt cho MVP**

Một tài khoản đăng ký với email được xác minh có thể mua và gửi tin bán; MVP không bắt buộc email trường hoặc duyệt hồ sơ Seller. Việc xác minh tư cách sinh viên bằng email trường được để ngoài MVP.

## **3. Quy tắc về tin đăng**

### **BR-LISTING-001 — Thông tin đăng tải bắt buộc**

**Phân loại:**Đề xuất-định nghĩa

Mô tả sản phẩm cần cung cấp thông tin có cấu trúc cần thiết để đánh giá mặt hàng, bao gồm:

- Hình ảnh.
- Tên/loại mặt hàng.
- Kích cỡ.
- Sự miêu tả.
- Tình trạng.
- Các lỗi đã biết.
- Giá.
- Khu vực gửi hàng của Seller.
### **BR-LISTING-002 — Thông tin quyền sở hữu tin đăng**

**Phân loại:**Quy tắc MVP được đề xuất

Người dùng chỉ có thể chỉnh sửa hoặc ẩn các tin đăng mà họ sở hữu, trừ khi đó là thao tác được quản trị viên ủy quyền thực hiện.

### **BR-LISTING-003 — Khám phá tin đăng**

**Phân loại:**Đề xuất-định nghĩa

Người dùng có thể duyệt, tìm kiếm và lọc danh sách theo loại mặt hàng, kích thước, tình trạng và giá cả. Chỉ tin đã được Admin duyệt, đang hiển thị và còn đủ điều kiện bán mới xuất hiện như món có thể mua.

### **BR-LISTING-004 — Ẩn một tin đăng**

**Phân loại:**Đề xuất-định nghĩa

Người bán có thể ẩn tin đăng của họ. Tin đăng bị ẩn sẽ không hiển thị là mặt hàng có sẵn trong kết quả tìm kiếm công khai thông thường.

### **BR-LISTING-005 — Tình trạng hàng hóa và đơn đặt hàng trùng lặp**

**Phân loại:**Đã chốt

Mỗi tin đăng bán tương ứng một món, số lượng 1. Thêm vào giỏ không giữ món. Khi Buyer xác nhận mua VNPAY, hệ thống kiểm tra lại giá và khả năng bán, tạo Checkout/đơn theo Seller và giữ món ban đầu 15 phút. Hết hạn kích hoạt đối chiếu; các checkpoint nội bộ là lúc hết hạn và sau 1, 3, 5 phút. Do giới hạn QueryDr của cổng (mã 94 cho request trùng trong 5 phút), lần +1/+3 kiểm tra IPN đến mới; không gọi QueryDr quá sớm. Kết quả chưa rõ tiếp tục chặn bán. Chỉ giải phóng khi đã xác minh chưa thanh toán và không còn xung đột. Việc giải phóng không tự gỡ lý do Seller/Admin ẩn hoặc chờ duyệt bản sửa; món chỉ được mua khi mọi điều kiện bán đều hợp lệ. COD theo BR-ORDER-006/BR-PAYMENT-011.

### **BR-LISTING-006 — Độ chính xác của thông tin đăng tải**

**Phân loại:**Đề xuất-định nghĩa

Người bán được yêu cầu cung cấp thông tin sản phẩm chính xác, bao gồm tình trạng và các khuyết tật đã biết. Nền tảng này cung cấp các trường thông tin được cấu trúc sẵn và cơ chế báo cáo/kiểm duyệt nhưng không đảm bảo xác thực thương hiệu tự động.

### **BR-LISTING-007 — Admin duyệt tin trước khi công khai**

**Phân loại: Đã chốt**

Tin đăng mới do Seller gửi ở trạng thái chờ duyệt và chưa xuất hiện như món có thể mua. Chỉ sau khi Admin duyệt đúng phiên bản Seller đã gửi, tin mới được hiển thị công khai nếu không có hạn chế khác.

Khi Seller gửi form sửa gồm đầy đủ thông tin sản phẩm, phiên bản đã duyệt trước đó bị ẩn trong thời gian chờ Admin duyệt phiên bản mới. Nếu Admin từ chối, tin tiếp tục không được hiển thị như món có thể mua và Seller được thông báo lý do.

Đơn đã tạo và món đã được giữ trước khi Seller gửi form sửa vẫn dùng giá, thông tin món đã lưu lúc đặt; việc gửi form sửa không làm gián đoạn thanh toán của đơn đó.

## **4. Quy tắc đặt hàng**

**Bổ sung 28/10/2026 — Hai phương thức:** Checkout bắt buộc paymentMethod=VNPAY|COD; một phương thức cho toàn Checkout, không đổi sau tạo. Các quy tắc 15 phút, một payment attempt, xác minh cổng trước SOLD, QueryDr, hủy trước attempt và PAID trước giao trong tài liệu này áp dụng nhánh VNPAY. COD theo BR-ORDER-006/BR-PAYMENT-011 cuối tài liệu và [hợp đồng A-09](../report/backend-orders-vnpay-sandbox-master-report.md).

### **BR-ORDER-001 — Mã số đơn hàng**

**Phân loại:**Đề xuất-định nghĩa

Hệ thống tạo **mã Checkout** và mã riêng cho **từng đơn Seller** trước khi chuyển tới cổng thanh toán.

### **BR-ORDER-002 — Đơn đặt hàng và thanh toán là riêng biệt**

**Phân loại:**Quy tắc MVP được đề xuất

Đơn đặt hàng và hồ sơ thanh toán phải được mô hình hóa riêng biệt. Một lần thử thanh toán có thể thay đổi trạng thái mà không xóa hồ sơ đơn đặt hàng.

### **BR-ORDER-003 — Tạo đơn hàng và đặt chỗ**

**Phân loại:Đã chốt **

Hệ thống tạo Checkout, các đơn theo Seller và lưu giá/thông tin từng món tại thời điểm Buyer xác nhận mua. Đơn đã giữ chỗ không bị đổi giá hoặc gián đoạn thanh toán nếu Seller gửi form sửa sau đó. Không thử thanh toán lại trên cùng Checkout trong MVP. Kết quả đến muộn hoặc mâu thuẫn xử lý theo BR-PAYMENT-009.

### **BR-ORDER-004 — Hủy đơn hàng**

**Phân loại: Đã chốt cho MVP**

Buyer chỉ được tự hủy Checkout trước khi tạo lần thử thanh toán đầu tiên. Sau khi đã bắt đầu thanh toán hoặc đã trả tiền, Buyer và Seller không có nút tự hủy; trường hợp cần hỗ trợ được ghi thành vụ việc. Hủy trước thanh toán chỉ giải phóng món sau khi hệ thống xác nhận không có giao dịch thanh toán chưa rõ; việc giải phóng không gỡ lý do ẩn.

## **5. Quy tắc thanh toán**

### **BR-PAYMENT-001 — Chỉ dành cho môi trường thử nghiệm (Sandbox) để minh họa khóa học**

**Phân loại:**Đề xuất-định nghĩa

Bản demo khóa học sử dụng chế độ thử nghiệm/môi trường ảo của nhà cung cấp dịch vụ thanh toán và không chuyển tiền thật.

### **BR-PAYMENT-002 — Nhà cung cấp xử lý dữ liệu thanh toán nhạy cảm**

**Phân loại:**Đề xuất-định nghĩa

Nhà cung cấp dịch vụ thanh toán xử lý thông tin thanh toán nhạy cảm. Rewear Circle không được phép lưu trữ số thẻ hoặc mã bảo mật thẻ.

### **BR-PAYMENT-003 — Xác minh thông báo của nhà cung cấp**

**Phân loại:**Đề xuất-định nghĩa

Hệ thống phụ trợ phải xác minh các lệnh gọi lại/webhook theo tài liệu của nhà cung cấp đã chọn trước khi áp dụng kết quả thanh toán.

### **BR-PAYMENT-004 — Chuyển hướng không phải là bằng chứng thanh toán**

**Phân loại:**Đề xuất-định nghĩa

Việc trình duyệt chuyển hướng hoặc hiển thị trang báo thành công không phải là bằng chứng xác thực duy nhất cho thấy giao dịch đã thành công.

### **BR-PAYMENT-005 — Xử lý thông báo trùng lặp**

**Phân loại:**Đề xuất-định nghĩa

Việc gửi thông báo lặp đi lặp lại cho nhà cung cấp không được gây ra hiện tượng cập nhật thanh toán/đơn hàng trùng lặp hoặc không chính xác. Quá trình xử lý phải đảm bảo tính nhất quán.

### **BR-PAYMENT-006 — Số tham chiếu thanh toán và số tiền**

**Phân loại:**Đề xuất được xác định / Chi tiết triển khai

Yêu cầu thanh toán tham chiếu một Checkout và sử dụng tổng tiền, tiền tệ do hệ thống tính từ các đơn thuộc Checkout. Tổng tiền Checkout phải bằng tổng các đơn theo Seller. Hệ thống chỉ áp dụng kết quả khi đã xác minh và đối chiếu mã tham chiếu, số tiền, tiền tệ và trạng thái với cổng thanh toán; kết quả hợp lệ được xử lý một lần cho đúng các đơn thuộc Checkout.

### **BR-PAYMENT-007 — Kết quả thanh toán**

**Phân loại:**Đề xuất-định nghĩa

Luồng người dùng có kết quả thành công, thất bại, đang chờ và NEEDS_REVIEW. Kết quả chưa rõ hoặc xung đột không được hiển thị là đã thanh toán hoàn tất; trạng thái Payment, Checkout và Order theo State Lifecycles và BR-PAYMENT-009.

### **BR-PAYMENT-008 — Hoàn tiền và tranh chấp**

**Phân loại:**Phạm vi giới hạn được xác định trong đề xuất

Các chức năng hoàn tiền, giải quyết tranh chấp và đối chiếu tự động toàn diện nằm ngoài phạm vi của phiên bản MVP. Bản demo không được ngụ ý rằng các khả năng vận hành này được hỗ trợ đầy đủ.

### BR-PAYMENT-009 — Kết quả thanh toán đến muộn hoặc mâu thuẫn

Phân loại: Đã chốt cho MVP

Hết 15 phút, tra cứu cổng. Thành công đã xác minh: ghi SUCCESS, PAID và SOLD nếu không có Checkout khác liên quan. Thất bại/hết hạn đã xác minh và không còn giao dịch chưa rõ: giải phóng món theo điều kiện bán. Chưa rõ: tiếp tục chặn món, tra cứu lại sau 1, 3, 5 phút; vẫn chưa rõ thì Checkout/đơn NEEDS_REVIEW và giữ khóa bán. Kết quả thành công đến muộn trong khi đã có Checkout khác: ghi đúng khoản tiền đã xác minh; khóa bán/giao và đưa các Checkout/đơn liên quan NEEDS_REVIEW. Nếu Checkout sau được xác minh chưa trả, hoàn tất quyền nhận của Checkout đã trả; nếu cả hai đã trả, xử lý vụ việc thủ công qua cổng. Không tự giao một món cho hai Buyer, không tự hoàn tiền; Admin không có nút tự đánh dấu Đã thanh toán. Sự kiện giả/sai chữ ký bị từ chối và ghi log, không coi là thanh toán.

## **6. Quy tắc về sự tin tưởng và kiểm duyệt**

### **BR-TRUST-001 — Báo cáo niêm yết**

**Phân loại:**Đề xuất-định nghĩa

Người dùng đã đăng nhập có thể báo cáo tin bán có vấn đề trước khi mua. Buyer mở DELIVERY theo ma trận VNPAY/COD khi chưa nhận; sau COMPLETED mở ITEM cho đúng OrderItem snapshot. Chi tiết theo hợp đồng giao nhận 29/10/2026. Báo tin trước mua và khiếu nại đơn (DELIVERY/ITEM) có lý do và bằng chứng riêng.

### **BR-TRUST-002 — Kiểm duyệt của quản trị viên**

**Phân loại:**Đề xuất-định nghĩa

Admin xử lý một danh sách vụ việc: từng tin bị báo cáo trước mua hoặc từng đơn có vụ DELIVERY hoặc ITEM. Nhiều báo cáo về cùng mục tiêu được hiển thị chung để xem xét, nhưng từng người báo, lý do và bằng chứng vẫn được lưu. Admin chỉ ẩn tin qua hệ thống tin bán; khiếu nại sau nhận không tự động hoàn tiền.

### **BR-TRUST-003 — Không đảm bảo tính xác thực**

**Phân loại:**Phạm vi giới hạn được xác định trong đề xuất

Sản phẩm khả thi tối thiểu (MVP) không bao gồm xác thực thương hiệu tự động hoặc dịch vụ ký quỹ. Sản phẩm không được ngụ ý rằng tất cả các mặt hàng được liệt kê đã được xác thực độc lập.

## **7. Quy tắc về bảo mật và dữ liệu**

### **BR-SEC-001 — Ủy quyền phía máy chủ**

**Phân loại:**Quy tắc MVP được đề xuất

Các thao tác được bảo vệ phải thực thi quyền truy cập ở phía máy chủ, bao gồm cả việc liệt kê quyền sở hữu và quyền quản trị.

### **BR-SEC-002 — Dữ liệu thanh toán tối thiểu**

**Phân loại:**Đề xuất-định nghĩa

Chỉ lưu trữ thông tin tham chiếu thanh toán/đơn hàng và trạng thái cần thiết cho MVP; không lưu trữ số thẻ hoặc mã bảo mật thẻ.

### **BR-SEC-003 — Các sự kiện liên quan đến kiểm toán**

**Phân loại:**Quy tắc MVP được đề xuất

Lưu thời điểm, người thực hiện, mã vụ việc/đơn, quyết định kiểm duyệt và kết quả xác minh thanh toán để truy vết. Nhân viên hỗ trợ chỉ xem dữ liệu cần thiết của vụ được giao; không lưu số thẻ, mã bảo mật hoặc dữ liệu thanh toán nhạy cảm. Hồ sơ báo cáo/khiếu nại và bằng chứng được giữ 12 tháng sau khi đóng vụ, rồi xóa hoặc ẩn danh phần không còn cần thiết.

## **8. Các quyết định cần thiết trước khi triển khai**

- Đã chốt: thêm vào giỏ chưa giữ món; tạo đơn sau khi Buyer xác nhận mua sẽ giữ từng món 15 phút. Hết hạn phải đối chiếu cổng thanh toán trước khi mở bán lại.
- Đã chốt cho MVP: món chuyển SOLD khi PAY xác minh thanh toán thành công; Buyer xác nhận đã nhận hàng thì đơn chuyển COMPLETED. Seller tự đặt dịch vụ vận chuyển ngoài hệ thống; PAID không đồng nghĩa đã giao hoặc đã nhận.
- Đã chốt cho MVP: Buyer chỉ tự hủy trước lần thử thanh toán đầu tiên; không thử lại trên cùng Checkout. Kết quả thanh toán đến muộn hoặc mâu thuẫn xử lý theo BR-PAYMENT-009; VNPAY Sandbox là cổng mục tiêu; khóa thử nghiệm, IPN công khai và ánh xạ mã kết quả phải được kiểm chứng trước khi lập trình.
- VNPAY Sandbox là cổng mục tiêu; xác minh chữ ký IPN và QueryDr theo tài liệu tích hợp, sau khi có thông số thử nghiệm.
- Đã chốt phần form: tên, danh mục, kích cỡ, tình trạng, thông tin lỗi, giá VND, khu vực gửi hàng và ít nhất một ảnh; tối đa 5 ảnh, 5 MB/ảnh, JPEG/PNG/WebP. Danh mục, giới hạn giá và độ dài trường theo BR-LISTING-008.
- Đã chốt phạm vi Admin MVP: duyệt/từ chối, ẩn/hiện tin, xử lý vụ việc, tra cứu giao dịch có phân quyền và giao vụ cho Support; không sửa tin thay Seller, không tự đánh dấu Đã thanh toán hoặc quản lý chi trả Seller.
- Đã chốt: chỉ xác minh email thông thường; không yêu cầu email trường hay duyệt hồ sơ Seller.
- Đã chốt: báo cáo tin trước mua và khiếu nại đơn sau nhận được xử lý trong một danh sách vụ việc; Admin xử lý từng tin hoặc từng đơn, giữ lại từng báo cáo gốc.
## QUYẾT ĐỊNH BỔ SUNG — BÁO CÁO VÀ HỖ TRỢ (23/10/2026)

Báo cáo tin bán trước mua — mô tả form: “Bạn thấy tin bán có thông tin sai, thiếu hoặc nội dung đáng ngờ dù chưa mua món? Hãy chọn lý do và mô tả điều bạn phát hiện.” Bộ lý do đã chốt: thông tin/ảnh sai hoặc thiếu lỗi; nghi hàng giả; hàng cấm/không phù hợp; nội dung phản cảm; tin trùng/spam; dấu hiệu lừa đảo; lý do khác (ghi rõ).

Khiếu nại đơn sau khi nhận hàng — mô tả form: “Bạn đã nhận món nhưng món thực tế không đúng với thông tin trong đơn? Hãy chọn đơn, nêu vấn đề và gửi ảnh nếu có.” Bộ lý do đã chốt: nhận sai món; tình trạng khác mô tả/lỗi không khai báo; thiếu phụ kiện; nghi hàng giả; hư hại khi nhận; lý do khác (ghi rõ). Khiếu nại gắn với đơn và bản lưu thông tin món, không tự tạo hoàn tiền.

Nhân viên hỗ trợ chỉ xem vụ được giao: mã vụ việc, tin/đơn liên quan, bản lưu thông tin món và giá, các mốc thời gian, trạng thái vận chuyển, trạng thái và mã tham chiếu thanh toán, bằng chứng. Thông tin liên hệ/địa chỉ chỉ hiện khi cần; mọi lượt xem được ghi nhận. Không mở toàn bộ đơn khác, mật khẩu, số thẻ hoặc mã bảo mật.

Khôi phục tin: Seller tự ẩn có thể bấm Hiện khi tin đã duyệt và không vướng hạn chế khác. Tin bị Admin ẩn vì lỗi nhẹ cần Seller gửi form đầy đủ và Admin duyệt lại; lỗi phải được sửa, ảnh/mô tả phải khớp, món còn bán và không có lý do ẩn khác. Lần gửi lại tính vào giới hạn 5 lượt. Lỗi nặng tiếp tục ẩn; tin đã bán không mở bán lại bằng nút Hiện.

Điều tra giao dịch: đối chiếu mã đơn, mã tham chiếu, số tiền, tiền tệ, thời điểm và trạng thái từ cổng; chỉ hệ thống ghi nhận khoản đã thanh toán từ kết quả hợp lệ và xử lý một lần. Sau 15 phút tra cứu cổng; nếu chưa rõ tra cứu lại sau 1, 3, 5 phút rồi đưa NEEDS_REVIEW nếu vẫn chưa rõ. Khi kết quả muộn xung đột với Checkout khác, ghi đúng kết quả tài chính, khóa món/giao và điều tra theo BR-PAYMENT-009. Không giao cùng món cho hai Buyer, không tự hoàn tiền và Admin không tự đánh dấu Đã thanh toán.

QUYẾT ĐỊNH BỔ SUNG — 24/10/2026

Tin đăng chuyển SOLD ngay khi kết quả thanh toán của Checkout được cổng xác minh thành công; không đợi giao/nhận. Buyer tự xác nhận Đã nhận trên đơn; khi đó đơn chuyển COMPLETED và đủ điều kiện gửi khiếu nại sau nhận. Không tự hoàn tất đơn nếu Buyer chưa xác nhận.

Mỗi tin chỉ có một bản sửa PENDING tại một thời điểm. Seller có thể gửi form sửa khi món RESERVED, nhưng đơn đã tạo không đổi; tin SOLD không nhận bản sửa. Các cập nhật đồng thời phải kiểm tra phiên bản để tránh ghi đè.

Tin SOLD được giữ qua liên kết trực tiếp với watermark “Đã bán”, không có nút mua và không có trong feed món còn bán. Tin PENDING/REJECTED/ẩn không mở công khai. Người đã đăng nhập tìm theo tên/mô tả, mặc định sắp xếp mới nhất và 20 kết quả/trang.

Vụ việc dùng OPEN → IN_REVIEW → CLOSED và lưu kết quả xử lý. Người báo được thông báo đã tiếp nhận và kết quả tóm tắt, không xem dữ liệu nội bộ. Nhiều báo cáo cùng mục tiêu được nhóm cho Admin nhưng từng bản gốc vẫn lưu riêng.

Cập nhật 26/10/2026

BR-USER-004 — Xác minh email: đăng ký tạo tài khoản chưa xác minh; email chứa mã dùng một lần có hạn. Chỉ sau khi xác minh mới được mua, đăng bán hoặc báo cáo. Gửi lại mã phải giới hạn tần suất; không tiết lộ email có tồn tại hay không.

BR-ORDER-005 — Giao nhận thủ công: Buyer nhập tên, điện thoại và địa chỉ nhận khi checkout. Mỗi Order theo Seller lưu bản chụp thông tin nhận riêng. Seller chịu phí vận chuyển và đã tính vào giá niêm yết; tổng Checkout chỉ cộng giá món. Seller tự đặt vận chuyển và ghi hãng/mã vận đơn khi VNPAY PAID/PAID hoặc COD đủ điều kiện; server ghi shippedAt. Buyer xác nhận Đã nhận khi không có active Order Case/hold mới chuyển COMPLETED, không tự xác nhận đã thu COD. Dùng dữ liệu nhận hàng giả khi demo.

BR-TRUST-004 — Khiếu nại giao nhận: Buyer mở DELIVERY cho VNPAY PAID/PAID, COD CONFIRMED hợp lệ hoặc ngoại lệ COD đang yêu cầu hoàn theo ma trận đã chốt 29/10/2026. Phạm vi toàn Order, cấm gửi affectedOrderItemIds kể cả mảng rỗng. Vụ ITEM chỉ gửi sau COMPLETED; affectedOrderItemIds phải gồm ít nhất một OrderItem thuộc chính Order, đối chiếu bản chụp lúc đặt. Cả hai không tự hoàn tiền.

BR-PAYMENT-010 — Trạng thái xác minh: Payment FAILED dẫn Checkout PAYMENT_FAILED và mọi Order PENDING của Checkout sang PAYMENT_FAILED; Payment EXPIRED hoặc hết giữ chỗ đã đối chiếu là chưa trả dẫn Checkout EXPIRED và Order EXPIRED. Chỉ giải phóng món khi không còn giao dịch chưa rõ. Kết quả mâu thuẫn/đến muộn theo BR-PAYMENT-009.

BR-LISTING-008 — Giới hạn form MVP: danh mục Áo, Quần, Giày, Phụ kiện; size Áo/Quần XS–XXL, Giày EU 35–45, Phụ kiện FREE_SIZE. Giá 20.000–5.000.000 VND; tên 5–100 ký tự; mô tả 20–2.000 ký tự; mô tả lỗi tối đa 1.000 ký tự; 1–5 ảnh JPEG/PNG/WebP tối đa 5 MB/ảnh. Bằng chứng vụ việc tùy chọn 0–5 ảnh cùng định dạng và giới hạn. Frontend, API và kiểm thử dùng cùng cấu hình.

## Bổ sung 28/10/2026 — COD trong MVP

### BR-ORDER-006 — Đặt, hủy và hoàn đơn COD

COD chốt Checkout/Order CONFIRMED, paymentStatus UNPAID và Listing SOLD ngay trong transaction đặt hàng. SOLD nghĩa là đã chốt quyền mua, không chứng minh đã thu tiền. Không giữ tạm 15 phút hoặc gọi QueryDr. Buyer được hủy từng Order COD trước shippedAt khi chưa thu tiền/không có hold; giao, hủy và thu kiểm tra đồng thời. Hủy chỉ trả món về AVAILABLE khi đúng chủ đơn và không còn xung đột; các cờ ẩn/duyệt vẫn giữ.

Đơn đã gửi không tự hủy/mở bán. Seller yêu cầu xác nhận hàng đã hoàn đủ về, chưa thu; Admin quyết định có lý do/audit sau kiểm tra hồ sơ. Chấp nhận chuyển RETURNED/NOT_DUE và giải phóng đúng quyền nhận; dữ liệu mâu thuẫn giữ NEEDS_REVIEW. Không tự hoàn tiền. Hợp đồng API/điều kiện chi tiết ở A-09 báo cáo tổng đơn hàng.

### BR-PAYMENT-011 — Thu tiền COD và giao nhận

Một Checkout có thể có nhiều Order COD; Buyer trả từng Seller theo Order.total, không có attempt tổng. Seller của đơn khai báo đã thu đủ tiền sau khi đã gửi; ghi source=SELLER_DECLARATION, amount, thời điểm server và audit, không coi là xác minh của cổng/hãng vận chuyển. Mỗi Order có tối đa một collection hiệu lực; replay không thu hai lần.

Order COD CONFIRMED không hold được giao và Seller được đọc địa chỉ trước khi thu. Buyer xác nhận nhận sau khi gửi chuyển COMPLETED, không tự COLLECTED; Seller ghi nhận thu không tự COMPLETED. Workflow tài chính/COD return riêng giữ NEEDS_REVIEW khi có xung đột; mở hoặc đóng Case không tự đổi trạng thái đó. DELIVERY áp dụng cả COD CONFIRMED chưa nhận; ITEM vẫn sau COMPLETED. Toàn bộ demo dùng dữ liệu/tiền giả.

## Chốt giao nhận, khiếu nại và quyền vụ việc — 29/10/2026

**Trạng thái:** hợp đồng Bước A; các phần DELIVERY/ITEM, phân công và Support chưa triển khai. Hợp đồng cuối tại [báo cáo giao nhận, khiếu nại và vận hành](../report/backend-fulfillment-operations-master-report.md), mục 2–12.

### BR-TRUST-005 — Case, giới hạn và giao nhận

Mỗi target chỉ có một Case OPEN/IN_REVIEW. Complaint gốc lưu riêng, tối đa 3 bản/active Order Case và 5 bản mới/24 giờ/Buyer; cùng key/payload replay không tiêu quota. Case cùng type được bổ sung; khác type trả conflict. CLOSED không reopen; tạo lại cùng type/Order chờ 24 giờ từ closedAt. Không áp thời hạn mới tính từ receivedAt để nộp ITEM trong MVP.

Active Order Case chặn ghi vận đơn, receipt, thu COD, hủy COD và bắt đầu/chấp nhận hoàn COD. Admin đóng vụ trước khi các bên tiếp tục; đóng không đòi Order COMPLETED nên không tạo vòng phụ thuộc. Đóng/tạo Case không tự đổi Order, paymentStatus, Checkout, quyền món hoặc gỡ payment hold. REJECT_RETURN theo workflow COD riêng không giải phóng món và không tự đóng vụ.

DELIVERY có thể áp dụng COD NEEDS_REVIEW chỉ khi CodReturnRequest đúng Order có trạng thái OPEN/REJECTED, Order đã gửi/chưa nhận/chưa thu, paymentStatus UNPAID và không có xung đột quyền món/tài chính. Case đang mở chặn ACCEPT_RETURN. Các NEEDS_REVIEW khác không tự được phép tạo DELIVERY/ITEM.

### BR-TRUST-006 — Support và thông tin liên hệ

Support chỉ đọc active Case được giao. Đổi/gỡ assignment, mất role hoặc đóng vụ thu hồi quyền ở request tiếp theo, kể cả ảnh evidence/snapshot theo quyền Case. Không có quyền sửa Order/Case, đóng vụ hoặc điều chỉnh tiền. InternalNote chỉ Admin xem.

Contact-access theo lần đọc có reason 10–500 ký tự; chỉ recipient snapshot của Order gắn vụ; audit trước response và không cấp grant dài hạn. Admin dùng endpoint riêng cùng chính sách. REPORT không dùng contact-access địa chỉ nhận. Audit lỗi thì không trả dữ liệu; DTO Case mặc định không có địa chỉ hoặc contact.

### BR-TRUST-007 — Payload và kết quả xử lý

Khiếu nại cần details 10–2000 ký tự, 0–5 ảnh tùy chọn; reason theo loại. ITEM chọn ít nhất một OrderItem thuộc Order, không nhận listingId thay thế. Outcome DELIVERY/ITEM gồm NO_ACTION, RESOLVED, UNRESOLVED, OTHER; không nhận listingAction và không thực hiện refund. Buyer chỉ đọc bản gốc của mình và tóm tắt công khai; không xem dữ liệu điều tra nội bộ.
