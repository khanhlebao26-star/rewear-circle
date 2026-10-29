# **API Contracts & Error Conventions**

Cập nhật 26/10/2026: bổ sung trường giao nhận, xác minh email và affectedOrderItemIds.

**Rewear Circle — Technical Documentation**

**Ngày cập nhật:** 28/10/2026**Trạng thái:** Hợp đồng tổng thể; các endpoint của phạm vi tin đăng/kiểm duyệt và khám phá đã đồng bộ với code, các module khác vẫn là hợp đồng cho giai đoạn triển khai tiếp theo.

## **1. Mục đích và phạm vi**

Tài liệu này quy định cách frontend giao tiếp với backend thông qua API của Rewear Circle.

Tài liệu mô tả:

- Các endpoint cần có và chức năng của từng endpoint.
- Dữ liệu frontend gửi lên và dữ liệu backend trả về.
- Quy tắc xác thực, phân quyền và xử lý lỗi.
- Cách xử lý tin đăng, giỏ hàng, checkout, đơn hàng và thanh toán.
- Các quy tắc dữ liệu phải luôn được đảm bảo.
- Những quyết định kỹ thuật cần thống nhất trước khi triển khai.
Rewear Circle là marketplace C2C dành cho quần áo streetwear secondhand. Người dùng có thể đăng món đồ của mình để bán và mua món đồ từ người dùng khác.

Tài liệu này áp dụng cho MVP phục vụ đồ án. Trạng thái triển khai được theo dõi trong [báo cáo backend tuần 2](../report/backend-week2-master-report.md); quy tắc nghiệp vụ đã thống nhất phải được tuân thủ.

### **1.1. Các mô-đun API**

| **Mô-đun** | **Trách nhiệm** |
| --- | --- |
| ACC — Account | Xác thực và quản lý thông tin tài khoản |
| DISC — Discovery | Hiển thị feed, chi tiết tin, tìm kiếm và lọc |
| LST — Listing | Tạo, sửa, ẩn/hiện tin và duyệt tin |
| ORD — Order | Giỏ hàng, checkout và đơn hàng |
| PAY — Payment | Tạo yêu cầu thanh toán và xác minh kết quả |
| MOD — Moderation | Báo cáo tin, khiếu nại và xử lý vụ việc |

Các mô-đun là cách chia chức năng logic. MVP không bắt buộc phải triển khai mỗi mô-đun thành một dịch vụ riêng.

### **1.2. Quy tắc nghiệp vụ bắt buộc**

- Guest chỉ được xem feed và chi tiết tin công khai. Các chức năng tìm kiếm/lọc, giỏ hàng, mua hàng, đăng bán và báo cáo yêu cầu đăng nhập.
- Sau khi đăng nhập, người dùng quay lại trang trước đó và tự thực hiện lại thao tác. Hệ thống không tự động thực hiện thao tác bị gián đoạn.
- Một tài khoản đã đăng nhập có thể vừa mua hàng vừa đăng tin bán. Không yêu cầu duyệt hồ sơ Seller riêng.
- Người dùng không được mua tin do chính mình đăng.
- Mỗi listing đại diện cho một món đồ duy nhất, với quantity = 1.
- Tin mới và bản sửa đầy đủ đều phải được Admin duyệt.
- Khi Seller gửi bản sửa, phiên bản đã duyệt trước đó bị ẩn cho đến khi phiên bản mới được duyệt.
- Trạng thái duyệt và trạng thái bán hàng được quản lý riêng.
- Một checkout có thể chứa nhiều món từ nhiều Seller. Hệ thống tạo một Order cho mỗi Seller có món hàng trong checkout và một khoản thanh toán tổng.
- Giá và thông tin từng món được lưu lại tại thời điểm đặt hàng.
- Giỏ hàng không giữ món. Khi Buyer xác nhận checkout, backend phải kiểm tra lại các món và giữ chỗ trong 15 phút.
- Chỉ kết quả thanh toán đã được xác minh từ cổng sandbox mới được ghi nhận là đã thanh toán.
- Hết 15 phút giữ chỗ, backend tra cứu cổng. Thành công đã xác minh: cập nhật PAID/SOLD nếu không xung đột. Thất bại/hết hạn đã xác minh và không còn giao dịch chưa rõ: giải phóng theo điều kiện bán. Chưa rõ: giữ khóa bán, tra cứu lại sau 1, 3, 5 phút; vẫn chưa rõ thì NEEDS_REVIEW.
- Giải phóng giữ chỗ không tự động xóa trạng thái ẩn của Seller, trạng thái ẩn của Admin hoặc trạng thái chờ duyệt bản sửa.
## **2. Quy ước chung của API**

### **2.1. Định dạng và đường dẫn**

Các API dự kiến sử dụng:

- Base path: /api/v1
- Giao thức: HTTPS
- Định dạng dữ liệu: JSON, mã hóa UTF-8
- Thời gian: ISO 8601 theo UTC
- ID: chuỗi định danh, không dùng để suy ra thông tin nghiệp vụ
- Giá tiền: số nguyên không âm, tính bằng VND
Ví dụ:

GET /api/v1/listings

POST /api/v1/checkouts

GET /api/v1/orders/{orderId}

Các đường dẫn trên là đề xuất và có thể được điều chỉnh trước khi nhóm chốt OpenAPI.

### **2.2. Quy tắc xử lý giá**

Backend là nơi quyết định giá và tổng tiền phải thanh toán.

Frontend có thể gửi giá mà Buyer đã nhìn thấy để backend kiểm tra xem giá có thay đổi hay không. Tuy nhiên, backend phải tự đọc giá từ dữ liệu tin hợp lệ và tự tính tổng tiền.

Nếu giá đã thay đổi, backend từ chối checkout và yêu cầu Buyer kiểm tra lại.

Không được tin tổng tiền do frontend tự tính và gửi lên.

### **2.3. Phân trang**

Các API trả về danh sách sử dụng cursor và limit.

- limit: số bản ghi muốn nhận.
- nextCursor: thông tin để yêu cầu trang tiếp theo.
- nextCursor = null: không còn trang tiếp theo theo kết quả hiện tại.
Giới hạn limit tối đa cần được thống nhất sau khi đánh giá nhu cầu và tải hệ thống.

### **2.4. Theo dõi request**

Mỗi response phải có header X-Request-Id.

Mã này giúp nhóm tìm request tương ứng trong log khi cần điều tra lỗi.

Ví dụ: Buyer báo checkout bị lỗi. Nhóm có thể dùng request ID để tìm thời điểm xử lý, kết quả kiểm tra và nguyên nhân thất bại.

### **2.5. Chống xử lý trùng**

Các thao tác quan trọng như tạo checkout và tạo yêu cầu thanh toán phải hỗ trợ Idempotency-Key.

Quy tắc:

- Cùng khóa và cùng nội dung request: trả lại kết quả của thao tác ban đầu, không tạo thao tác trùng.
- Cùng khóa nhưng nội dung khác: trả lỗi IDEMPOTENCY_CONFLICT.
Thời gian lưu khóa và cách lưu kết quả cần được thống nhất khi triển khai.

### **2.6. Xác thực và bảo mật**

Cơ chế đăng nhập có thể sử dụng Express session/cookie. Backend chỉ được tin danh tính đã được ACC xác thực phía server.

Không trả về hoặc ghi vào log:

- Mật khẩu.
- Dữ liệu thẻ thanh toán hoặc mã bảo mật thẻ.
- Access token, secret key và bí mật webhook.
- Thông tin riêng tư mà người gọi API không có quyền xem.
## **3. Quy ước response và xử lý lỗi**

### **3.1. Response thành công**

Các response thành công sử dụng cấu trúc chung:

{

"data": {

"listingId": "lst_001",

"title": "Vintage Jacket",

"price": 250000

},

"meta": {

"requestId": "req_001"

}

}

Ý nghĩa:

- data: dữ liệu chính mà frontend cần.
- meta: thông tin bổ sung, chẳng hạn request ID hoặc thông tin phân trang.
Đối với API danh sách, data là một mảng và meta có thể chứa nextCursor.

### **3.2. Response lỗi**

Các response lỗi sử dụng cấu trúc chung:

{

"error": {

"code": "LISTING_UNAVAILABLE",

"message": "Món đồ hiện không thể mua.",

"details": [

{

"field": "listingId",

"reason": "RESERVED"

}

],

"retryable": false

},

"meta": {

"requestId": "req_001"

}

}

Ý nghĩa:

- code: mã lỗi ổn định để frontend xử lý bằng code.
- message: thông báo dễ hiểu.
- details: thông tin bổ sung mà người gọi được phép xem.
- retryable: cho biết có thể thử lại cùng thao tác hay không.
- requestId: mã để tra cứu log.
Không trả stack trace, thông tin bí mật hoặc xác nhận sự tồn tại của tài nguyên riêng tư cho người không có quyền.

### **3.3. Mã HTTP**

| **HTTP** | **Ý nghĩa** | **Ví dụ** |
| --- | --- | --- |
| 200 OK | Request thành công | Lấy thông tin tin đăng |
| 201 Created | Tạo tài nguyên thành công | Tạo tin đăng mới |
| 202 Accepted | Đã nhận xử lý nhưng chưa có kết quả cuối | Xử lý thanh toán đang chờ xác minh |
| 204 No Content | Thành công, không có nội dung response | Xóa một mục khỏi giỏ |
| 400 Bad Request | Request sai cú pháp hoặc định dạng | JSON không hợp lệ |
| 401 Unauthorized | Chưa xác thực | Guest gọi API yêu cầu đăng nhập |
| 403 Forbidden | Đã xác thực nhưng không có quyền | Seller gọi API chỉ dành cho Admin |
| 404 Not Found | Không tìm thấy hoặc không được phép biết tài nguyên | ID không tồn tại hoặc tài nguyên riêng tư |
| 409 Conflict | Xung đột trạng thái hoặc dữ liệu | Món đã được giữ bởi checkout khác |
| 422 Unprocessable Content | Dữ liệu đúng cú pháp nhưng vi phạm quy tắc | minPrice > maxPrice |
| 429 Too Many Requests | Gửi request quá thường xuyên | Vượt rate limit |
| 500 Internal Server Error | Lỗi nội bộ backend | Lỗi ngoài dự kiến |
| 502 Bad Gateway | Nhận phản hồi không hợp lệ từ dịch vụ phụ thuộc | Cổng thanh toán trả phản hồi lỗi |
| 503 Service Unavailable | Dịch vụ tạm thời không sẵn sàng | Backend hoặc dịch vụ phụ thuộc đang quá tải |

Chính sách rate limit và giới hạn cụ thể cần được thống nhất trước khi triển khai.

### **3.4. Mã lỗi nghiệp vụ tối thiểu**

| **Mã lỗi** | **Ý nghĩa** |
| --- | --- |
| AUTH_REQUIRED | Thao tác yêu cầu đăng nhập |
| ACCESS_DENIED | Người dùng không có quyền |
| VALIDATION_ERROR | Dữ liệu không hợp lệ |
| RESOURCE_NOT_FOUND | Không tìm thấy tài nguyên hoặc không được phép biết tài nguyên |
| LISTING_UNAVAILABLE | Món đồ không còn đủ điều kiện mua |
| LISTING_VERSION_CONFLICT | Phiên bản tin không còn là phiên bản phù hợp để thao tác |
| OWN_LISTING_PURCHASE | Người dùng đang cố mua tin của chính mình |
| PRICE_CHANGED | Giá hiện tại khác giá Buyer đã xác nhận |
| CHECKOUT_CONFLICT | Checkout không thể thực hiện do xung đột trạng thái |
| RESUBMISSION_LIMIT_REACHED | Đã đạt giới hạn gửi lại tin |
| IDEMPOTENCY_CONFLICT | Cùng khóa idempotency nhưng nội dung request khác |
| PAYMENT_REFERENCE_MISMATCH | Mã tham chiếu thanh toán không khớp |
| PAYMENT_NEEDS_REVIEW | Kết quả thanh toán cần được kiểm tra thêm |

Khi checkout có nhiều món và một số món không hợp lệ, details có thể liệt kê các món mà Buyer được phép biết. Backend phải từ chối toàn bộ checkout, không tạo một phần đơn hàng rồi để lại dữ liệu dở dang.

## **4. API theo mô-đun**

Tất cả endpoint dưới đây được hiểu là nằm dưới /api/v1, trừ khi ghi rõ là endpoint tích hợp từ cổng thanh toán.

### **4.1. ACC và DISC — Tài khoản và khám phá tin**

#### **Lấy tài khoản hiện tại**

GET /me

- Yêu cầu: đăng nhập.
- Trả về: thông tin tài khoản và quyền hiệu lực.
- Không trả về dữ liệu bí mật hoặc thông tin nội bộ không cần thiết.
Đăng nhập và đăng xuất sẽ do ACC cung cấp theo cơ chế xác thực mà nhóm lựa chọn.

#### **Lấy danh sách tin**

GET /listings

- Guest được xem danh sách tin công khai.
- Chỉ trả về tin đã được duyệt, đang hiển thị và đủ điều kiện xuất hiện trong feed.
- Các tham số tìm kiếm/lọc dự kiến gồm q, category, size, condition, minPrice, maxPrice.
- Theo chính sách hiện tại, tìm kiếm và lọc yêu cầu đăng nhập.
- Giá được tính bằng VND.
- Có thể chỉ truyền một trong hai tham số giá.
- Nếu minPrice > maxPrice, trả VALIDATION_ERROR.
- Tìm kiếm/lọc cần đăng nhập. Phân trang dùng page/limit, mặc định 20, tối đa 100; chỉ tìm trên revision đang được duyệt.
Ví dụ:

GET /api/v1/listings?q=vintage&minPrice=100000&maxPrice=300000

#### **Lấy chi tiết tin**

GET /listings/{listingId}

- Guest được xem chi tiết tin công khai.
- Tin không được duyệt hoặc đang bị ẩn không được trả về như tin công khai.
- Tin RESERVED vẫn xem được nhưng không mua thêm; tin SOLD xem được qua liên kết trực tiếp với watermark “Đã bán”, không có nút mua.
### **4.2. LST — Tin đăng và duyệt tin**

#### **Tạo tin mới**

POST /listings

Seller gửi form đầy đủ cùng ảnh của món đồ.

Nếu request hợp lệ:

- Tạo tin mới.
- Tạo phiên bản tin ban đầu.
- Đặt trạng thái duyệt là PENDING.
- Trả 201 Created cùng listingId, versionId và trạng thái duyệt.
Tin chưa được duyệt không xuất hiện như tin bán công khai.

#### **Gửi bản sửa tin**

POST /listings/{listingId}/revisions

Seller gửi lại toàn bộ form tin đăng, không chỉ gửi những trường thay đổi.

Backend:

- Kiểm tra người gửi có phải chủ tin không.
- Tạo phiên bản mới.
- Đặt phiên bản mới ở trạng thái PENDING.
- Ẩn phiên bản đã duyệt trước đó trong thời gian chờ duyệt bản mới.
Nếu món đã được giữ trong một checkout, thông tin và giá đã lưu trong Order không được thay đổi.

#### **Ẩn hoặc hiện tin bởi Seller**

POST /listings/{listingId}/visibility

Request dự kiến:

{

"action": "HIDE"

}

action có thể là HIDE hoặc SHOW.

- Chỉ chủ tin được thực hiện.
- HIDE đặt trạng thái Seller ẩn tin.
- SHOW chỉ xóa trạng thái Seller ẩn khi tin đã được duyệt, món đang AVAILABLE và không có trạng thái ẩn khác hoặc đang chờ duyệt sửa.
- Seller không được xóa trạng thái ẩn do Admin đặt.
- Seller không được hiện lại món đang RESERVED hoặc SOLD.

#### **Thông báo kiểm duyệt của Seller**

GET /me/notifications?page={page}&limit={limit}

Trả thông báo nội bộ gắn với người dùng hiện tại, gồm lý do kiểm duyệt, Listing/Version liên quan, `readAt` và tổng số chưa đọc. Mặc định 20 mục/trang, tối đa 100.

PATCH /me/notifications/{notificationId}/read

Chỉ người nhận được đánh dấu đã đọc; thao tác lặp lại trả trạng thái hiện tại. Thông báo không đồng nghĩa email đã được gửi.
#### **Admin duyệt hoặc từ chối phiên bản tin**

POST /admin/listing-versions/{versionId}/decision

Request dự kiến:

{

"decision": "REJECT",

"reason": "Ảnh chưa thể hiện rõ tình trạng sản phẩm."

}

Quyết định gồm APPROVE hoặc REJECT, kèm lý do phù hợp.
REJECT bắt buộc có lý do; cập nhật trạng thái revision, Listing, audit và thông báo Seller trong cùng transaction. Revision không còn PENDING trả 409.

#### **Admin ẩn hoặc hiện tin**

POST /admin/listings/{listingId}/visibility

Chỉ Admin có quyền thực hiện. Mỗi quyết định phải lưu người thực hiện, thời điểm và lý do.
Request gồm action HIDE/SHOW và reason bắt buộc. HIDE có thể kèm `requireCorrection: true` khi không có revision PENDING và món chưa SOLD; SHOW chỉ gỡ cờ `adminHidden`, không xóa `sellerHidden` và không vượt qua trạng thái RESERVED/SOLD, chờ duyệt hoặc khóa điều tra. Cập nhật audit và thông báo Seller nguyên tử với thay đổi Listing.

#### **Giới hạn gửi lại tin**

- Lần gửi tin đầu tiên không tính vào hạn mức gửi lại.
- Mỗi lần gửi lại sau khi bị từ chối hoặc được yêu cầu sửa lỗi nhẹ tính là một lượt theo listing.
- Giới hạn đã chốt là 5 lượt gửi lại trên mỗi listing: không tính lần gửi đầu; mỗi lần gửi lại sau từ chối hoặc yêu cầu sửa lỗi nhẹ tính 1 lượt. Lỗi nặng do Admin giữ ẩn theo quyết định riêng.
- Khi đạt giới hạn, trả RESUBMISSION_LIMIT_REACHED.
- Trường hợp lỗi nặng tiếp tục bị ẩn và được xử lý theo quyết định của Admin.
Chi tiết cách phân loại lỗi nhẹ và lỗi nặng phải thống nhất trong Business Rules.

### **4.3. ORD — Giỏ hàng, checkout và đơn hàng**

Chốt Bước A ngày 28/10/2026: hợp đồng chi tiết ORD/PAY, idempotency, route cũ và trạng thái nằm trong [báo cáo tổng đơn hàng và VNPAY Sandbox](../report/backend-orders-vnpay-sandbox-master-report.md). Các bước D–J đã triển khai; K đã kiểm thử cục bộ trên replica set. Giao dịch Sandbox thật và migration dữ liệu cũ vẫn chưa nghiệm thu. Giỏ giữ đường dẫn thực tế `/cart`, `/cart/items` trong lần triển khai này.

#### **Xem giỏ hàng**

GET /me/cart

Yêu cầu đăng nhập. Trả về các listing mà Buyer đã thêm vào giỏ.

#### **Thêm món vào giỏ**

PUT /me/cart/items/{listingId}

- Mỗi listing chỉ xuất hiện tối đa một lần trong giỏ.
- quantity luôn bằng 1.
- Thêm vào giỏ không giữ món.
- Backend có thể kiểm tra sớm món đã bán, đang được giữ hoặc thuộc về chính Buyer.
#### **Xóa món khỏi giỏ**

DELETE /me/cart/items/{listingId}

Xóa món tương ứng khỏi giỏ của Buyer đang đăng nhập.

#### **Xác nhận checkout**

POST /checkouts

Request dự kiến:

{

"paymentMethod": "VNPAY",

"recipientName": "Người nhận demo",

"recipientPhone": "0900000000",

"recipientAddress": "Địa chỉ giả dùng kiểm thử",

"items": [

{

"listingId": "lst_1",

"expectedPrice": 100000,

"expectedVersionId": "ver_1"

},

{

"listingId": "lst_2",

"expectedPrice": 200000,

"expectedVersionId": "ver_2"

}

]

}

Request phải có header Idempotency-Key. Body checkout còn bắt buộc recipientName, recipientPhone và recipientAddress ở cấp cao nhất; cùng payload/key trả Checkout cũ, key trùng với payload khác trả IDEMPOTENCY_CONFLICT. Không nhận body requestKey/listingIds theo hợp đồng mới.

Backend phải kiểm tra lại từng món:

- Buyer đã đăng nhập.
- Buyer không mua tin của chính mình.
- Tin có phiên bản được duyệt hợp lệ.
- Tin không bị ẩn và không đang chờ duyệt bản sửa.
- Món đang khả dụng, chưa bị bán hoặc giữ bởi checkout khác.
- Giá hiện tại khớp với expectedPrice.
- Phiên bản phù hợp với expectedVersionId.
Nếu bất kỳ món nào không hợp lệ, toàn bộ checkout bị từ chối.

Nếu tất cả đều hợp lệ, backend phải thực hiện trong một giao dịch nhất quán hoặc cơ chế tương đương:

- Tạo một Checkout.
- Tạo một Order cho mỗi Seller có món trong checkout.
- Tạo OrderItem cho từng món, với quantity = 1.
- Lưu giá và thông tin món tại thời điểm đặt hàng.
- Giữ từng món trong 15 phút.
- Lưu thời điểm hết hạn giữ chỗ.
Response dự kiến gồm:

- checkoutId
- totalAmount
- currency
- expiresAt
- Danh sách orderId

Checkout bắt đầu PENDING_PAYMENT, Order PENDING; dọn các món đã chọn khỏi giỏ trong cùng transaction tạo. Không SOLD tại bước này. Route cũ POST /checkouts/{checkoutId}/confirm sẽ trả 410 ENDPOINT_RETIRED sau khi chuyển đổi; chỉ kết quả cổng đã xác minh mới thực hiện settlement.
#### **Xem checkout**

GET /checkouts/{checkoutId}

Buyer có quyền xem tổng tiền, trạng thái checkout và các Order thuộc checkout của mình.

#### **Xem đơn hàng**

GET /orders/{orderId}

- Buyer của checkout được xem đơn hàng tương ứng.
- Seller chỉ được xem đơn thuộc về mình.
- Seller không được xem thông tin đơn của Seller khác trong cùng checkout.
- Trạng thái đã thanh toán không đồng nghĩa với đã giao hoặc đã nhận hàng.
Quy trình giao nhận hàng không thuộc phạm vi của endpoint thanh toán và cần được thiết kế riêng nếu MVP có triển khai.

### **4.4. PAY — Thanh toán sandbox**

#### **Tạo yêu cầu thanh toán**

POST /checkouts/{checkoutId}/payment-attempts

Request phải có Idempotency-Key.

Backend:

- Kiểm tra quyền của Buyer đối với checkout.
- Lấy tổng tiền và tiền tệ từ dữ liệu checkout.
- Tạo payment attempt gắn với Checkout.
- Trả về attemptId và URL thanh toán sandbox.
Payment attempt gắn với Checkout tổng, không gắn riêng với một Order của Seller.

MVP chỉ có một payment attempt trên mỗi Checkout. Sau thất bại đã xác minh và giải phóng món an toàn, Buyer tạo Checkout mới nếu món còn bán.

#### **Nhận webhook từ cổng thanh toán**

GET /integrations/payments/vnpay/ipn

Đây là endpoint dành cho cổng thanh toán, không phải endpoint để frontend tự thông báo rằng Buyer đã thanh toán thành công.

PAY phải:

- Xác minh nguồn gửi và chữ ký theo yêu cầu của nhà cung cấp.
- Kiểm tra mã tham chiếu payment attempt và Checkout.
- Kiểm tra số tiền và tiền tệ.
- Kiểm tra trạng thái giao dịch.
- Nhận diện sự kiện đã xử lý để tránh ghi nhận trùng.
- Chỉ cập nhật thanh toán sau khi kết quả được xác minh.
Nếu dữ liệu sai, thiếu hoặc chưa thể kết luận:

- Đặt trạng thái xử lý là NEEDS_REVIEW khi phù hợp.
- Không tự động đánh dấu PAID.
- Lưu thông tin cần thiết để điều tra.
- Trả phản hồi cho cổng theo hợp đồng của nhà cung cấp được lựa chọn.

`GET /integrations/payments/vnpay/return` là trang thông báo chờ khi frontend chưa có. Route không dùng query Return để quyết định kết quả và không cập nhật trạng thái thanh toán. Khi frontend được triển khai, Return URL chuyển về giao diện kết quả; giao diện đọc trạng thái qua API Buyer.
#### **Xem trạng thái thanh toán**

GET /checkouts/{checkoutId}/payment

Buyer được xem trạng thái thanh toán tổng của checkout.

Admin có thể xem dữ liệu cần thiết để điều tra thông qua giao diện được phân quyền, nhưng không được tự ý đánh dấu thanh toán là thành công.

Thanh toán riêng giữa Buyer và Seller bên ngoài hệ thống không làm thay đổi trạng thái thanh toán của Rewear Circle.

### **4.5. MOD — Báo cáo và khiếu nại**

#### **Báo cáo tin đăng**

POST /reports/listings

Yêu cầu đăng nhập và xác minh email; người báo không được là chủ Listing. Giới hạn 5 báo cáo/ngày theo tài khoản.

Request gồm:

- listingId
- reasonCode
- Mô tả bổ sung nếu có
- Bằng chứng nếu có
reasonCode dùng tập INACCURATE_OR_INCOMPLETE, SUSPECTED_COUNTERFEIT, PROHIBITED_OR_INAPPROPRIATE, OFFENSIVE_CONTENT, DUPLICATE_OR_SPAM, SUSPECTED_SCAM, OTHER; OTHER bắt buộc details. Evidence là 0–5 ID ảnh CASE_EVIDENCE do chính người báo tải lên.

Report gốc được lưu riêng và gắn với Case REPORT đang mở theo Listing; Case đã đóng không bị mở lại, report tiếp theo tạo Case mới. Tạo Report, Case, audit và thông báo tiếp nhận là một transaction. Backend tự lấy reporterId từ session.
Đây là báo cáo về tin đăng, thường được tạo trước khi mua hàng.

#### **Khiếu nại đơn hàng**

POST /orders/{orderId}/complaints

POST /orders/{orderId}/complaints chỉ dành cho Buyer của Order. Request có complaintType: DELIVERY | ITEM, reasonCode, mô tả và bằng chứng tùy chọn. Với DELIVERY, Order phải PAID, khiếu nại áp dụng toàn đơn và không cần affectedOrderItemIds. Với ITEM, Order phải COMPLETED; affectedOrderItemIds phải là mảng không rỗng, mọi ID đều thuộc Order. Backend đối chiếu thông tin món từ OrderItem snapshot. Khiếu nại không tự đổi trạng thái Order/Payment hoặc tạo hoàn tiền

#### **Admin xem và xử lý vụ việc**

GET /admin/cases

GET /admin/cases/{caseId}

Admin có thể xem danh sách vụ việc và chi tiết vụ việc theo quyền được cấp.

Nhiều báo cáo liên quan cùng một tin hoặc đơn có thể được nhóm lại để điều tra. Tuy nhiên, từng báo cáo gốc phải được lưu riêng.

Nhân viên hỗ trợ chỉ được xem vụ việc được giao và dữ liệu cần thiết. Việc truy cập thông tin liên hệ hoặc địa chỉ phải có lý do và được ghi log.

Trong phạm vi Report tin, POST /admin/cases/{caseId}/decisions chỉ cho phép OPEN→IN_REVIEW→CLOSED. Đóng cần outcomeCode và outcomeSummary; CORRECTION_REQUIRED/LISTING_HIDDEN có thể gọi chung quy tắc Admin HIDE trong cùng transaction. Người báo nhận outcomeSummary qua thông báo nội bộ; internalNote chỉ Admin xem.

POST /media/upload-requests nhận multipart `purpose=LISTING|CASE_EVIDENCE` (mặc định LISTING). CASE_EVIDENCE không công khai; đọc cần quyền người tải lên hoặc liên kết Case được phép. Buyer/Seller của Checkout/Order có thể đọc ảnh nằm trong snapshot giao dịch của họ.

## **5. Quy tắc dữ liệu phải luôn đúng**

### **5.1. Quan hệ giữa các đối tượng**

- Một Listing thuộc về đúng một Seller.
- Một Listing đại diện cho một món đồ, nên quantity = 1.
- Một Order thuộc về một Checkout và một Seller.
- Một OrderItem tham chiếu đến một Listing.
- Một Checkout có thể có nhiều Order.
- Một Checkout có một khoản thanh toán tổng theo mô hình MVP hiện tại.
### **5.2. Giá và snapshot đơn hàng**

Khi Buyer đặt hàng, backend phải lưu lại giá và thông tin của món tại thời điểm đặt.

Dữ liệu này gọi là productSnapshot hoặc snapshot đơn hàng.

Nếu Seller sửa giá, ảnh hoặc mô tả sau đó, thông tin đã lưu trong Order vẫn không thay đổi.

Tổng tiền Checkout phải bằng tổng giá trị các Order; số tiền thanh toán phải khớp với tổng tiền Checkout.

### **5.3. Chống hai Buyer mua cùng một món**

Tại thời điểm xác nhận checkout, backend phải kiểm tra và giữ món theo cách đảm bảo chỉ một Checkout có thể giữ một Listing tại cùng thời điểm.

Không được chỉ kiểm tra ở frontend, vì hai Buyer có thể gửi request gần như đồng thời.

Nếu một checkout đã giữ món thành công, checkout khác phải bị từ chối khi cố giữ cùng món đó.

### **5.4. Hết thời hạn giữ chỗ**

Thời hạn giữ chỗ mặc định theo nghiệp vụ là 15 phút.

Khi hết thời hạn:

- Backend phải đối chiếu trạng thái giao dịch với cổng thanh toán.
- Nếu xác minh được kết quả chưa thanh toán và đủ điều kiện giải phóng, mới giải phóng món.
- Kết quả chưa rõ: tra cứu lại sau 1, 3, 5 phút; nếu vẫn chưa rõ, Checkout/đơn NEEDS_REVIEW và món tiếp tục bị chặn. Nếu có kết quả thành công đến muộn và Checkout khác liên quan, PAY lưu SUCCESS nhưng khóa bán/giao và đưa các Checkout/đơn liên quan NEEDS_REVIEW.
- Việc giải phóng món không tự động gỡ các trạng thái ẩn hoặc chờ duyệt.
Đã chốt quy tắc kết quả muộn/mâu thuẫn: không tự giao cùng món cho hai Buyer hoặc tự hoàn tiền. Nếu Checkout sau được xác minh chưa trả, hoàn tất Checkout đã trả; nếu cả hai đã trả, xử lý vụ việc thủ công qua cổng. IPN GET và QueryDr của VNPAY đã chọn; checksum và bảng ánh xạ mã kết quả phải được kiểm chứng với khóa sandbox.

### **5.5. Ghi nhận lịch sử thao tác**

Các thao tác quan trọng phải có audit event, bao gồm:

- Duyệt, từ chối, ẩn và hiện tin.
- Tạo checkout và xử lý thanh toán.
- Xử lý webhook.
- Xem hoặc thay đổi thông tin trong vụ việc.
- Truy cập dữ liệu liên hệ hoặc địa chỉ nhạy cảm.
Thông tin log tối thiểu gồm request ID, người thực hiện, đối tượng liên quan, thời điểm và kết quả.

Bằng chứng và hồ sơ vụ việc được lưu 12 tháng sau khi đóng vụ theo quyết định đã chốt. Thời hạn log kỹ thuật và dữ liệu tài chính vẫn là chính sách riêng cần hoàn thiện.

## **6. Ví dụ hoàn chỉnh: Buyer mua nhiều món**

Giả sử Buyer mua:

- Áo của Seller A: 100.000 VND.
- Quần của Seller B: 200.000 VND.
Luồng xử lý:

- Buyer thêm hai món vào giỏ. Chưa có món nào được giữ.
- Buyer xác nhận checkout.
- Backend kiểm tra quyền mua, trạng thái tin, giá và khả năng giữ cả hai món.
- Nếu một trong hai món không hợp lệ, toàn bộ checkout thất bại.
- Nếu cả hai hợp lệ, backend tạo một Checkout tổng 300.000 VND.
- Backend tạo hai Order riêng, mỗi Order thuộc về một Seller.
- Backend lưu snapshot của từng món và giữ cả hai món trong 15 phút.
- PAY tạo một payment attempt tổng 300.000 VND.
- Cổng sandbox gửi kết quả thanh toán.
- Backend xác minh kết quả trước khi cập nhật trạng thái thanh toán và các Order liên quan.
Backend không được dựa vào việc Buyer quay lại website để kết luận thanh toán thành công.

## **7. Các quyết định cần thống nhất trước khi triển khai**

Những mục sau chưa được tài liệu này quyết định thay cho nhóm.

| **Nội dung cần chốt** | **Điều cần quyết định** |
| --- | --- |
| Trạng thái Listing | Đã chốt: khi PAY xác minh thanh toán tổng thành công, LST chuyển các món thuộc Checkout sang SOLD; giao/nhận là bước riêng. |
| Hủy checkout | Đã chốt: Buyer chỉ tự hủy trước khi tạo payment attempt đầu tiên; Seller không tự hủy. Sau khi bắt đầu thanh toán/đã trả tiền không có nút tự hủy trong MVP. Giải phóng món phải bảo đảm không có giao dịch chưa rõ và không gỡ các lý do ẩn. |
| Thanh toán lại | Đã chốt: không tạo payment attempt thứ hai trên cùng Checkout trong MVP; sau kết quả thất bại đã xác minh và giải phóng an toàn, Buyer có thể đặt lại bằng Checkout mới nếu món còn bán. |
| Kết quả đến muộn — đã chốt nghiệp vụ | Sau 15 phút tra cứu cổng; nếu chưa rõ tra cứu lại sau 1, 3, 5 phút rồi NEEDS_REVIEW và chặn món. Thành công muộn không xung đột thì PAID/SOLD; có Checkout khác thì PAY giữ SUCCESS, Checkout/đơn liên quan NEEDS_REVIEW, khóa bán/giao và điều tra. Không tự hoàn tiền hoặc đánh dấu PAID bằng tay. |
| Nhà cung cấp sandbox | VNPAY Sandbox |
| Xác nhận nhận hàng | Đã chốt: bên vận chuyển giao món; Buyer xác nhận “Đã nhận” trên đơn. ORD chuyển đơn sang COMPLETED và cho phép khiếu nại sau nhận; không tự hoàn tất khi Buyer chưa xác nhận. |
| Tin đã bán | Đã chốt: cho xem trang SOLD qua liên kết trực tiếp với watermark “Đã bán”, không có nút mua và không xuất hiện trong feed món còn bán. |
| Dữ liệu đầu vào | Đã chốt: form có tên, danh mục, kích cỡ, tình trạng, mô tả lỗi, giá VND, khu vực gửi hàng và ít nhất 1 ảnh; tối đa 5 ảnh, 5 MB/ảnh, JPEG/PNG/WebP. Danh mục cụ thể, giới hạn giá và độ dài trường còn cần chốt. |
| Phân trang | Đã chốt: mặc định 20 kết quả/trang; giới hạn tối đa của limit vẫn cần nhóm kỹ thuật xác định. |
| Rate limit | Giới hạn request theo tài khoản, IP hoặc loại endpoint |
| Idempotency | Thời gian lưu khóa và cách xử lý request lặp |
| Trạng thái và enum | Đã chốt: SOLD sau thanh toán đã xác minh không xung đột; Order COMPLETED sau Buyer xác nhận nhận; Case OPEN → IN_REVIEW → CLOSED. Checkout/Order NEEDS_REVIEW khi chưa rõ sau các mốc 1, 3, 5 phút hoặc xung đột; PAY vẫn lưu SUCCESS nếu khoản tiền đã được cổng xác minh. Bảng ánh xạ trạng thái cụ thể của cổng được chọn còn mở. |

Các quyết định này cần được cập nhật đồng bộ trong API Contracts, OpenAPI, Domain Model, State Lifecycles và Business Rules.

## **8. Tài liệu liên quan**

Khi triển khai hoặc sửa API, đối chiếu với:

- Domain Overview & Glossary.
- Business Rules.
- Domain Model.
- State Lifecycles — Listing, Order, Payment.
- Workflow WF-01 đến WF-04.
- Security & Privacy.
- Observability.
- Deployment & Environment Requirements.
Nếu có mâu thuẫn, các quy tắc nghiệp vụ đã thống nhất là cơ sở để xác định hành vi đúng. Sau khi thay đổi chính sách, nhóm cần cập nhật các tài liệu liên quan cùng lúc.

## **9. Tiêu chí hoàn thành**

Tài liệu API được xem là sẵn sàng để đóng băng cho MVP khi:

- Endpoint, quyền truy cập và cấu trúc request/response đã được thống nhất.
- Mã HTTP và mã lỗi có cách sử dụng rõ ràng.
- Luồng duyệt tin, checkout và thanh toán phù hợp với Business Rules.
- Các quy tắc chống mua trùng, chống xử lý trùng và bảo vệ dữ liệu đã được xác định.
- Những quyết định còn mở ảnh hưởng đến code và kiểm thử đã được nhóm chốt.
- OpenAPI và kiểm thử hợp đồng được cập nhật theo tài liệu cuối cùng.
QUYẾT ĐỊNH BỔ SUNG — 24/10/2026

ACC: MVP yêu cầu email thông thường được xác minh, không bắt buộc email trường và không duyệt hồ sơ Seller. Hồ sơ gồm tên hiển thị, email, ảnh tùy chọn. Quản lý khóa/xóa tài khoản nâng cao ngoài MVP. Admin chỉ duyệt/từ chối, ẩn/hiện tin, xử lý vụ việc, tra cứu giao dịch có phân quyền và giao vụ Support; không sửa tin thay Seller, không tự ghi PAID hoặc quản lý chi trả.

LST: mỗi tin chỉ có một revision PENDING; Seller có thể gửi form sửa khi món RESERVED nhưng snapshot đơn hiện tại không đổi; tin SOLD không nhận sửa. Cập nhật đồng thời kiểm tra version. Tin PENDING/REJECTED/ẩn không mở công khai; người đã đăng nhập tìm tên/mô tả, sắp xếp mới nhất, mặc định 20 kết quả/trang.

ORD bổ sung POST /checkouts/{checkoutId}/cancel (Buyer, chỉ trước payment attempt đầu tiên), PUT /orders/{orderId}/shipment (Seller ghi carrierName/trackingCode) và POST /orders/{orderId}/receipt-confirmation (Buyer xác nhận đã nhận và chuyển COMPLETED). Các route kiểm tra quyền/trạng thái tại server; thao tác POST dùng Idempotency-Key, vận đơn lặp đúng dữ liệu được trả lại như cùng kết quả.

MOD dùng **ba bộ lý do** đã chốt: báo Listing trước mua, khiếu nại DELIVERY và khiếu nại ITEM. Hai loại khiếu nại Order dùng chung endpoint nhưng có điều kiện trạng thái, lý do và yêu cầu chọn món khác nhau. Case đi qua OPEN → IN_REVIEW → CLOSED và lưu kết quả xử lý.

VNPAY Sandbox đã chọn; checksum và bảng ánh xạ mã kết quả chờ kiểm chứng khi có khóa thử nghiệm. Hai tài liệu Deployment, Backup & Logging Plan và API & Data Conventions đã ghi các phương án kỹ thuật cần nhóm phê duyệt; quy tắc nghiệp vụ xử lý kết quả đến muộn/mâu thuẫn đã chốt.

Cập nhật 26/10/2026

Hợp đồng xác minh email: POST /auth/verify-email và /auth/resend-verification. Mã một lần, lưu hash, có hạn; giới hạn gửi lại và trả response chung để chống dò tài khoản.

Hợp đồng checkout: recipientName, recipientPhone, recipientAddress bắt buộc. Response Order chỉ lộ recipientSnapshot cho Buyer và Seller của chính Order; Support được giao vụ chỉ xem khi cần, truy cập ghi audit.

Hợp đồng MOD-02: complaintType DELIVERY | ITEM. DELIVERY chỉ trên PAID, affectedOrderItemIds rỗng/không gửi. ITEM chỉ sau COMPLETED, affectedOrderItemIds không rỗng và thuộc Order; đối chiếu snapshot. Lỗi sai phạm vi trả VALIDATION_ERROR hoặc FORBIDDEN theo nguyên nhân.

Hợp đồng shipment: Seller của Order đủ điều kiện giao gửi carrierName/trackingCode; Order VNPAY cần PAID, Order COD có thể CONFIRMED/UNPAID. Buyer xem tình trạng và có thể báo chưa gửi/chưa đến.

VNPAY IPN là GET; backend trả JSON RspCode và Message theo tài liệu cổng sau khi xác minh checksum và đối chiếu giao dịch.

## Bổ sung hợp đồng COD — 28/10/2026

Hợp đồng A-09 tại [báo cáo tổng đơn hàng](../report/backend-orders-vnpay-sandbox-master-report.md) là nguồn request/response/quyền/ma trận COD. Các quy định chỉ xác minh cổng mới PAID/SOLD và một attempt tổng ở các mục trước áp dụng VNPAY; COD chốt quyền mua SOLD nhưng UNPAID khi đặt, thu riêng từng Order bằng khai báo Seller có nguồn/audit.

POST /checkouts yêu cầu paymentMethod=VNPAY|COD trong fingerprint; không trộn hoặc đổi phương thức trên một Checkout. COD tạo CONFIRMED với expiresAt=null. Tạo attempt cho COD trả 409 PAYMENT_METHOD_NOT_SUPPORTED; trạng thái thanh toán COD trả summary theo các Order, không trả NOT_STARTED như thể phải tạo URL VNPAY.

API COD (hủy Order, collection, return-request, Admin return-decision, danh sách collection/return cho Admin) cùng quy tắc idempotency, trạng thái, body và quyền được liệt kê trong A-09. Seller COD được đọc địa chỉ/giao trước thu khi canFulfill; Buyer receipt không tự collection. Backend không tuyên bố xác minh COD qua ngân hàng hoặc hãng giao hàng; demo không chuyển tiền thật.

Triển khai D–J: POST /checkouts tạo Checkout/Order theo COD hoặc VNPAY; GET /me/checkouts, GET /checkouts/{id}, GET /checkouts/{id}/payment và GET /me/orders có phân trang/kiểm quyền. POST /checkouts/{id}/payment-attempts tạo một attempt VNPAY; COD trả 409. IPN và QueryDr dùng settlement chung; worker chạy bằng `npm run worker:vnpay`. Admin tra cứu payment qua GET /admin/payments và GET /admin/payments/{id}, không có API tự đánh dấu PAID. Kiểm thử K đạt trên replica set dành riêng cho test; giao dịch Sandbox thật và migration dữ liệu cũ còn mở.
