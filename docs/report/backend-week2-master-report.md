# Báo cáo tổng — Hợp đồng backend tuần 2

**Ngày cập nhật:** 28/10/2026  
**Trạng thái:** Các bước A–G trong phạm vi backend tin đăng và kiểm duyệt đã hoàn tất; unit và integration test đều đạt.
**Phạm vi cập nhật:** Hợp đồng và ma trận trạng thái; model, chỉ mục, quyền, audit, Seller revision/visibility, Admin duyệt/ẩn/hiện, report/case loại `REPORT`, feed/chi tiết/checkout/media và kiểm thử/tài liệu bàn giao. Thanh toán VNPAY, khiếu nại giao nhận/sản phẩm, phân công Support/quyền truy cập liên hệ và job nền chưa thuộc phần đã hoàn tất.

## 1. Mục tiêu của báo cáo

Đây là tài liệu tổng để lưu quyết định backend tuần 2 và cập nhật theo tiến độ. Nếu phát hiện mâu thuẫn giữa code và nghiệp vụ, cập nhật quyết định tại đây trước khi sửa hành vi liên quan; sau đó đồng bộ tài liệu miền/API cần thiết.

Bước A chốt:

- Mô hình trạng thái Listing và các điều kiện hiển thị/mua độc lập.
- Hợp đồng route Seller, Admin và báo cáo tin.
- Quy tắc chuyển trạng thái duyệt, ẩn, khôi phục và xử lý vụ `REPORT`.
- Quy ước response, lỗi, quyền, ảnh bằng chứng và tương tác với Checkout đang giữ món.

## 2. Căn cứ và code hiện có

Đã đối chiếu với `Business Rules.md`, `State Lifecycles.md`, `Domain Model.md`, `API Routes — Rewear Circle (MVP).md`, `API Contracts & Error Conventions.md`, `API & Data Conventions — Rewear Circle (MVP).md`, `Security & Privacy.md`, `WF-02_Dang-ban-duyet-khoi-phuc.drawio` và `WF-04_Bao-cao-kiem-duyet-ho-tro.drawio`.

Code sau đợt làm sạch có model Listing chứa các revision, `approvedVersionId`, `reviewHold`, `sellerHidden`, `adminHidden`, `saleStatus`; kiểm tra form trong `domain/listingRules.js`; quy tắc phiên bản/công khai trong `domain/commerceRules.js`; tra cứu tin do Seller sở hữu trong `routes/listings.js`; phản hồi chung trong `http/responses.js`. Feed, chi tiết, giữ món, checkout xác nhận và ảnh dùng các điều kiện công khai tương thích; checkout đang tồn tại tiếp tục đối chiếu reservation và snapshot.

Bước C cho phép gửi revision khi `RESERVED`, thêm giới hạn gửi lại và Seller visibility. Bước D bổ sung middleware Admin cho route kiểm duyệt. `confirmCheckout.js` kiểm tra reservation thuộc Checkout thay vì yêu cầu tin tiếp tục công khai/giữ nguyên revision hiện hành, để thay đổi tin không cắt ngang snapshot đã đặt.

### 2.1. Kết quả Bước B — nền dữ liệu và quyền

- `Listing` revision lưu `reviewedBy`, `reviewedAt`, `rejectionReason`; schema giới hạn tối đa một revision `PENDING` trên mỗi Listing. Index phục vụ danh sách chủ tin và hàng chờ revision được thêm.
- `Report` lưu reporter, Listing, reason code, mô tả, ảnh bằng chứng và Case; index hỗ trợ đọc theo Case, Listing và reporter. `OTHER` yêu cầu mô tả; tối đa 5 ID ảnh bằng chứng duy nhất.
- `Case` dùng chung cho `REPORT`, `DELIVERY`, `ITEM`; lưu target, trạng thái, Support được giao, kết quả và lịch sử quyết định. Một `activeTargetKey` được sinh cho Case đang mở/đang xem xét và được bỏ khi đóng; unique sparse index ngăn tạo hai Case mở cho cùng target.
- `AuditEvent` lưu actor, action, loại/ID target, request ID, lý do và trạng thái trước/sau; không có trường tự do để vô tình lưu token hoặc dữ liệu thanh toán. Index hỗ trợ truy vấn theo target và actor.
- `Media.purpose` phân biệt `LISTING` và `CASE_EVIDENCE`. Middleware `requireRole`, `requireAdmin`, `requireSupport` dùng role đã nạp từ session ở server; client không thể tự gửi role.
- `/media/:id` không còn cấp quyền đọc mọi media cho mọi Admin. Admin xem ảnh Listing chỉ khi ảnh liên kết với một revision; ảnh bằng chứng cần Case/report liên kết; Support chỉ xem bằng chứng thuộc Case được giao. Lượt đọc evidence của Admin/Support tạo audit event trước khi trả file.
- Backend khởi tạo index của các model mới khi server start và khi chạy seed.

**Hoàn thiện ở bước E:** route tải ảnh nhận `purpose=CASE_EVIDENCE`; quyền xem evidence được áp dụng khi ảnh liên kết với Report/Case. Phân công Support chưa nằm trong phạm vi E.

### 2.2. Kết quả Bước C — Seller revision và visibility

- `POST /listings/{listingId}/revisions` cho phép sửa khi `RESERVED`; vẫn từ chối `SOLD` và Listing đang có revision `PENDING`. Revision mới bật `reviewHold`, tắt `correctionRequested` và không thay đổi snapshot Checkout/Order.
- `resubmissionCount` tăng khi revision trước bị từ chối hoặc Admin đã đánh dấu `correctionRequested`; lần gửi đầu và chỉnh sửa chủ động sau revision đã duyệt không tiêu hao lượt. Giới hạn 5 được kiểm tra trước khi lưu; phản hồi gửi revision và lịch sử trả lượt đã dùng/còn lại.
- `POST /listings/{listingId}/visibility` thực thi `HIDE/SHOW` cho chủ tin. `SHOW` chỉ gỡ `sellerHidden` nếu tin đã duyệt, `AVAILABLE`, không có Admin hide, correction/review hold hoặc payment review hold. Thay đổi được lưu cùng `AuditEvent` trong một MongoDB transaction; request lặp giữ kết quả idempotent. Ảnh `CASE_EVIDENCE` không được dùng làm ảnh sản phẩm.
- `listingBlockReasons()` cung cấp lý do chặn cho response quản lý tin. Quy tắc chung của feed/giỏ/checkout/ảnh cũng loại tin `correctionRequested` hoặc `paymentReviewHold`; filter chấp nhận dữ liệu cũ chưa có hai trường mới.
- `confirmCheckout.js` xác nhận món dựa trên `listingId`, `sellerId`, `saleStatus=RESERVED` và `reservedCheckoutId` đúng Checkout; không phụ thuộc `approvedVersionId`, cờ hiển thị hoặc revision hiện hành. Order tiếp tục dùng snapshot lưu trong Checkout.

**Ranh giới:** luồng xác nhận Checkout hiện tại chưa phải VNPAY; tích hợp và xác minh thanh toán thuộc cụm PAY.

### 2.3. Kết quả Bước D — Admin duyệt và visibility

- `GET /admin/listing-versions` chỉ đưa revision `PENDING` vào hàng chờ, hỗ trợ `page/limit` (mặc định 20, tối đa 100) và trả thông tin Seller tối thiểu. `GET /admin/listing-versions/{versionId}` trả đúng form/version, trạng thái Listing, lịch sử revision và tối đa 50 sự kiện audit liên quan.
- `POST /admin/listing-versions/{versionId}/decision` chỉ xử lý revision còn `PENDING`. `REJECT` bắt buộc lý do; quyết định ghi reviewer/thời gian/lý do vào revision, cập nhật `approvedVersionId`/`reviewHold` theo kết quả và ghi `AuditEvent` cùng transaction. Revision đã có quyết định trả `409`.
- `POST /admin/listings/{listingId}/visibility` yêu cầu Admin và lý do. `HIDE` chỉ đặt `adminHidden`; có thể thêm `requireCorrection: true` để đặt `correctionRequested`, `correctionReason` và `reviewHold` khi không có revision `PENDING` và món chưa `SOLD`. `SHOW` chỉ gỡ `adminHidden` khi Listing có phiên bản duyệt, đang `AVAILABLE`, không có review/correction/payment hold; không xóa `sellerHidden` và không mở bán món `RESERVED`/`SOLD`.
- Model `Notification` lưu thông báo kiểm duyệt nội bộ cho Seller. Quyết định duyệt/từ chối và thao tác Admin ẩn/hiện ghi thông báo cùng transaction với Listing và audit. `GET /me/notifications` và `PATCH /me/notifications/{notificationId}/read` chỉ đọc/cập nhật thông báo của người nhận. Đây là thông báo trong ứng dụng; chưa tích hợp gửi email.
- Trường `adminHiddenReason` lưu lý do hiện hành của cờ Admin hide; lịch sử thay đổi nằm trong `AuditEvent`. Seller xem được trạng thái/lý do trên tin của chính mình.

**Giới hạn tại bước D:** report/case và gắn quyết định xử lý Case vào Admin visibility được hoàn tất ở bước E. Thông báo kiểm duyệt hiện là thông báo trong ứng dụng, chưa gửi email.

### 2.4. Kết quả Bước E — Report và Case loại REPORT

- `POST /reports/listings` yêu cầu đăng nhập và email xác minh, chặn chủ tin tự báo cáo, giới hạn 5 báo cáo/ngày/tài khoản và kiểm tra reason/details/evidence theo allowlist. Evidence phải là `CASE_EVIDENCE` do chính người báo tải lên; `OTHER` bắt buộc có mô tả.
- Mỗi lần báo cáo tạo một `Report` riêng. Các report cùng Listing được gắn vào Case `REPORT` đang `OPEN`/`IN_REVIEW`; Case đã đóng không mở lại. Unique index và retry xử lý xung đột khi tạo Case đồng thời.
- `GET /admin/cases` hỗ trợ lọc trạng thái và phân trang; `GET /admin/cases/{caseId}` trả nội dung report, thông tin tin đăng và lịch sử audit cho Admin.
- `POST /admin/cases/{caseId}/decisions` chỉ cho chuyển `OPEN → IN_REVIEW → CLOSED`. Đóng Case bắt buộc outcome; hành động ẩn/yêu cầu sửa Listing dùng chung quy tắc Admin visibility trong cùng transaction.
- Tạo report ghi audit và thông báo tiếp nhận trong transaction. Đóng Case ghi audit và gửi thông báo kết quả cho người báo; `internalNote` chỉ được lưu trong lịch sử Admin, không trả cho người báo.
- Ảnh `CASE_EVIDENCE` được phục vụ riêng tư; Admin xem evidence thuộc Case, Support chỉ khi được giao Case. Mọi lần đọc evidence của Admin/Support được audit.

**Giới hạn của bước E:** chỉ triển khai luồng report tin (`REPORT`); khiếu nại `DELIVERY`/`ITEM`, giao Case cho Support và quyền truy cập thông tin liên hệ chưa được triển khai.

### 2.5. Kết quả Bước F — Đồng bộ feed, chi tiết, checkout và ảnh

- `GET /listings` trả feed phân trang ổn định, chỉ gồm Listing đã duyệt, đang hiển thị, `AVAILABLE` và qua các hold; tìm kiếm/lọc chỉ chạy trên revision đang được duyệt và yêu cầu đăng nhập.
- Tìm kiếm hỗ trợ từ khóa literal trên tiêu đề/mô tả cùng category, size, condition và khoảng giá; kiểm tra tham số và giới hạn trang ở backend.
- `GET /listings/{listingId}` không làm lộ tin chờ duyệt/ẩn. Tin `RESERVED` xem được nhưng không mua thêm; tin `SOLD` xem qua link trực tiếp với nhãn đã bán và `canBuy=false`.
- Quyền media evidence giữ riêng tư theo Case. Buyer/Seller liên quan có thể xem ảnh Listing nằm trong Checkout/Order snapshot; các quy tắc commerce chung tiếp tục chặn ảnh không thuộc quyền.
- Checkout đang giữ món được xác nhận theo reservation của đúng Checkout và snapshot đã ghi; đổi revision/visibility sau khi giữ không ghi đè snapshot giao dịch.

### 2.6. Kết quả Bước G — kiểm thử, tài liệu và bàn giao

- `npm test` chạy lần lượt domain tests, commerce-flow integration và moderation-flow integration.
- Kết quả với MongoDB replica set tạm: domain **8/8**, commerce-flow **1/1**, moderation-flow **1/1**; không skip hoặc fail. Integration bao phủ feed/checkout snapshot và chu trình report → Case → quyết định → quyền thông báo.
- Các file JavaScript thay đổi đã qua `node --check`; `git diff --check` không phát hiện whitespace error.
- Tài liệu API Routes, API Contracts và báo cáo tổng này được đồng bộ với route, quyền, trường request/response, trạng thái và các giới hạn triển khai.

**Giới hạn xác nhận:** kiểm thử chứng minh các đường chạy đã nêu trong bộ test; chưa kiểm thử tải, gửi email, VNPAY thật/sandbox, DELIVERY/ITEM hoặc phân công Support.

**Bổ sung phạm vi 28/10/2026:** Quy tắc SOLD sau thanh toán xác minh trong báo cáo này mô tả VNPAY. COD đã được chốt bổ sung tại [A-09 báo cáo đơn hàng](backend-orders-vnpay-sandbox-master-report.md): chốt SOLD nhưng UNPAID khi đặt, thu theo Order, hủy/hoàn có điều kiện. Các luồng COD mới chưa được nghiệm thu bởi kết quả test kiểm duyệt nêu trên.

## 3. Mô hình trạng thái chuẩn

Các trục dưới đây độc lập; không gộp tất cả vào một trạng thái `status`.

| Trục | Giá trị / trường | Ý nghĩa |
| --- | --- | --- |
| Duyệt từng revision | `PENDING`, `APPROVED`, `REJECTED` | Quyết định áp dụng cho đúng revision được gửi. |
| Revision đang được chọn | `approvedVersionId` | ID revision đã duyệt hiện hành; chỉ đổi khi Admin duyệt revision khác. |
| Khóa kiểm duyệt | `reviewHold` | Chặn công khai/mua trong lúc cần Seller sửa và gửi lại hoặc khi revision bị từ chối. Tạo Listing mới đặt `true`; chỉ gỡ sau khi revision hợp lệ được duyệt. |
| Yêu cầu Seller sửa | `correctionRequested` | Admin bật khi yêu cầu sửa; Seller gửi revision mới thì cờ được gỡ và `reviewHold` tiếp tục chặn đến khi Admin duyệt. |
| Seller chủ động ẩn | `sellerHidden` | Seller sở hữu tin kiểm soát; Admin không tự xóa cờ này khi thao tác `SHOW`. |
| Admin ẩn | `adminHidden` | Hạn chế kiểm duyệt; chỉ thao tác Admin có quyền mới được gỡ. Lý do và lịch sử phải lưu riêng, không chỉ giữ boolean hiện tại. |
| Khóa thanh toán/điều tra | `paymentReviewHold` hoặc trường tương đương | Để cụm thanh toán bổ sung; độc lập với cờ kiểm duyệt. Không được gỡ qua Seller/Admin `SHOW`. |
| Tình trạng bán | `AVAILABLE`, `RESERVED`, `SOLD` | Trạng thái món. Chỉ PAY đã xác minh mới được làm món thành `SOLD`; `SHOW` không thay đổi trạng thái này. |

`reviewHold` là cờ chặn, không thay thế trạng thái từng revision. Revision `REJECTED` vẫn giữ lý do từ chối; Listing tiếp tục bị chặn cho đến khi có revision sửa được duyệt. Một Listing chỉ có tối đa một revision `PENDING`.

### 3.1. Điều kiện hiển thị và mua

- **Có thể mua ở Checkout mới:** có `approvedVersionId` trỏ tới revision `APPROVED`; `reviewHold=false`; `sellerHidden=false`; `adminHidden=false`; không có `paymentReviewHold`; `saleStatus=AVAILABLE`; Buyer không phải chủ tin. Checkout vẫn phải xác nhận lại các điều kiện trong thao tác giữ món có điều kiện.
- **Có thể xuất hiện trong feed món còn bán:** thỏa các điều kiện hiển thị và mua, ngoại trừ kiểm tra Buyer/chủ tin vốn chỉ áp dụng khi mua. `RESERVED` và `SOLD` không nằm trong feed món còn bán.
- **Trang chi tiết công khai:** tin `AVAILABLE`/`RESERVED` đã duyệt và không có cờ ẩn/chờ duyệt được xem; tin `SOLD` đã duyệt có thể xem bằng liên kết trực tiếp, có nhãn “Đã bán” và không có hành động mua. `PENDING`, `REJECTED`, `reviewHold`, `sellerHidden` hoặc `adminHidden` không được trả qua API công khai.
- **Ảnh tin:** chỉ ảnh thuộc revision đang được phép xem công khai mới dùng được công khai. Chủ tin và Admin xem theo quyền quản lý. Bằng chứng report là dữ liệu riêng tư, không kế thừa quyền ảnh tin.

### 3.2. Ma trận chuyển trạng thái

| Sự kiện | Điều kiện | Thay đổi | Kết quả hiển thị và tác dụng phụ |
| --- | --- | --- | --- |
| Tạo tin | Tài khoản đã xác minh; form/ảnh hợp lệ | Tạo revision 1 `PENDING`; `approvedVersionId=null`; `reviewHold=true`; sale `AVAILABLE` | Không công khai, không mua được. |
| Seller gửi revision | Là chủ tin; đã xác minh; không có revision `PENDING`; chưa `SOLD`; form/ảnh hợp lệ; còn lượt nếu là gửi lại | Thêm revision `PENDING`; đặt `reviewHold=true` | Tin tạm ẩn. Nếu đang `RESERVED`, Checkout/Order đã tạo tiếp tục dùng snapshot lúc đặt. |
| Admin duyệt revision | Revision vẫn `PENDING`; quyết định nhắm đúng revision | Revision thành `APPROVED`; cập nhật `approvedVersionId`; gỡ `reviewHold` | Trở lại hiển thị/mua chỉ khi mọi điều kiện khác cho phép. Không tự gỡ `sellerHidden`, `adminHidden` hoặc khóa điều tra. |
| Admin từ chối revision | Revision vẫn `PENDING`; có lý do | Revision thành `REJECTED`; lưu người duyệt/thời điểm/lý do; giữ `reviewHold=true` | Tin không công khai. Seller thấy lý do và có thể gửi lại nếu chưa hết 5 lượt. |
| Seller `HIDE` | Là chủ tin | `sellerHidden=true` | Ẩn công khai; không đổi duyệt, giữ chỗ hay tình trạng bán. |
| Seller `SHOW` | Là chủ tin; `AVAILABLE`; có revision duyệt; không có chờ duyệt, Admin ẩn hoặc khóa điều tra | `sellerHidden=false` | Chỉ hiện nếu không còn cờ chặn nào khác. Không áp dụng cho `RESERVED`/`SOLD`. |
| Admin `HIDE` | Admin; có lý do | `adminHidden=true`; ghi sự kiện kiểm duyệt. Có thể bật `correctionRequested` khi không có revision PENDING và món chưa SOLD | Ẩn công khai. Không tự đổi `saleStatus`, không xóa `sellerHidden`; tạo thông báo nội bộ cho Seller. |
| Admin `SHOW` | Admin; có revision `APPROVED`; `AVAILABLE`; không có `reviewHold` hoặc khóa thanh toán/điều tra | `adminHidden=false`; ghi sự kiện kiểm duyệt | Không xóa `sellerHidden`; không làm hiện nếu cờ khác vẫn chặn. Không mở bán `RESERVED`/`SOLD`. |
| PAY xác minh thành công | Chỉ xử lý sau khi đối chiếu Checkout/Payment; giữ chỗ thuộc chính Checkout hoặc xử lý xung đột theo PAY | Cụm PAY/ORD chuyển món `SOLD` khi không xung đột | Không do route kiểm duyệt hoặc client tự gọi. Hạn chế hiển thị không được viết đè kết quả thanh toán đã xác minh. |

**Gửi lại:** lần gửi đầu không tính lượt. Mỗi revision gửi lại sau khi bị từ chối/yêu cầu sửa tính một lượt; tối đa 5 lượt trên một Listing. Chỉnh sửa chủ động của một tin đã duyệt vẫn cần revision mới và Admin duyệt, nhưng không tiêu hao hạn mức “gửi lại sau từ chối” nếu không có quyết định từ chối/yêu cầu sửa trước đó. Khi đủ 5 lượt, trả `RESUBMISSION_LIMIT_REACHED`. Lượt gửi lại và revision đang `PENDING` phải được cập nhật nguyên tử để request đồng thời không vượt hạn mức.

**Ẩn vì lỗi nặng:** tin tiếp tục ẩn. Seller không thể tự gỡ `adminHidden`; sau khi Seller gửi sửa và Admin duyệt, Admin vẫn phải thực hiện `SHOW` rõ ràng nếu cho phép công khai. Không có enum phân loại mức độ vi phạm trong tài liệu nghiệp vụ hiện tại; hợp đồng dùng lý do Admin dạng văn bản, không tự phát minh taxonomy lỗi nặng/nhẹ.

## 4. Hợp đồng API đã chốt

Tiền tố thực tế: `/api/v1`. Thành công theo `{ data, meta: { requestId, ... } }`; lỗi theo `{ error: { code, message, retryable }, meta: { requestId } }`. ID gửi/nhận là chuỗi; thời gian ISO 8601 UTC; tiền VND là số nguyên. Danh sách dùng `page` bắt đầu từ 1, `limit` mặc định 20, tối đa 100, sắp xếp mới nhất trước và trả `page`, `limit`, `total` trong `meta`.

| Mã | Method và path | Quyền | Request chính | Response/tác dụng chính |
| --- | --- | --- | --- | --- |
| LST-01 | `GET /me/listings?page=&limit=` | Đã đăng nhập | Không nhận owner từ query | Danh sách tin của user hiện tại, gồm trạng thái revision/ẩn/bán và lý do chặn; phân trang. |
| LST-02 | `GET /me/listings/{listingId}` | Chủ tin | ID hợp lệ | Trạng thái quản lý và revision; người khác nhận `404` để không dò ID. |
| LST-03 | `POST /listings` | Đã đăng nhập + email xác minh | Toàn bộ form: `title`, `category`, `size`, `condition`, `description`, `flaws`, `price`, `shipFrom`, `imageIds` | `201`, `listingId`, `versionId`, trạng thái `PENDING`. Ảnh phải do user tải lên và sở hữu. |
| LST-04 | `POST /listings/{listingId}/revisions` | Chủ tin + email xác minh | Toàn bộ form LST-03 | `201`, ID revision mới và `PENDING`; cho phép `RESERVED`, cấm `SOLD`, cấm revision PENDING thứ hai. |
| LST-05 | `GET /me/listings/{listingId}/revisions` | Chủ tin | ID Listing | Lịch sử revision gồm quyết định/lý do/thời điểm và số lượt gửi lại đã dùng/còn lại. |
| LST-06 | `POST /listings/{listingId}/visibility` | Chủ tin | `{ "action": "HIDE" | "SHOW" }` | Cập nhật riêng `sellerHidden`; `SHOW` tuân điều kiện trong ma trận; trả trạng thái hiện tại và `blockedReasons`. |
| DISC-01 | `GET /listings?q=&category=&size=&condition=&minPrice=&maxPrice=&page=&limit=` | Công khai nếu không lọc; đăng nhập nếu tìm/lọc | Từ khóa/lọc và phân trang tùy chọn | Chỉ Listing đã duyệt, hiển thị và `AVAILABLE`; truy vấn revision đã duyệt, trả `page/limit/total`. |
| DISC-02 | `GET /listings/{listingId}` | Công khai với tin được phép xem | ID Listing | Tin ẩn/chờ duyệt không lộ; tin `SOLD` xem được qua link trực tiếp, kèm nhãn “Đã bán” và không có hành động mua. |
| ADM-01 | `GET /admin/listing-versions?status=PENDING&page=&limit=` | Admin | `status` chỉ chấp nhận `PENDING` ở hàng chờ MVP | Danh sách tin mới và bản sửa chờ duyệt, gồm `listingId`, `versionId`, thời điểm gửi, chủ tin dạng tối thiểu. |
| ADM-02 | `GET /admin/listing-versions/{versionId}` | Admin | ID revision | Form đúng revision, trạng thái hiện tại và lịch sử cần để quyết định. |
| ADM-03 | `POST /admin/listing-versions/{versionId}/decision` | Admin | `{ "decision": "APPROVE" | "REJECT", "reason": "..." }`; `reason` bắt buộc khi REJECT, tùy chọn khi APPROVE | Cập nhật đúng revision; audit và thông báo nội bộ Seller cùng transaction. Revision không còn PENDING trả `409`. |
| ADM-04 | `POST /admin/listings/{listingId}/visibility` | Admin | `{ "action": "HIDE" | "SHOW", "reason": "...", "requireCorrection?": boolean }`; lý do bắt buộc; `requireCorrection` chỉ dùng với HIDE | Cập nhật riêng `adminHidden`; tùy chọn yêu cầu Seller sửa; ghi audit và thông báo nội bộ. `SHOW` tuân điều kiện trong ma trận. |
| NOT-01 | `GET /me/notifications?page=&limit=` | Đã đăng nhập | Phân trang | Chỉ trả thông báo của user hiện tại và tổng unread. |
| NOT-02 | `PATCH /me/notifications/{notificationId}/read` | Người nhận | ID thông báo | Đánh dấu đã đọc; lặp lại trả trạng thái hiện tại; thông báo của người khác trả `404`. |
| MOD-01 | `POST /reports/listings` | Đã đăng nhập + email xác minh; không phải chủ tin | `{ "listingId", "reasonCode", "details?", "evidenceMediaIds?" }` | `201`, `reportId`, `caseId`, trạng thái `OPEN`, `receivedAt`. Reporter lấy từ session; mỗi report gốc được lưu riêng. |
| MOD-03 | `GET /admin/cases?type=REPORT&status=&page=&limit=` | Admin | Bộ lọc tùy chọn | Danh sách Case nhóm theo Listing, `reportCount`, trạng thái, thời điểm cập nhật; phân trang. |
| MOD-04 | `GET /admin/cases/{caseId}` | Admin | ID Case | Case, từng report gốc/bằng chứng, trạng thái tin và lịch sử quyết định; ghi chú nội bộ chỉ Admin. |
| MOD-05 | `POST /admin/cases/{caseId}/decisions` | Admin | `{ "status": "IN_REVIEW" }` hoặc `{ "status": "CLOSED", "outcomeCode", "outcomeSummary", "internalNote?", "listingAction?" }` | Chỉ cho `OPEN→IN_REVIEW→CLOSED`; đóng bắt buộc outcome. `listingAction` tùy chọn `HIDE|SHOW`, thực thi cùng quy tắc ADM-04 và cùng thao tác nguyên tử. |

`reasonCode` của report dùng tập đã chốt: `INACCURATE_OR_INCOMPLETE`, `SUSPECTED_COUNTERFEIT`, `PROHIBITED_OR_INAPPROPRIATE`, `OFFENSIVE_CONTENT`, `DUPLICATE_OR_SPAM`, `SUSPECTED_SCAM`, `OTHER`. `OTHER` bắt buộc có `details`. Bằng chứng tùy chọn 0–5 ảnh JPEG/PNG/WebP, tối đa 5 MB mỗi ảnh; ID phải thuộc uploader/report. Không nhận `reporterId`, `ownerId`, role hay trạng thái kiểm duyệt từ body.

`outcomeCode` của Case: `NO_ACTION`, `CORRECTION_REQUIRED`, `LISTING_HIDDEN`, `OTHER`. `OTHER` yêu cầu `outcomeSummary`. Người gửi chỉ nhận xác nhận tiếp nhận và `outcomeSummary`; không nhận `internalNote` hoặc dữ liệu của người báo khác.

**Gom Case:** report mới được gắn vào Case `REPORT` cùng Listing đang `OPEN` hoặc `IN_REVIEW`; nếu chưa có Case đang mở thì tạo Case `OPEN` mới. Case đã `CLOSED` không bị mở lại và lịch sử đóng không bị sửa; report mới cùng Listing sau đó mở Case mới. Từng report luôn là bản ghi riêng. Tạo/đính kèm report và Case phải xử lý đồng thời để hai report song song không tạo hai Case đang mở cho cùng một Listing.

## 5. Quyền và lỗi chuẩn

| Tình huống | HTTP | Code |
| --- | ---: | --- |
| Chưa đăng nhập | 401 | `UNAUTHORIZED` |
| Chưa xác minh email ở thao tác yêu cầu xác minh | 403 | `EMAIL_NOT_VERIFIED` |
| Đăng nhập nhưng không có role Admin | 403 | `FORBIDDEN` |
| ID không tồn tại/không thuộc user hiện tại | 404 | `NOT_FOUND` |
| Body, enum, form, evidence hoặc reason không hợp lệ | 422 | `VALIDATION_ERROR` |
| Đã có revision PENDING, trạng thái không cho phép hoặc quyết định revision cũ | 409 | `REVISION_PENDING`, `LISTING_SOLD`, `LISTING_RESERVED` (chỉ thao tác bị cấm), `INVALID_STATE` |
| Đã đạt lượt gửi lại tối đa | 409 | `RESUBMISSION_LIMIT_REACHED` |
| Bị giới hạn request | 429 | `RATE_LIMITED` + `Retry-After` |

Các thao tác quyết định/ẩn hiện lưu audit gồm `requestId`, actor ID, action, target Listing/Version/Case, thời gian UTC, lý do/kết quả. Không ghi session ID, mật khẩu, token hoặc dữ liệu thanh toán. Ảnh evidence chỉ được phục vụ sau kiểm tra quyền theo Case; không mở rộng quyền Admin thành quyền đọc mọi media không liên quan.

## 6. Quy tắc tương tác giữa kiểm duyệt và giao dịch đang giữ món

Checkout mới chỉ được giữ món đang hiển thị và `AVAILABLE`. Sau khi món đã được giữ cho Checkout, gửi revision hoặc thao tác Admin/Seller ẩn không tự hủy reservation, sửa snapshot, Order hay Payment đang xử lý. Xác nhận thanh toán của Checkout hiện hữu phải đối chiếu chủ sở hữu reservation và snapshot đã lưu; không yêu cầu Listing vẫn công khai ở thời điểm callback. Kết quả thanh toán chưa rõ/xung đột do PAY xử lý bằng `paymentReviewHold`/`NEEDS_REVIEW`; không dùng `reviewHold` hoặc `adminHidden` để giả lập khóa thanh toán.

Đây là ranh giới cần giữ khi chuyển code hiện tại sang VNPAY: không để `approvedVisibleListingQuery()` làm điều kiện cho callback đã xác minh trên một reservation hợp lệ. Quy tắc đó chỉ dùng để cho phép hiển thị/mua mới.

## 7. Điều kiện nghiệm thu hợp đồng ở bước A

- Mọi trạng thái duyệt, cờ ẩn, khóa điều tra và tình trạng bán có ý nghĩa riêng cùng quy tắc chuyển rõ ràng.
- Route có method/path/quyền/request/response/lỗi đã thống nhất trong bảng trên.
- Không route nào cho Seller/Admin tự đổi Payment, đánh dấu PAID/SOLD hoặc mở lại món RESERVED/SOLD.
- Quy tắc về gửi revision khi RESERVED, 5 lượt gửi lại, report riêng lẻ/gom Case, bằng chứng riêng tư và hành vi khi callback thanh toán đã xác minh được xác định.
- Các điểm trước đây mơ hồ được áp dụng mặc định: lý do kiểm duyệt là văn bản tự do trong audit; không định nghĩa taxonomy lỗi nặng/nhẹ; Admin SHOW là quyết định rõ ràng riêng; limit danh sách 20 mặc định/100 tối đa; `REPORT` là loại Case đầu tiên trong mô hình Case dùng chung.

## 8. Cập nhật tiến độ các bước tiếp theo

| Bước | Nội dung | Trạng thái | Cập nhật |
| --- | --- | --- | --- |
| A | Chốt hợp đồng API và ma trận trạng thái | Hoàn tất | Hợp đồng, quyền và chuyển trạng thái được ghi trong các mục 3–7. |
| B | Model, chỉ mục, middleware quyền và audit | Hoàn tất | Model/unique index, role middleware, quyền evidence và audit được kiểm tra qua integration. |
| C | Hoàn thiện luồng revision và Seller visibility | Hoàn tất | Sửa khi `RESERVED`, hạn mức gửi lại, HIDE/SHOW và snapshot checkout được bao phủ trong commerce-flow. |
| D | API Admin duyệt/ẩn/khôi phục | Hoàn tất | Hàng chờ, quyết định revision, Admin visibility, correction request, audit và thông báo Seller. |
| E | Report và Case loại REPORT | Hoàn tất | Tạo report, gom Case, quyết định, thông báo riêng tư và ảnh evidence; chưa gồm DELIVERY/ITEM/Support assignment. |
| F | Đồng bộ feed, chi tiết, checkout và ảnh | Hoàn tất | Feed/detail nhất quán với moderation state; Checkout snapshot và quyền ảnh giao dịch được giữ. |
| G | Kiểm thử, tài liệu và bàn giao | Hoàn tất | 8 unit + 2 integration pass trên MongoDB replica set; tài liệu API và báo cáo tổng đồng bộ. |

## 9. Nguồn trong repo

- `docs/Domain Documentation/Business Rules.md`
- `docs/Domain Documentation/State Lifecycles.md`
- `docs/Domain Documentation/Domain Model.md`
- `docs/Architecture & Technical Design/API Routes — Rewear Circle (MVP).md`
- `docs/Architecture & Technical Design/API Contracts & Error Conventions.md`
- `docs/Architecture & Technical Design/API & Data Conventions — Rewear Circle (MVP).md`
- `docs/Non-functional Requirements/Security & Privacy.md`
- `docs/Workflows/WF-02_Dang-ban-duyet-khoi-phuc.drawio`
- `docs/Workflows/WF-04_Bao-cao-kiem-duyet-ho-tro.drawio`
