# **State Lifecycles — Listing, Checkout, Order, Payment & Case**

**Dự án:** Rewear Circle**Cập nhật:** 26/10/2026**Phạm vi:** Vòng đời trạng thái nghiệp vụ trong MVP

## **1. Mục đích và phạm vi**

Tài liệu này mô tả vòng đời trạng thái của năm đối tượng nghiệp vụ trong Rewear Circle:

- **Listing:** Tin đăng bán sản phẩm.
- **Checkout:** Phiên thanh toán tổng cho một lần mua hàng.
- **Order:** Đơn hàng được tạo cho từng Seller.
- **Payment:** Hồ sơ thanh toán và kết quả giao dịch.
- **Case:** Vụ việc phát sinh từ báo cáo tin đăng hoặc khiếu nại giao nhận, sản phẩm.
Mục tiêu là giúp đội phát triển thống nhất về trạng thái của từng đối tượng, điều kiện chuyển trạng thái và cách xử lý những tình huống như thanh toán thất bại, hết thời gian giữ món, nhận kết quả thanh toán muộn hoặc phát sinh tranh chấp.

### **1.1. Các nguyên tắc chung**

- Mỗi đối tượng có vòng đời riêng. Thay đổi trạng thái của một đối tượng không đồng nghĩa với việc các đối tượng liên quan cũng tự động thay đổi theo mọi cách.
- Trạng thái thanh toán, tình trạng bán sản phẩm và trạng thái giao nhận là ba vấn đề khác nhau.
- Chỉ kết quả thanh toán đã được máy chủ xác minh mới được dùng để xác nhận thanh toán thành công.
- Không tự động giải phóng sản phẩm khi kết quả thanh toán vẫn chưa rõ.
- Khi phát hiện xung đột giữa các giao dịch liên quan đến cùng một sản phẩm, hệ thống phải khóa việc bán và giao sản phẩm để điều tra.
- Các quy tắc nghiệp vụ trong tài liệu này được chốt cho MVP. Riêng việc ánh xạ mã phản hồi của VNPAY sang trạng thái thanh toán cần được xác nhận qua tài liệu tích hợp và kiểm thử Sandbox.
## **2. Vòng đời Listing — Tin đăng bán sản phẩm**

### **2.1. Các nhóm trạng thái**

Một Listing được quản lý thông qua ba nhóm điều kiện độc lập:

- Trạng thái duyệt nội dung tin đăng.
- Các lý do khiến tin không được hiển thị.
- Tình trạng bán hoặc giữ chỗ của sản phẩm.
Nhờ tách biệt các nhóm này, hệ thống có thể xử lý những tình huống như sản phẩm đang được giữ cho người mua nhưng đồng thời bị Admin ẩn.

### **A. Trạng thái duyệt Listing**

| **Trạng thái** | **Ý nghĩa** |
| --- | --- |
| DRAFT | Tin đang được Seller soạn và chưa gửi Admin duyệt, nếu MVP hỗ trợ lưu bản nháp. |
| PENDING | Tin mới hoặc phiên bản chỉnh sửa đã được gửi và đang chờ Admin duyệt. |
| APPROVED | Phiên bản tin đăng đã được Admin duyệt. |
| REJECTED | Phiên bản tin đăng bị Admin từ chối. |

Admin phải duyệt đúng phiên bản mà Seller đã gửi. Một phiên bản mới chưa được duyệt không được tự động kế thừa quyền hiển thị của phiên bản trước.

### **B. Các lý do khiến Listing không được hiển thị**

| **Điều kiện** | **Ý nghĩa** |
| --- | --- |
| sellerHidden | Seller chủ động ẩn tin đăng. |
| adminHidden | Admin ẩn tin đăng. Chỉ Admin mới có quyền gỡ lý do này. |
| awaitingApprovedEdit | Seller đã gửi bản sửa và đang chờ duyệt. Phiên bản cũ bị ẩn trong thời gian chờ. |
| paymentReviewHold | Sản phẩm đang bị khóa bán do kết quả thanh toán chưa rõ hoặc có xung đột giao dịch cần điều tra. |

Các điều kiện trên được quản lý độc lập. Việc gỡ một lý do không đồng nghĩa với việc tất cả các lý do khác cũng được gỡ.

Ví dụ: nếu Admin đã ẩn tin, việc hết thời gian giữ chỗ không làm tin tự động hiển thị trở lại.

### **C. Tình trạng bán của sản phẩm**

| **Trạng thái** | **Ý nghĩa** |
| --- | --- |
| AVAILABLE | Sản phẩm có thể được mua nếu đáp ứng đầy đủ các điều kiện hiển thị và không bị khóa bán. |
| RESERVED | Sản phẩm đang được giữ cho một Checkout trong thời hạn 15 phút. |
| SOLD | Thanh toán của Checkout đã được xác minh thành công và sản phẩm được xác nhận đã bán, không có xung đột giao dịch chưa giải quyết. |

Mỗi Listing tương ứng với một sản phẩm, số lượng bằng 1.

**Điều kiện để sản phẩm xuất hiện như một món có thể mua:** phiên bản Listing đã được duyệt, sản phẩm ở trạng thái AVAILABLE và không có bất kỳ điều kiện nào chặn hiển thị hoặc bán.

### **2.2. Các chuyển đổi trạng thái**

| **Sự kiện** | **Thay đổi** | **Quy tắc** |
| --- | --- | --- |
| Seller gửi tin mới | DRAFT → PENDING | Tin chưa được mở bán trước khi Admin duyệt. |
| Admin duyệt tin | PENDING → APPROVED | Chỉ duyệt phiên bản đã gửi. |
| Admin từ chối tin | PENDING → REJECTED | Phải lưu lý do từ chối và thông báo cho Seller. |
| Seller ẩn tin | Thêm sellerHidden | Không thay đổi trạng thái duyệt hoặc tình trạng bán. |
| Seller chọn Hiện tin | Gỡ sellerHidden | Chỉ cho phép nếu sản phẩm đã được duyệt, chưa bán, không bị giữ chỗ và không có điều kiện chặn khác. |
| Buyer xác nhận mua | AVAILABLE → RESERVED | ORD kiểm tra lại sản phẩm, tạo Checkout và các Order liên quan, sau đó giữ sản phẩm trong 15 phút. |
| Thanh toán thành công | RESERVED → SOLD | PAY xác minh thành công; ORD kiểm tra xung đột trước khi xác nhận quyền mua. |
| Xác minh chưa thanh toán | RESERVED → AVAILABLE | Chỉ giải phóng khi kết quả thanh toán đã rõ và không có giao dịch khác chưa được giải quyết. |
| Seller gửi bản sửa | Thêm awaitingApprovedEdit | Ẩn phiên bản cũ cho đến khi bản sửa được duyệt. |
| Admin ẩn tin | Thêm adminHidden | Seller không được tự gỡ lý do này. |

### **2.3. Quy tắc xử lý đặc biệt**

**Hết thời gian giữ chỗ**

Sau 15 phút, hệ thống phải kiểm tra kết quả thanh toán trước khi giải phóng sản phẩm:

- Nếu đã xác minh chưa thanh toán và không có giao dịch khác chưa rõ, giải phóng sản phẩm.
- Nếu kết quả chưa rõ, tiếp tục khóa bán và tra cứu lại sau 1, 3 và 5 phút.
- Nếu vẫn chưa rõ sau các lần tra cứu, chuyển Checkout và các Order liên quan sang NEEDS_REVIEW, đồng thời giữ khóa bán cho đến khi có quyết định xử lý.
Việc giải phóng sản phẩm không tự động gỡ sellerHidden, adminHidden, awaitingApprovedEdit hoặc paymentReviewHold.

**Thanh toán thành công đến muộn**

Nếu PAY xác minh thanh toán thành công sau khi thời gian giữ chỗ kết thúc:

- Nếu sản phẩm chưa được gắn với một Checkout khác và không có xung đột, hệ thống hoàn tất quyền mua của Checkout đã thanh toán và chuyển sản phẩm sang SOLD.
- Nếu sản phẩm đã được giữ hoặc thanh toán trong một Checkout khác, hệ thống ghi nhận kết quả SUCCESS trong Payment nhưng chuyển các Checkout và Order liên quan sang NEEDS_REVIEW. Sản phẩm bị khóa bán và giao cho đến khi được xử lý.
Hệ thống không tự động giao cùng một sản phẩm cho nhiều Buyer hoặc tự quyết định hoàn tiền.

**Seller chỉnh sửa tin**

Khi Seller gửi bản sửa, phiên bản cũ bị ẩn cho đến khi bản mới được duyệt. Các Order đã được tạo trước đó vẫn sử dụng thông tin sản phẩm đã lưu tại thời điểm đặt hàng.

**Admin xử lý tin bị ẩn**

- Admin có thể gỡ adminHidden khi quyết định cho phép hiển thị trở lại.
- Nếu bản sửa được duyệt, hệ thống gỡ awaitingApprovedEdit.
- Nếu Admin xác định vi phạm nghiêm trọng, tin tiếp tục bị ẩn.
- Sản phẩm đã SOLD không thể trở lại trạng thái có thể bán chỉ bằng thao tác Hiện tin.
### **2.4. Quy tắc nghiệp vụ của Listing**

- Chỉ Seller sở hữu Listing mới được chỉnh sửa hoặc tự ẩn tin, trừ thao tác quản trị được phân quyền.
- Tin bị ẩn không xuất hiện trong danh sách sản phẩm công khai.
- Mở trang thanh toán không có nghĩa sản phẩm đã bán.
- Chỉ kết quả thanh toán đã được xác minh mới có thể dẫn đến việc xác nhận bán.
- Việc duyệt tin, ẩn tin, giữ chỗ và khóa bán để điều tra là các điều kiện độc lập.
- Seller không được tự gỡ lý do Admin ẩn hoặc tự mở bán sản phẩm đang bị khóa điều tra.
- MVP không có nút tự hủy Checkout sau khi lần thử thanh toán đầu tiên đã được tạo.
## **3. Vòng đời Checkout và Order**

### **3.1. Phân biệt Checkout và Order**

Checkout và Order là hai đối tượng khác nhau, dù chúng được tạo trong cùng một lần mua hàng.

- **Checkout** đại diện cho toàn bộ lần mua và khoản thanh toán tổng của Buyer.
- **Order** đại diện cho phần đơn hàng thuộc về một Seller cụ thể.
- **Payment** lưu thông tin lần thử thanh toán và kết quả do cổng thanh toán cung cấp.
Ví dụ: Buyer mua ba món từ hai Seller. Hệ thống tạo một Checkout, hai Order theo Seller và một khoản thanh toán tổng cho Checkout.

### **3.2. Các trạng thái Checkout**

| **Trạng thái** | **Ý nghĩa** |
| --- | --- |
| PENDING_PAYMENT | Checkout đã được tạo và đang chờ kết quả thanh toán. |
| PAID | Khoản thanh toán tổng đã được xác minh thành công. |
| PAYMENT_FAILED | Cổng thanh toán đã xác minh giao dịch thất bại. |
| CANCELLED | Buyer hủy Checkout trước khi lần thử thanh toán đầu tiên được tạo. |
| EXPIRED | Checkout đã hết thời hạn giữ chỗ và việc chưa thanh toán đã được xác minh. |
| NEEDS_REVIEW | Checkout cần điều tra vì kết quả chưa rõ hoặc có xung đột nghiệp vụ. |

COMPLETED không phải trạng thái của Checkout trong mô hình MVP này. Trạng thái COMPLETED được dùng cho Order sau khi Buyer xác nhận đã nhận hàng.

### **3.3. Các chuyển đổi trạng thái Checkout**

| **Sự kiện** | **Chuyển trạng thái** | **Điều kiện** |
| --- | --- | --- |
| Buyer xác nhận mua | → PENDING_PAYMENT | ORD tạo Checkout và các Order theo Seller. |
| Thanh toán thành công | PENDING_PAYMENT → PAID | PAY xác minh khoản thanh toán tổng thành công và không có xung đột chưa giải quyết ảnh hưởng đến quyền nhận hàng. |
| Thanh toán thất bại | PENDING_PAYMENT → PAYMENT_FAILED | Kết quả thất bại đã được xác minh. |
| Buyer yêu cầu hủy | PENDING_PAYMENT → CANCELLED | Chỉ khi chưa tạo lần thử thanh toán đầu tiên. |
| Hết thời gian giữ chỗ | PENDING_PAYMENT → EXPIRED | Hệ thống đã xác minh chưa thanh toán và không còn kết quả chưa rõ. |
| Kết quả chưa rõ hoặc có xung đột | → NEEDS_REVIEW | Áp dụng khi không thể xác định an toàn quyền nhận sản phẩm. |

Trong MVP, Checkout đã chuyển sang PAYMENT_FAILED không được quay lại PENDING_PAYMENT. Buyer phải tạo Checkout mới sau khi thất bại đã được xác minh và sản phẩm được giải phóng an toàn.

### **3.4. Các trạng thái Order**

Mỗi Order thuộc về một Seller và một Checkout.

| **Trạng thái** | **Ý nghĩa** |
| --- | --- |
| PENDING | Order đã được tạo và đang chờ kết quả thanh toán tổng của Checkout. |
| PAID | Khoản thanh toán tổng đã được xác minh và Order được xác nhận đã thanh toán. |
| PAYMENT_FAILED | Checkout liên quan có kết quả thanh toán thất bại đã được xác minh. |
| CANCELLED | Buyer hủy trước khi lần thử thanh toán đầu tiên được tạo. |
| EXPIRED | Order chưa thanh toán và đã hết hạn sau khi hệ thống xác minh an toàn. |
| NEEDS_REVIEW | Order cần điều tra do kết quả chưa rõ hoặc xung đột giao dịch. |
| COMPLETED | Buyer đã xác nhận nhận được sản phẩm. |

### **3.5. Các chuyển đổi trạng thái Order**

| **Sự kiện** | **Chuyển trạng thái** | **Quy tắc** |
| --- | --- | --- |
| Tạo Checkout | → PENDING | Tạo một Order cho mỗi Seller có sản phẩm trong Checkout. |
| Thanh toán tổng thành công | PENDING → PAID | ORD cập nhật các Order thuộc Checkout đúng một lần. |
| Thanh toán thất bại | PENDING → PAYMENT_FAILED | Chỉ cập nhật khi kết quả thất bại đã được xác minh. |
| Buyer hủy trước lần thử thanh toán đầu tiên | PENDING → CANCELLED | Backend phải kiểm tra điều kiện tại thời điểm xử lý yêu cầu. |
| Hết hạn và xác minh chưa thanh toán | PENDING → EXPIRED | Không giải phóng sản phẩm nếu kết quả còn chưa rõ. |
| Phát sinh xung đột | → NEEDS_REVIEW | Không giao sản phẩm trong khi điều tra. |
| Buyer xác nhận đã nhận | PAID → COMPLETED | Chỉ thực hiện khi Buyer xác nhận đã nhận sản phẩm. |

### **3.6. Quy tắc nghiệp vụ của Checkout và Order**

- Checkout có mã định danh duy nhất. Mỗi Order theo Seller có mã riêng.
- Giá, thông tin sản phẩm và dữ liệu cần thiết của Order phải được lưu tại thời điểm đặt hàng.
- Khoản thanh toán tham chiếu Checkout và tổng tiền tương ứng.
- Một Checkout có thể có nhiều Order nhưng không được xử lý thành nhiều khoản thanh toán tổng độc lập ngoài quy tắc đã thiết kế.
- Buyer không được mua Listing của chính mình.
- Thêm sản phẩm vào giỏ không giữ chỗ. Thời hạn 15 phút bắt đầu khi Buyer xác nhận mua và hệ thống tạo Checkout, Order.
- Buyer chỉ được tự hủy trước lần thử thanh toán đầu tiên.
- Sau khi bắt đầu thanh toán hoặc đã thanh toán, Buyer và Seller không có nút tự hủy trong MVP. Trường hợp cần hỗ trợ phải được xử lý qua Case.
- PAID không đồng nghĩa với COMPLETED. Thanh toán và giao nhận là hai bước riêng.
- Hệ thống không tự động hoàn tất Order nếu Buyer chưa xác nhận nhận hàng.
## **4. Vòng đời Payment — Thanh toán**

### **4.1. Các trạng thái Payment**

Payment quản lý kết quả của lần thử thanh toán cho khoản tiền tổng của Checkout.

| **Trạng thái** | **Ý nghĩa** |
| --- | --- |
| INITIATED | Hệ thống đã tạo hồ sơ hoặc lần thử thanh toán. |
| PENDING | Thanh toán đã bắt đầu nhưng chưa có kết quả cuối cùng được xác minh. |
| SUCCESS | Thanh toán thành công đã được xác minh và đối chiếu với Checkout. |
| FAILED | Kết quả thất bại đã được cổng thanh toán xác minh. |
| EXPIRED | Cổng hoặc quá trình đối chiếu đã xác minh giao dịch hết hạn hoặc chưa được thanh toán. |
| NEEDS_REVIEW | Kết quả hợp lệ về mặt nguồn nhưng chưa rõ hoặc có xung đột nghiệp vụ cần điều tra. |

**Lưu ý:** Sự kiện không hợp lệ, chẳng hạn sai chữ ký, sai mã tham chiếu hoặc sai số tiền, phải bị từ chối và ghi log. Sự kiện đó không được phép làm thay đổi trạng thái thanh toán thành công.

Nếu một khoản thanh toán đã được xác minh SUCCESS nhưng phát hiện xung đột về quyền nhận sản phẩm, Payment vẫn giữ SUCCESS. Checkout và Order liên quan được đưa vào NEEDS_REVIEW.

### **4.2. Các chuyển đổi trạng thái Payment**

| **Sự kiện** | **Chuyển trạng thái** | **Điều kiện** |
| --- | --- | --- |
| Tạo lần thử thanh toán | → INITIATED | Hệ thống tạo hồ sơ thanh toán cho Checkout. |
| Bắt đầu thanh toán | INITIATED → PENDING | Thanh toán đã được khởi tạo nhưng chưa có kết quả cuối cùng. |
| Xác minh thành công | INITIATED/PENDING → SUCCESS | Xác minh nguồn, mã tham chiếu, số tiền, tiền tệ và kết quả. |
| Xác minh thất bại | INITIATED/PENDING → FAILED | Nhà cung cấp xác nhận kết quả thất bại. |
| Xác minh hết hạn | INITIATED/PENDING → EXPIRED | Có căn cứ xác minh giao dịch hết hạn hoặc chưa thanh toán. |
| Kết quả chưa rõ | → NEEDS_REVIEW | Đã tra cứu nhưng không xác định được kết quả an toàn. |

Buyer đóng trình duyệt hoặc rời khỏi trang thanh toán không đủ căn cứ để chuyển Payment sang FAILED hoặc EXPIRED.

Nếu Buyer hủy giao dịch tại trang thanh toán, hệ thống chỉ chuyển Payment sang FAILED khi VNPAY xác nhận kết quả cuối cùng tương ứng. Việc ánh xạ mã phản hồi cụ thể phải được kiểm chứng trong Sandbox.

### **4.3. Quy tắc xử lý thanh toán**

- Sử dụng chữ ký và cơ chế xác thực chính thức của nhà cung cấp đã tích hợp.
- Không dùng riêng URL chuyển hướng của trình duyệt để xác nhận thanh toán.
- Đối chiếu sự kiện với lần thử thanh toán và Checkout tương ứng.
- Kiểm tra mã tham chiếu, tổng tiền, tiền tệ và các trường giao dịch bắt buộc.
- Xử lý thông báo lặp lại theo cách idempotent: một sự kiện được gửi nhiều lần không được gây ra tác dụng phụ trùng lặp.
- Không lưu số thẻ hoặc mã bảo mật thẻ.
- Xử lý các thông báo chậm, thiếu, sai hoặc không nhất quán mà không báo sai rằng thanh toán thành công.
- Lưu đủ thông tin chẩn đoán không nhạy cảm để phục vụ điều tra.
- Không tự ý chuyển một Payment đã được xác minh SUCCESS thành thất bại chỉ vì nhận được một thông báo cũ hoặc thông báo lặp lại.
- Kết quả cuối cùng của Payment phải được phân biệt với quyết định cho phép giao sản phẩm.
## **5. Điều phối giữa Listing, Checkout, Order và Payment**

### **5.1. Quy trình mua hàng tiêu chuẩn**

- Buyer chọn một hoặc nhiều sản phẩm trong giỏ. Mỗi Listing tương ứng một sản phẩm, số lượng bằng 1.
- Khi Buyer xác nhận mua, ORD kiểm tra đăng nhập, quyền mua, giá hiện tại, tình trạng bán và quy tắc không tự mua.
- Nếu các sản phẩm hợp lệ, ORD tạo một Checkout và tách thành các Order theo Seller.
- ORD lưu thông tin sản phẩm và giá tại thời điểm đặt hàng, sau đó giữ từng sản phẩm trong 15 phút.
- PAY tạo lần thử thanh toán cho tổng tiền của Checkout và chuyển Buyer đến VNPAY Sandbox.
- VNPAY gửi kết quả qua IPN hoặc hệ thống thực hiện truy vấn kết quả theo cơ chế tích hợp đã xác nhận.
- PAY xác minh nguồn sự kiện, mã tham chiếu, số tiền, tiền tệ và kết quả giao dịch.
- PAY ghi nhận trạng thái thanh toán. Thông báo lặp lại phải được xử lý idempotent.
- ORD cập nhật Checkout và các Order thuộc Checkout dựa trên kết quả đã xác minh.
- Nếu thanh toán thành công và không có xung đột, sản phẩm chuyển sang SOLD, Checkout chuyển sang PAID và các Order chuyển sang PAID.
- Sau khi thanh toán, Seller tự tổ chức vận chuyển bên ngoài hệ thống và cập nhật thông tin giao hàng.
- Buyer xác nhận đã nhận hàng để Order chuyển từ PAID sang COMPLETED.
### **5.2. Quy trình xử lý khi hết hạn**

Khi đã qua 15 phút:

- Hệ thống không giải phóng sản phẩm chỉ dựa vào thời gian.
- PAY hoặc quy trình đối chiếu phải kiểm tra kết quả giao dịch với VNPAY.
- Nếu đã xác minh chưa thanh toán và không có giao dịch khác chưa rõ, hệ thống giải phóng sản phẩm.
- Nếu chưa có kết quả chắc chắn, tiếp tục giữ khóa bán và tra cứu lại sau 1, 3 và 5 phút.
- Nếu vẫn chưa rõ, Checkout và các Order liên quan chuyển sang NEEDS_REVIEW; sản phẩm tiếp tục bị khóa bán cho đến khi có quyết định xử lý.
Việc giải phóng sản phẩm chỉ cập nhật tình trạng giữ chỗ. Các lý do ẩn Listing vẫn được giữ nguyên.

### **5.3. Quy trình xử lý thanh toán muộn hoặc xung đột**

Nếu thanh toán thành công được xác minh sau khi sản phẩm đã hết thời gian giữ chỗ:

- **Không có Checkout xung đột:** tiếp tục xử lý Checkout đã thanh toán, xác nhận sản phẩm đã bán và cập nhật Order.
- **Có Checkout khác đang giữ hoặc đã thanh toán:** ghi nhận Payment SUCCESS, chuyển các Checkout và Order bị ảnh hưởng sang NEEDS_REVIEW, khóa bán và giao sản phẩm.
Nếu hai Checkout cùng liên quan đến một sản phẩm:

- Nếu một Checkout đã thanh toán và Checkout còn lại được xác minh chưa thanh toán, xử lý quyền nhận sản phẩm cho Checkout đã thanh toán.
- Nếu cả hai Checkout đều đã thanh toán, chuyển vụ việc sang xử lý thủ công qua quy trình hỗ trợ và cổng thanh toán.
- Không tự động giao sản phẩm cho cả hai Buyer.
- Không tự động hoàn tiền.
- Admin không được tự đánh dấu Checkout hoặc Order là PAID khi chưa có xác minh thanh toán.
### **5.4. Quyền xem đơn hàng**

- Buyer chỉ được xem Checkout và các Order thuộc giao dịch của mình.
- Seller chỉ được xem các Order thuộc về mình.
- Admin có quyền xem và xử lý các vụ việc theo phân quyền.
- Thông tin của Seller khác trong cùng Checkout không được tiết lộ vượt quá phạm vi cần thiết cho Buyer hoặc Seller.
## **6. Vòng đời Case — Báo cáo và khiếu nại**

### **6.1. Phạm vi Case**

MVP sử dụng một danh sách quản lý Case dành cho Admin, gồm hai nhóm chính:

| **Loại Case** | **Mục đích** | **Thời điểm** |
| --- | --- | --- |
| REPORT | Báo cáo Listing có nội dung không phù hợp hoặc vi phạm quy định. | Trước khi mua hoặc trong quá trình Listing còn liên quan đến hoạt động trên nền tảng. |
| DELIVERY | Khiếu nại Seller chưa gửi hoặc Buyer chưa nhận. | VNPAY PAID/PAID hoặc COD trước nhận theo ma trận 29/10/2026, gồm ngoại lệ COD return được quy định riêng. |
| ITEM | Khiếu nại về tình trạng hoặc vấn đề của sản phẩm đã nhận. | Chỉ sau khi Order chuyển sang COMPLETED. |

DELIVERY và ITEM là các loại khiếu nại sau mua. Chúng không tự động thay đổi trạng thái Payment hoặc Order.

### **6.2. Các trạng thái Case**

| **Trạng thái** | **Ý nghĩa** |
| --- | --- |
| OPEN | Case đã được tạo và đang chờ Admin tiếp nhận xử lý. |
| IN_REVIEW | Admin đã bắt đầu xem xét vụ việc. |
| CLOSED | Vụ việc đã có quyết định hoặc kết quả xử lý được lưu lại. |

Các chuyển đổi:

- OPEN → IN_REVIEW: Admin bắt đầu xử lý.
- IN_REVIEW → CLOSED: Admin lưu kết quả xử lý và hoàn tất vụ việc.
Mỗi Case phải lưu kết quả xử lý trước khi đóng.

### **6.3. Quy tắc nghiệp vụ của Case**

- Nhiều báo cáo về cùng một Listing hoặc Order có thể được nhóm để Admin tiện theo dõi, nhưng từng báo cáo gốc vẫn phải được lưu riêng.
- Người gửi được thông báo rằng báo cáo đã được tiếp nhận và nhận phần tóm tắt kết quả khi vụ việc đóng.
- Người gửi không được xem ghi chú nội bộ, dữ liệu điều tra hoặc thông tin riêng tư của người khác.
- Seller ghi carrierName và trackingCode sau khi tự tổ chức vận chuyển.
- Buyer có thể mở Case loại DELIVERY nếu Seller chưa gửi hàng hoặc Buyer chưa nhận hàng.
- Buyer chỉ có thể mở Case loại ITEM sau khi Order chuyển sang COMPLETED và phải chọn đúng OrderItem bị ảnh hưởng.
- Việc mở hoặc đóng Case không tự động thay đổi Payment, Checkout hoặc Order.
- Nếu cần hoàn tiền hoặc điều chỉnh giao dịch, phải có quy trình xử lý riêng; không coi việc đóng Case là bằng chứng thanh toán đã được hoàn lại.
## **7. Quy tắc tích hợp VNPAY Sandbox**

VNPAY Sandbox là cổng thanh toán mục tiêu của MVP.

### **7.1. Nguồn xác minh**

- **IPN:** tiếp nhận thông báo giao dịch từ VNPAY và kiểm tra tính hợp lệ.
- **QueryDr:** tra cứu trạng thái giao dịch để đối chiếu khi kết quả chưa rõ.
- **URL Return:** chỉ phục vụ việc đưa Buyer trở lại giao diện và hiển thị thông tin phù hợp; không phải nguồn xác nhận thanh toán độc lập.
### **7.2. Xử lý sự kiện không hợp lệ**

Các sự kiện có chữ ký không hợp lệ, sai mã tham chiếu, sai số tiền hoặc không khớp thông tin bắt buộc phải bị từ chối và ghi log.

Những sự kiện này không được phép làm thay đổi Payment, Checkout hoặc Order theo hướng xác nhận thanh toán thành công.

### **7.3. Xử lý kết quả chưa rõ**

- Tra cứu trạng thái giao dịch bằng cơ chế được VNPAY hỗ trợ.
- Tạo checkpoint nội bộ tại +1, +3 và +5 phút. Vì QueryDr trả mã 94 nếu request trùng trong cửa sổ 5 phút, chỉ gọi API theo khoảng tối thiểu được cổng cho phép; checkpoint giữa kiểm tra IPN đến mới và không suy diễn rằng chưa trả.
- Nếu vẫn chưa xác định được kết quả, đưa Checkout và các Order liên quan vào NEEDS_REVIEW.
- Giữ khóa bán và giao sản phẩm cho đến khi có quyết định xử lý an toàn.
- Ghi lại thông tin chẩn đoán cần thiết để phục vụ điều tra.
**Điểm cần xác minh trước khi triển khai:** ánh xạ từng mã phản hồi VNPAY vào SUCCESS, FAILED, EXPIRED hoặc trạng thái chưa rõ. Quy tắc ánh xạ chỉ được chốt sau khi đối chiếu tài liệu tích hợp và kiểm thử Sandbox với thông tin kết nối phù hợp.

## **8. Bảng tổng hợp chuyển trạng thái nghiệp vụ MVP**

Bảng này là nguồn đối chiếu nhanh cho đội phát triển khi triển khai API, nghiệp vụ backend và kiểm thử.

### **8.1. Listing**

| **Sự kiện** | **Chuyển đổi hoặc thay đổi** |
| --- | --- |
| Seller gửi tin | DRAFT → PENDING |
| Admin duyệt | PENDING → APPROVED |
| Admin từ chối | PENDING → REJECTED |
| Buyer xác nhận mua | AVAILABLE → RESERVED |
| Thanh toán thành công, không xung đột | RESERVED → SOLD |
| Xác minh chưa thanh toán an toàn | RESERVED → AVAILABLE |
| Seller ẩn tin | Thêm sellerHidden |
| Admin ẩn tin | Thêm adminHidden |
| Seller gửi bản sửa | Thêm awaitingApprovedEdit |
| Kết quả thanh toán chưa rõ hoặc có xung đột | Thêm paymentReviewHold |

### **8.2. Checkout**

**Phạm vi:** Các bảng Checkout/Order/Payment dưới đây mô tả VNPAY. Nhánh COD được bổ sung tại mục 10, không áp dụng timer/QueryDr hoặc điều kiện PAID trước giao của VNPAY.

Hợp đồng triển khai chi tiết được chốt tại [báo cáo đơn hàng và VNPAY Sandbox](../report/backend-orders-vnpay-sandbox-master-report.md). Mốc đối chiếu tính tuyệt đối từ expiresAt: lần đầu khi hết hạn rồi +1, +3, +5 phút. Chưa có attempt thì hết hạn sau kiểm tra nguyên tử; đã có attempt mà QueryDr chưa rõ thì tiếp tục khóa. NEEDS_REVIEW có thể trở lại PAID từ bằng chứng cổng hợp lệ khi mọi xung đột được giải quyết; SUCCESS tài chính không bị hạ bởi sự kiện cũ.

PENDING_PAYMENT → PAID | PAYMENT_FAILED | EXPIRED | CANCELLED | NEEDS_REVIEW

- CANCELLED: chỉ trước lần thử thanh toán đầu tiên.
- EXPIRED: chỉ sau khi xác minh chưa thanh toán và đủ điều kiện giải phóng.
- NEEDS_REVIEW: kết quả chưa rõ hoặc xung đột; tiếp tục khóa sản phẩm.
- PAYMENT_FAILED: không thử lại trên cùng Checkout trong MVP.
### **8.3. Order**

PENDING → PAID | PAYMENT_FAILED | EXPIRED | CANCELLED | NEEDS_REVIEW

PAID → COMPLETED

- Các Order thuộc cùng Checkout được cập nhật theo kết quả thanh toán tổng đã xác minh.
- COMPLETED chỉ được thiết lập khi Buyer xác nhận đã nhận hàng.
- Không tự động giao hàng hoặc hoàn tiền.
- Khi có xung đột, các Order liên quan được đưa vào NEEDS_REVIEW.
### **8.4. Payment**

INITIATED → PENDING | SUCCESS | FAILED | EXPIRED | NEEDS_REVIEW

PENDING → SUCCESS | FAILED | EXPIRED | NEEDS_REVIEW

- Chỉ kết quả đã xác minh mới được cập nhật trạng thái.
- Sự kiện không hợp lệ bị từ chối và ghi log.
- Nếu Payment đã SUCCESS nhưng quyền nhận sản phẩm có xung đột, Payment giữ SUCCESS; Checkout và Order liên quan chuyển NEEDS_REVIEW.
- Ánh xạ mã phản hồi VNPAY cần được xác nhận qua kiểm thử Sandbox.
### **8.5. Case**

OPEN → IN_REVIEW → CLOSED

- Lưu kết quả xử lý trước khi đóng.
- Giữ nguyên từng báo cáo gốc kể cả khi nhiều báo cáo được nhóm.
- Case không tự động thay đổi trạng thái thanh toán hoặc đơn hàng.
### **8.6. Giao nhận**

- Order PAID: Seller cập nhật carrierName và trackingCode khi đã tổ chức vận chuyển.
- Buyer có thể mở Case DELIVERY nếu hàng chưa được gửi hoặc chưa nhận.
- Order COMPLETED: Buyer đã xác nhận nhận hàng; sau đó có thể mở Case ITEM theo quy tắc MVP.
- Khiếu nại không tự động hoàn tiền hoặc thay đổi trạng thái thanh toán.
## **9. Các quyết định nghiệp vụ đã chốt**

- Thời gian giữ mỗi sản phẩm là 15 phút, tính từ lúc Buyer xác nhận mua và hệ thống tạo Checkout cùng Order.
- Thêm sản phẩm vào giỏ không giữ chỗ.
- Chỉ chuyển sản phẩm sang SOLD sau khi thanh toán được xác minh thành công và không có xung đột chưa giải quyết.
- Thanh toán, tình trạng bán và giao nhận là các bước riêng biệt.
- Buyer chỉ được tự hủy trước lần thử thanh toán đầu tiên.
- MVP không cho phép thử lại trên cùng Checkout sau khi thanh toán thất bại.
- Trước khi giải phóng sản phẩm hết hạn, hệ thống phải đối chiếu trạng thái thanh toán.
- Nếu kết quả chưa rõ sau các lần tra cứu tại mốc 1, 3 và 5 phút, Checkout và Order liên quan chuyển NEEDS_REVIEW; sản phẩm tiếp tục bị khóa.
- Thanh toán thành công đến muộn phải được ghi nhận chính xác trong Payment. Nếu có xung đột sản phẩm, không tự động giao hàng hoặc hoàn tiền.
- Admin không được tự đánh dấu thanh toán thành công khi chưa có xác minh.
- Seller tự tổ chức vận chuyển và cập nhật thông tin giao hàng.
- Buyer xác nhận đã nhận hàng để Order chuyển sang COMPLETED.
- Báo cáo Listing và khiếu nại DELIVERY/ITEM được quản lý qua Case. Việc xử lý Case không tự động thay đổi Payment hoặc Order.
- VNPAY Sandbox là cổng mục tiêu; việc ánh xạ mã phản hồi cụ thể phải được xác nhận qua tài liệu tích hợp và kiểm thử thực tế trong Sandbox.

## 10. Bổ sung 28/10/2026 — COD

Hợp đồng chi tiết tại [A-09 báo cáo tổng đơn hàng](../report/backend-orders-vnpay-sandbox-master-report.md). Luồng COD D–E đã triển khai và kiểm thử cùng K; xác nhận thu là khai báo của Seller, không phải bằng chứng ngân hàng/hãng vận chuyển.

| Đối tượng | Chuyển trạng thái COD |
| --- | --- |
| Checkout | Tạo CONFIRMED; NEEDS_REVIEW nếu có đơn bị điều tra; CANCELLED khi tất cả Order CANCELLED/RETURNED; không dùng PAID để suy ra đã giao |
| Order | Tạo CONFIRMED; trước gửi/chưa thu/không hold có thể CANCELLED; Buyer xác nhận nhận sau gửi thì COMPLETED; hoàn/tranh chấp qua NEEDS_REVIEW, chỉ hoàn đủ và chưa thu mới RETURNED |
| Thu tiền Order | UNPAID → COLLECTED do Seller khai báo; NOT_DUE khi hủy/hoàn hợp lệ; NEEDS_REVIEW nếu tranh chấp; không đồng nghĩa Payment SUCCESS của VNPAY |
| Listing | AVAILABLE → SOLD lúc tạo Order COD; chỉ trả AVAILABLE khi hủy trước gửi hoặc hoàn được duyệt, đúng quyền và không xung đột; không xóa các cờ kiểm duyệt |

COD không tạo payment attempt, không có expiresAt và không đi vào job VNPAY 15 phút/QueryDr. Checkout COD nhiều Seller tổng hợp tiền từ từng collection; việc nhận hàng và thu tiền độc lập. Quyền giao COD dựa CONFIRMED và không hold, VNPAY dựa PAID và không hold. Không nhận hàng hoặc hoàn chưa về không tự giải phóng món.

## 11. Trạng thái triển khai F–K — 29/10/2026

Backend tạo một payment attempt VNPAY cho mỗi Checkout, nhận IPN và đối chiếu QueryDr qua cùng transaction settlement. Worker dùng lịch/checkpoint và lease lưu trong DB; timeout, mã 94 và kết quả chưa rõ không mở bán lại. Kết quả SUCCESS đến muộn vẫn được ghi nhận; xung đột quyền nhận chuyển Checkout/Order sang NEEDS_REVIEW và giữ `paymentReviewHold` để chặn bán/giao. K đã chạy trên MongoDB replica set riêng cho test. Giao dịch Sandbox thật, xác minh mapping thực tế và migration DB cũ chưa hoàn tất; xem [báo cáo tổng](../report/backend-orders-vnpay-sandbox-master-report.md).

## Hợp đồng vòng đời giao nhận/Case — 29/10/2026

Bước A đã chốt, chưa chứng nhận các tính năng mới đã triển khai. Nguồn: [báo cáo giao nhận, khiếu nại và vận hành](../report/backend-fulfillment-operations-master-report.md), mục 4, 6 và 7.

- Giữ một active Case/target. Thêm bản gốc cùng loại không đổi type/status; khác loại trả conflict. CLOSED không reopen; tạo vụ mới theo điều kiện hiện tại và cooldown cùng loại 24 giờ.
- Case OPEN/IN_REVIEW chặn giao/receipt/thu/hủy/bắt đầu hoặc chấp nhận hoàn COD. Admin đóng vụ không cần Order COMPLETED; đóng vụ chỉ thu hồi ràng buộc hỗ trợ, không tự gỡ hold tài chính hoặc hoàn tất đơn.
- Shipment chỉ ghi lần đầu hãng/mã và shippedAt, không thêm Order status SHIPPED. VNPAY giao/nhận cần PAID/PAID; COD CONFIRMED đủ điều kiện theo ma trận. Buyer xác nhận sau gửi chuyển COMPLETED, giữ nguyên paymentStatus COD.
- DELIVERY cho COD NEEDS_REVIEW chỉ áp dụng nhánh yêu cầu hoàn đúng Order OPEN/REJECTED, UNPAID/chưa thu/chưa nhận và quyền món an toàn. Case chặn ACCEPT_RETURN; đóng Case không tự khôi phục CONFIRMED hoặc tạo quyền nhận hàng.
- Assignment chỉ active Case, không tự IN_REVIEW. Support mất quyền qua Case khi CLOSED hoặc mất assignment/role; Admin đọc hồ sơ trong thời hạn lưu. Outcome Order Case không có hành động tài chính/Listing.
