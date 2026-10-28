# **Sơ đồ mô-đun và các mối quan hệ phụ thuộc**

Cập nhật 26/10/2026: đồng bộ ranh giới Next.js, Express và các luồng giao nhận.

## REWEAR CIRCLE | THIẾT KẾ HỆ THỐNG

Phạm vi đã được xác nhận | ranh giới chức năng | luồng người dùng

**Mục đích:**Hãy trình bày cách các chức năng đã được xác nhận của Rewear Circle phối hợp với nhau, ai chịu trách nhiệm về từng nhiệm vụ và thông tin hoặc quyết định được chuyển giao giữa các mô-đun như thế nào.

**Nguyên tắc làm việc:**Các mô-đun tổ chức các yêu cầu và công việc. Chúng không quyết định số lượng dịch vụ hoặc container.

# **01 | SƠ ĐỒ MÔ-ĐUN CHỨC NĂNG**

Sơ đồ này thể hiện các mối quan hệ phụ thuộc và chuyển giao logic. Thông tin niêm yết và truy cập được thể hiện bằng màu xanh lam; thông tin thanh toán đã được xác minh hoặc cập nhật kiểm duyệt được thể hiện bằng màu cam.

Hình 1. Các mối quan hệ phụ thuộc logic giữa các mô-đun và sự chuyển giao trách nhiệm.

Quy tắc truy cập: ACC cung cấp thông tin về danh tính, vai trò và quyền sở hữu. LST, ORD và MOD thực thi quyền hạn áp dụng cho từng hành động.

# **02 | CÁCH CÁC DÒNG CHÍNH KẾT NỐI**

Các lộ trình này thể hiện các bước chuyển giao chính giữa các mô-đun. Các chi tiết cụ thể của nhà cung cấp vẫn chưa được công khai cho đến khi nhà cung cấp môi trường thử nghiệm được lựa chọn.

Hình 2. Quy trình thanh toán của người mua và hành trình từ báo cáo đến kiểm duyệt.

# **03 | DANH MỤC CÁC MÔ-ĐUN**

## ACC | TÀI KHOẢN, HỒ SƠ & QUYỀN TRUY CẬP

Cung cấp thông tin cơ bản về hồ sơ và tài khoản. Express xử lý xác minh email và phiên bằng bcrypt, express-session, connect-mongo; vai trò và quyền hạn ứng dụng được thực thi bởi các quy trình làm việc được bảo vệ. Buyer và Seller là hai ngữ cảnh hoạt động của cùng một tài khoản người dùng.

Phụ thuộc vào: danh tính người dùng/phiên đã được xác thực. Hỗ trợ các hành động được bảo vệ trong LST, ORD và MOD.

## DISC | KHÁM PHÁ TIN ĐĂNG

Cung cấp danh sách tin công khai, tìm kiếm, bộ lọc và trang chi tiết. Guest, Buyer, Seller, Admin và nhân viên hỗ trợ đều có thể xem thông tin công khai; dữ liệu của vụ việc và đơn hàng chỉ được mở theo quyền tương ứng.

Phụ thuộc vào: dữ liệu niêm yết hiển thị và khả năng hiển thị từ LST.

## LST | QUẢN LÝ TIN ĐĂNG

Admin duyệt và có thể yêu cầu ẩn tin qua LST; Seller chỉ quản lý tin của mình. Admin không tự sửa tin hoặc mặc nhiên xem mọi đơn.

Tùy thuộc vào: ACC để xác minh danh tính, vai trò và quyền sở hữu.

**Nguồn cấp dữ liệu:**DISC chứa dữ liệu chi tiết/thông tin sản phẩm; ORD chứa dữ liệu danh sách để bắt đầu đặt hàng; MOD chứa danh sách đang được xem xét.

## ORD | ĐƠN HÀNG

Chịu trách nhiệm tạo đơn hàng và hiển thị trạng thái đơn hàng của người dùng. Người bán là sinh viên cũng có thể đóng vai trò là người mua.

Tùy thuộc vào: ACC của người dùng đang thực hiện giao dịch và LST của danh sách được sử dụng để bắt đầu đơn hàng.

**Nhận được:**Kết quả thanh toán đã được xác minh từ PAY. Việc hiển thị đơn hàng cho quản trị viên không bắt buộc trừ khi có nhu cầu cụ thể.

## PAY | THANH TOÁN THỬ NGHIỆM

Chịu trách nhiệm về quy trình thanh toán thử nghiệm, xác minh qua callback/webhook và xử lý trạng thái thanh toán cho một nhà cung cấp duy nhất.

Phụ thuộc vào: ORD và quá trình tích hợp thử nghiệm (sandbox) được ghi lại của nhà cung cấp đã chọn.

**Cập nhật:**ORD với kết quả thanh toán đã được xác minh. Nhà cung cấp, việc lập bản đồ trạng thái và khả năng liên lạc lại vẫn là những quyết định chưa được xác định.

## MOD | BÁO CÁO TIN, KHIẾU NẠI ĐƠN & KIỂM DUYỆT

MOD tiếp nhận báo tin trước mua và khiếu nại DELIVERY/ITEM, gom các phản ánh cùng tin/đơn trong một danh sách để Admin xử lý từng mục tiêu; chỉ hành động ẩn tin mới chuyển qua LST.

Phụ thuộc ACC cho danh tính/quyền hạn, LST cho tin bị báo cáo, ORD cho đơn và bản lưu món, PAY cho trạng thái thanh toán đã xác minh khi điều tra.

Cập nhật: LST xuất hiện khi quản trị viên được ủy quyền ẩn nội dung. DISC sau đó sẽ phản ánh trạng thái hiển thị đã được cập nhật.

# **04 | MA TRẬN VAI TRÒ VÀ QUYỀN HẠN**

Ma trận bên dưới ghi lại các quyền đã được xác nhận. Các quyền có điều kiện được ghi rõ ràng.

| **Chức năng** | **Guest** | **Buyer** | **Seller** | **Admin** | **Hỗ trợ** |
| --- | --- | --- | --- | --- | --- |
| **Xem tin công khai** | Có | Có | Có | Có | Có |
| **Tìm kiếm, lọc tin** | Không | Có | Có | Có | Có |
| **Xem chi tiết tin công khai** | Có | Có | Có | Có | Có |
| **Gửi tin bán** | Không | Có | Có | Không theo vai trò | Không theo vai trò |
| **Sửa tin mình đăng** | Không | Nếu là chủ tin | Nếu là chủ tin | Không | Không |
| **Tự ẩn tin mình đăng** | Không | Nếu là chủ tin | Nếu là chủ tin | Không | Không |
| **Đặt mua món của người khác** | Không | Có | Có | Không theo vai trò | Không theo vai trò |
| **Thanh toán sandbox** | Không | Có | Có | Không theo vai trò | Không theo vai trò |
| **Xem đơn của mình** | Không | Có | Có | Không mặc định | Không mặc định |
| **Báo tin trước mua** | Không | Có | Có | Không theo vai trò | Không theo vai trò |
| **Duyệt tin, xử lý báo cáo** | Không | Không | Không | Có | Không |
| **Xem dữ liệu vụ được giao** | Không | Không | Không | Theo vụ xử lý | Có |
| **Đánh dấu Đã thanh toán thủ công** | Không | Không | Không | Không | Không |

# **05 | CÁC QUY TẮC ÁP DỤNG CHO NHIỀU MÔ-ĐUN**

- Các thao tác được bảo vệ phải kiểm tra quyền và quyền sở hữu danh sách ở phía máy chủ. Chỉ riêng việc xác thực không đủ để cho phép thực hiện một hành động nghiệp vụ.
- LST là nguồn cung cấp nội dung và khả năng hiển thị danh sách. DISC hiển thị nó; ORD đọc nó khi bắt đầu một đơn đặt hàng; MOD yêu cầu các thay đổi kiểm duyệt được ủy quyền thông qua LST.
- PAY chỉ cập nhật ORD sau khi nhà cung cấp xác minh thông qua cuộc gọi lại/webhook. ORD hiển thị trạng thái đơn hàng cuối cùng.
- Trang web phải tương thích với cả máy tính để bàn và thiết bị di động. Các điểm ngắt chính xác và các tương tác chi tiết cần được xác định trong giai đoạn thiết kế/nguyên mẫu.
- Performance & Capacity đã được nhóm chấp nhận làm mục tiêu kiểm thử: 1.000 tin mẫu, 20 người dùng đồng thời trong 10 phút; p95 tối đa 2 giây cho xem/tìm tin và 3 giây cho giỏ/checkout/quản lý; lỗi ứng dụng dưới 1%. Đây chưa phải kết quả đo thực tế.
# **06 | QUYẾT ĐỊNH MỞ VÀ THEO DÕI**

Giải quyết các vấn đề này trong các tài liệu chức năng và công việc thiết kế có liên quan:

- Thông tin chi tiết về nhà cung cấp thanh toán và thông tin về hàm gọi lại/webhook trong môi trường thử nghiệm.
- Đã chốt các chuyển tiếp nghiệp vụ chính: SOLD sau thanh toán được cổng xác minh; COMPLETED sau Buyer xác nhận đã nhận; Buyer tự hủy chỉ trước lần thử thanh toán đầu tiên; không thử thanh toán lại trên cùng Checkout. Ánh xạ trạng thái nhà cung cấp và xử lý kết quả đến muộn/mâu thuẫn vẫn mở.
- Đã chốt hồ sơ cơ bản gồm tên hiển thị, email, ảnh tùy chọn; tin bán gồm tên, danh mục, kích cỡ, tình trạng, mô tả lỗi, giá VND, khu vực gửi hàng và 1–5 ảnh JPEG/PNG/WebP tối đa 5 MB/ảnh. Danh mục, giá và độ dài trường theo BR-LISTING-008.
- Đã chốt: Admin không tự chỉnh sửa tin, không mặc nhiên xem mọi đơn hoặc đánh dấu Đã thanh toán. Nhân viên hỗ trợ chỉ xem dữ liệu cần cho vụ được giao.
- Các điểm ngắt thích ứng và tương tác chi tiết trên máy tính/thiết bị di động.
Đặc tả chức năng các mô-đun gồm ACC, DISC, LST, ORD, PAY và MOD. MOD xử lý báo cáo tin trước mua, khiếu nại DELIVERY/ITEM và kiểm duyệt; tài liệu chi tiết cần nêu quyền truy cập, dữ liệu, quy trình, tiêu chí chấp nhận và những điểm còn mở.

## QUY TẮC ĐIỀU PHỐI ĐÃ CHỐT

Nhân viên hỗ trợ chỉ xem dữ liệu của vụ được giao; hồ sơ/bằng chứng lưu 12 tháng sau khi đóng. Admin không đánh dấu Đã thanh toán bằng tay hoặc xử lý chuyển tiền riêng Buyer/Seller. PAY đối chiếu kết quả cổng thanh toán; ORD cập nhật đơn từ kết quả hợp lệ. Khiếu nại sau nhận không tự tạo hoàn tiền.

QUYẾT ĐỊNH MVP ĐÃ CHỐT BỔ SUNG

Admin duyệt/từ chối, ẩn/hiện tin, xử lý vụ việc, tra cứu giao dịch theo quyền và giao việc cho Support; không sửa tin thay Seller, đánh dấu Đã thanh toán hoặc quản lý chi trả Seller. Một tài khoản xác minh email thông thường có thể mua và gửi tin bán.

Mỗi tin chỉ có một bản sửa chờ duyệt; Seller có thể gửi form khi món RESERVED mà không đổi đơn đã tạo; SOLD không cho sửa. Tin SOLD xem qua liên kết trực tiếp có watermark, không có nút mua; không vào feed hàng đang bán. Tài khoản đăng nhập tìm tên/mô tả, mới nhất trước, mặc định 20 kết quả/trang.

Case đi qua OPEN → IN_REVIEW → CLOSED, lưu kết quả và thông báo tóm tắt; các bản báo cáo gốc vẫn được giữ khi gom cùng mục tiêu. Mục tiêu tiếp cận là WCAG 2.2 AA; kiểm thử 10 người, ít nhất 8 người hoàn thành từng nhiệm vụ chính không cần hướng dẫn. Đây là mục tiêu, chưa phải kết quả đạt.

Cập nhật 26/10/2026

Ranh giới mới: ACC xác minh email; ORD giữ recipientSnapshot cho từng Order và dữ liệu hãng/mã vận đơn; MOD tách DELIVERY/ITEM case với affectedOrderItemIds; PAY dùng VNPAY Sandbox IPN/QueryDr; Express sở hữu /api/v1, Next.js chỉ giao diện và rewrite cùng origin.
