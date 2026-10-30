# Security & Privacy

Cập nhật 26/10/2026: bổ sung bảo vệ mã email, địa chỉ nhận và IPN.

**Dự án:** Rewear Circle**Phạm vi:** Website marketplace C2C quần áo secondhand — MVP sử dụng cổng thanh toán sandbox.

# 1. Phạm vi và trạng thái yêu cầu

Tài liệu này quy định các yêu cầu bảo mật và quyền riêng tư cần đáp ứng trong quá trình phát triển và nghiệm thu Rewear Circle.

Các yêu cầu được phân loại như sau:

- **[Đã chốt]:** Quy tắc nghiệp vụ đã được nhóm thống nhất.
- **[Đề xuất]:** Yêu cầu kỹ thuật cần được xem xét thêm, thống nhất và kiểm thử trước khi nghiệm thu.
# 2. Danh tính và phân quyền

### **NFR-SEC-01 — Quyền truy cập của khách chưa đăng nhập [Đã chốt]**

Khách chưa đăng nhập (Guest) chỉ được xem các trang và thông tin công khai của website.

Các thao tác thêm sản phẩm vào giỏ hàng, đặt hàng, đăng bán sản phẩm và gửi báo cáo yêu cầu người dùng đăng nhập trước khi thực hiện.

Sau khi đăng nhập thành công, hệ thống đưa người dùng trở lại trang sản phẩm hoặc nội dung mà họ đang xem. Người dùng cần tự thực hiện lại thao tác trước đó. Hệ thống không hỗ trợ giỏ hàng dành cho Guest.

### **NFR-SEC-02 — Quyền của người dùng và Admin [Đã chốt]**

Một tài khoản đã đăng ký có thể vừa mua hàng vừa đăng bán sản phẩm. Quyền thực hiện từng thao tác phụ thuộc vào vai trò của người dùng đối với tài nguyên liên quan.

Các quy tắc bắt buộc:

- **Seller:** Chỉ được sửa hoặc ẩn tin đăng do chính mình tạo.
- **Buyer:** Chỉ được xem và quản lý đơn hàng của mình. Buyer không được mua sản phẩm do chính mình đăng bán.
- **Admin được duyệt/từ chối, ẩn/hiện tin và xử lý vụ việc; chỉ tra cứu giao dịch theo quyền và giao vụ cho Support. Admin không sửa tin thay Seller, không tự đánh dấu Đã thanh toán và không quản lý chi trả Seller.**
- **Seller:** Không được tự gỡ trạng thái ẩn do Admin áp dụng.
Máy chủ phải kiểm tra quyền trước khi thực hiện mỗi thao tác. Không được mặc định cho phép truy cập chỉ vì người dùng đã đăng nhập.

### **NFR-SEC-03 — Kiểm tra quyền tại máy chủ [Đề xuất]**

Hệ thống phải từ chối yêu cầu khi người dùng không có quyền hoặc khi không thể xác định quyền hợp lệ.

Việc ẩn nút hoặc giới hạn thao tác trên giao diện không thay thế cho kiểm tra quyền tại API.

Cần kiểm thử các trường hợp người dùng cố tình thay đổi ID tin đăng, đơn hàng, vụ việc hoặc thông tin vai trò trong request để truy cập dữ liệu hay thực hiện hành động trái phép.

# 3. Giao dịch và dữ liệu nhạy cảm

### **NFR-SEC-04 — Bảo vệ thông tin đơn hàng và xác nhận thanh toán [Đã chốt]**

Khi Buyer đặt hàng, hệ thống phải lưu lại giá và thông tin sản phẩm tại thời điểm đặt hàng. Các thông tin này được sử dụng làm căn cứ xử lý đơn, không tự thay đổi khi Seller chỉnh sửa tin đăng sau đó.

Hệ thống chỉ chuyển trạng thái thanh toán sang **Đã thanh toán** khi kết quả từ cổng thanh toán đã được xác thực và phù hợp với giao dịch tương ứng.

Các nguyên tắc bắt buộc:

- Không xác nhận thanh toán chỉ dựa vào việc Buyer quay lại website sau khi thanh toán.
- Ảnh chụp màn hình chuyển khoản hoặc yêu cầu xác nhận thủ công không đủ căn cứ để hệ thống tự động chuyển trạng thái sang Đã thanh toán.
- Kiểm tra mã đơn hàng, mã giao dịch, số tiền và trạng thái giao dịch theo cơ chế của nhà cung cấp.
- Callback hoặc thông báo thanh toán bị gửi lặp không được khiến cùng một giao dịch bị ghi nhận nhiều lần.
- Callback không hợp lệ không được làm thay đổi trạng thái thanh toán.
### **NFR-SEC-05 — Phạm vi xử lý thanh toán của MVP [Đã chốt]**

Phiên bản MVP chỉ tích hợp một cổng thanh toán ở chế độ sandbox. Không có giao dịch tiền thật trong phạm vi demo.

Nhà cung cấp cổng thanh toán chịu trách nhiệm xử lý thông tin thẻ theo cơ chế tích hợp. Rewear Circle không lưu số thẻ hoặc mã bảo mật thẻ (CVV/CVC).

Nếu Buyer và Seller tự thỏa thuận chuyển tiền trực tiếp bên ngoài hệ thống, giao dịch đó không tự động làm thay đổi trạng thái thanh toán trên Rewear Circle.

### **NFR-SEC-06 — Kết nối an toàn và quản lý thông tin bí mật [Đề xuất]**

Mọi kết nối từ xa đến website và API phải sử dụng HTTPS.

Các thông tin bí mật như mật khẩu, khóa API, thông tin xác thực cơ sở dữ liệu và khóa tích hợp thanh toán phải được lưu bên ngoài mã nguồn. Không đưa các thông tin này lên kho mã nguồn hoặc công khai trong tài liệu dự án.

Chỉ người hoặc thành phần hệ thống được cấp quyền mới được phép truy cập thông tin bí mật. Khi phát hiện khóa bị lộ, nhóm phải thu hồi hoặc thay thế khóa bị ảnh hưởng.

Máy chủ phải từ chối yêu cầu sử dụng phiên đăng nhập đã hết hạn hoặc bị thu hồi.

# 4. Quyền riêng tư và nội dung người dùng

### **NFR-SEC-07 — Giới hạn quyền truy cập hồ sơ hỗ trợ [Đã chốt]**

Nhân viên hỗ trợ chỉ được truy cập các vụ việc được phân công.

Trong phạm vi xử lý vụ việc, nhân viên chỉ được xem những thông tin cần thiết, bao gồm:

- Mã tin đăng và mã đơn hàng liên quan.
- Hình ảnh và thông tin sản phẩm đã lưu.
- Các mốc thời gian và trạng thái xử lý.
- Trạng thái vận chuyển.
- Mã tham chiếu và trạng thái thanh toán.
- Bằng chứng cần thiết để giải quyết vụ việc.
Thông tin liên hệ và địa chỉ chỉ được mở khi thực sự cần cho việc xử lý vụ việc. Mỗi lần truy cập các thông tin này phải được ghi nhật ký.

Nhân viên hỗ trợ không được xem mật khẩu, dữ liệu thẻ hoặc đơn hàng không liên quan đến vụ việc được giao.

### **NFR-SEC-08 — Thời hạn lưu trữ hồ sơ vụ việc [Đã chốt]**

Hồ sơ vụ việc và các bằng chứng liên quan được lưu trong 12 tháng kể từ ngày vụ việc được đóng.

Sau thời hạn này, hệ thống phải xóa dữ liệu hoặc ẩn danh những thông tin cá nhân không còn cần thiết, theo chính sách lưu trữ đã thống nhất.

Hồ sơ giao dịch tài chính áp dụng chính sách lưu trữ riêng. Thời hạn và quy trình lưu trữ loại dữ liệu này chưa được xác định trong tài liệu hiện tại và cần được nhóm thống nhất riêng.

### **NFR-SEC-09 — Bảo vệ tệp tải lên và nội dung hiển thị [Đề xuất]**

Hệ thống phải kiểm tra các tệp do người dùng tải lên trước khi chấp nhận lưu trữ.

Các yêu cầu bao gồm:

- Chỉ chấp nhận các định dạng tệp được cho phép.
- Kiểm tra loại tệp thực tế và dung lượng tệp.
- Giới hạn 1–5 ảnh JPEG, PNG hoặc WebP cho mỗi tin đăng, tối đa 5 MB mỗi ảnh; kiểm tra loại tệp và kích thước ở máy chủ. Danh mục, giá và độ dài trường theo BR-LISTING-008.
- Không cho phép tệp tải lên được thực thi như mã chương trình trên máy chủ.
- Hiển thị mô tả sản phẩm và nội dung báo cáo dưới dạng an toàn, không để mã HTML hoặc JavaScript do người dùng nhập được thực thi ngoài ý muốn.
Nhật ký hệ thống và thông báo lỗi không được chứa mật khẩu, token, dữ liệu thẻ hoặc thông tin cá nhân không cần thiết.

# 5. Quản lý phiên và bảo vệ dữ liệu đầu vào

### **NFR-SEC-10 — Quản lý phiên đăng nhập và chống CSRF [Đề xuất]**

Hệ thống phải quản lý phiên đăng nhập an toàn theo cơ chế xác thực được sử dụng.

Nếu dùng cookie để xác thực, cookie phải được cấu hình các thuộc tính bảo mật phù hợp:

- HttpOnly: Ngăn JavaScript phía trình duyệt đọc cookie.
- Secure: Chỉ gửi cookie qua kết nối HTTPS.
- SameSite: Hạn chế việc cookie được gửi trong các yêu cầu phát sinh từ website khác, theo cấu hình phù hợp.
Các thao tác làm thay đổi dữ liệu phải có biện pháp chống CSRF khi cơ chế xác thực có nguy cơ này.

Khi người dùng đăng xuất, hệ thống phải vô hiệu hóa phiên đăng nhập ở máy chủ nếu sử dụng cơ chế phiên phía máy chủ. Phiên đã hết hạn hoặc bị thu hồi không được tiếp tục sử dụng.

### **NFR-SEC-11 — Xác thực dữ liệu đầu vào và chống XSS [Đề xuất]**

Dữ liệu người dùng gửi lên phải được kiểm tra theo quy tắc nghiệp vụ trước khi xử lý hoặc lưu trữ.

Các trường văn bản như tên sản phẩm, mô tả, nội dung báo cáo và thông tin liên quan phải được hiển thị an toàn để ngăn mã HTML hoặc JavaScript độc hại thực thi trong trình duyệt của người dùng khác.

Hệ thống không được sử dụng trực tiếp dữ liệu người dùng để tạo HTML không an toàn hoặc tạo truy vấn cơ sở dữ liệu theo cách cho phép chèn lệnh.

Các truy vấn cơ sở dữ liệu phải sử dụng cơ chế truy vấn tham số hóa hoặc phương thức tương đương an toàn của framework.

# 6. Giới hạn yêu cầu và sao lưu dữ liệu

### **NFR-SEC-12 — Giới hạn yêu cầu và chống lạm dụng [Đề xuất]**

Các API nhạy cảm phải có cơ chế giới hạn số lượng yêu cầu trong một khoảng thời gian phù hợp.

Các API cần được xem xét ưu tiên bao gồm:

- Đăng nhập.
- Gửi báo cáo.
- Tạo đơn hàng.
- Khởi tạo thanh toán.
Khi vượt ngưỡng cho phép, hệ thống phải từ chối hoặc trì hoãn yêu cầu phù hợp với cơ chế được triển khai.

Mục tiêu là hạn chế dò mật khẩu, gửi báo cáo hàng loạt và các hành vi lạm dụng làm ảnh hưởng đến tính ổn định của hệ thống.

Ngưỡng giới hạn cụ thể sẽ được nhóm xác định theo khả năng triển khai và kiểm thử của MVP.

### **NFR-SEC-13 — Sao lưu và khôi phục dữ liệu [Đề xuất]**

Hệ thống cần có phương án sao lưu phù hợp với môi trường triển khai đối với dữ liệu tài khoản, tin đăng, đơn hàng và trạng thái giao dịch.

Dữ liệu sao lưu phải được bảo vệ khỏi truy cập trái phép.

Nhóm phải kiểm tra khả năng khôi phục dữ liệu trong phạm vi hạ tầng MVP hỗ trợ. Sau khi khôi phục, cần xác minh tính nhất quán của dữ liệu, đặc biệt là thông tin đơn hàng và trạng thái thanh toán, để tránh mất dữ liệu hoặc ghi nhận sai trạng thái giao dịch.

# 7. Kiểm chứng bảo mật tối thiểu

Trước khi nghiệm thu MVP, phải kiểm thử bảo mật đối với các luồng chính của Rewear Circle. Kết quả cần được ghi lại để xác định tình huống nào đạt hoặc không đạt.

## **7.1. Danh tính và phân quyền**

- Guest không thể gọi trực tiếp API yêu cầu đăng nhập để thêm giỏ hàng, đặt hàng, đăng bán hoặc gửi báo cáo.
- Buyer không thể đọc, sửa hoặc hủy đơn hàng của người khác bằng cách thay đổi ID tài nguyên.
- Seller không thể tự gỡ trạng thái ẩn do Admin áp dụng.
- Người dùng không thể thực hiện hành động vượt quá quyền được cấp, kể cả khi tự sửa request gửi từ trình duyệt.
- Yêu cầu truy cập trái quyền phải bị từ chối và không được làm thay đổi dữ liệu.
## **7.2. Giao dịch và thanh toán**

- Thay đổi giá hoặc thông tin sản phẩm trong request không được làm thay đổi giá mà máy chủ đã xác định cho đơn hàng.
- Callback giả mạo, sai chữ ký, sai mã đơn, sai mã giao dịch, sai số tiền hoặc sai trạng thái không được ghi nhận là thanh toán hợp lệ.
- Callback trùng hoặc các yêu cầu xử lý đồng thời không được làm phát sinh nhiều lần ghi nhận thanh toán cho cùng một giao dịch.
- Trang quay lại từ cổng thanh toán không được tự xác nhận thanh toán nếu chưa có kết quả xác thực hợp lệ từ nhà cung cấp.
## **7.3. Tệp tải lên và nội dung hiển thị**

- Tệp không thuộc định dạng được cho phép, vượt giới hạn dung lượng hoặc vượt số lượng cho phép phải bị từ chối.
- Mã HTML hoặc JavaScript độc hại trong mô tả sản phẩm và báo cáo không được thực thi khi hiển thị.
- Tệp tải lên không được phép thực thi như mã chương trình trên máy chủ.
- Dữ liệu đầu vào không hợp lệ không được làm thay đổi dữ liệu ngoài dự kiến.
## **7.4. Quyền riêng tư và nhật ký**

- Nhân viên hỗ trợ không thể truy cập vụ việc chưa được phân công.
- Việc truy cập thông tin liên hệ hoặc địa chỉ phải được ghi nhật ký theo quy định.
- Nhật ký không chứa mật khẩu, token, dữ liệu thẻ hoặc thông tin cá nhân không cần thiết.
- Dữ liệu hết hạn lưu trữ phải được xử lý theo chính sách lưu trữ và xóa đã thống nhất.
## **7.5. Phiên đăng nhập và chống lạm dụng**

- Phiên đã hết hạn hoặc bị thu hồi không thể tiếp tục được sử dụng.
- Các thao tác có nguy cơ bị CSRF phải được bảo vệ theo cơ chế xác thực của hệ thống.
- API được giới hạn yêu cầu phải từ chối hoặc trì hoãn các yêu cầu vượt ngưỡng theo cấu hình đã thống nhất.
## **7.6. Sao lưu và khôi phục**

- Nhóm phải kiểm tra quy trình khôi phục dữ liệu theo phương án sao lưu được triển khai.
- Sau khôi phục, dữ liệu đơn hàng và trạng thái thanh toán phải được kiểm tra tính nhất quán.
- Kết quả kiểm thử và các vấn đề phát hiện phải được ghi lại.
# 8. Tiêu chí nghiệm thu

Tài liệu Security & Privacy được xem là đáp ứng yêu cầu nghiệm thu khi:

- Các tình huống kiểm thử bảo mật tối thiểu đã được thực hiện và ghi nhận kết quả đạt/trượt.
- Các yêu cầu trái quyền và dữ liệu không hợp lệ bị từ chối tại máy chủ, không làm thay đổi trạng thái nghiệp vụ ngoài dự kiến.
- Các luồng thanh toán được kiểm tra để bảo đảm callback không hợp lệ hoặc trùng không dẫn đến ghi nhận thanh toán sai.
- Các biện pháp bảo vệ tệp, nội dung hiển thị, phiên đăng nhập và dữ liệu riêng tư đã được kiểm thử theo phạm vi triển khai.
- Các lỗi bảo mật nghiêm trọng được khắc phục và kiểm thử lại trước khi nghiệm thu.
- Các yêu cầu mang nhãn [Đề xuất] đã được nhóm xem xét, thống nhất phạm vi thực hiện và xác định cách kiểm chứng phù hợp với MVP.
# 9. Tài liệu tham khảo

- OWASP Authorization Cheat Sheet:[ ](<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>)[https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html](<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>)
- OWASP Logging Cheat Sheet:[ ](<https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>)[https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html](<https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>)
- OWASP File Upload Cheat Sheet:[ ](<https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html>)[https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html](<https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html>)
PHẠM VI TÀI KHOẢN MVP ĐÃ CHỐT

Tài khoản xác minh email thông thường có thể mua và gửi tin bán; không bắt buộc email trường và không duyệt hồ sơ Seller riêng. Hồ sơ cơ bản gồm tên hiển thị, email, ảnh tùy chọn. Chức năng khóa/xóa tài khoản nâng cao để ngoài MVP.

Cập nhật 26/10/2026

Mã xác minh email chỉ lưu hash, dùng một lần, hết hạn và giới hạn số lần gửi. Route đổi dữ liệu bảo vệ CSRF; cookie phiên HttpOnly, Secure và SameSite; giới hạn đăng nhập và upload.

recipientSnapshot chỉ Buyer và Seller của chính Order được đọc. Support phải được giao vụ và truy cập dữ liệu liên hệ/địa chỉ đúng nhu cầu, có audit. Ảnh bằng chứng vụ việc lưu riêng tư; media ID ổn định không phải grant, mỗi request phải xác minh quyền và ảnh riêng tư dùng `Cache-Control: private, no-store`.

IPN VNPAY phải xác minh chữ ký và đối chiếu mã/số tiền trước cập nhật; QueryDr hỗ trợ đối chiếu khi callback chậm. Không ghi khóa sandbox hoặc dữ liệu thẻ vào log.

## Hợp đồng quyền dữ liệu vụ việc — 29/10/2026

Bước A đã chốt; quyền Support/contact và media Case đã có code ở G/H, regression tích hợp còn ở L. [Báo cáo giao nhận, khiếu nại và vận hành](../report/backend-fulfillment-operations-master-report.md), mục 7–10 và 19–20, quy định DTO/quyền và điểm cấp quyền đọc.

Support chỉ đọc active Case đang được giao; đóng/đổi assignment/mất role thu hồi quyền request sau. Default Case DTO không có recipient address/contact, internalNote chỉ Admin đọc. Contact-access active ORDER Case cần lý do, audit trước response, no-store và không cấp grant lâu dài; audit lỗi không trả PII. REPORT không mở quyền địa chỉ nhận. Admin dùng endpoint contact riêng với cùng audit.

Ảnh evidence không công khai; Support đọc evidence/snapshot hoặc ảnh phiên bản tin liên quan qua Case, không mở quyền toàn Order/Checkout/catalog. Đọc và audit dùng transaction cùng điểm đồng bộ quyền Case/User; request mới sau đổi role/assignment/đóng Case bị kiểm tra lại. Không hứa thu hồi byte đã gửi. Log không chứa request body/header, full URL/query hoặc object lỗi thô. Retention Case không xóa hồ sơ tài chính hoặc ảnh snapshot Order còn cần giữ.

Retention đã có dry-run mặc định và cờ áp dụng riêng; media pending trả 404 cho đến khi được dọn. Hồi quy dùng database `_test`; chưa chạy retention trên dữ liệu dự án hoặc production. Xem [runbook vận hành](../runbooks/backend-fulfillment-operations.md) để kiểm tra backup và điều kiện trước khi áp dụng.
