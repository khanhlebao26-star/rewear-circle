# **Reliability & Recovery**

Cập nhật 26/10/2026: đồng bộ xử lý giao nhận và trạng thái FAILED/EXPIRED.

## **1. Phạm vi và mục tiêu**

Tài liệu này quy định cách Rewear Circle bảo đảm hệ thống hoạt động đúng khi đặt hàng, thanh toán hoặc gặp sự cố.

Đối với MVP, nhóm ưu tiên ba mục tiêu:

- **Không bán trùng:** Một món hàng không được giữ thành công bởi hai đơn hàng khác nhau.
- **Không ghi nhận thanh toán sai:** Chỉ cập nhật trạng thái thanh toán khi có kết quả hợp lệ và đã được xác minh.
- **Có khả năng khôi phục:** Khi ứng dụng hoặc cổng thanh toán sandbox gặp lỗi, hệ thống phải có cách kiểm tra trạng thái và khôi phục dữ liệu an toàn.
Các yêu cầu được phân loại như sau:

- **[Đã chốt]:** Quy tắc nghiệp vụ đã được thống nhất.
- **[Cần chốt]:** Nhóm cần quyết định chi tiết trước khi hoàn thiện triển khai.
- **[Đề xuất]:** Mục tiêu kỹ thuật cần được nhóm xem xét và kiểm thử.
# **2. Đặt hàng và giữ món**

### **NFR-REL-01 — Kiểm tra và giữ món khi checkout [Đã chốt]**

Việc thêm sản phẩm vào giỏ hàng **không có nghĩa là món hàng đã được giữ cho Buyer**.

Khi Buyer xác nhận checkout, hệ thống phải kiểm tra lại các điều kiện sau:

- Buyer đã đăng nhập.
- Giá sản phẩm hợp lệ tại thời điểm đặt hàng.
- Món hàng vẫn còn khả dụng để bán.
- Buyer không mua món hàng do chính mình đăng bán.
Nếu tất cả điều kiện hợp lệ, hệ thống tạo Checkout, các đơn theo Seller và giữ từng món với **thời hạn ban đầu 15 phút**.

Việc kiểm tra khả dụng, tạo đơn và giữ món phải được xử lý nhất quán. Nếu hai Buyer cùng checkout một món gần như đồng thời, chỉ một người được phép giữ món thành công.

Nếu một điều kiện không hợp lệ, hệ thống không được tạo một lượt giữ món thành công cho Buyer đó.

### **NFR-REL-02 — Xử lý khi hết thời gian giữ món [Đã chốt]**

Khi thời gian giữ món 15 phút kết thúc, hệ thống phải kiểm tra trạng thái thanh toán trước khi quyết định có mở bán lại món hàng hay không.

Sau 15 phút, nếu kết quả thanh toán chưa rõ thì món vẫn bị chặn bán cho đến khi được đối chiếu; 15 phút không phải thời điểm tự động mở bán.

Các quy tắc xử lý:

- **Thanh toán thất bại hoặc đã hết hạn:** Có thể giải phóng món nếu kết quả đã được xác minh và món vẫn đủ điều kiện bán.
- **Thanh toán chưa có kết quả rõ ràng:** Không tự mở bán lại nếu việc đó có thể dẫn đến bán trùng.
- **Tin bị Admin ẩn:** Hết thời gian giữ món không được tự động gỡ trạng thái ẩn do Admin áp dụng.
- **Tin đang chờ duyệt bản sửa:** Hết thời gian giữ món không được tự động bỏ qua trạng thái chờ duyệt.
Chỉ được mở bán lại khi hệ thống xác định món hàng đủ điều kiện và không còn giao dịch chưa rõ trạng thái có thể ảnh hưởng đến việc bán món đó.

### **NFR-REL-03 — Xử lý khi Seller gửi yêu cầu sửa tin [Đã chốt]**

Cách xử lý phụ thuộc vào thời điểm Seller gửi yêu cầu sửa so với thời điểm Buyer checkout.

**Trường hợp 1: Seller gửi yêu cầu sửa trước khi Buyer checkout**

- Bản tin đã duyệt trước đó bị ẩn theo quy tắc nghiệp vụ.
- Bản sửa phải được duyệt trước khi có thể hiển thị trở lại.
- Nếu Buyer checkout trong thời gian tin không khả dụng, hệ thống phải từ chối checkout và thông báo rằng món hàng hiện không thể mua.
**Trường hợp 2: Seller gửi yêu cầu sửa sau khi đơn hàng đã được tạo và món hàng đã được giữ**

- Đơn hàng tiếp tục sử dụng giá và thông tin sản phẩm đã lưu tại thời điểm đặt hàng.
- Bản sửa mới không được thay đổi giá hoặc thông tin trong đơn hàng hiện tại.
- Việc gửi yêu cầu sửa không được làm gián đoạn lượt thanh toán đang diễn ra của đơn hàng đó.
Mục tiêu là tránh việc thông tin sản phẩm thay đổi giữa quá trình đặt hàng và thanh toán.

# **3. Thanh toán và xử lý trạng thái chưa rõ**

### **NFR-REL-04 — Thanh toán cho checkout có nhiều Seller [Đã chốt]**

Một lần checkout có thể chứa nhiều món hàng từ nhiều Seller. Hệ thống tách thành các đơn theo từng Seller nhưng vẫn sử dụng **một khoản thanh toán tổng** cho lần checkout đó.

Các yêu cầu bắt buộc:

- Tổng tiền thanh toán phải bằng tổng giá trị của tất cả đơn hàng thuộc lần checkout.
- Hệ thống phải liên kết khoản thanh toán với đúng các đơn hàng liên quan.
- Callback hoặc kết quả tra cứu thanh toán hợp lệ chỉ được áp dụng một lần cho cùng một sự kiện hoặc giao dịch.
- Callback gửi lặp không được tạo ra nhiều lần ghi nhận thanh toán.
- Trạng thái Đã thanh toán không đồng nghĩa với Đã giao hoặc Đã nhận. Seller tự đặt vận chuyển ngoài hệ thống và ghi hãng/mã vận đơn; Buyer xác nhận “Đã nhận” trên đơn thì đơn chuyển COMPLETED và đủ điều kiện khiếu nại sau nhận. MVP không tự hoàn tất khi Buyer chưa xác nhận.
### **NFR-REL-05 — Xử lý kết quả thanh toán đến muộn hoặc chưa xác minh được [Đã chốt]**

Khi hết 15 phút giữ món, hệ thống tra cứu cổng thanh toán. Kết quả thành công đã xác minh làm đơn PAID và món SOLD nếu không xung đột; thất bại/hết hạn đã xác minh và không còn giao dịch chưa rõ cho phép giải phóng. Nếu chưa rõ, giữ khóa bán, tra cứu lại sau 1, 3, 5 phút; vẫn chưa rõ thì Checkout/đơn NEEDS_REVIEW và tiếp tục chặn món đến khi xử lý.

Trong trường hợp này:

- Không tự chuyển đơn hàng sang trạng thái Đã thanh toán khi chưa có kết quả hợp lệ.
- Không tự mở bán lại món hàng nếu giao dịch cũ vẫn có nguy cơ đã thanh toán thành công.
- Lưu lại thông tin giao dịch để có thể kiểm tra và xử lý tiếp.
- Admin/nhân viên được phân quyền điều tra bằng mã Checkout/đơn, mã tham chiếu cổng, số tiền, tiền tệ, thời gian, trạng thái và lịch sử thông báo. Không có nút tự đánh dấu Đã thanh toán hoặc tự hoàn tiền.
Sau khi có kết quả xác minh, hệ thống mới được cập nhật trạng thái theo quy tắc nghiệp vụ đã thống nhất.

### **NFR-REL-06 — Thanh toán lại, hủy và kết quả đến muộn [Đã chốt nghiệp vụ]**

MVP không thử lại trên cùng Checkout; Buyer chỉ tự hủy trước payment attempt đầu. Xử lý kết quả đến muộn hoặc mâu thuẫn như sau:

- Không thử lại trên cùng Checkout. Sau khi cổng xác minh thất bại và món được giải phóng an toàn, Buyer có thể đặt lại bằng Checkout mới nếu món vẫn còn bán.
- Buyer chỉ tự hủy trước khi tạo lần thử thanh toán đầu tiên; Seller không tự hủy đơn của Buyer.
- Sau khi bắt đầu thanh toán hoặc đã trả tiền, Buyer/Seller không có nút tự hủy trong MVP; trường hợp cần hỗ trợ được đưa vào vụ việc, không tự hoàn tiền.
- Kết quả thành công đến sau thời hạn giữ: PAY ghi đúng SUCCESS. Nếu món chưa có Checkout khác liên quan, ORD cập nhật PAID và LST chuyển SOLD; nếu đã có Checkout khác, khóa bán/giao và đưa các Checkout/đơn liên quan NEEDS_REVIEW.
- Webhook đến sai thứ tự hoặc lặp: xác minh, tra cứu trạng thái hiện tại tại cổng và xử lý một lần theo mã sự kiện/giao dịch. Không dựa vào thứ tự webhook để mở bán hoặc xác nhận thanh toán.
- Một Checkout gồm nhiều đơn Seller: kết quả thanh toán tổng áp dụng nhất quán cho đúng các đơn; nếu bất kỳ món nào xung đột, Checkout và các đơn chịu ảnh hưởng cần điều tra, không tự giao món tranh chấp.
Nếu Checkout sau được xác minh chưa trả, món thuộc Checkout đã trả. Nếu hai Checkout đều đã trả, chặn giao, mở vụ việc thủ công để xác định quyền nhận và khoản tiền cần xử lý qua cổng. Không tự giao cùng món cho hai Buyer hoặc tự hoàn tiền.

Mọi thay đổi trạng thái phải có lịch sử để truy vết. Quy trình không được làm phát sinh hai đơn đã thanh toán cho cùng một món hàng hoặc tự mở bán lại món khi giao dịch cũ chưa được làm rõ.

# **4. Sao lưu và khôi phục hệ thống**

### **NFR-REL-07 — Sao lưu dữ liệu và mục tiêu khôi phục [Đề xuất]**

Đối với môi trường demo, nhóm đề xuất các mục tiêu sau:

- **Tần suất sao lưu:** Ít nhất một lần mỗi ngày.
- **Vị trí lưu bản sao:** Lưu bản sao ở nơi tách biệt với môi trường đang chạy chính.
- **RPO — Recovery Point Objective:** Tối đa 24 giờ.
- **RTO — Recovery Time Objective:** Mục tiêu khôi phục dịch vụ trong vòng 4 giờ.
Ý nghĩa:

- **RPO 24 giờ:** Trong trường hợp xảy ra sự cố, lượng dữ liệu có nguy cơ bị mất tối đa tương ứng với 24 giờ trước thời điểm sự cố.
- **RTO 4 giờ:** Mục tiêu đưa dịch vụ trở lại hoạt động trong vòng 4 giờ sau sự cố.
Đây là các mục tiêu đề xuất cho môi trường demo, chưa phải cam kết vận hành thực tế. Nhóm cần kiểm tra khả năng thực hiện dựa trên hạ tầng đang sử dụng.

Bản sao lưu phải được bảo vệ khỏi truy cập trái phép và không được chỉ lưu duy nhất trong môi trường có thể gặp cùng sự cố với hệ thống chính.

### **NFR-REL-08 — Kiểm tra khả năng khôi phục trước buổi demo [Đề xuất]**

Trước buổi demo, phải thử khôi phục dữ liệu từ ít nhất một bản sao lưu.

Sau khi khôi phục, cần đối chiếu trạng thái của các đơn hàng và lượt thanh toán với thông tin từ cổng sandbox.

Các nội dung cần kiểm tra:

- Đơn hàng đã được tạo hay chưa.
- Lượt thanh toán đã được khởi tạo hay chưa.
- Cổng sandbox ghi nhận thanh toán thành công, thất bại hay chưa có kết quả.
- Món hàng đang được giữ, đã bán hay đủ điều kiện mở bán lại.
- Có đơn hàng hoặc giao dịch nào bị thiếu, bị ghi nhận lặp hoặc có trạng thái không nhất quán hay không.
Nếu dữ liệu sau khôi phục khác với kết quả đã xác minh từ cổng sandbox, phải đối chiếu và xử lý sai lệch trước khi cho phép món hàng có liên quan được mở bán lại.

# **5. Kiểm chứng tối thiểu**

Phải thực hiện các bài kiểm thử dưới đây và ghi lại dữ liệu trước khi thử, thao tác thực hiện, dữ liệu sau khi thử và kết quả đạt/trượt.

| **Mã** | **Tình huống kiểm thử** | **Kết quả mong đợi** |
| --- | --- | --- |
| TEST-REL-01 | Hai Buyer checkout cùng một món hàng gần như đồng thời | Chỉ một Buyer giữ được món hàng. |
| TEST-REL-02 | Cổng thanh toán gửi cùng một callback nhiều lần | Không ghi nhận thanh toán lặp. |
| TEST-REL-03 | Callback đến sai thứ tự hoặc kết quả mới đến sau kết quả cũ | Trạng thái không bị cập nhật sai hoặc quay ngược trái quy tắc. |
| TEST-REL-04 | Cổng sandbox phản hồi chậm hơn 15 phút | Không tự mở bán lại món khi trạng thái thanh toán chưa rõ. |
| TEST-REL-05 | Seller gửi yêu cầu sửa trước khi Buyer checkout | Buyer không thể checkout khi tin đang không khả dụng. |
| TEST-REL-06 | Seller gửi yêu cầu sửa sau khi đơn đã tạo và món đã được giữ | Giá và thông tin sản phẩm trong đơn hiện tại không bị thay đổi. |
| TEST-REL-07 | Ứng dụng dừng sau khi tạo đơn nhưng trước khi hoàn tất chuyển sang thanh toán | Khi ứng dụng hoạt động lại, hệ thống xác định được trạng thái đơn và xử lý tiếp mà không tạo giao dịch hoặc lượt giữ món trùng. |
| TEST-REL-08 | Khôi phục cơ sở dữ liệu từ bản sao lưu | Dữ liệu được phục hồi; các đơn hàng và lượt thanh toán được đối chiếu với sandbox trước khi giải phóng món có trạng thái chưa rõ. |

Kết quả kiểm thử cần được lưu lại để nhóm có thể xác định các yêu cầu đã đạt, chưa đạt hoặc cần xử lý thêm.

# **6. Tiêu chí hoàn thành**

Các yêu cầu Reliability & Recovery được xem là đã được kiểm chứng khi:

- Các bài kiểm thử tối thiểu đã được thực hiện và ghi nhận kết quả.
- Không có hai đơn hàng cùng giữ thành công một món hàng duy nhất.
- Callback trùng hoặc kết quả thanh toán chưa xác minh không làm hệ thống ghi nhận thanh toán sai.
- Các trạng thái đơn hàng và thanh toán vẫn nhất quán khi xảy ra lỗi hoặc khi kết quả đến muộn.
- Đã thử khôi phục dữ liệu từ bản sao lưu và đối chiếu các đơn hàng, lượt thanh toán liên quan.
- Các chính sách còn mang trạng thái [Cần chốt] đã được thống nhất trước khi hoàn thiện các luồng tương ứng.
**Lưu ý:** Có bản sao lưu không đồng nghĩa hệ thống đã khôi phục được thành công. Tương tự, việc ứng dụng hoạt động trở lại không đồng nghĩa dữ liệu đơn hàng và thanh toán đã nhất quán. Cả hai cần được kiểm tra bằng kết quả thực tế.

Cập nhật 26/10/2026: Payment FAILED đã xác minh dẫn Checkout/Order PAYMENT_FAILED; hết hạn sau đối chiếu xác nhận chưa trả dẫn Checkout/Order EXPIRED. Kết quả chưa rõ giữ khóa bán và NEEDS_REVIEW. Buyer có thể mở DELIVERY case trên Order PAID trước khi xác nhận Đã nhận.

## Hợp đồng an toàn giao nhận và vụ việc — 29/10/2026

Nguồn: [báo cáo giao nhận, khiếu nại và vận hành](../report/backend-fulfillment-operations-master-report.md), mục 4, 7 và 11. Bước A chỉ chốt tài liệu; chưa thay đổi tính tin cậy của code hiện tại.

Active Order Case chặn giao/nhận/thu/hủy và bắt đầu hoặc chấp nhận hoàn COD; Admin đóng vụ trước, không cần Order COMPLETED. Đóng không tự sửa Order/Payment hoặc gỡ payment hold. COD đang yêu cầu hoàn có ngoại lệ mở DELIVERY theo điều kiện trong báo cáo; Case mở chặn ACCEPT_RETURN.

Ghi Case và mutation giao/nhận/COD phải chia sẻ điểm ghi có điều kiện trên Order để tránh race giữa snapshot đọc ở các document khác nhau. Audit/notification mutation nằm trong transaction; đọc PII audit lỗi thì không trả dữ liệu. Replay kiểm tra lại quyền và không nhân tác dụng phụ.

Giữ worker VNPAY độc lập, lease/checkpoint bền vững và giới hạn QueryDr hiện có; không giả thất bại khi tắt tích hợp/timeout. Heartbeat worker riêng API readiness, kiểm tra restart/đa worker và retention chạy lại an toàn ở các bước I–L.
