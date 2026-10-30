# Báo cáo tổng — Backend giao nhận, khiếu nại và vận hành

**Ngày cập nhật:** 29/10/2026  
**Mốc đối chiếu:** trạng thái backend trước khi triển khai cụm tuần 2.  
**Trạng thái:** A–H đã hoàn tất phần hợp đồng/triển khai tương ứng; hồi quy tích hợp còn ở L. B đã áp dụng trên MongoDB local `rewear_circle`: backup xác minh được, index vật lý của phạm vi B đã khớp và một Checkout/Order legacy đã được khôi phục an toàn. Một Listing SOLD không có Order liên kết vẫn được giữ nguyên. E bổ sung index `ComplaintQuota` sau lần áp dụng B; cần backup và audit/apply riêng trước nghiệm thu DB mới. I–M còn mở. Tích hợp merchant VNPAY Sandbox thật vẫn tạm gác.

Kế hoạch: [Giao nhận, khiếu nại và vận hành](../../plan/tuan-2-giao-nhan-khieu-nai-van-hanh-backend.md). Thư mục `plan` hiện bị Git ignore; báo cáo này là bản hợp đồng được theo dõi trong repo.

## 1. Phạm vi, nguồn và trạng thái thực tế

Hoàn thiện giao/nhận thủ công cho COD và VNPAY, khiếu nại DELIVERY/ITEM, hàng chờ Admin chung với REPORT, phân công Support, quyền đọc dữ liệu vụ việc, job nền, log/audit và retention. Không triển khai frontend, hãng vận chuyển tự động, hoàn tiền/payout hoặc quyền Support sửa dữ liệu nghiệp vụ.

Nguồn đã đối chiếu: Business Rules (gồm bổ sung COD 28/10), State Lifecycles, Domain Model, Actors & Roles, API Routes, API Contracts, Security & Privacy, Observability, Reliability & Recovery, Performance & Capacity; báo cáo tin đăng/kiểm duyệt và [báo cáo đơn hàng/VNPAY/COD](backend-orders-vnpay-sandbox-master-report.md), đặc biệt mục A-09.

| Bước | Trạng thái | Bằng chứng/đầu ra hiện tại |
| --- | --- | --- |
| A — Hợp đồng, quyền, trạng thái | Hoàn tất về tài liệu | Các mục 2–13 bên dưới; cập nhật kế hoạch và tài liệu nguồn. Không chứng nhận tính năng hoạt động. |
| B — Dữ liệu/index/migration | Hoàn tất trên MongoDB local theo schema tại thời điểm B | Index vật lý ban đầu khớp; 1 Checkout/Order COD legacy được chuyển an toàn; post-audit không báo index thiếu/thừa. E sau đó thêm collection/index ComplaintQuota; cần backup và audit/apply riêng trước nghiệm thu DB mới. |
| C — Quyền/DTO | Đã triển khai; regression chờ Bước L | Tài khoản Support/Admin không dùng route Order/Checkout của USER; DTO allowlist; Admin Case detail chỉ trả Order đích; ảnh private kiểm tra Case và assignment hiện tại. |
| D — Giao/nhận | Đã triển khai; regression chờ Bước L | Đồng bộ trạng thái COD/VNPAY, Case/hold, quyền SOLD đúng Seller/Checkout; idempotency, audit transaction và Order `__v` gate; DTO có `canShip`/`canConfirmReceipt`. |
| E — Khiếu nại | Đã triển khai; regression chờ L | Buyer tạo/theo dõi DELIVERY/ITEM, snapshot, evidence, transaction/audit/notification, quota và idempotency; tạo/đóng tranh Order `__v`. Index ComplaintQuota mới chưa apply/audit ở MongoDB local. |
| F — Admin | Đã triển khai; regression chờ L | Queue chung REPORT/DELIVERY/ITEM, lọc/count, assignment có version, quyết định có idempotency/version, đóng vụ gửi thông báo không đổi tài chính/Listing Order. |
| G — Support/contact | Đã triển khai; regression chờ L | Support list/detail chỉ lấy assignment và role hiện tại; Order DTO bị giới hạn; contact-access trả recipient snapshot tối thiểu, audit trong transaction trước response. |
| H — Media/notification | Đã triển khai; regression chờ L | Evidence/snapshot/ảnh tin REPORT có quyền theo Case; audit trước stream và private no-store; notification DTO allowlist, message đóng vụ cố định, dedupe cùng transaction. |
| I — Job nền | Có worker VNPAY | Chưa bổ sung nghiệm thu vận hành/heartbeat trong cụm này. |
| J — Log/audit | Có request ID và audit nền | Error handler còn log object lỗi thô; chưa chuẩn hóa toàn bộ. |
| K — Retention | Chưa thực hiện | Chưa có job dọn hồ sơ/bằng chứng theo hợp đồng. |
| L — Kiểm thử | Chưa thực hiện | Không chạy test ứng dụng/DB tại Bước A. |
| M — Bàn giao | Chưa thực hiện | Chưa nghiệm thu deploy, vận hành hoặc Sandbox thật. |

## 2. Nhật ký quyết định Bước A

Các lựa chọn dưới đây được chốt cho MVP trong phạm vi yêu cầu thực hiện Bước A. Đây là đích triển khai cho B–M, không phải mô tả rằng code hiện đã hỗ trợ.

| Mã | Quyết định | Lựa chọn đã cân nhắc và lý do |
| --- | --- | --- |
| A-01 | Giữ route shipment PUT và receipt-confirmation POST; thời điểm do server ghi. | Dùng route sẵn có, không thêm route nhận hàng thứ hai hoặc status SHIPPED mới. |
| A-02 | Một active Case trên mỗi target; Order giữ type của Case từ lúc tạo. | Không đổi unique target sang unique target+type. DELIVERY và ITEM không mở đồng thời trên một Order. |
| A-03 | Active Order Case chặn giao, receipt, thu COD, hủy COD và bắt đầu/chấp nhận hoàn COD. | Giữ ràng buộc hiện có; không để receipt tự chuyển/đóng DELIVERY hoặc tự đổi Case thành ITEM. Admin được đóng vụ mà không cần Order COMPLETED. |
| A-04 | Tạo/đóng Case chỉ tác động hồ sơ hỗ trợ và quyền thao tác dẫn xuất. | Không sửa Order/paymentStatus/Checkout/Listing hoặc tạo refund; đóng vụ không gỡ hold tài chính. |
| A-05 | DELIVERY hỗ trợ VNPAY PAID/PAID và COD CONFIRMED trước nhận, kể cả COD đã COLLECTED sau gửi. | Tách nhận hàng khỏi thu tiền. Không giả định COD phải PAID hoặc đã thu là đã nhận. |
| A-06 | Cho phép DELIVERY bổ sung với COD NEEDS_REVIEW do yêu cầu hoàn đang OPEN hoặc REJECTED, theo điều kiện mục 4. | Buyer cần có kênh phản đối hoàn hàng trước khi Admin chấp nhận. Không mở khiếu nại này cho mọi NEEDS_REVIEW hoặc xung đột tài chính VNPAY. |
| A-07 | Khiếu nại gốc lưu riêng trong Complaint liên kết Case và Order. | Report hiện là báo cáo Listing. Không đặt listingId giả hoặc thay type của Report cũ. |
| A-08 | Support chỉ xem Case OPEN/IN_REVIEW đang được giao; CLOSED mất quyền đọc qua vụ, assignment cũ giữ lịch sử. | Không cấp quyền lịch sử vô hạn. Admin vẫn đọc hồ sơ CLOSED trong thời hạn lưu trữ. |
| A-09 | Contact-access là lần đọc có lý do, kiểm tra lại quyền và audit trước khi trả DTO; không cấp grant dài hạn. | Tránh thêm quy trình duyệt/grant/TTL không cần cho MVP. Mỗi lần đọc lại phải kiểm tra và ghi audit mới. |
| A-10 | Tối đa 5 khiếu nại mới/24 giờ/Buyer và 3 bản gốc/active Order Case; sau đóng chờ 24 giờ để mở lại cùng loại/cùng Order. | Giữ các bản bổ sung thay vì ghi đè; replay hợp lệ không tiêu quota. ITEM sau DELIVERY đã đóng không phải cùng loại nên không chịu cooldown đó. |
| A-11 | Evidence tùy chọn 0–5 ảnh mỗi bản, details 10–2000 ký tự; bộ reason/outcome theo type. | Bám giới hạn media hiện có, không bắt buộc Buyer có ảnh cho khiếu nại chưa giao. |
| A-12 | Idempotency bắt buộc trên mutation mới; dùng version cho assignment và quyết định Order Case. | REPORT quyết định giữ body cũ tương thích; quy tắc chi tiết ở mục 7, không buộc client cũ thêm field ngay. |
| A-13 | Giữ worker đối chiếu hiện có; thêm quan sát và job retention vừa đủ. | Không dựng queue hoặc engine đối chiếu khác; không đổi giới hạn QueryDr để khớp lịch nội bộ. |
| A-14 | Retention hồ sơ 12 tháng sau đóng, log kỹ thuật 30 ngày cho staging/demo; tài chính giữ chính sách riêng. | 12 tháng đã được chốt trong docs. Chọn 30 ngày từ đề xuất để có cấu hình MVP rõ ràng; không áp quy tắc xóa cho Order/Payment. |

Mặc định log staging/demo 30 ngày và các quota mới trong A-10 là quyết định thiết kế MVP của bước này, chưa phải kết quả vận hành. Không còn quyết định nghiệp vụ mở trong phạm vi A. Các việc chưa làm là triển khai, migration và kiểm chứng môi trường; mọi thay đổi hợp đồng sau A phải bổ sung quyết định và ca hồi quy trong báo cáo.

## 3. Quy ước API và dữ liệu

- Prefix `/api/v1`; ID là chuỗi ObjectId; thời gian ISO UTC; VND nguyên. Không cho client tự gán actor, owner, trạng thái, giá hoặc thời điểm hệ thống.
- Success dùng `{data, meta:{requestId, ...}}`; lỗi dùng `{error:{code,message}, meta:{requestId}}`, giữ helper hiện có. Commerce tiếp tục có `serverNow`; không bắt route cũ thêm field mới để chốt A.
- Danh sách Case/complaint dùng `page` mặc định 1, `limit` mặc định 20/tối đa 100; trả `meta.page/limit/total`; sort `updatedAt DESC, _id DESC` cho Case, `createdAt DESC, _id DESC` cho Complaint. Không dùng cursor cho các route này.
- Body/query allowlist: field lạ, null sai kiểu, ID sai trong body, chuỗi không hợp lệ trả 422. ID route không hợp lệ hoặc tài nguyên ngoài quyền trả 404. Không dùng ID do client khai làm quyền.
- Các mutation yêu cầu session và Origin hợp lệ theo middleware hiện có. Buyer/Seller cần email xác minh; route Admin/Support cần role từ DB hiện tại. Buyer/Seller là quan hệ với Order, không phải role mới hoặc quyền giả danh từ Admin.
- Khóa `Idempotency-Key` có 8–100 ký tự `[A-Za-z0-9_-]`. DTO trả ID nghiệp vụ; không trả đường dẫn file, session, secret, raw callback/query hoặc toàn bộ User/Payment document.
- Media hiện dùng upload tối đa 5 ảnh, JPEG/PNG/WebP xác minh định dạng thực, ≤5 MB/ảnh. ID ảnh không tự chứng minh quyền đọc/gắn vụ.

## 4. Ma trận trạng thái Order và các thao tác

### 4.1. Điều kiện nền

`financialSafe` nghĩa là Order không có paymentReviewHold, không ở review tài chính; các Listing liên quan không có paymentReviewHold/paymentReviewCheckoutIds. Không suy ra đã trả tiền từ log hoặc status Case.

`ownsItems` nghĩa là mọi Listing của Order còn SOLD và `soldCheckoutId` đúng Checkout của Order. Thiếu Listing, lệch chủ hoặc snapshot không hợp lệ phải chặn giao/nhận, không tự sửa dữ liệu.

`activeCase` là Case target ORDER, trạng thái OPEN hoặc IN_REVIEW, bất kể type. Case REPORT của Listing không phải Order Case và không tự hủy quyền mua snapshot đã có.

| Order/payment | Shipment | Receipt | DELIVERY mới | ITEM mới |
| --- | --- | --- | --- | --- |
| VNPAY PAID / PAID, chưa nhận | Chưa gửi, financialSafe + ownsItems + không activeCase | Đã gửi, financialSafe + ownsItems + không activeCase | Có nếu financialSafe + ownsItems, chưa nhận; gửi hoặc chưa gửi đều được | Không |
| COD CONFIRMED / UNPAID, chưa nhận | Chưa gửi, financialSafe + ownsItems + không activeCase | Đã gửi, financialSafe + ownsItems + không activeCase | Có nếu financialSafe + ownsItems, chưa nhận | Không |
| COD CONFIRMED / COLLECTED, chưa nhận | Không ghi vận đơn mới; collection hợp lệ phải đã có shippedAt | Có nếu đã gửi, financialSafe + ownsItems + không activeCase | Có nếu đã gửi, financialSafe + ownsItems, chưa nhận | Không |
| COD NEEDS_REVIEW do yêu cầu hoàn đủ điều kiện mục 4.2 | Không | Không | Chỉ theo ngoại lệ mục 4.2 | Không |
| COMPLETED, receivedAt có giá trị; VNPAY PAID hoặc COD UNPAID/COLLECTED | Không ghi mới | Chỉ replay, không thay trạng thái/thời điểm | Không | Có nếu financialSafe + ownsItems và chưa có active Case khác loại |
| PENDING, PLACED legacy, PAYMENT_FAILED, EXPIRED, CANCELLED, RETURNED | Không | Không | Không | Không |
| NEEDS_REVIEW tài chính, paymentStatus NEEDS_REVIEW, hold hoặc sai cặp trạng thái | Không | Chỉ trả replay hợp lệ đã ghi trước đó; không thay đổi | Không | Không |

Nếu đã có active Case cùng loại và vẫn đủ điều kiện tạo khiếu nại, request key mới có thể thêm bản gốc vào Case đó trong giới hạn. Case khác loại trả 409 ACTIVE_CASE_TYPE_CONFLICT; không tự đổi type. Replay mutation đã thành công được xử lý theo mục 7 trước khi kiểm tra điều kiện mới, nhưng luôn kiểm tra quyền hiện tại.

`canFulfill` là điều kiện giao/nhận dẫn xuất, không phải trạng thái Order và không thay thế việc kiểm tra lại khi ghi. Chỉ true cho VNPAY PAID/PAID hoặc COD CONFIRMED với paymentStatus hợp lệ, financialSafe, ownsItems và không activeCase. DTO cần trả `canShip` (thêm chưa shipped), `canConfirmReceipt` (thêm đã shipped/chưa received) và `canComplainDelivery/Item` để frontend không suy luận từ status đơn lẻ.

### 4.2. Ngoại lệ COD đang yêu cầu hoàn

DELIVERY được mở khi cùng lúc: Order COD NEEDS_REVIEW, paymentStatus UNPAID, shippedAt có, receivedAt null, chưa có collection, financialSafe + ownsItems; `codReturnRequestId` trỏ đúng yêu cầu của Order có trạng thái OPEN hoặc REJECTED. Cần khớp request và dữ liệu hiện tại trong transaction, không chỉ kiểm tra field ID tồn tại.

Tạo Case không làm Order NEEDS_REVIEW lần nữa hoặc thay trạng thái yêu cầu hoàn. Active Case chặn ACCEPT_RETURN; Admin có thể đóng vụ rồi xử lý yêu cầu hoàn qua endpoint COD riêng. REJECT_RETURN không giải phóng món, không đưa Order về CONFIRMED và không tạo quyền receipt. Nếu hồ sơ chưa đủ để tiếp tục bằng workflow COD hiện có, giữ điều tra và báo rõ giới hạn; không dùng Case decision làm lối sửa tiền/trạng thái thủ công.

Quy tắc này sửa cách diễn đạt cũ “mở DELIVERY đưa đơn NEEDS_REVIEW”: **chỉ workflow COD return hoặc workflow tài chính riêng được chuyển trạng thái đó; mở DELIVERY không tự chuyển Order**.

### 4.3. Hủy, thu COD, hoàn COD và trạng thái Case

| Thao tác | Điều kiện chính | Khi Order có active Case | Tác dụng phụ được phép |
| --- | --- | --- | --- |
| Buyer hủy COD | CONFIRMED/UNPAID, chưa gửi/thu, financialSafe + ownsItems | Chặn | Workflow COD riêng có thể CANCELLED/NOT_DUE và giải phóng đúng quyền; giữ cờ ẩn/hold khác. |
| Seller ghi thu COD | CONFIRMED hoặc COMPLETED, UNPAID, đã gửi, đúng total, không hold | Chặn | COLLECTED và collection SELLER_DECLARATION, không tự COMPLETED. |
| Seller bắt đầu yêu cầu hoàn COD | CONFIRMED/UNPAID, đã gửi/chưa nhận/chưa thu, không hold | Chặn | Tạo CodReturnRequest và NEEDS_REVIEW qua workflow hiện có. |
| Admin ACCEPT_RETURN | Đúng request mở, đã nhận đủ hàng/chưa thu/chưa nhận; quyền món an toàn | Chặn | Workflow COD riêng RETURNED/NOT_DUE và giải phóng đúng chủ. |
| Admin REJECT_RETURN | Đúng request mở và các điều kiện hiện có | Được phép nếu đáp ứng workflow COD; không giải phóng | Đóng request REJECTED, giữ NEEDS_REVIEW; không tự đóng Case. |
| Admin đóng Case | IN_REVIEW, outcome/tóm tắt hợp lệ | Đây là thao tác đóng chính Case | CLOSED + history/audit/notification; không sửa Order/payment/Listing/return request. |

Với DELIVERY chưa gửi, Admin có thể đóng RESOLVED khi các bên đã thống nhất tiếp tục giao; sau đó Seller mới ghi vận đơn. Với hàng đã đến, Buyer chờ Admin đóng vụ rồi xác nhận nhận. Đóng vụ không đòi Order đã COMPLETED, nên không tạo vòng phụ thuộc không thể thực hiện.

## 5. Hợp đồng endpoint

Các endpoint trong bảng là **đích triển khai**, chỉ shipment/receipt và route REPORT/Admin nền đang có code. Ký hiệu K: Idempotency-Key bắt buộc; V: expectedVersion bắt buộc.

| Method/path | Actor và phạm vi | Request allowlist | Kết quả, idempotency | Audit/notification |
| --- | --- | --- | --- | --- |
| PUT `/orders/:id/shipment` | Seller đúng Order, email xác minh | `{carrierName,trackingCode}`; trim; tên 2–100, mã 3–100; cả hai không có control character | 200 Order DTO; idempotent theo nội dung vận đơn; khác thông tin đã ghi: 409 SHIPMENT_ALREADY_RECORDED. Không nhận shippedAt. | ORDER_SHIPPED đúng một lần; không thêm notification mới bắt buộc. |
| POST `/orders/:id/receipt-confirmation` | Buyer đúng Order, email xác minh | `{}`; K | 200 Order DTO; COMPLETED và receivedAt lần đầu; replay không sửa receivedAt/tiền | ORDER_RECEIVED đúng một lần; không tự đóng vụ/thu COD. |
| POST `/orders/:id/complaints` | Buyer đúng Order, email xác minh | `{type,reasonCode,details,evidenceMediaIds?,affectedOrderItemIds?}`; K | 201 bản mới; 200 replay + meta.idempotentReplay=true; trả ComplaintReceipt ở mục 8 | COMPLAINT_CREATED + COMPLAINT_RECEIVED; cùng transaction. |
| GET `/orders/:id/complaints` | Buyer đúng Order | `page,limit,type?,status?`; type DELIVERY/ITEM, status theo Case | 200 danh sách bản khiếu nại của Buyer, trạng thái Case/tóm tắt; không dữ liệu nội bộ | Request log; không tạo mutation/audit tài chính. |
| GET `/orders/:id/complaints/:complaintId` | Buyer đúng Order và bản gốc của mình | Không query/body | 200 BuyerComplaintDetail mục 8; 410 nếu nội dung đã retention | Request log. |
| GET `/admin/cases` | ADMIN | `page,limit,type?,status?,assignedSupportId?,unassigned?`; không kết hợp assignedSupportId với unassigned=true | 200 hàng chờ REPORT/DELIVERY/ITEM, bộ lọc hợp lệ, version và counts | Request log; DTO danh sách không PII/evidence/details. |
| GET `/admin/cases/:id` | ADMIN | Không query/body | 200 AdminCaseDetail + snapshot/histories đã lọc; không shippingAddress mặc định | CASE_DETAIL_READ; không nhúng raw PaymentEvent. |
| PATCH `/admin/cases/:id/assignment` | ADMIN; Case active | `{assignedSupportId: ID|null,expectedVersion}`; K,V | 200 Case summary; target user SUPPORT hiện tại; stale 409 CASE_VERSION_CONFLICT; CLOSED 409 CASE_NOT_ACTIVE | CASE_ASSIGNED lưu actor, before/after, time; đổi/gỡ quyền nguyên tử; không notification bắt buộc. |
| POST `/admin/cases/:id/decisions` | ADMIN | `{status,outcomeCode?,outcomeSummary?,internalNote?,expectedVersion?,listingAction?}` theo mục 6; K,V cho DELIVERY/ITEM | 200 Case summary; state machine nghiêm ngặt; REPORT giữ payload cũ theo mục 7 | CASE_REVIEW_STARTED hoặc CASE_CLOSED; đóng gửi CASE_CLOSED tóm tắt cho từng người gửi, không trùng recipient/Case. |
| GET `/support/cases` | SUPPORT hiện tại | `page,limit,type?,status?`; chỉ OPEN/IN_REVIEW | 200 assignedSupportId từ session bắt buộc; không nhận ID Support tùy ý | Request log. |
| GET `/support/cases/:id` | SUPPORT được giao, Case active | Không query/body | 200 SupportCaseDetail; 404 ngoài quyền/đã đóng | CASE_DETAIL_READ; không có internalNote/contact. |
| POST `/support/cases/:id/contact-access` | SUPPORT được giao, Case active target ORDER | `{reason}` 10–500 ký tự; không K | 200 `{caseId,orderId,shippingAddress:{fullName,phone,address},accessedAt}`; mỗi lần là đọc mới | CASE_CONTACT_ACCESS_READ; lý do trong audit hạn chế quyền; audit lỗi thì không trả PII. |
| POST `/admin/cases/:id/contact-access` | ADMIN, Case active target ORDER | Giống Support | Giống Support; không cần assignment | Cùng audit và fail-closed; không đặc quyền bỏ qua ghi nhận. |
| GET `/media/:id` | Owner upload hoặc Buyer/Seller có quyền Order hiện có; Admin theo Case, Support được giao active Case | Không thêm query cấp quyền | Ảnh stream với private/no-store cho ảnh riêng tư; mỗi request kiểm tra lại quyền | CASE_EVIDENCE_READ; thêm CASE_SNAPSHOT_MEDIA_READ cho đường đọc theo Case. Owner đọc ảnh chưa gắn Case ghi MEDIA_PRIVATE_READ với caseId null. |

Lỗi chung và thứ tự kiểm tra tại mục 10. Lấy ảnh evidence không cho Seller đọc chỉ vì là Seller của Order; ảnh snapshot của đúng Order vẫn theo quyền giao dịch. API upload/notifications cũ tái sử dụng; không tạo dịch vụ media hoặc notification thứ hai.

## 6. Payload, reason và vòng đời Case

### 6.1. Tạo khiếu nại

- `type`: DELIVERY hoặc ITEM; `details` sau trim dài 10–2000 ký tự, không chỉ khoảng trắng; OTHER cũng phải mô tả cụ thể trong giới hạn này. Không log nội dung tự do.
- `evidenceMediaIds`: mặc định `[]`, tối đa 5 ID không trùng, thuộc người gửi và purpose CASE_EVIDENCE; file tồn tại và có metadata ảnh hợp lệ. Chỉ được chưa gắn Case hoặc gắn chính Case đang bổ sung, không tái dùng ảnh đã gắn vụ khác.
- ITEM: `affectedOrderItemIds` có 1–20 ID không trùng, tất cả thuộc chính Order. Chuẩn hóa thứ tự ID khi fingerprint; đối chiếu OrderItem._id, không đối chiếu listingId.
- DELIVERY: cấm gửi `affectedOrderItemIds`, kể cả `[]`; phạm vi toàn Order.
- Không nhận orderId/buyerId/sellerId/Case status/assignedSupportId/tổng tiền/thời điểm qua body. Order ID lấy từ route, người gửi từ session.

| Type | reasonCode được nhận |
| --- | --- |
| DELIVERY | SELLER_NOT_SHIPPED, NOT_RECEIVED, DELIVERY_DELAYED, OTHER |
| ITEM | WRONG_ITEM, NOT_AS_DESCRIBED, MISSING_ACCESSORIES, SUSPECTED_COUNTERFEIT, DAMAGED_ON_ARRIVAL, OTHER |

SELLER_NOT_SHIPPED chỉ khi shippedAt null. NOT_RECEIVED/DELIVERY_DELAYED chỉ khi đã có shippedAt và chưa receivedAt. OTHER áp dụng trước/sau gửi theo ma trận; không thêm ngưỡng “chậm X ngày” vì chưa có SLA hãng vận chuyển trong MVP. Không có hạn chót nộp ITEM mới tính từ receivedAt ở MVP; rate limit/cooldown và lưu trữ vẫn áp dụng.

### 6.2. Gom Case, bản gốc và giới hạn

- Giữ unique activeTargetKey `ORDER:<orderId>` hoặc `LISTING:<listingId>`; không thêm type vào khóa. Case mới OPEN; phân công không tự IN_REVIEW.
- Khi active Case cùng type: thêm Complaint bất biến mới, giữ Case status/assignment; aggregate evidence là hợp của bản gốc, tối đa 15 ảnh vì tối đa 3 bản/active Order Case.
- Active Case khác type: 409 ACTIVE_CASE_TYPE_CONFLICT. Sau CLOSED không reopen Case cũ; tạo Case mới theo điều kiện Order hiện tại. Có thể tạo ITEM ngay sau DELIVERY đóng và receipt hợp lệ.
- Tối đa 5 bản mới trong cửa sổ trượt 24 giờ/Buyer, tối đa 3 bản gốc/active Case, 24 giờ từ closedAt để tạo Case mới cùng type/Order. Mã 429 RATE_LIMITED và Retry-After cho giới hạn thời gian; đầy Case trả 409 COMPLAINT_LIMIT_REACHED.
- Chỉ mutation mới thành công tiêu quota. Cùng key/payload replay hợp lệ không tạo bản/thông báo/audit mới và không tiêu quota; lỗi quyền/validation không tính vào quota nghiệp vụ. Lớp chống spam HTTP tổng quát có thể trả 429 trước nghiệp vụ; không dùng rate limit in-memory làm bằng chứng quota bền vững.
- Quota và unique key phải an toàn khi hai request/worker chạy đồng thời; index và transaction là điều kiện nghiệm thu B/E/L.

### 6.3. Quyết định

- OPEN → IN_REVIEW: `{status:"IN_REVIEW", expectedVersion}` cho Order Case, K bắt buộc; không kèm outcome/internalNote/listingAction.
- IN_REVIEW → CLOSED: `{status:"CLOSED", outcomeCode, outcomeSummary, internalNote?, expectedVersion}`; tóm tắt DELIVERY/ITEM 10–1000, REPORT giữ 1–1000 như hợp đồng hiện có; internalNote 0–2000 ký tự sau trim; không nhận closedAt.
- DELIVERY/ITEM chỉ nhận NO_ACTION, RESOLVED, UNRESOLVED, OTHER; cấm listingAction. RESOLVED nghĩa là kết luận xử lý hỗ trợ đã được thống nhất, không chứng nhận đã nhận hàng/đã hoàn tiền/đã trả tiền. UNRESOLVED ghi kết luận chưa thể giải quyết, vẫn không sửa trạng thái Order.
- REPORT giữ NO_ACTION, CORRECTION_REQUIRED, LISTING_HIDDEN, OTHER và quy tắc listingAction hiện có; mọi thay đổi Listing qua service kiểm duyệt hiện có.
- CLOSED không đổi status/assignment, không thêm bản gốc và không tự reopen. Replay quyết định hợp lệ trả kết quả cũ theo mục 7. Việc cần điều tra mới tạo Case mới nếu đủ điều kiện.

### 6.4. Assignment và truy cập sau đóng

Chỉ ADMIN giao/đổi/gỡ Support khi OPEN/IN_REVIEW, người được giao phải là User role SUPPORT hiện tại. Case.version là số nguyên không âm lấy từ version nghiệp vụ trong DTO, khởi tạo 0; expectedVersion bắt buộc là số nguyên không âm. Version thay đổi khi có bản gốc/bằng chứng/assignment/quyết định mới. expectedVersion sai trả 409, không âm thầm ghi đè.

Gán lại cùng Support là no-op nếu version khớp; không thêm audit giả. Đóng Case thu hồi ngay quyền Support dù assignedSupportId vẫn lưu để truy vết. Owner evidence vẫn đọc được ảnh của mình trong hạn lưu trữ; việc đóng Case không biến evidence thành public.

## 7. Idempotency, nguyên tử và cạnh tranh

- Scope key: `(actorId, operation, resourceId, key)`. Fingerprint gồm tên thao tác, target ID, type và payload allowlist chuẩn hóa; trim text, sort/deduplicate ID sau khi validate không trùng. Không dùng cùng key cho payload khác dù status đã thay đổi.
- Complaint/receipt/assignment/quyết định Order Case: K bắt buộc. Shipment idempotent tự nhiên theo cặp hãng/mã nên không thêm K bắt buộc vào PUT hiện có. REPORT decisions giữ body và no-key hiện có; nếu có K/expectedVersion thì validate và dùng, nếu thiếu vẫn dùng cập nhật trạng thái/version có điều kiện và trả 409 khi đã thay đổi, không tạo side effect trùng.
- Replay luôn cần auth/role/ownership hiện tại. Key/fingerprint phải khớp, không chạy lại audit/notification mutation; có thể trả trạng thái tài nguyên hiện tại kèm meta.idempotentReplay=true thay vì snapshot HTTP cũ. Không cấp lại địa chỉ đã mất quyền khi replay.
- Replay Complaint giữ complaintId/caseId và original details bất biến; caseStatus lấy hiện tại. Nội dung đã retention trả 410 CONTENT_REDACTED, không tạo lại Case. Receipt đã COMPLETED/receivedAt hợp lệ là no-op ngay cả key khác; key cũ khác payload vẫn conflict.
- Key có scope/unique index hoặc record bền vững theo nghiệp vụ; không chỉ cache trong process. Bản ghi replay không chứa response PII thô. Lỗi validation/điều kiện không được ghi là thành công; key đang xử lý có thể 409 OPERATION_IN_PROGRESS với Retry-After, client retry cùng key.
- Mutation ghi Order/Case/bản gốc/audit/notification cần thiết trong cùng transaction. Nếu audit/notification lỗi, rollback. Thông báo đóng vụ unique theo `(caseId,recipientId,type)`; bản tiếp nhận theo complaintId. Chưa cần gửi email hoặc queue mới.
- Tạo/append/đóng Case và giao/nhận/thu/hủy/hoàn COD phải cùng tranh một điểm ghi có điều kiện trên Order, ngay cả khi tạo Case không đổi Order.status. Không dựa riêng vào snapshot read của transaction hoặc query Case rồi ghi document khác để chống race.
- Điểm ghi chung dùng version key sẵn có `Order.__v`. Bước D áp dụng gate cho giao/nhận, các mutation COD và payment settlement; E/F dùng cùng gate khi tạo/bổ sung và quyết định Order Case. Giao/nhận cũng kiểm tra lại quyền SOLD/hold trước cập nhật, không tự sửa dữ liệu lệch.
- Contact/evidence/snapshot read của Support có kiểm tra assignment/role và gate chung với đổi assignment/đóng vụ, audit trước khi trả; nếu mutation thu hồi quyền thắng trước điểm cấp quyền đọc thì read phải bị từ chối/retry. Nếu read đã được cấp và audit trước khi thu hồi thì đó là lượt truy cập trước thu hồi hợp lệ; không hứa thu hồi byte đã gửi.
- Audit-read không làm thay đổi Case.version nghiệp vụ/hàng chờ chỉ vì có người xem. Gate đọc và version nghiệp vụ phải được triển khai sao cho không gây conflict giả cho form Admin.

## 8. DTO và ma trận quyền dữ liệu

| Nhóm | Buyer sở hữu | Seller của Order | ADMIN | SUPPORT được giao active Case |
| --- | --- | --- | --- | --- |
| Order thông thường | Theo API hiện có | Chỉ Order của Seller, địa chỉ theo canFulfill | Không mở quyền chung mới qua endpoint Buyer/Seller | Không mở quyền chung mới qua endpoint Buyer/Seller |
| Khiếu nại của Buyer | Bản gốc của mình + status/tóm tắt | Không có API xem Complaint chỉ vì là Seller | Đọc qua Case | Đọc qua Case theo DTO tối thiểu |
| Snapshot món và vận đơn | Order của mình | Order của mình | Đúng Case, đúng Order | Đúng Case, đúng Order; ảnh qua quyền media tương ứng |
| Trạng thái/tham chiếu thanh toán | Theo quyền Checkout/Order hiện có | Chỉ dữ liệu Order được cấp | Allowlist phục vụ Case; quyền tra cứu tài chính Admin hiện có giữ riêng | method, status, total/currency Order, merchant reference cần thiết của attempt liên quan; không tổng/đơn Seller khác hoặc raw event |
| ShippingAddress trong Case | Không cần đọc lại qua Case | Không được mở rộng từ Case | Chỉ contact-access active ORDER Case | Chỉ contact-access active ORDER Case |
| Evidence | Chỉ ảnh upload của mình/Complaint của mình | Không tự có quyền | Case trong thời hạn lưu | Được giao và active; thu hồi sau đóng/đổi người |
| InternalNote/quyết định nội bộ | Không | Không | Có | Không |
| Audit/history | Chỉ status/tóm tắt công khai | Không thêm API | Allowlist lịch sử của Case | Các mốc công khai của Case; không internalNote, lý do contact của người khác hoặc audit hệ thống đầy đủ |

**ComplaintReceipt:** complaintId, caseId, orderId, type, caseStatus, receivedAt. Không trả assignedSupportId, internalNote hoặc địa chỉ.

**BuyerComplaintDetail:** receipt + reasonCode/details/affectedOrderItemIds/evidenceMediaIds của chính bản gửi, createdAt, caseStatus, outcomeCode/outcomeSummary/closedAt công khai nếu CLOSED; không trả bản gốc người khác. Sau retention chỉ còn receipt tối thiểu và cờ contentRedacted, endpoint nội dung trả 410.

**CaseSummary:** caseId/type/targetType/targetId/status/version/assignedSupportId, reportCount hoặc complaintCount, createdAt/updatedAt/closedAt và outcomeCode/outcomeSummary đã lọc. List không kèm details/evidence/contact.

**AdminCaseDetail:** summary + original reports/complaints, snapshot items và mốc Order/payment theo allowlist, assignment history, quyết định và internalNote, audit mục tiêu đã lọc. Không có shippingAddress mặc định hoặc raw user/provider data.

**SupportCaseDetail:** summary + reason/details/evidence IDs của vụ được giao, ảnh snapshot và thông tin Order liên quan theo bảng trên; timeline chỉ actor loại/role và mốc xử lý cần thiết, không ghi chú nội bộ hoặc lịch sử vụ khác. Không có quyền đọc toàn Checkout dù biết checkoutId.

**ContactAccess:** chỉ recipient snapshot `{fullName,phone,address}` của đúng Order; không email đăng nhập, mật khẩu, contact của Seller khác hoặc User profile thô. reason phải mô tả nhu cầu nghiệp vụ, không sao chép PII vào reason. Mặc định chỉ dành DELIVERY/ITEM target ORDER; REPORT trả 409 CONTACT_ACCESS_NOT_APPLICABLE.

Contact không có grantId/token/TTL; quyền chỉ có hiệu lực cho lần response đó, `Cache-Control: private, no-store`. Lần đọc sau phải nêu reason và audit lại. Support mất role/assignment hoặc Case CLOSED thì trả 404 trước audit đọc thành công. Audit không ghi giá trị địa chỉ/điện thoại, chỉ field names và target; nếu audit không ghi được trả 503 AUDIT_UNAVAILABLE và không trả PII.

## 9. Bằng chứng, thông báo và dữ liệu bất biến

- Complaint lưu snapshot từ Order tại lúc nhận: OrderItem ID/listingId/versionId/title/category/size/condition/description/flaws/price/quantity/imageIds của các món liên quan; DELIVERY toàn Order, ITEM các món được chọn. Kèm method/status/paymentStatus/shipment/receipt tại lúc gửi và mã Order/Buyer/Seller. Địa chỉ vẫn nằm ở Order nguồn, không nhân bản vào Complaint.
- Điều tra hiển thị cả mốc snapshot khi gửi và trạng thái hiện tại có nhãn; sửa Listing hoặc snapshot Case không được sửa snapshot giá/thông tin món đã mua.
- Evidence bind vào đúng Case, kiểm tra owner/purpose và tham chiếu nguyên tử; không cho attach ảnh vụ khác hoặc trả đường dẫn file. Đọc ảnh riêng tư có quyền hiện tại/audit và no-store; Support đọc ảnh snapshot qua Case không mở quyền toàn bộ Listing.
- COMPLAINT_RECEIVED gửi đúng Buyer một lần/bản gốc; CASE_CLOSED gửi đúng mỗi người gửi một lần/Case. Nội dung chỉ xác nhận đã tiếp nhận hoặc outcomeSummary, không internalNote/contact. Schema Notification B phải hỗ trợ Order/complaint và REPORT cũ, không cần listingId giả.
- Các audit action mới dự kiến: COMPLAINT_CREATED, CASE_DETAIL_READ, CASE_SNAPSHOT_MEDIA_READ, MEDIA_PRIVATE_READ, CASE_RETENTION_APPLIED, bên cạnh CASE_ASSIGNED/REVIEW_STARTED/CLOSED/CONTACT_ACCESS_READ/EVIDENCE_READ hiện có. Enum/target cụ thể thực hiện ở B.
- Audit bắt buộc actorType/actorId đúng nguồn, target ID, caseId/orderId liên kết khi cần, requestId hoặc job runId, action/time và trạng thái trước/sau khi có đổi. Không lưu PII thô trong audit reason/fromState/toState.

## 10. Lỗi và thứ tự kiểm tra

| HTTP/code | Dùng khi |
| --- | --- |
| 401 UNAUTHORIZED | Không có session hợp lệ. |
| 403 FORBIDDEN / EMAIL_NOT_VERIFIED / INVALID_ORIGIN | Sai role trên route role, Buyer/Seller chưa xác minh hoặc Origin mutation sai. |
| 404 NOT_FOUND | ID route sai, không tồn tại hoặc không thuộc phạm vi hiện tại; Support mất assignment/Case đã đóng. |
| 422 VALIDATION_ERROR / INVALID_IDEMPOTENCY_KEY | Body/query sai schema, key sai/thiếu, reason/type/item không hợp lệ; item/evidence ngoài Order/quyền trả lỗi chung không tiết lộ chủ thật. |
| 409 ORDER_ON_HOLD | Payment/ownership hold hoặc active Case chặn giao/nhận/COD theo ma trận. Không tự gỡ hold. |
| 409 ORDER_NOT_FULFILLABLE / RECEIPT_NOT_ALLOWED / COMPLAINT_NOT_ALLOWED | Trạng thái/điều kiện thao tác không đúng. |
| 409 SHIPMENT_ALREADY_RECORDED | Shipment đã có nhưng payload khác. |
| 409 ACTIVE_CASE_TYPE_CONFLICT / COMPLAINT_LIMIT_REACHED | Đã có active Case khác type hoặc đạt 3 bản gốc/Case. |
| 409 CASE_VERSION_CONFLICT / CASE_NOT_ACTIVE / INVALID_STATE | Version cũ, Case đóng hoặc chuyển trạng thái sai; client tải lại. |
| 409 IDEMPOTENCY_CONFLICT / OPERATION_IN_PROGRESS | Key khác payload hoặc request cùng key đang xử lý; trường hợp đang xử lý có Retry-After. |
| 409 CONTACT_ACCESS_NOT_APPLICABLE | Case không target ORDER cho việc đọc địa chỉ nhận. |
| 410 CONTENT_REDACTED | Nội dung hồ sơ đã xử lý retention, không replay để tạo lại. |
| 429 RATE_LIMITED | Vượt quota theo thời gian hoặc cooldown, kèm Retry-After. |
| 503 AUDIT_UNAVAILABLE / SERVICE_UNAVAILABLE | Lỗi tạm thời, không trả PII hoặc ghi thành công giả. |
| 500 INTERNAL_ERROR | Lỗi chưa dự kiến, response không lộ stack/DB query/secret. |

Thứ tự nghiệp vụ sau middleware: xác thực/role → định dạng route và tài nguyên theo quyền → validate payload/key → tìm replay và so fingerprint → version/trạng thái/type/item/evidence/quota → transaction và kiểm tra lại → DTO theo quyền hiện tại. Validation cú pháp cấp middleware có thể xảy ra sớm hơn; không query/tiết lộ tài nguyên ngoài quyền. Replay không bỏ qua auth hoặc cấp PII theo response cũ.

## 11. Job nền, log và retention

### 11.1. Đối chiếu VNPAY và health

- Giữ worker độc lập `npm run worker:vnpay`, vòng quét nghỉ 10 giây giữa các cycle, batch hiện có 30; không hứa toàn bộ batch luôn hoàn tất trong 10 giây. Query timeout 10 giây, lease 30 giây và giới hạn QueryDr ≥5 phút 10 giây theo hợp đồng thanh toán giữ nguyên.
- Checkpoint nội bộ từ expiresAt: 0/+1/+3/+5 phút; checkpoint không chứng minh đã gọi cổng. Không attempt thì hết hạn bằng kiểm tra nguyên tử; attempt chưa rõ thì giữ khóa/NEEDS_REVIEW. Không gọi QueryDr dồn sau restart. COD không có timer 15 phút.
- Tắt VNPAY: không gọi cổng, không biến attempt thành thất bại/expired giả. Worker có thể xử lý an toàn Checkout VNPAY không có attempt theo logic hiện có; attempt cũ chưa rõ vẫn khóa và phải được quan sát.
- Health API hiện tại chỉ chứng minh API/DB. Bổ sung heartbeat worker được ghi tối đa mỗi 10 giây qua timer độc lập công việc dài; stale >60 giây là không khỏe. lastSuccessfulCycleAt, consecutiveFailures và backlog là chỉ số riêng; 3 cycle lỗi liên tiếp là degraded dù heartbeat còn chạy.
- Mỗi instance/run có ID; lease chống xử lý trùng; shutdown dừng nhận việc, lưu tiến độ an toàn. Retry DB/chu kỳ theo backoff 10/20/40/60 giây, tối đa 60; không dùng retry job để vượt cửa sổ QueryDr hoặc kết luận chưa thanh toán.
- Cảnh báo staging/demo bằng log có cấu trúc cho heartbeat stale, lỗi 3 cycle, backlog cần review; runbook M nêu người vận hành và lệnh kiểm tra. Health công khai chỉ trạng thái tổng quát, không trả ID/secret/backlog chi tiết cho Guest.

### 11.2. Log và audit

Log kỹ thuật: timestamp/level/requestId hoặc runId, method, route template, statusCode/durationMs, mã lỗi đã chuẩn hóa và các ID liên kết cần thiết. Không log nguyên req/res/error, query URL đầy đủ, body/header, cookie, mật khẩu/token/hash secret, dữ liệu thẻ hoặc shippingAddress. Log lỗi DB/duplicate key và upload phải lọc như luồng thành công. Free text complaint/internalNote/contact reason chỉ lưu trong dữ liệu nghiệp vụ có quyền, không copy ra console.

Audit mutation cùng transaction với thay đổi; audit đọc nhạy cảm ghi trước response. Audit là bằng chứng thao tác, không phải nguồn xác minh đã thanh toán. Không sửa/xóa audit bằng API người dùng. Retention được phép ẩn danh phần hồ sơ đã hết hạn theo mục 11.3; không áp tùy tiện lên audit tài chính.

### 11.3. Retention

- Thời hạn hồ sơ/bằng chứng: 12 tháng lịch UTC sau closedAt, cộng tháng có quy tắc kẹp ngày cuối tháng; Case active không đủ điều kiện. Job quét ít nhất mỗi ngày, xử lý trong 24 giờ sau mốc đủ điều kiện.
- Dọn details/internalNote/contact reason và evidence của Report/Complaint/Case cùng hồ sơ liên quan theo phạm vi đã hết hạn; có thể giữ tombstone ID/type/status/time/outcomeCode/contentRedacted không chứa nội dung cá nhân. Nội dung outcomeSummary/notification có thể chứa PII nên phải được rút gọn về thông báo đã lưu trữ khi hết hạn.
- Không xóa User/Order/Checkout/Payment/collection hoặc ảnh snapshot Order bằng chính sách Case. Media dùng chung chỉ xóa file khi không còn tham chiếu giữ lại từ Listing/Order/Case khác hoặc nghĩa vụ lưu trữ riêng; tham chiếu Case active luôn chặn xóa.
- Audit tài chính có chính sách riêng chưa chốt; các audit thuộc Case được giữ metadata truy vết tối thiểu, ẩn danh free text/PII hết hạn. Không dùng Case TTL xóa cha trước khi xử lý con/media.
- Batch 100 hồ sơ, timeout 30 giây cho thao tác I/O từng file, tối đa 3 lần retry/lượt rồi ghi lỗi an toàn để lượt sau tiếp tục; marker/cursor bền vững, idempotent, mặc định dry-run trong lệnh thủ công. Lỗi dọn file không làm xóa record tham chiếu trước khi hoàn tất hoặc mất khả năng chạy lại.
- Log kỹ thuật staging/demo: 30 ngày, bằng host retention/log rotation; không triển khai DB tài chính TTL theo mốc này. Backup phải có kiểm soát truy cập và thời hạn tương ứng được ghi ở runbook, không coi xóa online là đã xóa mọi bản backup.
- Chưa chạy xóa/migration DB thật ở A; K phải kiểm tra dry-run, mốc thời gian, tham chiếu dùng chung và chạy lại trên dataset riêng trước nghiệm thu vận hành.

## 12. Ví dụ và các kết quả bắt buộc

### 12.1. Khiếu nại hợp lệ

Order VNPAY PAID/PAID, chưa gửi, không hold, Buyer sở hữu; header `Idempotency-Key: delivery_order_001`:

```json
{
  "type": "DELIVERY",
  "reasonCode": "SELLER_NOT_SHIPPED",
  "details": "Đơn chưa được gửi, tôi cần kiểm tra lịch giao dự kiến.",
  "evidenceMediaIds": []
}
```

Lần đầu 201, replay 200 cùng complaintId/caseId, không thêm bản gốc/audit/notification. Thêm `affectedOrderItemIds: []` trả 422. COD CONFIRMED/UNPAID chưa gửi dùng cùng body hợp lệ; COD COLLECTED đã gửi phải dùng NOT_RECEIVED/DELIVERY_DELAYED/OTHER.

Order COMPLETED hợp lệ, ảnh do Buyer upload CASE_EVIDENCE, item lấy từ Order.items._id:

```json
{
  "type": "ITEM",
  "reasonCode": "NOT_AS_DESCRIBED",
  "details": "Áo có vết rách chưa được mô tả trong thông tin lúc mua.",
  "affectedOrderItemIds": ["507f1f77bcf86cd799439011"],
  "evidenceMediaIds": ["507f1f77bcf86cd799439012"]
}
```

Các ID trên chỉ minh họa định dạng; không phải fixture có thật. Nếu ID món thuộc Order khác hoặc là listingId trả 422; Order chưa COMPLETED trả 409 COMPLAINT_NOT_ALLOWED. Active DELIVERY chưa đóng không được đổi sang ITEM bằng payload này.

### 12.2. Phân công và đóng vụ

Assignment gửi K mới và `{assignedSupportId:"<SUPPORT_ID>",expectedVersion:0}`. Nếu Case version hiện không phải 0 trả 409; người nhận không còn SUPPORT trả 422. Nếu thành công, Support mới đọc được, Support cũ mất quyền request tiếp theo.

Admin chuyển Order Case OPEN → IN_REVIEW bằng K và `{status:"IN_REVIEW",expectedVersion:1}`; đóng bằng K khác và `{status:"CLOSED",outcomeCode:"RESOLVED",outcomeSummary:"Các bên đã thống nhất tiếp tục thực hiện việc giao nhận.",expectedVersion:2}` khi version thực tế khớp. Đóng không tạo shipment/receipt/refund hoặc thay paymentStatus.

### 12.3. Ca cạnh tranh phải chứng minh ở L

| Tình huống | Kết quả hợp lệ cần chứng minh |
| --- | --- |
| DELIVERY đua receipt | Case thắng: receipt bị chặn. Receipt thắng: DELIVERY mới bị từ chối do COMPLETED. Không đồng thời tạo DELIVERY mới và COMPLETED từ snapshot cũ. |
| DELIVERY đua shipment | Case thắng: shipment bị chặn. Shipment thắng: lý do SELLER_NOT_SHIPPED phải bị từ chối sau retry; NOT_RECEIVED vẫn có thể hợp lệ nếu chưa nhận. |
| ITEM đua thu COD | Nếu thu thắng trước, ITEM tạo sau với snapshot COLLECTED; nếu Case thắng trước, thu bị chặn. Không có thu mới xuyên qua active Case. |
| Complaint đua ACCEPT_RETURN | Case thắng thì ACCEPT_RETURN bị chặn; return thắng thì Order RETURNED, không nhận complaint mới. |
| Hai request tạo Case/bổ sung bản gốc | Một active target; quota không vượt; cùng key không nhân đôi; bản gốc không bị ghi đè. |
| Đổi Support/đóng vụ đua contact/evidence | Điểm cấp quyền đọc và audit xác định trước/sau thu hồi; thu hồi thắng trước thì không trả dữ liệu. |
| Audit/notification lỗi | Mutation rollback; đọc PII fail-closed; không có bản gốc/Case/tác dụng phụ dở dang. |
| Worker hết hạn đua IPN/attempt | Giữ hợp đồng settlement cũ; không giải phóng sai chủ, không hết hạn COD hoặc kết luận chưa trả từ timeout. |

## 13. Phi chức năng, bằng chứng Bước A và bàn giao bước tiếp

Quy mô nghiệm thu MVP: 20 người dùng đồng thời trong 10 phút, 1.000 tin mẫu theo tài liệu hiệu năng; bổ sung dataset 1.000 Case gồm cả active/closed và 3 bản gốc mỗi Case để đo hàng chờ. Mục tiêu hàng chờ Admin/Support và chi tiết Case: p95 ≤3 giây, lỗi ứng dụng không dự kiến <1%; lỗi 4xx có chủ đích đo riêng. Ảnh và độ trễ cổng không gộp vào độ trễ JSON của Case. Đây là mục tiêu, chưa có kết quả đo.

Backend duy trì code/contract/index/migration/runbook; người vận hành cấu hình API/worker/media volume, retention log, backup và cảnh báo. Không có yêu cầu độ sẵn sàng production hay hạ tầng phân tán mới. Bước M phải ghi lệnh chạy, trách nhiệm vận hành và phần chưa nghiệm thu sau deploy.

**Bằng chứng A:** đã đọc code Order/Case/Report/Notification/Media/AuditEvent, route commerce/moderation/media, middleware auth, idempotency helper, service giao nhận/COD và worker đối chiếu; đối chiếu với docs và A-09. Rà soát đường dẫn tài liệu và consistency của contract. Không chạy test ứng dụng, DB, migration hoặc giao dịch VNPAY thật vì A chỉ chốt tài liệu.

**Khoảng cách ban đầu ghi nhận tại A:** Case DTO/version/assignment behavior; gate chống race Order/Case/quyền media; route Complaint/Admin/Support/contact; lọc log; heartbeat/retention. Sau các bước E–H, các phần Case DTO/gate/Complaint/Admin/Support/contact/media đã có code; lọc log, heartbeat và retention vẫn còn ở J/K. Schema có enum hoặc middleware có role không tự chứng minh nghiệm thu.

**Bàn giao sau A:** B đã áp dụng trên DB local; báo cáo C và D lần lượt ở mục 15 và 16.

## 14. Kết quả B — Dữ liệu, chỉ mục và dữ liệu cũ

### Schema và đăng ký model

- Thêm model `Complaint` riêng với Report, liên kết Case/Order/Checkout/Buyer/Seller; lưu type/reason/details, OrderItem bị ảnh hưởng, bằng chứng và snapshot món/trạng thái lúc gửi. Snapshot không chứa địa chỉ. Idempotency key/fingerprint có unique index theo Buyer + Order + key.
- Mở rộng Case với version nghiệp vụ, lịch sử assignment và thông tin replay cho decision; outcome được ràng buộc theo REPORT hoặc khiếu nại Order. Thêm index cho active target, hàng chờ Admin/Support, lịch sử mục tiêu và Case.
- Notification hỗ trợ target Listing hoặc Order/Complaint, có dedupe key; AuditEvent có action/target phục vụ Complaint, truy cập Case/media và retention; Media có liên kết Case và index evidence.
- Server và seed khởi tạo Complaint cùng các model liên quan. Thêm `npm run audit:fulfillment-data` để kiểm kê chỉ đọc và `npm run migrate:fulfillment-data` cho migration có dry-run mặc định, yêu cầu backup đã xác minh khi apply.

### Backup và điều kiện trước khi áp dụng

- Backup nén được tạo với quyền file `0600`, thư mục `0700` tại `/tmp/rewear-circle-backups/20261029-fulfillment/rewear_circle.archive.gz`; `mongorestore --dryRun` đọc archive thành công.
- MongoDB local là replica set hỗ trợ transaction; không có tiến trình API Node đang chạy trong lúc migration.
- Dry-run tìm đúng một Checkout cũ `COMPLETED` với một Order `PLACED/COD/UNPAID`; Buyer khớp, snapshot món Checkout và Order trùng, tổng Order khớp các item, địa chỉ Order đầy đủ và nhất quán. Không có PaymentAttempt/COD collection. Hạn giữ đã qua.

### Thay đổi đã áp dụng và audit hậu kiểm

- Tạo đủ index vật lý cho Case, Complaint, Media, Notification, Report và AuditEvent; post-audit báo `missing: []`, `obsolete: []` cho tất cả nhóm.
- Trong một transaction: khôi phục subtotal/shipping fee/total và địa chỉ Checkout từ snapshot Order nhất quán; chuyển Checkout và Order sang `CONFIRMED/COD/UNPAID`, đặt `contractVersion=1`, xóa hạn giữ COD cũ đã hết, cập nhật tổng COD chưa thu; gắn `soldCheckoutId` cho Listing duy nhất. Ghi AuditEvent `LEGACY_CHECKOUT_MIGRATED`.
- Post-audit xác nhận Checkout/Order đều `CONFIRMED/COD/UNPAID`, tổng khớp, snapshot người nhận có đủ, Listing được gắn đúng Checkout, không có PaymentAttempt và có đúng 1 AuditEvent migration. Dry-run migration chạy lại cho `candidates: 0`.
- Còn một Listing `SOLD` không được Order nào tham chiếu. Giữ nguyên trạng thái SOLD và để trống `soldCheckoutId`; không thể suy ra Checkout từ dữ liệu hiện có.

**Trạng thái nghiệm thu B:** hoàn tất trên DB local theo phạm vi dữ liệu có căn cứ. Record Listing SOLD mồ côi đã được phân loại và giữ nguyên an toàn; không áp dụng dữ liệu lên môi trường production. Không chạy test ứng dụng trong bước này.

## 15. Kết quả C — Quyền theo Order/Case và DTO

### Quyền Order và Checkout

- Route mua/bán, giỏ, Checkout và Order dành cho tài khoản `USER`; `ADMIN`/`SUPPORT` không dùng route người mua/người bán để đọc hoặc thay đổi dữ liệu. Truy cập Order ngoài quyền trả 404. API tra cứu thanh toán/thu COD vẫn nằm sau `requireAdmin`; Support không được nâng quyền qua các endpoint này.
- Truy vấn danh sách dùng `buyerId` hoặc `sellerId` lấy từ session hiện tại. `GET /orders/:id` lọc `_id` cùng Buyer/Seller hiện tại trong query; không lấy chủ thể từ query/body.
- `OrderDTO` chỉ trả các field được liệt kê; từng OrderItem được chuyển qua serializer dùng chung, địa chỉ chỉ gồm `fullName`, `phone`, `address` và chỉ xuất hiện khi Buyer sở hữu đơn hoặc Seller đủ điều kiện giao. Bỏ `paymentReviewReason` khỏi DTO thường; không trả nguyên subdocument.
- Admin có `GET /admin/cases/:caseId` cho REPORT và DELIVERY/ITEM. Với Case Order, query Order bằng đúng `Case.targetId`; trả snapshot, vận đơn, trạng thái/tham chiếu thanh toán và collection của đúng Order. Không trả địa chỉ, toàn Checkout, số tiền Checkout có thể gồm Seller khác, PaymentEvent thô hay trường idempotency nội bộ. Chi tiết Case ghi `CASE_DETAIL_READ` trước response và đặt `Cache-Control: private, no-store`.

### Quyền ảnh riêng tư

- Người dùng thường chỉ đọc ảnh do mình tải lên, ảnh snapshot của Order mình là Buyer/Seller, hoặc ảnh công khai theo Listing đã duyệt/đang hiển thị.
- Support chỉ đọc evidence của Case đang `OPEN/IN_REVIEW` được giao đúng cho Support hiện tại. Ảnh snapshot Order yêu cầu Case đang được giao và complaint gắn đúng Order; với ITEM, ảnh còn phải thuộc OrderItem bị ảnh hưởng. Mỗi lần đọc được audit.
- Admin đọc evidence/snapshot qua Case tương ứng; ảnh Listing ẩn chỉ đọc được qua Case REPORT liên quan. Không có Case phù hợp thì trả 404.
- Đọc ảnh private được audit trước khi gửi và dùng `Cache-Control: private, no-store`; assignment hoặc role được đọc lại từ MongoDB ở request kế tiếp nên quyền cũ không được giữ trong session.

### Ma trận truy cập chéo để nghiệm thu

| Tình huống | Kết quả mong đợi |
| --- | --- |
| USER Buyer/Seller xem Order thuộc mình | Chỉ đúng Order đó; field theo OrderDTO và quyền địa chỉ |
| USER khác gọi `/orders/:id` hoặc `/checkouts/:id` | 404, không tiết lộ tài nguyên tồn tại |
| SUPPORT gọi route Order/Checkout, giỏ hoặc API Admin payment/COD | 404 ở route USER; 403 ở route Admin |
| SUPPORT đọc evidence/snapshot của Case chưa giao, đã đóng hoặc đã giao cho người khác | 404; không stream file và không ghi audit thành công |
| SUPPORT đọc ảnh snapshot Item không thuộc `affectedOrderItemIds` | 404 |
| SUPPORT được giao active Case, đọc evidence hoặc snapshot đúng vụ | Được phép; audit có actor, media, Case và requestId; response no-store |
| Role SUPPORT bị gỡ hoặc assignment đổi/gỡ rồi request ảnh lại | Request kế tiếp bị từ chối theo dữ liệu role/assignment mới |
| ADMIN đọc Order Case | Chỉ Order gắn với `Case.targetId`; không có địa chỉ hoặc Checkout/Order Seller khác |

**Phạm vi còn ở bước sau:** hàng chờ/assignment/quyết định Admin cho DELIVERY/ITEM thuộc F; API danh sách/chi tiết Support và contact-access thuộc G; luồng upload→complaint→evidence→notification hoàn chỉnh thuộc H. Chưa có API Support Case detail để đọc snapshot qua response DTO; hiện C đã khóa đường truy cập trực tiếp Order và ảnh.

**Trạng thái C:** hoàn tất phần triển khai quyền và DTO; chưa chạy kiểm thử API hoặc kiểm thử chéo tài khoản. Các ca trên được đưa vào regression Bước L. Đã chạy `node --check` cho bốn file backend liên quan và `git diff --check`, đều qua; không thay đổi dữ liệu MongoDB trong bước này.

## 16. Kết quả D — Giao hàng và xác nhận đã nhận

### Điều kiện và dữ liệu ghi

- `PUT /orders/:id/shipment` chỉ nhận `{carrierName,trackingCode}`; trim, giới hạn 2–100 và 3–100 ký tự, từ chối ký tự điều khiển C0/C1. Không nhận trạng thái, thanh toán hoặc thời điểm từ client; `shippedAt` do máy chủ ghi.
- Có thể ghi vận đơn mới khi VNPAY là `PAID/PAID` hoặc COD là `CONFIRMED/UNPAID`. COD `COLLECTED` không được ghi vận đơn mới; nếu đã có cùng cặp hãng/mã thì replay trả kết quả cũ, cặp khác trả `409 SHIPMENT_ALREADY_RECORDED`.
- Điều kiện giao/nhận còn yêu cầu Order không `NEEDS_REVIEW`/payment hold, không có active Case, mọi Listing vẫn `SOLD` đúng Checkout và đúng Seller, Listing không có payment hold. Với COD `COLLECTED`, collection phải khớp đúng Order/Buyer/Seller/số tiền/tiền tệ và đã có `shippedAt`.
- `POST /orders/:id/receipt-confirmation` chỉ nhận body rỗng và Buyer của đúng Order. Chỉ VNPAY `PAID/PAID` hoặc COD `CONFIRMED/UNPAID|COLLECTED` đã gửi mới được xác nhận; cập nhật `COMPLETED`/`receivedAt` do máy chủ ghi, giữ nguyên payment status và không tự thu COD.
- Order DTO giữ allowlist, `canFulfill` cùng `canShip`/`canConfirmReceipt` dùng chung quy tắc trạng thái với service ghi. Case/hold/sai quyền Listing làm các cờ phù hợp thành false.

### Replay, audit và tranh chấp đồng thời

- Gửi lại cùng vận đơn không ghi lại `shippedAt` hoặc audit; payload khác sau khi đã ghi vận đơn trả conflict. Receipt hoàn tất được replay an toàn, không sửa `receivedAt` hoặc payment status, không tạo audit lần hai.
- Ghi Order và audit `ORDER_SHIPPED`/`ORDER_RECEIVED` nằm cùng MongoDB transaction; update có điều kiện nên lỗi audit hoặc dữ liệu đổi làm rollback.
- Dùng version key sẵn có `Order.__v` làm write gate qua `orderWrite()`: shipment/receipt, hủy/thu COD/yêu cầu và chấp nhận hoàn COD cùng các thay đổi Order từ checkout/payment settlement đều tăng version. Nếu tài liệu cũ chưa có version key, lần ghi đầu tiên đặt version về 1.
- **Điều kiện bắt buộc cho E/F:** tạo hoặc đóng Order Case phải tranh cùng gate `Order.__v`; nếu không, race giữa mở/đóng khiếu nại với giao/nhận vẫn chưa được khép kín.

### Ma trận hồi quy cần chạy ở L

| Trường hợp | Kết quả mong đợi |
| --- | --- |
| Seller đúng Order; VNPAY `PAID/PAID`; món còn SOLD đúng Checkout | Ghi shipment một lần; có `shippedAt` do server và audit cùng transaction |
| Seller đúng Order; COD `CONFIRMED/UNPAID` | Ghi shipment; payment giữ `UNPAID` |
| COD `CONFIRMED/COLLECTED` đã gửi, collection đúng | Buyer xác nhận nhận được; Order thành `COMPLETED`, payment vẫn `COLLECTED` |
| Sai cặp trạng thái, payment review, Listing đổi quyền sở hữu, hoặc active Case | Từ chối; không ghi vận đơn/receipt/audit dở dang |
| User ngoài Buyer/Seller, Support/Admin dùng route USER | 404 trước khi tiết lộ Order |
| Gửi cùng vận đơn/receipt lại | Trả kết quả hiện tại, không nhân đôi audit và không đổi thời điểm |
| Hai transaction tranh shipment/receipt/thu COD/mở Case | Chỉ transaction thắng version gate được commit; bên thua nhận conflict, tải lại trạng thái và gửi lại nếu còn hợp lệ |

**Trạng thái D:** hoàn tất phần triển khai; chưa chạy test API hoặc race test. Đã chạy `node --check` và `git diff --check`, không lỗi; không thay đổi dữ liệu MongoDB. Các kiểm thử ma trận/race được giữ cho Bước L.

## 17. Kết quả E — Tiếp nhận và theo dõi khiếu nại

### API, quyền và điều kiện nghiệp vụ

- `POST /orders/:id/complaints` chỉ dành cho Buyer `USER` sở hữu Order và đã xác minh email. Body allowlist là `type`, `reasonCode`, `details`, `evidenceMediaIds` và `affectedOrderItemIds` chỉ với ITEM; khóa `Idempotency-Key` bắt buộc.
- DELIVERY kiểm tra VNPAY `PAID/PAID`, COD `CONFIRMED/UNPAID|COLLECTED` và ngoại lệ COD `NEEDS_REVIEW` có yêu cầu hoàn đúng Order đang `OPEN/REJECTED`; mọi trường hợp đều chưa nhận, đúng reason, không hold, Listing còn thuộc Seller/Checkout. COD đã thu cần collection hợp lệ và đã gửi.
- ITEM chỉ sau `COMPLETED` với `receivedAt`, trạng thái thanh toán hợp lệ và mọi Item ID phải là OrderItem thật trong Order. Cả hai loại lưu snapshot món; DELIVERY lưu toàn Order, ITEM chỉ lưu món được chọn. Không sao chép địa chỉ.
- Evidence phải là ảnh `CASE_EVIDENCE` thuộc Buyer, tối đa 5, chưa gắn Case khác; binding vào Case, Complaint, quota, audit và thông báo nằm cùng transaction. Lỗi audit/notification sẽ rollback.

### Case, idempotency và theo dõi của Buyer

- Tạo Case active hoặc nối thêm bản gốc cùng type; type đang active khác bị từ chối. Tối đa 3 bản/Case, tối đa 5 bản mới trong 24 giờ/Buyer và cooldown 24 giờ cho cùng type/Order sau khi đóng. `ComplaintQuota` lưu mốc gửi gần đây và dùng unique Buyer cùng optimistic concurrency để tránh vượt quota đồng thời.
- Order `__v` được tăng qua `orderWrite()` trước khi ghi Case, nên tạo Case tranh cùng điểm ghi với shipment, receipt, payment settlement và COD. Order Case detail/assignment/decision cũng sử dụng gate ở F.
- Cùng key/payload replay trả ID gốc và trạng thái Case hiện tại; sai fingerprint trả conflict. Bản mới lưu snapshot, audit `COMPLAINT_CREATED` và notification `COMPLAINT_RECEIVED` trong một transaction.
- Buyer có `GET /orders/:id/complaints` (lọc type/status, phân trang) và `GET /orders/:id/complaints/:complaintId`; detail chỉ hiện bản gửi của Buyer, trạng thái và kết quả công khai khi đóng. Các cờ Order DTO `canComplainDelivery`/`canComplainItem` phản ánh trạng thái, hold, Case, cooldown và quota; server vẫn kiểm tra lại khi ghi.

**Giới hạn còn lại:** Bước E thêm unique index cho collection `ComplaintQuota`; index mới hiện chỉ có trong schema/script, chưa áp dụng hoặc audit trên MongoDB local. Preflight read-only và dry-run ngày 29/10 không kết nối được `127.0.0.1:27017` (`MongooseServerSelectionError`/`EPERM`), nên tôi không tạo backup mới hay ghi index/migration trong lượt này. Không có DB write trong E/F. Regression cho quyền, quota, retry, song song tạo Case và shipment/receipt được giữ cho L.

## 18. Kết quả F — Hàng chờ, phân công và quyết định Admin

- `GET /admin/cases` hỗ trợ REPORT/DELIVERY/ITEM, trạng thái, Support được giao hoặc `unassigned`, phân trang giới hạn và sort ổn định; hàng chờ chỉ trả summary/version/count, không trả details/evidence/address.
- `PATCH /admin/cases/:caseId/assignment` yêu cầu Admin, `Idempotency-Key`, Support đang có role SUPPORT và `expectedVersion`. Giao/đổi/gỡ cập nhật assignment history, nghiệp vụ version và audit cùng transaction; Case CLOSED hoặc version cũ bị từ chối. Gán lại cùng người đúng version là no-op, không tạo audit giả.
- `/admin/cases/:caseId/decisions` giữ payload cũ cho REPORT. DELIVERY/ITEM yêu cầu expectedVersion và key, chỉ nhận outcome `NO_ACTION|RESOLVED|UNRESOLVED|OTHER`, cấm `listingAction`; chỉ REPORT mới gọi service ẩn/hiện Listing.
- Chuyển trạng thái chỉ `OPEN → IN_REVIEW → CLOSED`. Mỗi quyết định tăng Case version; với Order Case còn tăng `Order.__v` trong transaction. Đóng vụ thông báo tối đa một lần/người gửi/Case nhờ dedupe key; nội dung không có internalNote.
- Đóng DELIVERY/ITEM không sửa Order status/payment, Checkout, Listing, thu/hoàn tiền hoặc quyền hàng; chỉ thay Case, audit và notification. Admin detail hiện có từ C trả đúng Order cùng snapshot/complaints và payment reference đã lọc, không trả shipping address hoặc PaymentEvent thô.

**Trạng thái F:** code và hợp đồng đã đồng bộ; regression REPORT cũ, phân công cạnh tranh, decision replay/stale version, notification dedupe và Order gate chờ L. Không chạy kiểm thử ứng dụng hoặc thao tác MongoDB trong bước E/F.

## 19. Kết quả G — API Support và truy cập liên hệ

- `GET /support/cases` chỉ dùng Support ID lấy từ session/DB hiện tại; nhận type/status/page/limit theo allowlist, chỉ trả vụ OPEN/IN_REVIEW đang được giao. `GET /support/cases/:caseId` trả bản gốc và dữ liệu tối thiểu theo loại Case; Order Case chỉ chứa Order đúng target, snapshot khi gửi, vận đơn và tham chiếu/trạng thái PaymentAttempt đã lọc. DTO không có địa chỉ, `internalNote`, Checkout tổng hoặc PaymentEvent thô.
- Support REPORT xem thông tin tin và phiên bản liên quan; Support DELIVERY/ITEM xem các complaint cùng snapshot đúng phạm vi. Không có mutation Support để phân công, quyết định, sửa Order, thanh toán hoặc vận đơn.
- `POST /support/cases/:caseId/contact-access` và endpoint Admin tương ứng chỉ mở địa chỉ cho Case DELIVERY/ITEM active gắn Order. Response gồm `fullName`, `phone`, `address` của đúng Order, đặt `private, no-store`; Case detail mặc định không có contact. Request chỉ nhận `{reason}`; validator từ chối email/số điện thoại hiển nhiên, còn lý do text tự do không thể lọc chắc chắn mọi cách ghi địa chỉ.
- Đọc detail/contact dùng transaction: role hiện tại được đọc lại trong DB, Support phải còn được giao Case active; User và Case có write fence để cạnh tranh assignment/đóng/đổi role tạo write conflict. Audit nằm trong cùng transaction và hoàn tất trước khi response; audit lỗi làm hủy response nhạy cảm. Quyền bị kiểm tra lại ở request sau, không hứa thu hồi dữ liệu đã gửi trước đó.

**Trạng thái G:** code và hợp đồng hoàn tất; truy cập chéo, mất role/assignment, đóng Case cạnh tranh và audit failure chưa chạy API regression, để ở L. Trong lượt triển khai không gọi API, không ghi trực tiếp MongoDB, không chạy migration hoặc tạo index; khi API được gọi, audit và access fence được ghi cùng transaction.

## 20. Kết quả H — Media riêng tư và thông báo

- Luồng E đã bind ảnh CASE_EVIDENCE thuộc người gửi vào Media, Complaint và Case trong một transaction. Upload evidence chỉ cho role USER; mục đích, chủ ảnh và binding Case được kiểm tra trước khi lưu khiếu nại.
- Quyền đọc trực tiếp `/media/:id` được phân theo ảnh: chủ ảnh đọc ảnh mình tải; Admin đọc theo Case; Support chỉ đọc Case đang được giao. Evidence phải thuộc Case; Order snapshot phải thuộc đúng Order và ảnh ITEM phải thuộc OrderItem bị ảnh hưởng. Với REPORT, Support/Admin chỉ đọc ảnh của phiên bản liên quan (approved, nếu có; nếu không là bản mới nhất), kể cả tin bị ẩn. Mọi đường media riêng tư ghi audit trước stream, trả `private, no-store` và kiểm tra quyền lại mỗi request; media ID không phải grant.
- Notification list/read dùng DTO allowlist, bỏ `recipientId`/`dedupeKey`; target ID chỉ gồm loại phù hợp, `reason` chỉ xuất hiện ở loại LISTING. Notification đóng Case dùng câu cố định để không chèn `internalNote` hoặc dữ liệu riêng tư vào message; kết quả công khai được Buyer xem qua API Case. Receipt/close, audit, Case và các bản gốc được ghi trong transaction; unique dedupe key bảo vệ notification đóng vụ khỏi lặp.
- H cập nhật API Routes, Security & Privacy, kế hoạch và báo cáo tổng theo hành vi code. Không thay đổi dữ liệu MongoDB hoặc apply index trong H.

**Trạng thái H:** code và tài liệu hoàn tất; upload→complaint→media, quyền trực tiếp, cache và notification replay chưa chạy regression tích hợp, để ở L. Trong lượt triển khai không gọi API, không ghi trực tiếp MongoDB hoặc chạy migration; chưa chạy kiểm thử ứng dụng.

