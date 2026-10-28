# **Usability & Accessibility**

Cập nhật 26/10/2026: chốt hành vi sau đăng nhập và giao diện theo dõi giao nhận.

## **1. Phạm vi và mục tiêu**

Tài liệu này quy định các yêu cầu về tính dễ sử dụng (Usability) và khả năng tiếp cận (Accessibility) của website **Rewear Circle**.

Các yêu cầu tập trung vào những luồng chính:

- **Guest:** Xem danh sách món hàng và trang chi tiết món.
- **Buyer:** Đăng nhập, chọn món, checkout, báo cáo tin đăng và khiếu nại đơn hàng.
- **Seller:** Đăng tin, quản lý món hàng và gửi yêu cầu sửa tin.
- **Admin:** Duyệt tin đăng, xử lý báo cáo và kiểm tra trạng thái liên quan.
Mục tiêu là giúp người dùng hiểu rõ trạng thái món hàng, biết cần làm gì tiếp theo và hoàn thành các thao tác mà không bị nhầm lẫn.

Các yêu cầu được phân loại như sau:

- **[Đã chốt]:** Quy tắc nghiệp vụ đã được thống nhất.
- **[Đề xuất]:** Tiêu chí thiết kế hoặc kiểm thử cần được nhóm xác nhận trước khi nghiệm thu.
WCAG 2.2 mức AA đã được nhóm chấp nhận làm mục tiêu kiểm tra giao diện và các luồng chính; đây chưa phải tuyên bố website đã tuân thủ hoặc được chứng nhận.

## **2. Dễ hiểu và nhất quán**

### **NFR-UX-01 — Sử dụng thuật ngữ nhất quán [Đã chốt]**

Giao diện phải sử dụng thống nhất các thuật ngữ sau:

- **Món:** Sản phẩm secondhand cụ thể được đăng bán.
- **Tin đăng bán:** Nội dung mô tả món hàng được hiển thị trên marketplace.
- **Giỏ:** Nơi Buyer tập hợp các món muốn mua trước khi checkout.
- **Đơn:** Đơn hàng được tạo khi Buyer xác nhận checkout thành công.
Mỗi tin đăng bán đại diện cho **một món hàng duy nhất, số lượng bằng 1**. Buyer có thể chọn nhiều món khác nhau từ các Seller khác nhau trong cùng một lần checkout.

Giá được lưu và hiển thị trong đơn phải là giá áp dụng tại thời điểm đặt hàng. Nếu Seller thay đổi giá tin đăng sau đó, giá của đơn đã tạo không được tự động thay đổi.

### **NFR-UX-02 — Hướng dẫn Guest đăng nhập đúng cách [Đã chốt]**

Guest được phép xem các trang công khai mà không cần đăng nhập. Khi Guest sử dụng chức năng yêu cầu tài khoản, hệ thống phải chuyển họ đến trang Login.

Sau khi đăng nhập thành công:

- Hệ thống đưa người dùng trở lại đúng trang món hàng hoặc ngữ cảnh ban đầu.
- Sau đăng nhập, hệ thống đưa người dùng về đúng trang món, làm mới giá và tình trạng. Người dùng tự bấm Mua ngay hoặc Thêm giỏ lần nữa; không tự gửi lại thao tác cũ.
- Giao diện không được tạo ấn tượng rằng Guest có một giỏ hàng được lưu như giỏ hàng của người dùng đã đăng nhập.
Ví dụ: Guest bấm “Mua ngay” trên trang chi tiết món hàng, đăng nhập thành công và được quay lại đúng món đó để tiếp tục thao tác mua.

### **NFR-UX-03 — Hiển thị đúng trạng thái món hàng [Đã chốt]**

Giao diện chỉ được trình bày một món là **có thể mua** khi món đó đáp ứng đầy đủ các điều kiện:

- Đã được Admin duyệt.
- Đang được hiển thị công khai.
- Còn khả dụng để bán và không bị giữ chỗ cho giao dịch khác.
Các trạng thái phải được thể hiện rõ ràng:

- **Đang bán:** Có thể hiển thị nút mua khi món đủ điều kiện.
- **Đã bán:** Hiển thị nhãn “Đã bán” và không cho phép Buyer đặt mua.
- **Chờ duyệt, bị từ chối hoặc bị ẩn:** Không hiển thị như món đang sẵn sàng để mua.
- **Đang giữ chỗ:** Không hiển thị nút mua như một món còn khả dụng.
Giao diện không được chỉ dựa vào màu sắc để thể hiện trạng thái. Trạng thái cần có nhãn hoặc thông tin dễ nhận biết.

### **NFR-UX-04 — Thông báo lỗi rõ ràng và có hướng xử lý [Đề xuất]**

Khi xảy ra lỗi hoặc một thao tác không thể tiếp tục, hệ thống phải thông báo rõ:

- Điều gì đã xảy ra.
- Thao tác bị ảnh hưởng như thế nào.
- Người dùng cần làm gì tiếp theo, nếu có.
Các tình huống cần có thông báo phù hợp bao gồm:

- Giá món hàng đã thay đổi.
- Món hàng không còn khả dụng.
- Form thiếu dữ liệu hoặc có dữ liệu không hợp lệ.
- Thời gian giữ món sắp kết thúc.
- Thanh toán đang được đối chiếu hoặc chưa có kết quả cuối cùng.
Không sử dụng một thông báo chung như “Có lỗi xảy ra” cho những tình huống cần cách xử lý khác nhau.

Ví dụ, nếu món không còn khả dụng, giao diện cần thông báo rằng Buyer không thể tiếp tục mua món đó và hướng dẫn họ quay lại giỏ hàng để kiểm tra. Nếu thanh toán chưa rõ kết quả, giao diện cần hướng dẫn Buyer kiểm tra trạng thái thay vì khuyến khích thanh toán lại ngay.

### **NFR-UX-05 — Làm rõ tác động khi Seller sửa tin đăng [Đã chốt]**

Seller phải sử dụng form đầy đủ để sửa thông tin món hàng và gửi yêu cầu cho Admin duyệt.

Trước khi Seller gửi yêu cầu sửa, giao diện phải thông báo rõ:

- Tin đăng đang bán sẽ bị ẩn trong thời gian chờ duyệt bản sửa.
- Món hàng sẽ không thể được mua trong thời gian tin không khả dụng.
- Nếu đơn hàng đã được tạo và món đã được giữ, giá và thông tin sản phẩm trong đơn hiện tại không bị thay đổi bởi bản sửa mới.
Mục tiêu là giúp Seller hiểu ảnh hưởng của việc sửa tin trước khi xác nhận gửi yêu cầu.

## **3. Khả năng sử dụng trên nhiều thiết bị và công cụ hỗ trợ**

### **NFR-UX-06 — Hỗ trợ màn hình điện thoại và máy tính [Đề xuất]**

Các luồng chức năng chính phải sử dụng được trên cả điện thoại và máy tính.

Khi người dùng phóng to giao diện lên 200%:

- Nội dung quan trọng không bị cắt hoặc che khuất.
- Các nút và thành phần tương tác vẫn có thể sử dụng.
- Form không bị vỡ bố cục đến mức người dùng không thể nhập hoặc gửi dữ liệu.
- Người dùng vẫn có thể hoàn thành các thao tác chính như xem món, đăng nhập, checkout và quản lý tin đăng.
Bố cục có thể thay đổi theo kích thước màn hình, miễn là chức năng và thông tin cần thiết vẫn được giữ đầy đủ.

### **NFR-UX-07 — Hỗ trợ bàn phím và công cụ hỗ trợ [Đề xuất]**

Các trang và chức năng chính phải có thể sử dụng bằng bàn phím và cung cấp thông tin phù hợp cho các công cụ hỗ trợ như trình đọc màn hình.

Các yêu cầu cụ thể:

- **Điều hướng bằng bàn phím:** Người dùng có thể di chuyển giữa các thành phần tương tác bằng bàn phím và kích hoạt chúng bằng phím phù hợp.
- **Thứ tự focus hợp lý:** Khi di chuyển bằng bàn phím, các thành phần được chọn theo thứ tự dễ hiểu và phù hợp với luồng sử dụng.
- **Focus dễ nhận biết:** Thành phần đang được chọn phải có dấu hiệu trực quan rõ ràng.
- **Form có nhãn:** Các trường nhập liệu phải có nhãn mô tả mục đích. Khi dữ liệu không hợp lệ, thông báo lỗi phải được liên kết với trường tương ứng.
- **Ảnh có mô tả thay thế:** Ảnh món hàng cần có mô tả phù hợp để người dùng sử dụng trình đọc màn hình hiểu được thông tin cần thiết.
- **Trạng thái không chỉ dựa vào màu:** Các trạng thái như “Đã bán”, “Chờ duyệt” hoặc “Thanh toán đang xử lý” phải được thể hiện bằng chữ hoặc dấu hiệu bổ sung, không chỉ bằng màu sắc.
### **NFR-UX-08 — Kiểm tra khả năng tiếp cận theo WCAG 2.2 AA [Đã chốt — mục tiêu kiểm thử]**

Dùng WCAG 2.2 mức AA làm mục tiêu kiểm tra các trang và luồng chức năng cốt lõi.

Các nội dung cần kiểm tra bao gồm:

- **Độ tương phản:** Chữ và các thành phần giao diện quan trọng có độ tương phản phù hợp với nền.
- **Vùng tương tác:** Nút và các thành phần điều khiển có kích thước phù hợp để người dùng dễ thao tác, đặc biệt trên màn hình cảm ứng.
- **Điều hướng bằng bàn phím:** Người dùng có thể sử dụng các chức năng chính mà không bắt buộc phải dùng chuột.
- **Focus:** Vị trí đang được chọn bằng bàn phím có thể nhận biết rõ ràng và không bị che khuất.
- **Thông báo trạng thái:** Những thay đổi như thêm món vào giỏ, gửi form thành công hoặc thanh toán đang chờ xử lý được thông báo theo cách phù hợp, kể cả khi sử dụng công cụ hỗ trợ.
Việc kiểm tra cần kết hợp hai phương pháp:

- **Kiểm tra tự động:** Sử dụng công cụ kiểm tra accessibility để phát hiện các lỗi mà công cụ có thể nhận diện.
- **Kiểm tra thủ công:** Thử điều hướng bằng bàn phím và kiểm tra bằng trình đọc màn hình trên các trang quan trọng.
Kết quả kiểm tra phải ghi rõ các lỗi đã phát hiện, cách xử lý và những nội dung chưa được kiểm chứng. Việc sử dụng công cụ tự động không thay thế hoàn toàn cho kiểm tra thủ công.

**Lưu ý: WCAG 2.2 AA là mục tiêu kiểm tra đã chốt cho MVP, không phải bằng chứng website đã tuân thủ toàn bộ tiêu chuẩn.**

## **4. Kiểm thử với người dùng**

### **NFR-UX-09 — Đánh giá khả năng hoàn thành nhiệm vụ [Đã chốt — mục tiêu kiểm thử]**

Cần tổ chức kiểm thử với người dùng để đánh giá xem họ có thể tự hoàn thành các luồng chính hay không.

Mỗi người tham gia cần thực hiện các nhiệm vụ sau:

- Tìm món hàng bằng chức năng tìm kiếm hoặc bộ lọc.
- Bấm mua khi chưa đăng nhập, đăng nhập và tiếp tục thao tác.
- Checkout hai món hàng thuộc hai Seller khác nhau.
- Gửi form yêu cầu sửa tin đăng.
- Báo cáo một tin đăng trước khi mua.
- Gửi khiếu nại đối với đơn hàng sau khi nhận hàng.
Trong quá trình kiểm thử, cần ghi lại:

- **Tỷ lệ hoàn thành:** Tỷ lệ người tham gia hoàn thành từng nhiệm vụ.
- **Thời gian hoàn thành:** Thời gian cần thiết để thực hiện mỗi nhiệm vụ.
- **Điểm gây khó khăn:** Những bước người dùng phải dừng lại, thử nhiều lần hoặc không biết cách tiếp tục.
- **Lỗi hiểu trạng thái:** Các trường hợp người dùng nhầm lẫn giữa trạng thái đang giữ món, đã thanh toán, đã giao hoặc đã nhận.
- **Mức độ cần hỗ trợ:** Người dùng có cần người hướng dẫn chỉ thao tác hay không.
#### **Mục tiêu kiểm thử đã chốt**

Kiểm thử 10 người; với từng nhiệm vụ chính, ít nhất 8 người hoàn thành mà không cần người hướng dẫn chỉ cách thao tác.

Để đánh giá mục tiêu này, cần thống nhất trước:

- Số lượng người tham gia.
- Các nhiệm vụ và điều kiện kiểm thử.
- Tiêu chí xác định một nhiệm vụ đã hoàn thành.
- Cách tính tỷ lệ hoàn thành và ghi nhận trường hợp cần hỗ trợ.
Ví dụ: Nếu 10 người cùng thử một nhiệm vụ, ít nhất 8 người cần hoàn thành nhiệm vụ đó mà không cần người hướng dẫn chỉ thao tác để đạt ngưỡng 80% cho nhiệm vụ ấy.

Đây là mục tiêu nội bộ đã chốt cho nghiệm thu MVP, không phải ngưỡng bắt buộc của WCAG.

## **5. Tài liệu tham chiếu**

- W3C — Web Content Accessibility Guidelines (WCAG) 2.2:[ ](<https://www.w3.org/TR/WCAG22/>)[https://www.w3.org/TR/WCAG22/](<https://www.w3.org/TR/WCAG22/>)
Sử dụng tài liệu này làm cơ sở tham khảo khi thiết kế và kiểm tra khả năng tiếp cận của giao diện Rewear Circle.

Cập nhật 26/10/2026

Checkout hiển thị form nhận hàng và phí vận chuyển đã tính trong giá; với nhiều Seller, giải thích mỗi đơn có lượt giao riêng. Đơn PAID hiển thị hãng/mã vận đơn Seller nhập, nút báo chưa gửi/chưa nhận và nút Đã nhận. Form ITEM case cho chọn một hoặc nhiều món của chính đơn.
