# **Tổng quan miền và bảng thuật ngữ — Rewear Circle**

Cập nhật 26/10/2026: định nghĩa rõ khu vực gửi hàng, địa chỉ nhận và hai loại khiếu nại.

## **1. Tổng quan miền**

Rewear Circle là một sàn giao dịch giữa người tiêu dùng với người tiêu dùng (C2C) tập trung vào quần áo đường phố đã qua sử dụng dành cho sinh viên đại học.

Nền tảng này kết nối những sinh viên muốn bán các món đồ thời trang đường phố không còn sử dụng với những sinh viên đang tìm kiếm quần áo cũ giá cả phải chăng và độc đáo. Sản phẩm chú trọng vào thông tin đăng bán được cấu trúc bài bản, khả năng tìm kiếm tập trung và quy trình thanh toán cũng như theo dõi trạng thái giao dịch rõ ràng.

MVP hỗ trợ VNPAY Sandbox và COD. VNPAY là nhà cung cấp trực tuyến duy nhất, xử lý dữ liệu nhạy cảm và trả kết quả cần backend xác minh. COD thu theo từng Order của Seller, ghi nhận thủ công có nguồn trong demo; không tạo giao dịch cổng hoặc tuyên bố thu hộ đã được hãng vận chuyển xác minh. Hợp đồng hai nhánh ở [báo cáo đơn hàng và thanh toán, mục A-09](../report/backend-orders-vnpay-sandbox-master-report.md).

## **2. Ranh giới miền**

### **Trong phạm vi**

- Tài khoản người dùng và thông tin cơ bản.
- Các hoạt động của người mua và người bán trong cùng một thị trường.
- Tạo, chỉnh sửa, ẩn, duyệt, tìm kiếm và lọc danh sách sản phẩm thời trang đường phố.
- Tạo đơn hàng và hiển thị trạng thái đơn hàng.
- Thanh toán thông qua môi trường thử nghiệm của một nhà cung cấp dịch vụ thanh toán.
- Xác minh cuộc gọi lại/webhook thanh toán và xử lý sự kiện trùng lặp.
- Lập báo cáo danh sách và kiểm duyệt nội dung quản trị cơ bản.
### **Nằm ngoài phạm vi của MVP**

- Đề xuất cá nhân hóa nâng cao.
- Phân tích giá tự động hoặc xác thực thương hiệu.
- Nhiều nhà cung cấp dịch vụ thanh toán.
- Các giao dịch bằng tiền thật được minh họa trong khóa học.
- Quản lý toàn diện tự động các tranh chấp, yêu cầu hoàn tiền hoặc đối chiếu dữ liệu.
- Dịch vụ vận chuyển tích hợp và ký quỹ sản phẩm.
## **3. Tác nhân**

### **Sinh viên mua hàng**

Một sinh viên đại học đang duyệt và mua quần áo đường phố đã qua sử dụng do người dùng khác đăng bán. Người mua có thể tìm kiếm sản phẩm, xem chi tiết tin đăng, đặt hàng, tiến hành thanh toán thử nghiệm, xem trạng thái giao dịch và báo cáo tin đăng.

### **Sinh viên bán hàng**

Một sinh viên đại học rao bán các mặt hàng thời trang đường phố đã qua sử dụng mà họ không còn dùng nữa nhưng vẫn còn trong tình trạng tốt. Người bán có thể tạo, chỉnh sửa và ẩn các bài đăng của mình cũng như xem trạng thái đơn hàng liên quan (nếu có hỗ trợ).

### **Quản trị viên**

Quản trị viên được ủy quyền duyệt/từ chối và ẩn/hiện tin, xử lý vụ việc, tra cứu giao dịch theo quyền và giao vụ cho nhân viên hỗ trợ. Admin không sửa tin thay Seller, không tự đánh dấu Đã thanh toán và không quản lý chi trả Seller.

### **Nguyên tắc về tài khoản và vai trò**

Người mua và người bán là các vai trò hoạt động, không nhất thiết phải là các loại tài khoản riêng biệt. Cùng một người dùng đã đăng ký có thể mua và bán bằng một tài khoản duy nhất. Quyền quản trị chỉ dành cho các tài khoản được ủy quyền.

## **4. Thuật ngữ**

| Thuật ngữ | Sự định nghĩa |
| --- | --- |
| **Sàn giao dịch C2C** | Một nền tảng cho phép người tiêu dùng chào bán sản phẩm và giao dịch với những người tiêu dùng khác. |
| **Người dùng** | Một người có tài khoản trên Rewear Circle. |
| **Người mua** | Người dùng đóng vai trò là người mua trong một giao dịch cụ thể. |
| **Người bán** | Người dùng sở hữu và đăng bán một mặt hàng. |
| **Quản trị viên** | Người dùng được ủy quyền thực hiện các nhiệm vụ kiểm duyệt nền tảng. |
| **Danh sách** | Một tin rao bán do người bán tạo ra cho một món đồ thời trang đường phố đã qua sử dụng, bao gồm mô tả, hình ảnh, tình trạng, kích cỡ, giá cả và khu vực gửi hàng. |
| **Chủ sở hữu tin đăng** | Người dùng đã tạo và sở hữu tin đăng. |
| **Tình trạng niêm yết** | Mô tả do người bán cung cấp về tình trạng vật lý của sản phẩm và bất kỳ khuyết điểm nào đã biết. |
| **Khám phá sản phẩm** | Duyệt, tìm kiếm và lọc các danh sách có sẵn. |
| **Đặt hàng** | Khi Buyer xác nhận mua, hệ thống tạo một lượt mua chung (Checkout) và tách các món thành đơn theo từng Seller. Mỗi món chỉ có số lượng 1; đơn lưu giá và thông tin món tại lúc đặt. Món được giữ 15 phút sau khi xác nhận mua, không phải khi thêm vào giỏ. |
| **Thanh toán** | Quy trình Buyer thanh toán tổng tiền của một Checkout gồm một hoặc nhiều đơn theo Seller qua nhà cung cấp thanh toán sandbox đã chọn. |
| **Khoản thanh toán / lần thử thanh toán** | Bản ghi khoản thanh toán tổng hoặc một lần thử thanh toán gắn với Checkout; từ Checkout xác định các đơn theo Seller được khoản tiền đó chi trả. |
| **Nhà cung cấp thanh toán** | Dịch vụ bên ngoài xử lý thông tin thanh toán và báo cáo kết quả giao dịch. |
| **Chế độ hộp cát/thử nghiệm** | Môi trường của nhà cung cấp dịch vụ thanh toán được sử dụng để kiểm tra khả năng tích hợp mà không cần chuyển tiền thật. |
| **Gọi lại/Webhook** | Thông báo từ nhà cung cấp đến nền tảng về một sự kiện thanh toán. Nền tảng phải xác minh thông báo này theo tài liệu của nhà cung cấp. |
| **Mã tham chiếu thanh toán** | Mã dùng để liên kết sự kiện của cổng thanh toán với lần thử thanh toán và Checkout, từ đó xác định các đơn theo Seller liên quan. |
| **Báo cáo tin bán trước mua** | Phản ánh của người dùng đã đăng nhập về tin bán có nội dung sai, thiếu hoặc đáng ngờ dù tin đã được duyệt; gắn với tin, không đòi hỏi đã có đơn mua. |
| **Kiểm duyệt nội dung** | Xem xét và xử lý nội dung được báo cáo hoặc không phù hợp. |
| **Tính bất khả năng** | Xử lý cùng một sự kiện nhiều lần mà không tạo ra các hiệu ứng trùng lặp hoặc không chính xác. |
| **Chuyển đổi trạng thái** | Sự thay đổi từ trạng thái được xác định này sang trạng thái được xác định khác theo một quy tắc cho phép. |

## **5. Nguyên tắc miền chung**

- Thông tin đăng bán cần giúp người mua dễ dàng đánh giá sản phẩm, bao gồm hình ảnh, kích thước, tình trạng, khuyết điểm, giá cả và khu vực gửi hàng.
- Một người dùng có thể đóng vai trò là người mua và người bán bằng cùng một tài khoản.
- Hệ thống máy chủ (backend), chứ không chỉ riêng trình duyệt, quyết định thứ tự thanh toán và trạng thái thanh toán chính thức.
- Kết quả thanh toán phải dựa trên phản hồi đã được xác minh từ nhà cung cấp, chứ không chỉ dựa vào việc chuyển hướng trình duyệt.
- Thông báo trùng lặp từ nhà cung cấp phải nKhông gây ra việc cập nhật giao dịch trùng lặp hoặc không chính xác.
- Rewear Circle không được phép lưu trữ số thẻ hoặc mã bảo mật thẻ.
- Các kết quả nghiên cứu về động lực học tập của sinh viên vẫn chỉ là giả thuyết cho đến khi được đánh giá với người dùng mục tiêu của dự án.
## **6. Câu hỏi về phạm vi mở**

- MVP xác minh email thông thường; chưa bắt buộc email trường hoặc xác minh tư cách sinh viên bằng trường. Không có vòng duyệt hồ sơ Seller riêng.
- Đã chốt: thêm vào giỏ chưa giữ món; sau khi Buyer xác nhận mua, hệ thống giữ món 15 phút và đối chiếu cổng thanh toán trước khi giải phóng khi hết hạn.
- Đã chốt cho MVP: món SOLD khi cổng xác minh thanh toán thành công; Buyer xác nhận “Đã nhận” sau giao hàng để đơn COMPLETED. Buyer chỉ tự hủy trước lần thử thanh toán đầu tiên; Seller không tự hủy đơn. Không thanh toán lại trên cùng Checkout. Kết quả đến muộn/mâu thuẫn vẫn cần quy tắc riêng.
- Sẽ sử dụng nhà cung cấp dịch vụ thanh toán nào?
- Đã chốt: Admin xử lý báo cáo tin trước mua và khiếu nại đơn sau nhận trong một danh sách vụ việc; quyền hỗ trợ giới hạn theo vụ được giao.
- Hoàn tiền tự động toàn diện vẫn ngoài phạm vi MVP. Seller tự đặt vận chuyển ngoài hệ thống; thỏa thuận chuyển tiền riêng Buyer/Seller không được Admin xác nhận.
## THUẬT NGỮ BỔ SUNG — ĐÃ CHỐT

Khiếu nại ITEM sau nhận hàng: phản ánh của Buyer sau khi nhận món, gắn với đơn và bản lưu giá/thông tin món lúc đặt; khác với báo cáo tin trước mua. Lý do đã chốt gồm sai món, khác mô tả/lỗi không khai báo, thiếu phụ kiện, nghi giả, hư hại khi nhận và lý do khác.

Vụ việc Admin: một mục trong danh sách xử lý, ứng với một tin bị báo cáo trước mua hoặc một đơn bị khiếu nại sau nhận. Nhiều báo cáo cùng mục tiêu hiển thị chung nhưng từng bản báo cáo gốc được giữ.

Nhân viên hỗ trợ: người được cấp quyền xem dữ liệu tối thiểu của vụ được giao; quyền xem và thời điểm truy cập được ghi lại. Hồ sơ/bằng chứng lưu 12 tháng sau khi đóng vụ.

THUẬT NGỮ ĐÃ CHỐT BỔ SUNG

Đã bán (SOLD): tình trạng món sau khi hệ thống xác minh cổng thanh toán thành công; khác với đã giao hoặc đã nhận.

Đã nhận/COMPLETED: Buyer xác nhận đã nhận món trên đơn sau quá trình giao của bên vận chuyển; hệ thống không tự xác nhận thay Buyer trong MVP.

Vụ việc: bản ghi báo cáo tin trước mua hoặc khiếu nại đơn sau nhận, đi qua OPEN → IN_REVIEW → CLOSED và lưu kết quả xử lý.

Cập nhật 26/10/2026

Khu vực gửi hàng: khu vực Seller có thể gửi món, là thuộc tính tin đăng. Địa chỉ nhận: thông tin Buyer nhập khi checkout và được lưu bản chụp theo từng Order; không công khai trên tin.

DELIVERY case: Buyer phản ánh Order PAID chưa gửi/chưa đến, áp dụng toàn đơn. ITEM case: Buyer phản ánh món cụ thể sau COMPLETED, có affectedOrderItemIds và dùng OrderItem snapshot.
