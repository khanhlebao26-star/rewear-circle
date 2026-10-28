# **Deployment & Environment Requirements**

Cập nhật 26/10/2026: chốt stack ứng dụng và dữ liệu giả cho demo.

## **1. Mục tiêu và phạm vi**

Tài liệu này quy định các yêu cầu về môi trường chạy ứng dụng, cấu hình, triển khai và kiểm thử trước buổi demo của Rewear Circle.

Rewear Circle là dự án marketplace C2C dành cho đồ streetwear secondhand. Các yêu cầu trong tài liệu áp dụng cho **MVP phục vụ đồ án**, không đồng nghĩa với việc hệ thống đã sẵn sàng vận hành thương mại.

**Sandbox** là môi trường thử nghiệm do nhà cung cấp thanh toán cung cấp. Mọi luồng thanh toán trong MVP chỉ phục vụ mục đích minh họa, không thực hiện giao dịch tiền thật.

## **2. Môi trường và cấu hình**

### **NFR-DEP-01 — Cấu hình thanh toán sandbox [Đã chốt]**

MVP chỉ tích hợp một nhà cung cấp thanh toán và sử dụng chế độ sandbox.

Các thông tin cấu hình của sandbox, bao gồm tài khoản thử nghiệm, khóa truy cập và địa chỉ callback/webhook, phải được quản lý riêng với các cấu hình khác.

Giao diện thanh toán trong bản demo phải thông báo rõ đây là môi trường thử nghiệm và không sử dụng tiền thật.

### **NFR-DEP-02 — Tách môi trường phát triển và demo [Đề xuất]**

Nhóm nên có hai môi trường riêng biệt:

- **Development:** Dùng để lập trình, sửa lỗi và thử nghiệm tính năng.
- **Demo/Testing:** Dùng để kiểm tra các luồng hoàn chỉnh và trình bày sản phẩm.
Dữ liệu giữa hai môi trường cần được tách biệt để việc thử nghiệm trong Development không ảnh hưởng đến dữ liệu chuẩn bị cho buổi demo.

Dữ liệu demo nên sử dụng tài khoản, tin đăng và đơn hàng mẫu. Không sử dụng thông tin thẻ thật hoặc dữ liệu cá nhân thực nếu không cần thiết.

### **NFR-DEP-03 — Quản lý cấu hình và thông tin bí mật [Đề xuất]**

Các cấu hình theo từng môi trường phải được quản lý thông qua biến môi trường hoặc kho lưu trữ bí mật phù hợp, bao gồm:

- URL của ứng dụng.
- Thông tin kết nối cơ sở dữ liệu.
- URL và thông tin xác thực của cổng thanh toán sandbox.
- Thời hạn giữ món hàng, mặc định theo quy tắc nghiệp vụ là 15 phút.
- Các khóa bí mật và thông tin xác thực cần thiết khác.
Không được ghi trực tiếp khóa bí mật vào mã nguồn hoặc đưa chúng vào các tệp chia sẻ công khai.

Khi chuyển giữa môi trường phát triển và demo, chỉ cần thay đổi cấu hình tương ứng mà không phải sửa trực tiếp mã nguồn.

## **3. Triển khai và quản lý phiên bản**

### **NFR-DEP-04 — Hướng dẫn cài đặt và khởi chạy [Đề xuất]**

Phải chuẩn bị tài liệu hướng dẫn để một thành viên khác có thể thiết lập và chạy dự án từ đầu mà không cần dựa vào các bước cấu hình ngầm hoặc hướng dẫn trực tiếp từ người viết code.

Tài liệu cần nêu rõ:

- Phiên bản runtime và các thư viện cần thiết.
- Các biến môi trường bắt buộc.
- Cách tạo và kết nối cơ sở dữ liệu.
- Cách chạy migration và tạo dữ liệu mẫu.
- Cách khởi chạy frontend, backend và các dịch vụ liên quan.
- Cách cấu hình và kiểm tra callback/webhook thanh toán thử nghiệm.
- Tài khoản demo và quyền tương ứng của từng vai trò.
Các bước thiết lập phải được ghi lại đầy đủ để thành viên khác có thể làm theo và xác nhận ứng dụng hoạt động bình thường.

### **NFR-DEP-05 — Kiểm tra trước khi triển khai phiên bản mới [Đề xuất]**

Trước mỗi lần cập nhật lên môi trường demo, phải thực hiện các kiểm tra cơ bản:

- **Kiểm tra build:** Xác nhận ứng dụng có thể được xây dựng mà không gặp lỗi.
- **Kiểm tra chức năng:** Kiểm tra các luồng chính như đăng nhập, đăng tin, duyệt tin và checkout.
- **Kiểm tra cấu hình:** Xác nhận ứng dụng đang sử dụng đúng cơ sở dữ liệu, cổng thanh toán và các biến môi trường.
- **Kiểm tra thay đổi dữ liệu:** Nếu có thay đổi cấu trúc cơ sở dữ liệu, phải có migration hoặc hướng dẫn áp dụng rõ ràng và có thể thực hiện lại một cách kiểm soát.
Mỗi lần triển khai cần ghi lại phiên bản ứng dụng và thời điểm triển khai để có thể xác định phiên bản đang chạy khi xảy ra lỗi.

### **NFR-DEP-06 — Sao lưu và khôi phục sau triển khai [Đề xuất]**

Trước những thay đổi lớn có nguy cơ ảnh hưởng đến dữ liệu, nên tạo bản sao lưu phù hợp.

Cần có hướng dẫn để:

- Khôi phục dữ liệu từ bản sao lưu khi cần thiết.
- Quay lại phiên bản ứng dụng trước đó nếu phiên bản mới gây lỗi.
- Kiểm tra lại dữ liệu đơn hàng và thanh toán sau khi khôi phục hoặc quay lui phiên bản.
Việc quay lại phiên bản ứng dụng không được mặc định là sẽ khôi phục dữ liệu cơ sở dữ liệu về trạng thái trước đó.

Nếu xảy ra lỗi liên quan đến thanh toán, phải đối chiếu đơn hàng với kết quả đã xác minh từ cổng thanh toán. Không được tự ý sửa trạng thái đơn thành “Đã thanh toán” chỉ để khắc phục lỗi triển khai.

## **4. Điều kiện sẵn sàng cho buổi demo**

### **NFR-DEP-07 — Các luồng nghiệp vụ cần trình bày [Đề xuất]**

Bản demo phải thể hiện được các luồng nghiệp vụ chính của Rewear Circle:

- **Guest:** Có thể xem tin đăng công khai nhưng chưa thể thực hiện các thao tác yêu cầu tài khoản.
- **Buyer và Seller:** Một tài khoản có thể thực hiện cả hoạt động mua và bán theo phạm vi MVP.
- **Quản lý tin đăng:** Seller có thể tạo tin và gửi yêu cầu chỉnh sửa qua biểu mẫu đầy đủ; Admin có thể duyệt tin.
- **Quản lý món hàng:** Mỗi tin đăng đại diện cho một món hàng duy nhất.
- **Giỏ hàng và checkout:** Buyer có thể chọn nhiều món trong cùng một lần checkout.
- **Quản lý đơn hàng:** Khi mua các món từ nhiều Seller, hệ thống tạo các đơn hàng riêng theo từng Seller.
- **Thanh toán:** Các đơn hàng trong cùng lần checkout được thanh toán tổng qua một luồng sandbox.
- **Báo cáo và khiếu nại:** Người dùng có thể báo cáo tin đăng trước khi mua và gửi DELIVERY case trên Order PAID hoặc ITEM case sau khi nhận hàng.
Các luồng trình bày cần phù hợp với quy tắc nghiệp vụ đã thống nhất trong tài liệu dự án.

### **NFR-DEP-08 — Kiểm thử và chuẩn bị dữ liệu demo [Đề xuất]**

Trước buổi demo, phải kiểm tra ứng dụng có thể khởi động và các chức năng quan trọng hoạt động theo đúng thiết kế.

Các tình huống cần kiểm tra bao gồm:

- Đăng nhập và truy cập theo quyền người dùng.
- Xem, tìm kiếm và lọc tin đăng.
- Seller tạo tin và Admin duyệt tin.
- Buyer checkout hai món hàng, bao gồm trường hợp hai món thuộc các Seller khác nhau.
- Cổng thanh toán sandbox trả kết quả thành công và thất bại.
- Hệ thống xử lý callback/webhook bị gửi trùng mà không áp dụng kết quả thanh toán hai lần.
- Hệ thống xử lý món hàng được giữ trong 15 phút và đối chiếu trạng thái khi hết thời hạn.
- Buyer không thể mua tin đăng đã bị Admin ẩn.
- Người dùng gửi báo cáo tin đăng và khiếu nại đơn hàng theo đúng điều kiện nghiệp vụ.
Phải chuẩn bị dữ liệu mẫu để trình bày cả trường hợp thành công và trường hợp lỗi. Với các tình huống thanh toán chưa rõ kết quả, cần thể hiện cách hệ thống xử lý và yêu cầu đối chiếu thay vì tự động xác nhận thanh toán thành công.

### **NFR-DEP-09 — Chốt nền tảng và cấu hình triển khai [Cần chốt]**

Cần thống nhất các thông tin triển khai cuối cùng trước khi đánh giá hiệu năng và khả năng khôi phục của hệ thống, bao gồm:

- Nền tảng hosting hoặc máy chủ sử dụng.
- Tên miền và URL của môi trường demo.
- Các trình duyệt và phiên bản tối thiểu được hỗ trợ.
- Cấu hình máy chủ và tài nguyên triển khai.
Sau khi chốt cấu hình, có thể sử dụng môi trường này làm cơ sở để đo lường hiệu năng và kiểm tra khả năng khôi phục theo các tài liệu yêu cầu phi chức năng liên quan.

Các kết quả đo phải ghi rõ môi trường và cấu hình đã sử dụng. Không được mặc định kết quả thử nghiệm trên máy lập trình tương đương với kết quả trên môi trường demo.

## **5. Tiêu chí hoàn thành**

Tài liệu này được xem là đã đáp ứng mục tiêu chuẩn bị demo khi:

- Cấu hình thanh toán sandbox được thiết lập riêng và không sử dụng tiền thật.
- Thành viên trong nhóm có thể làm theo tài liệu để thiết lập và khởi chạy ứng dụng.
- Các kiểm tra cần thiết được thực hiện trước khi cập nhật phiên bản demo.
- Có phương án sao lưu, khôi phục và đối chiếu dữ liệu đơn hàng/thanh toán khi xảy ra lỗi.
- Các luồng nghiệp vụ và tình huống kiểm thử được chuẩn bị đầy đủ.
- Nền tảng triển khai và cấu hình môi trường cuối cùng được nhóm thống nhất.
## **6. Trạng thái yêu cầu**

- **[Đã chốt]:** Yêu cầu đã được thống nhất trong phạm vi dự án.
- **[Đề xuất]:** Yêu cầu cần được nhóm xem xét và thống nhất trước khi triển khai.
- **[Cần chốt]:** Quyết định còn bỏ ngỏ và cần được xác định để hoàn thiện kế hoạch triển khai.
Cập nhật 26/10/2026: frontend Next.js App Router JavaScript, API Express chạy trên Node.js 24 LTS, MongoDB/Mongoose, session MongoDB. Next.js rewrite /api/v1 sang Express cùng origin. VNPAY Sandbox là cổng mục tiêu; trước demo phải lấy khóa thử nghiệm và thử IPN công khai/QueryDr. Dữ liệu nhận hàng trong demo phải là dữ liệu giả.
