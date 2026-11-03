# **API Routes — Rewear Circle (MVP)**

Cập nhật 29/10/2026: đồng bộ Checkout/Order, COD/VNPAY và hợp đồng giao nhận, DELIVERY/ITEM, Admin/Support/contact. A–H đã có phần code tương ứng; hồi quy tích hợp còn ở L. Xem [báo cáo giao nhận](../report/backend-fulfillment-operations-master-report.md).

**Danh mục API RoutesNgày cập nhật:** 28/10/2026**Trạng thái:** Danh mục gồm hợp đồng đề xuất và route đã triển khai; không khẳng định mọi route trong MVP đã có trong code.

Danh mục bao gồm hợp đồng route và trạng thái triển khai. Các route giao nhận/khiếu nại/Admin/Support có code; kiểm thử tích hợp, migration dữ liệu cũ và nghiệm thu triển khai vẫn được theo dõi riêng. Merchant VNPAY Sandbox thật đang tạm gác. Xem [báo cáo tổng đơn hàng và VNPAY](../report/backend-orders-vnpay-sandbox-master-report.md) và [báo cáo giao nhận](../report/backend-fulfillment-operations-master-report.md).

## **1. Mục đích và cách đọc**

Tài liệu này liệt kê các API cần có để phục vụ những chức năng của Rewear Circle, bao gồm:

- Tài khoản và hồ sơ người dùng.
- Xem, tìm kiếm và lọc tin đăng.
- Đăng bán, sửa tin và duyệt tin.
- Giỏ hàng, checkout và đơn hàng.
- Thanh toán sandbox.
- Báo cáo, khiếu nại và hỗ trợ.
- Tải ảnh và kiểm tra tình trạng hoạt động của hệ thống.
Đây là hợp đồng tổng thể. Trạng thái triển khai theo từng phạm vi được ghi trong [báo cáo backend tuần 2](../report/backend-week2-master-report.md).

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
- Tìm kiếm/lọc cần tài khoản; feed không tham số tìm kiếm vẫn công khai.
- Phân trang dùng page/limit, mặc định 20, tối đa 100; sắp xếp mới nhất trước và chỉ lọc revision đang được duyệt.
### **DISC-02 — Xem chi tiết tin**

- **Method:** GET
- **Route:** /listings/{listingId}
- **Quyền:** Công khai đối với tin được phép xem
- **Phân loại:** Cốt lõi
Trả về thông tin chi tiết của một món đồ và trạng thái mua hiện tại.

Tin đang chờ duyệt, bị từ chối hoặc bị ẩn không được hiển thị như tin công khai.

Tin RESERVED xem được nhưng không mua thêm; tin SOLD xem được qua liên kết trực tiếp với watermark “Đã bán” và không có nút mua.

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

### **NOT-01 — Danh sách thông báo của tôi**

- **Method:** GET
- **Route:** /me/notifications?page=&limit=
- **Quyền:** Tài khoản
- **Phân loại:** Bổ trợ
Trả về thông báo kiểm duyệt dành riêng cho người nhận hiện tại, lý do liên quan, trạng thái đã đọc, thời điểm tạo và tổng số thông báo chưa đọc. Mặc định 20 mục/trang, tối đa 100.

### **NOT-02 — Đánh dấu thông báo đã đọc**

- **Method:** PATCH
- **Route:** /me/notifications/{notificationId}/read
- **Quyền:** Người nhận thông báo
- **Phân loại:** Bổ trợ
Chỉ cập nhật thông báo của người dùng hiện tại. Gọi lại với thông báo đã đọc trả trạng thái hiện tại; ID không thuộc người gọi hoặc không tồn tại trả 404.

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
Từ chối bắt buộc có lý do. Quyết định và thông báo nội bộ cho Seller được lưu cùng transaction; đây chưa phải gửi email.

### **ADM-04 — Admin ẩn hoặc gỡ ẩn tin**

- **Method:** POST
- **Route:** /admin/listings/{listingId}/visibility
- **Quyền:** Admin
- **Phân loại:** Cốt lõi
Admin thay đổi trạng thái hiển thị theo quyền kiểm duyệt.

Request gồm `action` (`HIDE` hoặc `SHOW`) và `reason` bắt buộc. `HIDE` có thể nhận `requireCorrection: true` để yêu cầu Seller sửa và gửi lại nếu không có revision đang chờ duyệt và món chưa bán; khi đó tin được đặt `reviewHold` và lý do sửa được lưu. Quyết định, audit và thông báo nội bộ cho Seller được ghi cùng transaction.

Thao tác này không được:

- Mở bán món đang RESERVED hoặc SOLD.
- Xóa trạng thái Seller tự ẩn.
- Bỏ qua yêu cầu duyệt phiên bản tin.
- Làm hiện tin chưa có phiên bản được duyệt, đang chờ duyệt/yêu cầu sửa, đang bị khóa điều tra hoặc không ở trạng thái AVAILABLE.
## **6. ORD — Giỏ hàng, checkout và đơn hàng**

Hợp đồng chốt Bước A ngày 28/10/2026 và được triển khai ở D–J: xem [báo cáo tổng đơn hàng và VNPAY Sandbox](../report/backend-orders-vnpay-sandbox-master-report.md) để biết request/response, quyền, idempotency và trạng thái. POST /checkouts là điểm tạo Checkout/Order duy nhất; route confirm cũ trả 410; `/me/sales` giữ alias của danh sách đơn bán.

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

### **ORD-11 — Ghi nhận thông tin vận chuyển**

- **Method:** PUT
- **Route:** /orders/{orderId}/shipment
- **Quyền:** Seller sở hữu Order
- **Phân loại:** Cốt lõi
Ghi nhận lần đầu thông tin vận chuyển cho Order đủ điều kiện giao.

Request gồm:

- carrierName: tên đơn vị vận chuyển.
- trackingCode: mã vận đơn.

Response có shippedAt do server ghi khi xác nhận lần đầu; không nhận shippedAt qua request.
Quy tắc:

- VNPAY Order phải PAID/PAID; COD CONFIRMED/UNPAID được ghi vận đơn lần đầu. Không hold, không active Order Case và quyền SOLD đúng Checkout; xem ma trận hợp đồng giao nhận.
- Seller chỉ được thao tác trên Order thuộc mình.
- Seller chỉ ghi lần đầu carrierName/trackingCode; shippedAt do server ghi.
- Gửi lại cùng thông tin trả lại kết quả hiện tại; thông tin khác sau khi đã gửi trả 409.
- Mỗi lần thay đổi phải được ghi audit log.
- Không tích hợp API hãng vận chuyển trong MVP; backend không tuyên bố rằng trạng thái giao hàng đã được hãng vận chuyển xác minh.
### **ORD-12 — Buyer xác nhận đã nhận hàng**

- **Method:** POST
- **Route:** /orders/{orderId}/receipt-confirmation
- **Quyền:** Buyer của Order
- **Phân loại:** Cốt lõi
Buyer xác nhận đã thực sự nhận được sản phẩm sau khi Seller ghi nhận đã gửi. VNPAY Order phải PAID; COD Order có thể CONFIRMED. Backend chuyển Order sang COMPLETED và giữ nguyên paymentStatus COD, vì nhận hàng không tự xác nhận đã thu tiền.

Request body rỗng, Idempotency-Key bắt buộc. Active Order Case chặn receipt; Admin cần đóng vụ trước nhưng đóng không đòi Order COMPLETED. Receipt lặp giữ receivedAt và không lặp tác dụng phụ; không tự thu COD, hoàn tiền hoặc đóng Case. VNPAY phải PAID/PAID; COD CONFIRMED có paymentStatus UNPAID/COLLECTED hợp lệ, đã gửi, không hold và quyền món đúng Checkout.

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

Chỉ tài khoản đã xác minh email, không phải chủ tin, được gửi. Lý do dùng tập đã chốt trong hợp đồng; `OTHER` bắt buộc mô tả. Bằng chứng là 0–5 ảnh `CASE_EVIDENCE` do chính người báo tải lên. Mỗi tài khoản tối đa 5 báo cáo/ngày.

Request gồm:

- listingId.
- Lý do báo cáo.
- Mô tả bổ sung nếu có.
- Bằng chứng nếu có.
Backend tự xác định người báo cáo từ phiên đăng nhập, không tin reporterId do client tự gửi.
Backend lưu từng Report gốc riêng. Report mới gắn vào Case REPORT cùng Listing đang OPEN/IN_REVIEW; nếu không có thì tạo Case OPEN mới. Tạo Report, cập nhật Case, audit và thông báo tiếp nhận phải nguyên tử.

### **MOD-02 — Tạo khiếu nại đơn hàng**

- **Method:** POST
- **Route:** /orders/{orderId}/complaints
- **Quyền:** Buyer của Order, đã xác minh email; Idempotency-Key bắt buộc.
- **Trạng thái:** DELIVERY/ITEM và API Buyer theo dõi đã triển khai ở Bước E; regression còn ở Bước L.

Request allowlist: type, reasonCode, details (10–2000 ký tự), evidenceMediaIds (0–5 ảnh CASE_EVIDENCE của người gửi), affectedOrderItemIds chỉ dành ITEM. DELIVERY cấm gửi affectedOrderItemIds kể cả mảng rỗng. ITEM bắt buộc 1–20 OrderItem ID không trùng thuộc chính Order, không nhận listingId thay thế.

DELIVERY nhận VNPAY PAID/PAID hoặc COD CONFIRMED/UNPAID; COD CONFIRMED/COLLECTED chỉ sau gửi và chưa nhận. Ngoại lệ COD NEEDS_REVIEW chỉ khi có yêu cầu hoàn OPEN/REJECTED đúng Order, UNPAID/chưa thu/chưa nhận và quyền món không hold. ITEM chỉ sau COMPLETED với paymentStatus hợp lệ. Chi tiết hold, reason, quota và ngoại lệ theo [hợp đồng giao nhận](../report/backend-fulfillment-operations-master-report.md), mục 4–7.

Mỗi target chỉ có một Case OPEN/IN_REVIEW. Cùng type được bổ sung tối đa 3 bản gốc/active Case; type khác trả 409. Tối đa 5 bản mới/24 giờ/Buyer; tạo lại cùng type/Order chờ 24 giờ sau đóng. Không tự reopen Case hoặc đổi Order/Payment/Listing. Lần đầu 201, replay 200 cùng ID và không lặp tác dụng phụ.

### **MOD-03 — Danh sách vụ việc Admin**

- **Method:** GET
- **Route:** /admin/cases
- **Quyền:** Admin

Hợp đồng mở rộng REPORT/DELIVERY/ITEM, lọc type/status/assignedSupportId hoặc unassigned, page mặc định 1 và limit mặc định 20/tối đa 100. Không kết hợp assignedSupportId với unassigned=true. List không trả địa chỉ, bằng chứng hoặc chi tiết tự do; có version và số lượng bản gốc theo Case. Đã triển khai ở Bước F.

### **MOD-04 — Chi tiết vụ việc Admin**

- **Method:** GET
- **Route:** /admin/cases/{caseId}
- **Quyền:** Admin

Trả bản gốc, snapshot đúng Order/Listing, mốc thời gian, assignment/decision history và audit đã lọc. InternalNote chỉ Admin xem; địa chỉ nhận không nằm trong DTO mặc định. Đọc chi tiết có CASE_DETAIL_READ; không nhúng raw User/PaymentEvent.

### **MOD-05 — Quyết định xử lý**

- **Method:** POST
- **Route:** /admin/cases/{caseId}/decisions
- **Quyền:** Admin

OPEN → IN_REVIEW → CLOSED; đóng bắt buộc outcomeCode, outcomeSummary (DELIVERY/ITEM 10–1000 ký tự, REPORT giữ 1–1000), internalNote tùy chọn (≤2000); thời điểm do server ghi. DELIVERY/ITEM yêu cầu Idempotency-Key và expectedVersion; outcome NO_ACTION/RESOLVED/UNRESOLVED/OTHER, cấm listingAction. REPORT giữ payload cũ tương thích và bộ outcome kiểm duyệt; key/version là tùy chọn.

Đóng gửi một thông báo tóm tắt/người gửi/Case, không lộ internalNote; không tự chuyển Order/paymentStatus, nhận hàng, thu tiền, hoàn tiền hoặc giải phóng món. Hành động ẩn/hiện Listing chỉ áp dụng REPORT qua service tin đăng hiện có.

### **MOD-06 — Phân công vụ việc**

- **Method:** PATCH
- **Route:** /admin/cases/{caseId}/assignment
- **Quyền:** Admin; Case OPEN/IN_REVIEW

Body {assignedSupportId: ID hoặc null, expectedVersion}; Idempotency-Key bắt buộc. Người nhận phải có role SUPPORT hiện tại; ghi actor, before/after và thời điểm. Gán lại cùng người là no-op khi version khớp. CLOSED hoặc stale version trả 409. Phân công không tự chuyển IN_REVIEW. Đã triển khai ở Bước F.

### **MOD-07 — Danh sách vụ được giao**

- **Method:** GET
- **Route:** /support/cases
- **Quyền:** Support hiện tại

Chỉ OPEN/IN_REVIEW với assignedSupportId lấy từ session, lọc type/status và page/limit như Admin; không nhận Support ID tùy ý hoặc trả tất cả Case. Đã triển khai ở Bước G.

### **MOD-08 — Chi tiết vụ được giao**

- **Method:** GET
- **Route:** /support/cases/{caseId}
- **Quyền:** Support được giao, Case OPEN/IN_REVIEW

DTO tối thiểu gồm bản gốc, evidence và snapshot đúng vụ, dữ liệu vận chuyển và tham chiếu/trạng thái thanh toán của đúng Order. Không internalNote, địa chỉ mặc định hoặc đơn Seller khác. Đổi/gỡ assignment, mất role hoặc đóng vụ thu hồi quyền ở lần đọc kế tiếp; ngoài quyền trả 404. Đọc có audit trong transaction và điểm đồng bộ quyền Case/User; ảnh riêng tư có kiểm tra quyền hiện tại. Đã triển khai ở Bước G.

### **MOD-09 — Đọc thông tin liên hệ theo vụ**

- **Method:** POST
- **Route:** /support/cases/{caseId}/contact-access
- **Quyền:** Support được giao, Case active target ORDER

Body {reason} dài 10–500 ký tự, từ chối email/số điện thoại hiển nhiên. Mỗi lần kiểm tra lại quyền và ghi audit trước response; chỉ trả shippingAddress {fullName,phone,address} của Order gắn vụ. Không cấp token/grant dài hạn; không cache hoặc replay địa chỉ từ response cũ. Audit lỗi trả 503 và không có PII. REPORT không áp dụng. Admin dùng POST /admin/cases/{caseId}/contact-access với cùng chính sách active Order Case, reason và audit. Đã triển khai ở Bước G.

### **MOD-10 — Buyer theo dõi khiếu nại của mình**

- **Method:** GET
- **Route:** /orders/{orderId}/complaints và /orders/{orderId}/complaints/{complaintId}
- **Quyền:** Buyer sở hữu Order và bản gốc

List có page/limit/type/status; detail chỉ trả bản gửi của mình, status Case và outcome công khai sau đóng. Không internalNote/assignment/dữ liệu điều tra của người khác. Retention đánh dấu nội dung đã ẩn danh thì detail trả 410 CONTENT_REDACTED; danh sách vẫn trả receipt tối thiểu. Hai route Buyer đã triển khai ở Bước E.

Hợp đồng đầy đủ request/DTO/lỗi/idempotency/audit và ma trận cạnh tranh: [báo cáo giao nhận, khiếu nại và vận hành](../report/backend-fulfillment-operations-master-report.md), mục 3–12 và 19–20. MOD-04 đọc chi tiết Admin REPORT và Order Case triển khai ở C; MOD-02/MOD-10 ở E; MOD-03, assignment và quyết định ở F; MOD-07–09 Support/contact ở G; quyền ảnh theo Case và DTO notification ở H. Regression tổng còn ở L.

## **9. Media và vận hành hệ thống**

### **INF-01 — Yêu cầu tải ảnh**

- **Method:** POST
- **Route:** /media/upload-requests
- **Quyền:** Tài khoản
- **Phân loại:** Phụ thuộc
Yêu cầu quyền tải ảnh phục vụ:

- LISTING_IMAGE: ảnh tin đăng.
- CASE_EVIDENCE: bằng chứng cho báo cáo hoặc khiếu nại.
Upload nhận tối đa 5 ảnh JPEG/PNG/WebP, mỗi ảnh tối đa 5 MB; backend kiểm tra nội dung tệp. Media được lưu private trên volume backend và truy cập qua ID ổn định; ID không phải quyền truy cập hay URL ký.

Request multipart có `purpose` là LISTING (mặc định) hoặc CASE_EVIDENCE; CASE_EVIDENCE chỉ tài khoản USER tải lên. Ảnh bằng chứng chỉ người tải lên, Admin hoặc Support được giao Case mới đọc được. Support chỉ xem ảnh snapshot thuộc món của vụ đang xử lý; ảnh tin REPORT chỉ thuộc phiên bản liên quan. Buyer/Seller của Order được xem ảnh trong snapshot Order của mình. Media riêng tư được audit trước khi stream và trả `Cache-Control: private, no-store`; mỗi request kiểm tra quyền lại.

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

Ghi chú lịch sử: mục ORD-10 cũ về xác nhận nhận hàng được hợp nhất vào ORD-12 ở phần 6; không có endpoint nhận hàng thứ hai. Điều kiện cuối theo hợp đồng giao nhận 29/10/2026.

CẬP NHẬT QUYỀN VÀ HIỂN THỊ

Admin chỉ duyệt/từ chối, ẩn/hiện tin, xử lý vụ việc, tra cứu giao dịch có phân quyền và giao vụ Support; không sửa tin thay Seller, không tự ghi PAID hoặc quản lý chi trả. Một tin có tối đa một revision PENDING; Seller được gửi form sửa khi RESERVED nhưng đơn đã tạo không đổi; không sửa tin SOLD. Tin đã bán chỉ mở qua link trực tiếp có watermark. Người đã đăng nhập tìm theo tên/mô tả, sắp xếp mới nhất, mặc định 20 kết quả/trang.

MOD dùng hai bộ lý do đã chốt; Case có OPEN → IN_REVIEW → CLOSED, lưu kết quả; người gửi được thông báo tiếp nhận và kết quả tóm tắt, không xem dữ liệu nội bộ.

Cập nhật 26/10/2026

ACC-06 — POST /auth/verify-email: nhận mã một lần, kiểm tra hash/hạn/số lần dùng, đặt emailVerifiedAt; trả lỗi chung khi mã sai hoặc hết hạn.

ACC-07 — POST /auth/resend-verification: gửi lại mã có hạn và giới hạn tần suất; response không tiết lộ email có tài khoản hay không.

ORD-11 — PUT /orders/{orderId}/shipment: Seller đúng Order gửi carrierName/trackingCode, server ghi shippedAt. VNPAY PAID/PAID hoặc COD hợp lệ, không hold/active Case; xem mục ORD-11 chính thức và ma trận giao nhận. Không nhận shippedAt từ client.

ORD-04 /checkouts: request phải có recipientName, recipientPhone, recipientAddress; hệ thống lưu recipientSnapshot cho từng Order theo Seller. Tổng thanh toán chỉ cộng giá niêm yết đã gồm phí vận chuyển Seller chịu.

MOD-02 /orders/{orderId}/complaints: DELIVERY theo ma trận VNPAY/COD ở mục MOD-02 chính thức, cấm affectedOrderItemIds; ITEM sau COMPLETED chọn đúng OrderItem snapshot. Bộ reason, ngoại lệ COD return, idempotency và quota theo hợp đồng giao nhận 29/10/2026.

PAY-03: cấu hình VNPAY Sandbox IPN trên Express; đối chiếu chữ ký, mã tham chiếu, số tiền và trạng thái. Job dùng QueryDr khi thiếu IPN. Mapping kết quả cụ thể được kiểm chứng khi có thông số sandbox.

VNPAY IPN dùng GET với query parameters và phản hồi JSON {RspCode, Message} sau khi kiểm tra chữ ký, mã giao dịch, số tiền và trạng thái; URL phải có HTTPS. Nguồn: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html

## Bổ sung COD — Hợp đồng 28/10/2026

Request POST /checkouts bắt buộc paymentMethod=VNPAY|COD; COD không có payment attempt/QueryDr và không tự hết hạn. Hợp đồng A-09 tại [báo cáo đơn hàng](../report/backend-orders-vnpay-sandbox-master-report.md) thay điều kiện PAID trước giao/SOLD sau xác minh chỉ cho nhánh COD. D–J đã có code; K đã chạy kiểm thử tích hợp/race cục bộ.

| Method/path | Quyền | Chức năng |
| --- | --- | --- |
| POST /orders/{orderId}/cancel | Buyer của Order COD | Hủy trước gửi/chưa thu/không hold, kiểm tra quyền SOLD trước mở bán |
| POST /orders/{orderId}/cod-collection | Seller của Order COD | Ghi nhận thu đủ total sau khi gửi, có Idempotency-Key, không tự xác nhận nhận hàng |
| POST /orders/{orderId}/cod-return-requests | Seller của Order COD | Yêu cầu xác nhận đã nhận lại hàng, reason bắt buộc; giữ SOLD và chuyển NEEDS_REVIEW |
| POST /admin/orders/{orderId}/cod-return-decisions | Admin | ACCEPT_RETURN/REJECT_RETURN có lý do; chỉ giải phóng khi hàng đủ/đã về/chưa thu và không xung đột |
| GET /admin/cod-collections | Admin | Lịch sử xác nhận thu COD đã lọc, có audit đọc |
| GET /admin/cod-return-requests | Admin | Danh sách yêu cầu hoàn COD và thông tin Order đã lọc, có audit đọc |

GET /me/checkouts, GET /checkouts/{checkoutId}/payment, GET /me/orders?perspective=buying|selling, POST /orders/{orderId}/receipt-confirmation, PUT /orders/{orderId}/shipment và API COD đã có code theo A-09. `POST /checkouts/{checkoutId}/payment-attempts` tạo attempt VNPAY và trả URL đã ký; COD trả 409. IPN tại `/integrations/payments/vnpay/ipn` dùng settlement chung với QueryDr. Admin tra cứu tại `GET /admin/payments` và `GET /admin/payments/{attemptId}` chỉ đọc. Worker chạy bằng `npm run worker:vnpay`. DELIVERY/ITEM, Admin Case và Support đã có code theo các bước E–H; regression còn ở L. Client không tự cập nhật trạng thái hoặc thời điểm thu.

## Chốt hợp đồng giao nhận — 29/10/2026

Bước A đã chốt hợp đồng; B–H đã có code tương ứng. Regression tích hợp/race còn ở L; I–M còn mở. Nguồn chi tiết: [hợp đồng giao nhận, khiếu nại và vận hành](../report/backend-fulfillment-operations-master-report.md).
