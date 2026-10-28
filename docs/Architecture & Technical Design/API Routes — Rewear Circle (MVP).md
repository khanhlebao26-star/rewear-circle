# **API Routes — Rewear Circle (MVP)**

Cập nhật 26/10/2026: bổ sung xác minh email, cập nhật vận đơn và hợp đồng khiếu nại.

**Danh mục API RoutesNgày cập nhật:** 24/10/2026**Trạng thái:** Đề xuất cho MVP — chưa xác nhận là đã triển khai

Tổng cộng: 44 route ứng dụng và 3 route hạ tầng sau khi bổ sung route Buyer hủy trước thanh toán và xác nhận đã nhận. Các đường dẫn là đề xuất kỹ thuật; quy tắc nghiệp vụ đã chốt phải được giữ nguyên.

## **1. Mục đích và cách đọc**

Tài liệu này liệt kê các API cần có để phục vụ những chức năng của Rewear Circle, bao gồm:

- Tài khoản và hồ sơ người dùng.
- Xem, tìm kiếm và lọc tin đăng.
- Đăng bán, sửa tin và duyệt tin.
- Giỏ hàng, checkout và đơn hàng.
- Thanh toán sandbox.
- Báo cáo, khiếu nại và hỗ trợ.
- Tải ảnh và kiểm tra tình trạng hoạt động của hệ thống.
Đây là **danh mục thiết kế API**, không phải xác nhận rằng các route đã được lập trình.

### **1.1. Quy ước đường dẫn**

Tất cả route ứng dụng sử dụng tiền tố /api/v1.

Ví dụ:

- GET /listings tương ứng với GET /api/v1/listings.
- POST /checkouts tương ứng với POST /api/v1/checkouts.
Các route /health/live và /health/ready không sử dụng tiền tố /api/v1.

### **1.2. Ý nghĩa nhãn**

- **Cốt lõi:** Cần cho luồng nghiệp vụ chính của MVP.
- **Bổ trợ:** Phục vụ quản lý, theo dõi hoặc điều tra.
- **Phụ thuộc:** Cần chốt thêm về hạ tầng, nhà cung cấp hoặc chính sách trước khi triển khai.
### **1.3. Quy ước quyền truy cập**

| **Quyền** | **Ý nghĩa** |
| --- | --- |
| Công khai | Không cần đăng nhập, nhưng chỉ được xem dữ liệu đã được phép công khai |
| Tài khoản | Người dùng đã đăng nhập |
| Chủ tin | Người dùng sở hữu tin đăng tương ứng |
| Buyer | Người mua có liên quan đến checkout hoặc đơn hàng |
| Seller | Người bán sở hữu đơn hàng tương ứng |
| Admin | Người dùng có quyền quản trị được cấp riêng |
| Support | Nhân viên hỗ trợ chỉ được xem vụ việc được giao |
| Cổng | Webhook đến từ cổng thanh toán và đã được xác minh |

Buyer và Seller không phải hai loại tài khoản riêng biệt. Một tài khoản người dùng có thể vừa mua hàng vừa đăng tin bán.

## **2. ACC — Tài khoản và hồ sơ**

**Mục đích:** Đăng ký, đăng nhập, đăng xuất và quản lý thông tin tài khoản.

### **ACC-01 — Đăng ký tài khoản**

- **Method:** POST
- **Route:** /auth/register
- **Quyền:** Chưa đăng nhập
- **Phân loại:** Phụ thuộc
Tạo tài khoản mới.

Tài khoản mới chưa xác minh email. Express tạo phiên sau đăng nhập; chỉ email đã xác minh mới được mua/đăng bán. Xác minh tư cách sinh viên bằng email trường ngoài MVP.

### **ACC-02 — Đăng nhập**

- **Method:** POST
- **Route:** /auth/login
- **Quyền:** Chưa đăng nhập
- **Phân loại:** Phụ thuộc
Xác thực người dùng và tạo phiên đăng nhập hợp lệ.

Sau khi đăng nhập, người dùng quay lại trang đang xem và tự thực hiện lại thao tác trước đó. Hệ thống không tự động gửi lại thao tác bị gián đoạn.

### **ACC-03 — Đăng xuất**

- **Method:** POST
- **Route:** /auth/logout
- **Quyền:** Tài khoản
- **Phân loại:** Phụ thuộc
Kết thúc phiên đăng nhập hiện tại theo cơ chế xác thực đã chọn.

### **ACC-04 — Lấy thông tin tài khoản hiện tại**

- **Method:** GET
- **Route:** /me
- **Quyền:** Tài khoản
- **Phân loại:** Cốt lõi
Trả về hồ sơ cơ bản và quyền hiệu lực của người dùng hiện tại.

Không trả về mật khẩu, bí mật xác thực hoặc dữ liệu nội bộ không cần thiết. Backend không được tin vai trò do frontend tự gửi lên.

### **ACC-05 — Cập nhật hồ sơ**

- **Method:** PATCH
- **Route:** /me
- **Quyền:** Tài khoản
- **Phân loại:** Bổ trợ
Cập nhật các trường hồ sơ được phép chỉnh sửa.

Người dùng không được tự thay đổi vai trò, trạng thái tài khoản hoặc quyền Admin.

### **ACC-06 — Xác minh email**

- **Method:** POST
- **Route:** /auth/verify-email
- **Quyền:** Người dùng đã đăng nhập
- **Phân loại:** Cốt lõi
Xác minh địa chỉ email bằng mã một lần được gửi đến email đã đăng ký.

Backend kiểm tra mã, thời hạn, số lần nhập sai và trạng thái sử dụng. Khi xác minh thành công, cập nhật emailVerifiedAt.

Mã phải được lưu dưới dạng hash, chỉ dùng một lần và hết hạn sau 10 phút. Cho phép tối đa 5 lần nhập sai cho mỗi mã.

**Lỗi chính:** VALIDATION_ERROR, VERIFICATION_CODE_INVALID, VERIFICATION_CODE_EXPIRED, VERIFICATION_ATTEMPTS_EXCEEDED.

### **ACC-07 — Gửi lại mã xác minh email**

- **Method:** POST
- **Route:** /auth/resend-verification
- **Quyền:** Người dùng đã đăng nhập
- **Phân loại:** Cốt lõi
Yêu cầu gửi mã xác minh mới đến email của tài khoản hiện tại.

Giới hạn gửi lại: tối thiểu 60 giây giữa các lần gửi và tối đa 5 lần trong 1 giờ cho mỗi tài khoản. Mã mới phải vô hiệu hóa mã cũ.

Response không tiết lộ email đã tồn tại, chưa xác minh hay không đủ điều kiện gửi mã. Endpoint phải áp dụng rate limit và không trả mã xác minh trong response hoặc log.

## **3. DISC — Xem và tìm kiếm tin**

**Mục đích:** Hiển thị feed và chi tiết món đồ.

### **DISC-01 — Lấy danh sách tin**

- **Method:** GET
- **Route:** /listings
- **Quyền:** Công khai khi không có tham số tìm kiếm/lọc; Tài khoản khi sử dụng tìm kiếm/lọc
- **Phân loại:** Cốt lõi
Trả về danh sách tin đủ điều kiện xuất hiện công khai.

Các tham số dự kiến:

- q: từ khóa tìm kiếm.
- category: danh mục.
- size: kích cỡ.
- condition: tình trạng sản phẩm.
- minPrice: giá thấp nhất.
- maxPrice: giá cao nhất.
Quy tắc:

- Tin phải được duyệt và được phép hiển thị.
- Món phải đáp ứng điều kiện xuất hiện trong feed.
- Giá lọc được tính bằng VND.
- Có thể bỏ trống một trong hai đầu giá.
- Nếu minPrice > maxPrice, trả VALIDATION_ERROR.
- Danh sách phải hỗ trợ phân trang.
### **DISC-02 — Xem chi tiết tin**

- **Method:** GET
- **Route:** /listings/{listingId}
- **Quyền:** Công khai đối với tin được phép xem
- **Phân loại:** Cốt lõi
Trả về thông tin chi tiết của một món đồ và trạng thái mua hiện tại.

Tin đang chờ duyệt, bị từ chối hoặc bị ẩn không được hiển thị như tin công khai.

Tin SOLD xem được qua liên kết trực tiếp với watermark Đã bán và không có nút mua.

## **4. LST — Seller quản lý tin đăng**

**Mục đích:** Cho phép người dùng tạo, xem và quản lý các tin do mình đăng.

### **LST-01 — Danh sách tin của tôi**

- **Method:** GET
- **Route:** /me/listings
- **Quyền:** Tài khoản
- **Phân loại:** Bổ trợ
Trả về các tin do người dùng hiện tại đăng, bao gồm tin:

- Đang chờ duyệt.
- Bị từ chối.
- Được Seller tự ẩn.
- Bị Admin ẩn.
- Đang giữ chỗ.
- Đã bán.
Danh sách cần hỗ trợ phân trang.

### **LST-02 — Chi tiết tin của tôi**

- **Method:** GET
- **Route:** /me/listings/{listingId}
- **Quyền:** Chủ tin
- **Phân loại:** Bổ trợ
Trả về thông tin quản lý của tin, bao gồm trạng thái duyệt, trạng thái bán và lý do tin chưa thể mua.

Route này cho phép chủ tin xem thông tin quản lý của tin ẩn mà không cần làm lộ tin đó qua API công khai.

### **LST-03 — Tạo tin mới**

- **Method:** POST
- **Route:** /listings
- **Quyền:** Tài khoản
- **Phân loại:** Cốt lõi
Nhận form sản phẩm đầy đủ và thông tin tham chiếu đến ảnh.

Backend tạo tin và phiên bản đầu tiên ở trạng thái PENDING để Admin duyệt.

Không cần quy trình duyệt hồ sơ Seller riêng.

### **LST-04 — Gửi bản sửa tin**

- **Method:** POST
- **Route:** /listings/{listingId}/revisions
- **Quyền:** Chủ tin
- **Phân loại:** Cốt lõi
Seller gửi lại toàn bộ form tin đăng để tạo phiên bản mới.

Backend phải:

- Kiểm tra người gửi là chủ tin.
- Tạo phiên bản mới ở trạng thái PENDING.
- Ẩn phiên bản đã duyệt trước đó trong thời gian chờ duyệt bản mới.
- Giữ nguyên dữ liệu của các đơn đã tạo trước đó.
Việc sửa tin không được làm thay đổi giá hoặc thông tin sản phẩm đã lưu trong đơn hàng cũ.

### **LST-05 — Xem lịch sử phiên bản tin**

- **Method:** GET
- **Route:** /me/listings/{listingId}/revisions
- **Quyền:** Chủ tin
- **Phân loại:** Bổ trợ
Trả về lịch sử các phiên bản, lý do từ chối hoặc yêu cầu sửa, và số lượt gửi lại còn lại.

Theo quy tắc đề xuất:

- Lần gửi tin đầu tiên không tính vào giới hạn gửi lại.
- Giới hạn gửi lại là 5 lượt theo mỗi listing.
- Đã chốt: lần gửi đầu không tính; mỗi lần gửi lại sau từ chối hoặc yêu cầu sửa lỗi nhẹ tính 1 lượt theo listing; tối đa 5 lượt. Lỗi nặng do quyết định Admin xử lý riêng.
### **LST-06 — Ẩn hoặc hiện tin**

- **Method:** POST
- **Route:** /listings/{listingId}/visibility
- **Quyền:** Chủ tin
- **Phân loại:** Cốt lõi
Request sử dụng action với giá trị HIDE hoặc SHOW.

HIDE: Seller tự ẩn tin.

SHOW: Seller yêu cầu hiện lại tin. Chỉ được phép gỡ trạng thái Seller ẩn khi:

- Tin đã được duyệt.
- Món đang AVAILABLE.
- Không có trạng thái Admin ẩn.
- Không đang chờ duyệt bản sửa.
Seller không được tự gỡ trạng thái ẩn do Admin đặt hoặc mở bán món đang RESERVED hay SOLD.

## **5. LST/MOD — Admin duyệt và ẩn tin**

**Mục đích:** Hỗ trợ Admin kiểm duyệt phiên bản tin và quản lý việc hiển thị.

### **ADM-01 — Danh sách phiên bản chờ duyệt**

- **Method:** GET
- **Route:** /admin/listing-versions?status=PENDING
- **Quyền:** Admin
- **Phân loại:** Bổ trợ
Trả về hàng chờ gồm tin mới và các phiên bản sửa đang chờ duyệt.

### **ADM-02 — Chi tiết phiên bản cần duyệt**

- **Method:** GET
- **Route:** /admin/listing-versions/{versionId}
- **Quyền:** Admin
- **Phân loại:** Bổ trợ
Trả về form đầy đủ, lịch sử phiên bản và thông tin cần thiết để Admin đưa ra quyết định.

### **ADM-03 — Duyệt hoặc từ chối phiên bản**

- **Method:** POST
- **Route:** /admin/listing-versions/{versionId}/decision
- **Quyền:** Admin
- **Phân loại:** Cốt lõi
Admin chọn APPROVE hoặc REJECT và cung cấp lý do phù hợp.

Backend phải ghi lại người thực hiện, thời điểm, quyết định và kết quả. Việc duyệt phải cập nhật đúng phiên bản, không vô tình làm hiện phiên bản khác đang bị ẩn.

### **ADM-04 — Admin ẩn hoặc gỡ ẩn tin**

- **Method:** POST
- **Route:** /admin/listings/{listingId}/visibility
- **Quyền:** Admin
- **Phân loại:** Cốt lõi
Admin thay đổi trạng thái hiển thị theo quyền kiểm duyệt.

Thao tác này không được:

- Mở bán món đang RESERVED hoặc SOLD.
- Xóa trạng thái Seller tự ẩn.
- Bỏ qua yêu cầu duyệt phiên bản tin.
## **6. ORD — Giỏ hàng, checkout và đơn hàng**

**Mục đích:** Xử lý quá trình Buyer chọn món, xác nhận mua và theo dõi đơn.

### **ORD-01 — Xem giỏ hàng**

- **Method:** GET
- **Route:** /me/cart
- **Quyền:** Tài khoản
- **Phân loại:** Cốt lõi
Trả về giỏ hàng của người dùng hiện tại. Guest không có giỏ hàng trong MVP.

### **ORD-02 — Thêm món vào giỏ**

- **Method:** PUT
- **Route:** /me/cart/items/{listingId}
- **Quyền:** Tài khoản
- **Phân loại:** Cốt lõi
Thêm một món vào giỏ.

Quy tắc:

- Mỗi listing chỉ xuất hiện tối đa một lần.
- Số lượng luôn bằng 1.
- Thêm vào giỏ không giữ chỗ.
- Backend có thể thông báo sớm nếu món không khả dụng hoặc thuộc về chính người dùng.
- Backend vẫn phải kiểm tra lại khi Buyer xác nhận checkout.
### **ORD-03 — Xóa món khỏi giỏ**

- **Method:** DELETE
- **Route:** /me/cart/items/{listingId}
- **Quyền:** Tài khoản
- **Phân loại:** Cốt lõi
Xóa món tương ứng khỏi giỏ của người dùng hiện tại.

### **ORD-04 — Xác nhận checkout**

- **Method:** POST
- **Route:** /checkouts
- **Quyền:** Buyer đã đăng nhập và đã xác minh email
- **Phân loại:** Cốt lõi
Buyer gửi danh sách các món muốn mua. Mỗi món cần có:

- listingId: ID tin đăng.
- expectedPrice: giá Buyer đã xem.
- expectedVersionId: phiên bản tin Buyer đã xem.
Request phải có Idempotency-Key, recipientName, recipientPhone và recipientAddress, ngoài danh sách sản phẩm cần mua.

Backend phải kiểm tra lại:

- Người mua không phải chủ của bất kỳ món nào.
- Tin đã được duyệt và đang được phép hiển thị.
- Món đang khả dụng, chưa bán và chưa được checkout khác giữ.
- Giá chưa thay đổi.
- Phiên bản tin phù hợp.
- Không có trạng thái ẩn hoặc chờ duyệt bản sửa khiến món không được mua.
Nếu bất kỳ món nào không hợp lệ, từ chối toàn bộ checkout.

Nếu tất cả món hợp lệ, backend tạo:

- Một Checkout tổng.
- Một Order cho mỗi Seller có món trong checkout.
- Một OrderItem cho mỗi món.
- Snapshot giá và thông tin sản phẩm tại thời điểm đặt.
- Reservation cho từng món trong 15 phút.
Việc kiểm tra, tạo dữ liệu và giữ món phải được thực hiện theo cách nhất quán để không bán một món hai lần.

### **ORD-05 — Lịch sử checkout**

- **Method:** GET
- **Route:** /me/checkouts
- **Quyền:** Buyer
- **Phân loại:** Bổ trợ
Trả về lịch sử các lượt mua của người dùng hiện tại, gồm tổng tiền và trạng thái thanh toán. Danh sách cần hỗ trợ phân trang.

### **ORD-06 — Chi tiết checkout**

- **Method:** GET
- **Route:** /checkouts/{checkoutId}
- **Quyền:** Buyer sở hữu checkout
- **Phân loại:** Cốt lõi
Trả về tổng tiền, thời hạn giữ chỗ và các Order thuộc checkout.

Buyer chỉ được xem checkout của mình.

### **ORD-07 — Danh sách đơn mua hoặc đơn bán**

- **Method:** GET
- **Route:** /me/orders?perspective=buying|selling
- **Quyền:** Tài khoản
- **Phân loại:** Bổ trợ
Trả về danh sách đơn theo góc nhìn:

- buying: các đơn người dùng mua.
- selling: các đơn thuộc về tin do người dùng bán.
Một tài khoản có thể sử dụng cả hai góc nhìn. Danh sách cần hỗ trợ lọc và phân trang.

### **ORD-08 — Chi tiết đơn hàng**

- **Method:** GET
- **Route:** /orders/{orderId}
- **Quyền:** Buyer liên quan hoặc Seller của đơn
- **Phân loại:** Cốt lõi
Trả về thông tin đơn hàng và snapshot sản phẩm đã lưu tại thời điểm đặt.

Seller chỉ được xem đơn thuộc về mình, không được xem đơn của Seller khác trong cùng Checkout.

### **ORD-11 — Tạo hoặc cập nhật thông tin vận chuyển**

- **Method:** PUT
- **Route:** /orders/{orderId}/shipment
- **Quyền:** Seller sở hữu Order
- **Phân loại:** Cốt lõi
Tạo hoặc cập nhật thông tin vận chuyển cho Order đã thanh toán.

Request gồm:

- carrierName: tên đơn vị vận chuyển.
- trackingCode: mã vận đơn.
- shippedAt: thời điểm gửi hàng, do server ghi nhận khi xác nhận lần đầu đã gửi.
Quy tắc:

- Order phải ở trạng thái PAID.
- Seller chỉ được thao tác trên Order thuộc mình.
- Seller có thể sửa carrierName và trackingCode khi Order chưa COMPLETED.
- shippedAt không được tự ý thay đổi khi chỉnh sửa mã vận đơn.
- Mỗi lần thay đổi phải được ghi audit log.
- Không tích hợp API hãng vận chuyển trong MVP; backend không tuyên bố rằng trạng thái giao hàng đã được hãng vận chuyển xác minh.
### **ORD-12 — Buyer xác nhận đã nhận hàng**

- **Method:** POST
- **Route:** /orders/{orderId}/receipt-confirmation
- **Quyền:** Buyer của Order
- **Phân loại:** Cốt lõi
Buyer xác nhận đã thực sự nhận được sản phẩm. Order phải ở trạng thái PAID; backend chuyển Order sang COMPLETED.

Request phải hỗ trợ Idempotency-Key hoặc cơ chế tương đương để tránh xử lý lặp. Việc xác nhận không tự động hoàn tiền hoặc đóng các Case đang mở.

## **7. PAY — Thanh toán sandbox và điều tra**

**Mục đích:** Tạo yêu cầu thanh toán, kiểm tra trạng thái và hỗ trợ điều tra giao dịch.

### **PAY-01 — Tạo payment attempt**

- **Method:** POST
- **Route:** /checkouts/{checkoutId}/payment-attempts
- **Quyền:** Buyer sở hữu checkout
- **Phân loại:** Cốt lõi
Tạo yêu cầu thanh toán cho tổng tiền của Checkout.

Backend tự lấy tổng tiền và tiền tệ từ dữ liệu đã lưu. Request phải có Idempotency-Key.

Response dự kiến có:

- attemptId: ID lần thử thanh toán.
- URL thanh toán sandbox.
MVP không tạo lần thử thứ hai trên cùng Checkout; Buyer tạo Checkout mới sau khi kết quả chưa trả được xác minh và món được giải phóng an toàn.

### **PAY-02 — Xem trạng thái thanh toán**

- **Method:** GET
- **Route:** /checkouts/{checkoutId}/payment
- **Quyền:** Buyer sở hữu checkout
- **Phân loại:** Cốt lõi
Trả về trạng thái thanh toán tổng của checkout.

Việc trình duyệt quay lại website không phải bằng chứng thanh toán thành công. Trạng thái cuối cùng phải dựa trên kết quả đã được backend xác minh.

### **PAY-03 — Nhận webhook thanh toán**

- **Method: GET**
- **Route: /integrations/payments/vnpay/ipn**
- **Quyền:** Cổng thanh toán đã xác minh
- **Phân loại:** Cốt lõi, phụ thuộc nhà cung cấp
Nhận thông báo giao dịch từ cổng thanh toán.

Backend phải:

- Xác minh nguồn gửi hoặc chữ ký theo yêu cầu nhà cung cấp.
- Kiểm tra mã tham chiếu của payment attempt và Checkout.
- Kiểm tra tổng tiền, tiền tệ và trạng thái giao dịch.
- Nhận diện sự kiện đã xử lý để tránh ghi nhận trùng.
- Chỉ cập nhật trạng thái thanh toán khi kết quả đã được xác minh.
Webhook sai chữ ký, sai mã tham chiếu, số tiền hoặc tiền tệ bị từ chối và ghi log; không đánh dấu PAID. Nếu cổng đã xác minh nhưng kết quả chưa rõ, giữ khóa bán và xử lý theo các mốc 1, 3, 5 phút; xung đột Checkout khác đưa NEEDS_REVIEW.

VNPAY IPN dùng GET /integrations/payments/vnpay/ipn và phản hồi JSON RspCode/Message; cấu hình URL công khai với cổng.

### **PAY-04 — Tra cứu giao dịch**

- **Method:** GET
- **Route:** /admin/payments?orderId=...&providerReference=...
- **Quyền:** Admin được phân quyền
- **Phân loại:** Bổ trợ
Cho phép Admin tìm giao dịch theo mã đơn hoặc mã tham chiếu của nhà cung cấp để điều tra.

Route này chỉ phục vụ tra cứu, không cho phép tự ghi nhận thanh toán thành công.

### **PAY-05 — Chi tiết payment attempt**

- **Method:** GET
- **Route:** /admin/payments/{attemptId}
- **Quyền:** Admin được phân quyền
- **Phân loại:** Bổ trợ
Trả về thông tin cần thiết để điều tra một lần thử thanh toán, bao gồm mã tham chiếu, các sự kiện liên quan và trạng thái đối chiếu.

Thông tin nhạy cảm phải được che hoặc loại bỏ.

## **8. MOD — Báo cáo, khiếu nại và hỗ trợ**

**Mục đích:** Tiếp nhận báo cáo và khiếu nại, đồng thời cho phép Admin hoặc nhân viên hỗ trợ xử lý vụ việc.

### **MOD-01 — Báo cáo tin đăng**

- **Method:** POST
- **Route:** /reports/listings
- **Quyền:** Tài khoản
- **Phân loại:** Cốt lõi
Cho phép người dùng báo cáo tin đăng trước khi mua.

Request gồm:

- listingId.
- Lý do báo cáo.
- Mô tả bổ sung nếu có.
- Bằng chứng nếu có.
Backend tự xác định người báo cáo từ phiên đăng nhập, không tin reporterId do client tự gửi.

### **MOD-02 — Tạo khiếu nại đơn hàng**

- **Method:** POST
- **Route:** /orders/{orderId}/complaints
- **Quyền:** Buyer của Order
Các loại khiếu nại:

**DELIVERY**

- Chỉ cho phép khi Order ở trạng thái PAID.
- Dùng để báo Seller chưa gửi hàng hoặc Buyer chưa nhận hàng.
- affectedOrderItemIds phải bị bỏ qua hoặc không được gửi; đề xuất không cho phép gửi trường này.
**ITEM**

- Chỉ cho phép khi Order ở trạng thái COMPLETED.
- Dùng để báo vấn đề với sản phẩm đã nhận.
- affectedOrderItemIds là mảng bắt buộc, có ít nhất một ID và mọi ID phải thuộc Order tương ứng.
Backend phải kiểm tra quyền sở hữu Order, trạng thái hiện tại, reasonCode tương ứng với loại khiếu nại và các OrderItem được chọn.

Mỗi khiếu nại phải lưu thông tin cần thiết tại thời điểm tạo. Khiếu nại không tự động thay đổi trạng thái Order hoặc Payment và không tự tạo giao dịch hoàn tiền.

### **MOD-03 — Danh sách vụ việc**

- **Method:** GET
- **Route:** /admin/cases
- **Quyền:** Admin
- **Phân loại:** Cốt lõi
Trả về danh sách vụ việc liên quan đến báo cáo tin hoặc khiếu nại đơn hàng.

Nhiều báo cáo cùng liên quan đến một tin hoặc đơn có thể được nhóm vào một vụ việc. Tuy nhiên, từng báo cáo gốc vẫn phải được lưu riêng.

### **MOD-04 — Chi tiết vụ việc**

- **Method:** GET
- **Route:** /admin/cases/{caseId}
- **Quyền:** Admin
- **Phân loại:** Cốt lõi
Trả về thông tin cần thiết để điều tra, bao gồm báo cáo gốc, bằng chứng và lịch sử xử lý, trong phạm vi quyền được cấp.

### **MOD-05 — Ghi nhận quyết định xử lý vụ việc**

- **Method:** POST
- **Route:** /admin/cases/{caseId}/decisions
- **Quyền:** Admin
- **Phân loại:** Bổ trợ
Ghi nhận quyết định xử lý vụ việc theo Business Rules đã thống nhất, chẳng hạn giữ nguyên quyết định hiện tại, yêu cầu sửa tin hoặc tiếp tục ẩn tin.

Nếu quyết định làm thay đổi trạng thái hiển thị, việc thay đổi phải đi qua quy trình LST tương ứng. Quyết định xử lý vụ việc không được bỏ qua quy tắc duyệt tin hoặc trạng thái bán hàng.

### **MOD-06 — Phân công vụ việc**

- **Method:** PATCH
- **Route:** /admin/cases/{caseId}/assignment
- **Quyền:** Admin
- **Phân loại:** Bổ trợ
Giao vụ việc cho nhân viên hỗ trợ được phép xử lý.

Backend ghi lại người giao, người nhận và thời điểm phân công.

### **MOD-07 — Danh sách vụ việc được giao**

- **Method:** GET
- **Route:** /support/cases
- **Quyền:** Support
- **Phân loại:** Bổ trợ
Trả về các vụ việc được giao cho nhân viên hỗ trợ hiện tại. Không được trả toàn bộ danh sách vụ việc của hệ thống.

### **MOD-08 — Chi tiết vụ việc được giao**

- **Method:** GET
- **Route:** /support/cases/{caseId}
- **Quyền:** Support được giao vụ việc
- **Phân loại:** Bổ trợ
Trả về thông tin tối thiểu cần thiết để xử lý vụ việc.

Quyền xem vụ việc không đồng nghĩa với quyền xem tất cả đơn hàng, địa chỉ hoặc thông tin liên hệ của người dùng.

### **MOD-09 — Yêu cầu quyền xem thông tin liên hệ**

- **Method:** POST
- **Route:** /support/cases/{caseId}/contact-access
- **Quyền:** Support được giao vụ việc
- **Phân loại:** Bổ trợ, cần chốt thiết kế
Cho phép nhân viên hỗ trợ nêu lý do cần truy cập thông tin liên hệ hoặc địa chỉ để xử lý vụ việc.

Mọi lần truy cập phải được ghi log. Cách cấp quyền, thời hạn quyền và trường thông tin được phép xem cần được thống nhất trước khi triển khai.

## **9. Media và vận hành hệ thống**

### **INF-01 — Yêu cầu tải ảnh**

- **Method:** POST
- **Route:** /media/upload-requests
- **Quyền:** Tài khoản
- **Phân loại:** Phụ thuộc
Yêu cầu quyền tải ảnh phục vụ:

- LISTING_IMAGE: ảnh tin đăng.
- CASE_EVIDENCE: bằng chứng cho báo cáo hoặc khiếu nại.
Đã chốt giới hạn ảnh/tin: 1–5 ảnh JPEG/PNG/WebP, mỗi ảnh tối đa 5 MB. Cách lưu file, kiểm tra nội dung tệp và URL ký thuộc quy ước API/lưu dữ liệu chưa chốt.

Bằng chứng vụ việc không được công khai như ảnh sản phẩm thông thường.

### **INF-02 — Kiểm tra tiến trình**

- **Method:** GET
- **Route:** /health/live
- **Quyền:** Hạ tầng nội bộ
- **Phân loại:** Phụ thuộc
Kiểm tra ứng dụng có đang chạy hay không.

Không trả dữ liệu nghiệp vụ, thông tin đăng nhập hoặc chi tiết kết nối.

### **INF-03 — Kiểm tra mức độ sẵn sàng**

- **Method:** GET
- **Route:** /health/ready
- **Quyền:** Hạ tầng nội bộ
- **Phân loại:** Phụ thuộc
Kiểm tra ứng dụng có sẵn sàng nhận request hay không, bao gồm các phụ thuộc quan trọng theo cấu hình triển khai.

Không công khai thông tin kết nối hoặc bí mật hệ thống.

## **10. Quy tắc chung khi triển khai**

### **10.1. Quy tắc dữ liệu**

- Request và response sử dụng JSON UTF-8.
- Thời gian sử dụng ISO 8601 UTC.
- Giá tiền là số nguyên VND.
- Backend tự tính tổng tiền Checkout.
- Tổng Checkout phải bằng tổng các Order và số tiền tương ứng của payment attempt.
- Các API trả về danh sách phải hỗ trợ phân trang.
### **10.2. Xác thực và phân quyền**

- Các route ghi dữ liệu phải kiểm tra đăng nhập và quyền ở backend.
- 401 dùng khi chưa xác thực.
- 403 dùng khi đã xác thực nhưng không có quyền.
- Backend tự xác định Buyer, Seller và người báo cáo từ danh tính đã xác thực.
- Không dùng ID do client tự khai làm bằng chứng về quyền sở hữu.
- Route công khai chỉ được trả dữ liệu đã được phép xem.
### **10.3. Chống thao tác trùng và mua trùng**

- Tạo Checkout và payment attempt phải hỗ trợ Idempotency-Key.
- Webhook phải chống xử lý trùng theo mã sự kiện của nhà cung cấp.
- Kiểm tra khả dụng và giữ món phải được thực hiện theo cách nhất quán.
- Một listing không được bị giữ bởi hai Checkout cùng lúc.
### **10.4. Xử lý khi hết thời hạn giữ chỗ**

Hết 15 phút, tiến trình nền tra cứu cổng. Nếu chưa rõ, tra cứu lại sau 1, 3, 5 phút; vẫn chưa rõ thì Checkout/đơn NEEDS_REVIEW và món tiếp tục bị chặn. Chỉ giải phóng khi xác minh chưa thanh toán và không có xung đột.

Đây là công việc nội bộ của backend, không phải route để frontend tự mở bán.

Kết quả thành công đến muộn được PAY lưu SUCCESS. Không có Checkout khác thì cập nhật PAID/SOLD; có Checkout khác thì chặn bán/giao, Checkout/đơn liên quan NEEDS_REVIEW. Giải phóng giữ chỗ không xóa các cờ Seller/Admin ẩn hoặc chờ duyệt; paymentReviewHold chỉ xóa sau điều tra có căn cứ.

### **10.5. Logging và bảo mật**

- Response lỗi tuân theo API Contracts & Error Conventions.
- Các thao tác duyệt tin, ẩn/hiện, Checkout, thanh toán, xử lý vụ việc và truy cập dữ liệu nhạy cảm phải có audit event phù hợp.
- Log phải có request ID để hỗ trợ điều tra.
- Không ghi số thẻ, CVV, mật khẩu hoặc bí mật xác thực vào log.
## **11. Route không đưa vào MVP và các quyết định còn mở**

Các chức năng hoàn tiền tự động, chi trả Seller và Admin tự đánh dấu PAID không thuộc MVP. Kết quả đến muộn/mâu thuẫn đã chốt nghiệp vụ; VNPAY Sandbox đã chọn; khóa thử nghiệm và ánh xạ mã kết quả còn cần kiểm chứng:

- Buyer được hủy Checkout trước payment attempt đầu tiên qua route bổ sung ở mục 14; không có nút tự hủy sau khi bắt đầu thanh toán hoặc đã trả tiền.
- MVP không tạo payment attempt thứ hai trên cùng Checkout; Buyer đặt lại bằng Checkout mới sau khi thất bại đã xác minh và món được giải phóng an toàn.
- Hoàn tiền.
- Chi trả tiền cho Seller.
- Admin tự đánh dấu thanh toán thành công.
- SOLD là cập nhật nội bộ khi PAY xác minh thanh toán thành công; không có route cho client tự đánh dấu SOLD.
- Buyer xác nhận đã nhận qua route bổ sung ở mục 14; ORD chuyển đơn sang COMPLETED, không tự hoàn tất trước đó.
Đã chốt: Buyer tự hủy trước payment attempt đầu; Buyer xác nhận Đã nhận trên đơn PAID sau giao hàng. Kết quả muộn/mâu thuẫn theo quy tắc NEEDS_REVIEW và khóa bán/giao; quy trình vụ việc sau khi bắt đầu thanh toán và khả năng thao tác trên cổng cụ thể chờ nhà cung cấp được chọn.

Seller tự đặt vận chuyển ngoài hệ thống và ghi hãng/mã vận đơn cho đơn của mình. Việc Buyer và Seller tự chuyển tiền bên ngoài hệ thống không làm thay đổi trạng thái thanh toán của Rewear Circle.

Các thông số triển khai còn cần xác minh gồm:

- Đã chốt: tin SOLD được xem qua link trực tiếp với watermark “Đã bán”, không có nút mua và không nằm trong feed món còn bán.
- Đã chốt cho MVP: xác minh email thông thường; chưa bắt buộc email trường hoặc duyệt hồ sơ Seller.
- Đã chốt: form gồm tên, danh mục, kích cỡ, tình trạng, thông tin lỗi, giá VND, khu vực gửi hàng, tối thiểu 1 ảnh; tối đa 5 ảnh, 5 MB/ảnh, JPEG/PNG/WebP. Giới hạn form theo BR-LISTING-008.
- Đã chốt mặc định 20 kết quả/trang; limit tối đa và rate limit vẫn thuộc gói quy ước API chưa chốt.
- Xác thực dùng bcrypt và express-session/connect-mongo; thời hạn phiên theo API & Data Conventions.
- Chi tiết triển khai webhook và upload ảnh.
Sau khi thống nhất, cần cập nhật đồng bộ API Routes, API Contracts, State Lifecycles, Business Rules và OpenAPI nếu có.

## **12. Tài liệu liên quan**

Danh mục API này cần được đối chiếu với:

- Product Overview.
- Actors & Roles.
- Business Rules.
- Domain Model.
- State Lifecycles.
- Module Map & Dependencies.
- Đặc tả chức năng các mô-đun.
- Workflow WF-01 đến WF-04.
- Security & Privacy.
- Reliability & Recovery.
- Observability.
- API Contracts & Error Conventions.
Danh mục này mô tả các route dùng giữa frontend, cổng thanh toán và hạ tầng. Các lời gọi nội bộ giữa ACC, DISC, LST, ORD, PAY và MOD có thể là lời gọi hàm hoặc service call, không nhất thiết phải tạo thêm HTTP API.

## **13. Tiêu chí hoàn thành**

Danh mục API sẵn sàng để chốt khi:

- Mỗi route có method, đường dẫn, quyền truy cập và chức năng rõ ràng.
- Các route quan trọng phù hợp với quy tắc nghiệp vụ đã thống nhất.
- Trước khi đóng băng OpenAPI, nhóm chọn cổng sandbox và ánh xạ trạng thái/chữ ký; phê duyệt các thông số trong Deployment, Backup & Logging Plan và API & Data Conventions. Quy tắc nghiệp vụ kết quả đến muộn/mâu thuẫn đã chốt và phải có ca kiểm thử tương ứng.
- Frontend và backend thống nhất cấu trúc request, response và mã lỗi.
- OpenAPI và kiểm thử hợp đồng được cập nhật theo danh mục cuối cùng.
14. ROUTE BỔ SUNG SAU QUYẾT ĐỊNH 24/10/2026

ORD-09 — Buyer hủy Checkout trước thanh toán

Method: POST

Route: /checkouts/{checkoutId}/cancel

Quyền: Buyer sở hữu Checkout

Điều kiện: chưa có payment attempt đầu tiên. Seller không tự hủy đơn Buyer; sau khi bắt đầu thanh toán hoặc đã trả tiền, Buyer/Seller không có nút tự hủy trong MVP. Giải phóng món phải an toàn và không xóa lý do ẩn.

ORD-10 — Buyer xác nhận đã nhận hàng

Method: POST

Route: /orders/{orderId}/receipt-confirmation

Quyền: Buyer của đơn

Điều kiện: đơn đã PAID và Buyer thực sự đã nhận món. ORD chuyển đơn sang COMPLETED; sau đó Buyer có thể gửi khiếu nại sau nhận. MVP không tự hoàn tất khi Buyer chưa xác nhận.

CẬP NHẬT QUYỀN VÀ HIỂN THỊ

Admin chỉ duyệt/từ chối, ẩn/hiện tin, xử lý vụ việc, tra cứu giao dịch có phân quyền và giao vụ Support; không sửa tin thay Seller, không tự ghi PAID hoặc quản lý chi trả. Một tin có tối đa một revision PENDING; Seller được gửi form sửa khi RESERVED nhưng đơn đã tạo không đổi; không sửa tin SOLD. Tin đã bán chỉ mở qua link trực tiếp có watermark. Người đã đăng nhập tìm theo tên/mô tả, sắp xếp mới nhất, mặc định 20 kết quả/trang.

MOD dùng hai bộ lý do đã chốt; Case có OPEN → IN_REVIEW → CLOSED, lưu kết quả; người gửi được thông báo tiếp nhận và kết quả tóm tắt, không xem dữ liệu nội bộ.

Cập nhật 26/10/2026

ACC-06 — POST /auth/verify-email: nhận mã một lần, kiểm tra hash/hạn/số lần dùng, đặt emailVerifiedAt; trả lỗi chung khi mã sai hoặc hết hạn.

ACC-07 — POST /auth/resend-verification: gửi lại mã có hạn và giới hạn tần suất; response không tiết lộ email có tài khoản hay không.

ORD-11 — POST /orders/{orderId}/shipment: Seller của Order PAID nhập carrierName, trackingCode và shippedAt; Seller không được xem/sửa đơn Seller khác. Chưa tích hợp API hãng vận chuyển.

ORD-04 /checkouts: request phải có recipientName, recipientPhone, recipientAddress; hệ thống lưu recipientSnapshot cho từng Order theo Seller. Tổng thanh toán chỉ cộng giá niêm yết đã gồm phí vận chuyển Seller chịu.

MOD-02 /orders/{orderId}/complaints: type=DELIVERY khi PAID, reason thuộc DeliveryComplaintReason, không cần affectedOrderItemIds; type=ITEM sau COMPLETED, reason thuộc OrderComplaintReason, affectedOrderItemIds là mảng không rỗng, mỗi ID thuộc chính Order. Dùng OrderItem snapshot.

PAY-03: cấu hình VNPAY Sandbox IPN trên Express; đối chiếu chữ ký, mã tham chiếu, số tiền và trạng thái. Job dùng QueryDr khi thiếu IPN. Mapping kết quả cụ thể được kiểm chứng khi có thông số sandbox.

VNPAY IPN dùng GET với query parameters và phản hồi JSON {RspCode, Message} sau khi kiểm tra chữ ký, mã giao dịch, số tiền và trạng thái; URL phải có HTTPS. Nguồn: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html
