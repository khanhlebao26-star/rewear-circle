# Performance & Capacity

## **1. Phạm vi và mục tiêu**

Tài liệu này quy định các mục tiêu về tốc độ phản hồi, khả năng chịu tải và tính nhất quán dữ liệu cho MVP của **Rewear Circle**.

Các ngưỡng bên dưới đã được nhóm chấp nhận làm mục tiêu kiểm thử MVP, chưa phải kết quả hệ thống đã đạt được.

Điều kiện kiểm thử ban đầu:

- **Dữ liệu:** 1.000 tin đăng mẫu.
- **Tải đồng thời:** 20 người dùng.
- **Thời gian kiểm thử tải:** 10 phút.
- **Môi trường:** Cấu hình gần với môi trường dùng để demo, mạng ổn định.
- **Báo cáo:** Ghi lại cấu hình máy, dữ liệu kiểm thử và kết quả đo thực tế.
## **2. Tốc độ phản hồi**

### **NFR-PERF-01 — Tốc độ duyệt và tìm kiếm tin đăng**

**Trạng thái: [Đã chốt — mục tiêu kiểm thử]**

95% yêu cầu mở danh sách tin đăng, tìm kiếm, lọc và xem chi tiết sản phẩm phải được máy chủ xử lý trong vòng **2 giây**.

Thời gian này không bao gồm thời gian tải ảnh qua mạng của người dùng.

### **NFR-PERF-02 — Tốc độ xử lý giỏ hàng và checkout**

**Trạng thái: [Đã chốt — mục tiêu kiểm thử]**

95% thao tác xem giỏ hàng, tính tổng tiền và xác nhận checkout phải phản hồi trong vòng **3 giây**, tính đến trước khi chuyển người dùng sang cổng thanh toán sandbox.

Thời gian xử lý của cổng thanh toán sandbox phải được đo riêng vì nằm ngoài thời gian xử lý của ứng dụng Rewear Circle.

### **NFR-PERF-03 — Tốc độ quản lý tin đăng và xử lý báo cáo**

**Trạng thái: [Đã chốt — mục tiêu kiểm thử]**

95% yêu cầu mở trang quản lý tin đăng của người bán và danh sách báo cáo của Admin phải phản hồi trong vòng **3 giây** với bộ dữ liệu kiểm thử đã quy định.

Các tác vụ có thể mất nhiều thời gian, chẳng hạn xử lý ảnh hoặc gửi thông báo, được phép chạy nền. Tuy nhiên, giao diện phải hiển thị trạng thái rõ ràng để người dùng biết tác vụ đang chờ xử lý, đang thực hiện hay đã hoàn tất.

## **3. Khả năng chịu tải và tính nhất quán dữ liệu**

### **NFR-PERF-04 — Khả năng xử lý người dùng đồng thời**

**Trạng thái: [Đã chốt — mục tiêu kiểm thử]**

Hệ thống phải vượt qua bài kiểm thử với **20 người dùng đồng thời trong 10 phút**. Các thao tác kiểm thử bao gồm:

- Xem danh sách tin đăng và chi tiết sản phẩm.
- Tìm kiếm và lọc sản phẩm.
- Thêm sản phẩm vào giỏ hàng.
- Thực hiện quy trình đặt hàng thử.
Trong quá trình kiểm thử:

- Tỷ lệ yêu cầu ứng dụng bị lỗi phải dưới **1%**.
- Không được xuất hiện lỗi máy chủ chưa xác định được nguyên nhân.
- Lỗi phát sinh từ cổng thanh toán sandbox phải được ghi nhận và báo cáo riêng, không gộp chung với lỗi của ứng dụng.
Kết quả phải thể hiện số lượng yêu cầu thành công, số lượng yêu cầu lỗi và cách tính tỷ lệ lỗi.

### **NFR-PERF-05 — Ngăn chặn hai người mua cùng một món hàng**

**Trạng thái:** [Đã chốt]

Mỗi tin đăng trên Rewear Circle đại diện cho **một món hàng duy nhất, với số lượng bằng 1**.

Khi hai Buyer cùng xác nhận mua một món hàng gần như đồng thời:

- Chỉ một đơn hàng được phép giữ thành công món hàng đó.
- Đơn hàng còn lại phải bị từ chối hoặc thông báo rằng món hàng không còn khả dụng.
- Việc kiểm tra trạng thái món hàng và ghi nhận giữ chỗ phải được thực hiện một cách nhất quán, tránh trường hợp cả hai đơn hàng cùng giữ được một món.
Hệ thống cần sử dụng cơ chế bảo đảm tính nhất quán của dữ liệu, chẳng hạn transaction, khóa dữ liệu hoặc cập nhật có điều kiện phù hợp.

**Không được đánh đổi tính đúng đắn của dữ liệu để cải thiện tốc độ xử lý.** Ngăn chặn việc bán trùng quan trọng hơn việc rút ngắn thời gian phản hồi trong tình huống có tranh chấp mua hàng.

Thời hạn giữ món và cách xử lý khi thanh toán hết hạn phải được quy định riêng trong Business Rules hoặc Order Lifecycle.

### **NFR-PERF-06 — Phân trang và tối ưu truy vấn**

**Trạng thái: [Đã chốt — mục tiêu kiểm thử]**

Để hạn chế thời gian tải trang và tránh truy vấn quá nhiều dữ liệu cùng lúc, hệ thống cần:

- **Phân trang:** Áp dụng cho danh sách tin đăng công khai, giỏ hàng và hàng chờ xử lý của Admin khi dữ liệu vượt quá số lượng hiển thị mỗi trang.
- **Tối ưu ảnh:** Sử dụng ảnh có kích thước phù hợp và chỉ tải ảnh khi cần thiết, chẳng hạn khi ảnh sắp xuất hiện trong vùng hiển thị.
- **Tối ưu tìm kiếm và lọc:** Giới hạn dữ liệu truy vấn và tạo chỉ mục cơ sở dữ liệu cho những trường được sử dụng thường xuyên, dựa trên các truy vấn thực tế.
- **Tránh tải dư dữ liệu:** Chỉ lấy những thông tin cần thiết cho màn hình hoặc thao tác hiện tại.
## **4. Phương pháp kiểm thử và đo lường**

### **4.1. Các chỉ số cần ghi nhận**

Mỗi lần kiểm thử cần ghi nhận các chỉ số sau:

| **Chỉ số** | **Ý nghĩa** |
| --- | --- |
| p50 latency | Thời gian phản hồi ở mức trung vị: 50% yêu cầu có thời gian bằng hoặc thấp hơn giá trị này. |
| p95 latency | Thời gian phản hồi mà 95% yêu cầu có thời gian bằng hoặc thấp hơn giá trị này. |
| Requests per second | Số yêu cầu hệ thống xử lý mỗi giây. |
| Error rate | Tỷ lệ yêu cầu thất bại trên tổng số yêu cầu được tính. |
| CPU usage | Mức sử dụng CPU trong quá trình kiểm thử. |
| Memory usage | Mức sử dụng bộ nhớ trong quá trình kiểm thử. |

Các chỉ số cần được ghi nhận theo từng luồng chức năng phù hợp, thay vì chỉ báo cáo một con số chung cho toàn hệ thống.

### **4.2. Các luồng cần kiểm thử**

Tối thiểu cần kiểm thử các luồng sau:

- Duyệt danh sách tin đăng công khai.
- Tìm kiếm và lọc tin đăng theo giá.
- Mở trang chi tiết sản phẩm.
- Xem giỏ hàng và checkout với nhiều món hàng.
- Chuyển sang sandbox và xử lý kết quả thanh toán trả về.
- Admin mở danh sách báo cáo hoặc hàng chờ xử lý.
- Hai Buyer cùng cố gắng đặt mua một món hàng để kiểm tra khả năng ngăn chặn bán trùng.
Trong đó, luồng cuối cần được kiểm thử riêng với các yêu cầu gửi gần như đồng thời để xác nhận rằng chỉ một đơn hàng có thể giữ được món hàng.

### **4.3. Báo cáo kết quả**

Báo cáo kiểm thử phải bao gồm:

- Cấu hình máy chủ và môi trường kiểm thử.
- Số lượng tin đăng và dữ liệu được sử dụng.
- Số lượng người dùng đồng thời và thời gian chạy.
- Công cụ hoặc phương pháp kiểm thử.
- Các chỉ số đo được và tỷ lệ lỗi.
- Các lỗi phát sinh, nguyên nhân đã xác định và hướng xử lý.
- Kết luận về việc đạt hoặc chưa đạt từng ngưỡng mục tiêu.
Không được xem mục tiêu kiểm thử đã chốt là kết quả thực tế nếu chưa có bằng chứng đo. Một lần chạy demo thành công cũng không đủ để khẳng định hệ thống luôn đạt các ngưỡng này trong mọi điều kiện.

## **5. Các nội dung cần thống nhất trước khi nghiệm thu**

Trước khi xem các ngưỡng trên là tiêu chí nghiệm thu chính thức, cần xác nhận:

- **Đã chốt quy mô bộ dữ liệu kiểm thử MVP: 1.000 tin đăng mẫu. Cần ghi cấu hình dữ liệu và hạ tầng trong báo cáo thực nghiệm.**
- **Đã chốt tải kiểm thử MVP: 20 người dùng đồng thời trong 10 phút. Đây là mục tiêu đo, chưa phải năng lực đã được chứng minh.**
- **Môi trường kiểm thử:** Cấu hình máy chủ, thiết bị và điều kiện mạng nào sẽ được sử dụng?
- **Cách tính thời gian phản hồi:** Đo ở phía máy chủ hay từ lúc người dùng bắt đầu thao tác đến khi nhận được phản hồi? Mỗi chỉ số cần xác định rõ điểm bắt đầu và kết thúc.
- **Cách tính tỷ lệ lỗi:** Những loại lỗi nào được tính là lỗi ứng dụng và những lỗi sandbox nào được loại trừ?
- **Ngưỡng nghiệm thu cuối cùng:** Các mục tiêu 2 giây, 3 giây và tỷ lệ lỗi dưới 1% có được nhóm chấp thuận không?
Sau khi thống nhất, cần thực hiện kiểm thử, lưu lại kết quả và đối chiếu với từng yêu cầu trong tài liệu.

## **6. Tiêu chí hoàn thành**

Bộ yêu cầu Performance & Capacity được xem là đã được kiểm chứng khi:

- Các ngưỡng hiệu năng đã được thống nhất và có kết quả đo thực tế.
- Các luồng chính đã được kiểm thử trong điều kiện được ghi rõ.
- Tỷ lệ lỗi và các trường hợp thất bại đã được báo cáo.
- Không xảy ra tình trạng hai đơn hàng cùng giữ thành công một món hàng.
- Các kết quả chưa đạt ngưỡng được ghi nhận để tiếp tục xử lý.
**Lưu ý:** Hoàn thành kiểm thử không đồng nghĩa mọi chỉ số đều đạt yêu cầu. Báo cáo phải phân biệt rõ giữa yêu cầu đã được xác nhận, yêu cầu đã kiểm thử đạt và yêu cầu chưa đạt hoặc chưa được kiểm chứng.

QUYẾT ĐỊNH NGƯỠNG KIỂM THỬ ĐÃ CHỐT

Với 1.000 tin mẫu và 20 người dùng đồng thời trong 10 phút: p95 xem/tìm tin tối đa 2 giây; p95 giỏ, checkout và màn hình quản lý tối đa 3 giây; tỷ lệ lỗi ứng dụng dưới 1%. Ghi kết quả đo thực tế riêng; lỗi/thời gian của cổng sandbox không gộp vào thời gian xử lý ứng dụng.
