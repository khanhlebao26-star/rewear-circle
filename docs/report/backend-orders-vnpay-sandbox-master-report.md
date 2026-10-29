# Báo cáo tổng — Backend đơn hàng, VNPAY Sandbox và COD

**Ngày cập nhật:** 29/10/2026  
**Trạng thái:** Merchant Sandbox đã cấp thông tin và cấu hình local được bật. Backend từ worktree `w2-be` đang chạy cổng 4000; tunnel công khai trả trang Return đúng và worker đã kết nối MongoDB. IPN URL trong SIT chưa được xác nhận và chưa có giao dịch Sandbox thật. C có schema/index definitions nhưng migration DB cũ chưa chạy. D–J đã có code; K đạt trên MongoDB replica set tạm. L (giao dịch thật) và M (bàn giao đầy đủ) còn mở.
**Phạm vi đợt cập nhật:** Hoàn thiện Return URL và fail-fast validation cho cấu hình VNPAY, cập nhật hướng dẫn môi trường; không kết nối DB dự án để migration và chưa thể chạy giao dịch Sandbox thật trong phiên này.

## 1. Mục đích và cách cập nhật

Đây là báo cáo tổng riêng của cụm đơn hàng và thanh toán. Sau mỗi bước, cập nhật mục tiến độ, file đã thay đổi, kiểm thử thực sự đã chạy, kết quả và giới hạn còn lại. Không ghi một bước hoàn tất chỉ vì đã có schema hoặc test giả lập.

Kế hoạch thực hiện: [Kế hoạch backend đơn hàng và VNPAY Sandbox](../../plan/tuan-2-don-hang-vnpay-sandbox-backend.md).

Nguồn nghiệp vụ: BR-ORDER-001–005, BR-PAYMENT-001–010; State Lifecycles mục 8–9; hợp đồng ORD-04–08 và PAY-01–05. Những quyết định dưới đây cụ thể hóa các phần API/dữ liệu còn mơ hồ; khi triển khai phải đồng bộ tài liệu nếu thay đổi quyết định.

**Ranh giới:** Bao gồm checkout, đơn mua/bán, VNPAY với một attempt thanh toán tổng, IPN/QueryDr/đối chiếu; COD với xác nhận thu tiền theo Order, hủy trước gửi và xử lý hàng COD hoàn về. Có API vận đơn/nhận hàng tối thiểu để COD chạy xuyên suốt; không tích hợp API hãng vận chuyển. Khiếu nại DELIVERY/ITEM, phân công Support, payout, production và hoàn tiền tự động thuộc phạm vi khác. Demo dùng dữ liệu và tiền giả.

**Phạm vi quy tắc cũ:** A-01–A-08, bảng trạng thái/mapping/ACK ở mục 5–7 mô tả nhánh VNPAY, trừ phần snapshot, quyền sở hữu và idempotency dùng chung. A-09 dưới đây bổ sung và thay thế các điều kiện trước đó vốn giả định mọi Checkout đều thanh toán trực tuyến. Không áp dụng 15 phút, một attempt, PAID trước giao hoặc QueryDr cho COD.

## 2. Kết quả khảo sát code tại Bước A

| Hiện trạng đã đọc | Quyết định cần thực hiện ở các bước sau |
| --- | --- |
| `POST /checkouts` lưu selection/snapshot, giữ món nhưng chưa tạo Order hoặc nhận địa chỉ. | Đổi route này thành điểm xác nhận mua duy nhất: tạo Checkout và Order PENDING, snapshot, tổng và địa chỉ trong transaction. |
| `/checkouts/:id/confirm` gọi `confirmCheckout.js`, trực tiếp SOLD và tạo đơn COD chưa trả. | Ngừng nghiệp vụ cũ; chỉ service xử lý kết quả cổng đã xác minh được thực hiện settlement. |
| Checkout dùng OPEN/COMPLETED; Order dùng PLACED/COD/UNPAID. | Chuyển sang trạng thái mục 5. Dữ liệu cũ không tự được coi là đã thanh toán VNPAY. |
| `releaseExpired()` tự giải phóng theo giờ; `availableStates()` cho chiếm reservation quá hạn. | Bỏ cả hai lối mở bán theo đồng hồ. Chỉ giữ món AVAILABLE đã được giải phóng an toàn. |
| Chưa có Payment, payment event hoặc worker đối chiếu. | Bổ sung dữ liệu lưu bền, unique index và xử lý kết quả chung cho IPN/QueryDr. |
| AuditEvent bắt buộc actorId User và chỉ hỗ trợ enum kiểm duyệt. | Mở rộng có kiểm soát cho CHECKOUT/ORDER/PAYMENT và actor USER/PROVIDER/SYSTEM; không giả một User để ghi job/cổng. |
| Media đọc Checkout theo OPEN/COMPLETED; Listing chưa giữ dấu vết chủ món sau SOLD. | Cập nhật quyền snapshot theo trạng thái mới; có dữ liệu xác định Checkout nhận món và các Checkout đang làm món bị payment hold. |

File đã đối chiếu: `models/commerce.js`, `models/Listing.js`, `models/AuditEvent.js`, `services/confirmCheckout.js`, `routes/commerce.js`, `domain/commerceRules.js`, `routes/media.js`, `http/responses.js`, `app.js`, `server.js` trong `backend/src` và tài liệu ORD/PAY hiện có.

## 3. Các quyết định đã khóa

### A-01 — Một điểm tạo Checkout và Order

`POST /api/v1/checkouts` là điểm Buyer xác nhận mua. Request có danh sách món kèm giá/version đã xem, paymentMethod và thông tin nhận hàng. Một MongoDB transaction kiểm tra toàn bộ món, giữ món, tạo Checkout, tạo một Order cho mỗi Seller và ghi snapshot. Một món không hợp lệ làm toàn bộ thao tác rollback.

Thời gian giữ bắt đầu tại `createdAt` của Checkout do server xác định trong lần tạo đầu; `expiresAt = createdAt + 15 phút`. Gửi lại request hoặc tạo URL thanh toán không gia hạn. Tổng Checkout bằng tổng Order; phí ship Buyer bằng 0 theo BR-ORDER-005.

`POST /checkouts/{id}/confirm` bị ngừng và code hiện trả `410 ENDPOINT_RETIRED`; không tạo đơn hoặc SOLD. Cần đồng bộ frontend và test trong các bước bàn giao/kiểm thử.

### A-02 — Request chuẩn và idempotency

Header bắt buộc cho tạo Checkout và tạo attempt: `Idempotency-Key`, chuỗi 8–100 ký tự `[A-Za-z0-9_-]`. Danh tính từ session. Không nhận `requestKey`, `listingIds`, `buyerId`, tổng tiền hoặc trạng thái từ body của hợp đồng mới; payload cũ trả `422 VALIDATION_ERROR` sau khi chuyển đổi.

Body tạo Checkout:

```json
{
  "items": [
    {
      "listingId": "ObjectId dạng chuỗi",
      "expectedPrice": 120000,
      "expectedVersionId": "ObjectId dạng chuỗi"
    }
  ],
  "recipientName": "Người nhận demo",
  "paymentMethod": "VNPAY",
  "recipientPhone": "0900000000",
  "recipientAddress": "Địa chỉ giả dùng kiểm thử"
}
```

`items` có 1–20 phần tử, không trùng Listing; expectedPrice là số nguyên VND. Snapshot và tổng vẫn lấy từ DB. Giá lệch trả `PRICE_CHANGED`; version lệch trả `LISTING_VERSION_CONFLICT`; client cần lấy lại thông tin và xác nhận bằng request/key mới.

Địa chỉ được trim, chuyển sang cấu trúc nội bộ `shippingAddress.fullName/phone/address` và kiểm tra bằng giới hạn hiện có: tên 2–100 ký tự, điện thoại 9–15 chữ số với dấu `+` tùy chọn, địa chỉ 10–500 ký tự. Chỉ nhận các trường đã công bố.

Phạm vi key là `(buyerId, operation, key)`; operation tạo Checkout khác tạo attempt. Lưu fingerprint từ dữ liệu chuẩn hóa: sắp items theo listingId, chuẩn hóa ID, địa chỉ và paymentMethod; fingerprint attempt chứa checkoutId. Cùng key/cùng fingerprint trả tài nguyên cũ `200`, không giữ món/tạo đơn/dọn giỏ lần hai. Khác fingerprint trả `409 IDEMPOTENCY_CONFLICT`.

Đọc bản ghi idempotency sau xác thực/quyền và trước khi kiểm lại giá hiện tại. Request đã thành công vẫn trả đúng Checkout cũ dù Listing đã đổi hoặc Checkout đã kết thúc. Key được giữ cùng vòng đời hồ sơ trong MVP, không xóa bằng TTL khi giao dịch còn có thể nhận kết quả muộn.

### A-03 — Một attempt trên một Checkout

Đối với VNPAY, Payment và payment attempt là cùng một hồ sơ; `attemptId` là ID Payment. Unique index trên checkoutId ngăn attempt thứ hai dù client đổi key. Payment lấy amount/currency từ Checkout đã lưu; currency cố định `VND`, tổng là số nguyên an toàn. COD dùng bản ghi xác nhận thu riêng theo Order ở A-09, không tạo Payment VNPAY hoặc gán provider giả.

Tạo attempt chỉ khi paymentMethod=VNPAY và Checkout PENDING_PAYMENT, chưa quá hạn, đúng Buyer đã xác minh email và mọi reservation còn thuộc Checkout. Tạo attempt và hủy dùng cùng điều kiện/version Checkout trong transaction để chỉ một thao tác thắng.

Attempt INITIATED được lưu cùng reference trước khi cấp URL. Hoàn tất tạo URL chuyển PENDING; lỗi tạo URL chỉ cho retry cùng attempt/key, không sinh reference khác. Lặp đúng key trả hồ sơ cũ; URL chỉ trả khi Checkout còn đủ điều kiện chuyển sang cổng, kèm `canRedirect`. Attempt đã kết thúc hoặc hết giờ trả `paymentUrl=null`, `canRedirect=false`. Key mới trên Checkout đã có attempt trả `409 PAYMENT_ATTEMPT_EXISTS`.

### A-04 — Snapshot, giỏ và định danh

OrderItem có ID ổn định, quantity=1, lưu listingId/versionId/sellerId và snapshot title/category/size/condition/description/flaws/price/shipFrom/imageIds. Mỗi Order lưu bản chụp địa chỉ riêng. Chỉnh revision/ẩn tin sau khi đặt không sửa snapshot, tổng hoặc cắt ngang settlement của reservation hợp lệ.

MVP dùng checkoutId/orderId duy nhất làm mã tra cứu; không yêu cầu mã số tuần tự. Các món đã chọn được dọn khỏi giỏ trong cùng transaction tạo Checkout/Order. Hủy/thất bại không tự thêm lại; Buyer chủ động thêm vào nếu món được giải phóng và còn mua được.

Ảnh snapshot được đọc theo quan hệ Buyer/Seller của Order đã tạo, độc lập với công khai của revision mới. Người ngoài vẫn theo quy tắc media công khai; ảnh CASE_EVIDENCE không trở thành ảnh Order.

### A-05 — Hủy, hết hạn và không chiếm reservation theo giờ

Buyer chỉ được hủy Checkout PENDING_PAYMENT còn trong hạn và chưa tạo attempt. Lặp hủy trên CANCELLED trả trạng thái cũ. Các trạng thái khác hoặc đã có attempt trả `409 CHECKOUT_NOT_CANCELLABLE`; hết giờ không được dùng hủy để bỏ qua đối chiếu.

Hết hạn mà chưa từng có attempt: transaction kiểm tra lại chưa có attempt và trạng thái/version Checkout rồi EXPIRED, Order EXPIRED, giải phóng đúng reservation. Không cần gọi QueryDr khi chắc chắn không có giao dịch nào được phát hành. Tạo attempt đồng thời phải bị loại hoặc khiến thao tác hết hạn retry theo trạng thái mới.

Có attempt: đồng hồ hết 15 phút chỉ kích hoạt đối chiếu. Mọi luồng giữ mới chỉ nhận Listing AVAILABLE, không có hold; không dùng `reservedUntil <= now` để chiếm món. Giải phóng chỉ sửa sale/reservation đúng Checkout, không xóa sellerHidden/adminHidden/reviewHold/correctionRequested hoặc khóa của giao dịch khác.

### A-06 — Settlement và quyền nhận món

Một service nội bộ áp dụng kết quả đã xác minh từ IPN hoặc QueryDr. Nó kiểm tra attempt/Checkout/tổng/Order, xác định quyền nhận từng món, cập nhật trong transaction và ghi sự kiện. Route client không gọi service bằng trạng thái do client khai.

Thành công không xung đột chuyển toàn bộ Checkout và Order sang PAID, món sang SOLD. Reservation đã vượt thời gian vẫn có thể hợp lệ nếu vẫn thuộc Checkout đó; không đòi Listing tiếp tục công khai. Lưu `soldCheckoutId` hoặc quan hệ sở hữu tương đương để xác định ai đã nhận quyền sau khi xóa reservation.

Thành công nhưng mất reservation hoặc có Checkout khác liên quan: Payment giữ SUCCESS, các Checkout/Order bị ảnh hưởng NEEDS_REVIEW; mọi món trong Checkout có xung đột bị chặn giao theo tổng thanh toán, không cấp quyền nhận từng phần. Listing giữ liên kết các Checkout cần điều tra; `paymentReviewHold` là cờ dẫn xuất từ các liên kết chưa giải quyết, không chỉ là boolean được tùy ý gỡ.

Khi xác minh Checkout sau chưa trả, hệ thống có thể cấp lại quyền nhận cho Checkout đã trả nếu mọi món của nó đều an toàn. Nếu cả hai đã trả hoặc dữ liệu chưa đủ, giữ điều tra qua cổng. Không tự hoàn tiền, không Admin đánh dấu đã trả. Một kết quả đến sau không đảo SUCCESS xuống FAILED/EXPIRED.

`canFulfill` chỉ true cho Order PAID và không có xung đột/hold trên Order hoặc các món. Bước giao nhận phải kiểm lại trong thao tác ghi vận đơn/nhận hàng sau này. Nếu hàng đã giao trước khi phát hiện xung đột, ghi sự cố và lịch sử thật, không giả lập thu hồi hoặc xóa bằng chứng đã giao.

### A-07 — Đối chiếu nền và mốc thời gian

Các checkpoint nội bộ tuyệt đối là `expiresAt`, `expiresAt + 1 phút`, `+3 phút`, `+5 phút`, không phải khoảng cộng dồn. Khi có attempt, QueryDr đầu tiên được gọi lúc hết hạn; checkpoint +1/+3 chỉ đọc IPN/sự kiện mới và trạng thái đã lưu. Tài liệu VNPAY quy định mã 94 cho yêu cầu QueryDr lặp trong thời hạn 5 phút, vì vậy request QueryDr kế tiếp không được gửi trước ít nhất 5 phút 10 giây kể từ request trước (thường là `expiresAt + 5 phút 10 giây`). Nếu worker trễ/restart, chỉ xử lý lượt đến hạn theo trạng thái mới nhất; không bắn dồn các lượt đã lỡ.

MVP dùng một worker chạy độc lập với request web, quét DB mỗi 10 giây; mỗi lần QueryDr timeout tối đa 10 giây, claim/lease 30 giây và cập nhật có điều kiện. Các mốc/lần đã thực hiện, lần tiếp theo, lỗi và lease lưu trong DB; chạy hai worker hoặc restart không gây settlement trùng. Tham số có thể điều chỉnh sau số liệu Sandbox nhưng không đổi ý nghĩa mốc nghiệp vụ.

QueryDr bị từ chối/throttling/timeout/mã không rõ không xác nhận chưa trả. Ghi kết quả từng checkpoint và từng request, không retry dồn để lách giới hạn cổng. Đến checkpoint cuối mà chưa xác minh được thì NEEDS_REVIEW và giữ khóa; checkpoint +5 không được hiểu là đã QueryDr thành công nếu request còn trong cửa sổ giới hạn. Nếu giới hạn cổng làm các mốc 1/3/5 không có request tra cứu, báo rõ trong nghiệm thu; không âm thầm suy diễn chưa thanh toán hoặc tự EXPIRED.

IPN hợp lệ đến sau NEEDS_REVIEW vẫn được áp dụng qua cùng service, chỉ gỡ những hold đã giải quyết bằng điều kiện giao dịch. Sau mốc cuối không mở vòng QueryDr vô hạn; điều tra tiếp cần kết quả IPN hoặc quy trình đối chiếu qua cổng có audit. API Admin MVP chỉ đọc, chưa bổ sung endpoint trigger hoặc sửa trạng thái thủ công.

### A-08 — Quyền và dữ liệu riêng tư

Buyer xem Checkout/Payment của mình và Order liên quan. Seller chỉ xem Order của mình, không thấy tổng Checkout/đơn của Seller khác. Trước PAID hoặc khi NEEDS_REVIEW, response Seller che tên/điện thoại/địa chỉ nhận và trả `canFulfill=false`; sau PAID không có hold, Seller đọc địa chỉ của đúng Order để giao hàng. Buyer vẫn thấy địa chỉ mình đã nhập.

Admin xem dữ liệu tra cứu Payment đã lọc, lịch sử kết quả và lý do điều tra; không trả địa chỉ nhận khi điều tra thanh toán không cần đến. Support chưa có quyền Payment trong cụm này. Tài nguyên không thuộc quyền trả 404; role sai trên route Admin trả 403.

Log không chứa secret, session ID, số thẻ/OTP, toàn bộ query chứa dữ liệu chưa lọc hoặc địa chỉ nhận. Audit actor USER có actorId; actor PROVIDER/SYSTEM không giả danh User. Sự kiện thanh toán lưu nguồn, attempt/reference, trạng thái trước/sau, kết quả kiểm tra và request ID bằng allowlist.

### A-09 — Bổ sung COD và lựa chọn phương thức

#### Chọn phương thức và chốt quyền mua

Body `POST /checkouts` bắt buộc `paymentMethod: "VNPAY" | "COD"`, không có mặc định ngầm. Một Checkout dùng cùng phương thức cho tất cả Order; không trộn COD/VNPAY và không đổi phương thức sau khi tạo. Thiếu/enum sai trả 422; dùng lại key với phương thức khác trả IDEMPOTENCY_CONFLICT. Chuyển phương thức phải hủy được đơn cũ rồi tạo Checkout mới.

VNPAY giữ hợp đồng PENDING_PAYMENT/PENDING, RESERVED 15 phút và chỉ SOLD sau xác minh. COD tạo Checkout `CONFIRMED`, các Order `CONFIRMED`, `paymentStatus=UNPAID`, `expiresAt=null`; chốt Listing `SOLD` cho đúng Checkout ngay trong transaction tạo đơn. SOLD từ đây nghĩa là món đã có người mua và không còn mở bán, không đồng nghĩa đã thu tiền. Không có bước confirm COD thứ hai, không có timer tự giải phóng hoặc QueryDr.

COD vẫn kiểm tra email xác minh, giỏ, giá/version, quyền sở hữu, availability/hold, snapshot, tổng và dọn giỏ giống VNPAY. COD không được chiếm món RESERVED quá hạn chưa được đối chiếu hoặc món SOLD của Checkout khác. Đây là thay đổi nghĩa SOLD so với hợp đồng VNPAY trước đó, phải cập nhật mọi caller khi triển khai.

#### Thu tiền từng Order và tổng hợp Checkout

Mỗi Seller tự tổ chức giao nhận/thu hộ cho Order của mình. Buyer trả đúng `Order.total` khi nhận từng đơn; Checkout nhiều Seller có thể thu vào những thời điểm khác nhau. Tổng hiển thị vẫn bằng tổng các món, phí vận chuyển Buyer bằng 0. Không có một lần thu tiền COD tổng qua nền tảng.

Mỗi Order COD có tối đa một bản ghi thu tiền còn hiệu lực: amount, currency=VND, sellerId, recordedAt, source=`SELLER_DECLARATION`, requestId và idempotency fingerprint. Seller của đơn xác nhận đã nhận tiền/được đơn vị giao hàng báo thu đủ tiền sau khi có shippedAt; amount phải bằng Order.total. Backend đối chiếu quyền, phương thức, trạng thái và số tiền nhưng **không tuyên bố ngân hàng/hãng vận chuyển đã xác minh**. Không gửi OTP/thông tin thẻ; demo chỉ mô phỏng việc thu tiền.

`paymentStatus` Order COD là `UNPAID → COLLECTED`; `NOT_DUE` khi hủy/hoàn hợp lệ, `NEEDS_REVIEW` khi phát sinh tranh chấp thu tiền. Bản ghi thu không bị xóa/ghi đè bởi request lặp. Không gọi đây là Payment SUCCESS của VNPAY. Địa chỉ được cấp cho Seller khi Order COD CONFIRMED không có hold, dù chưa thu tiền, để có thể giao hàng.

PAY-02 trả `paymentMethod`, `attemptId=null`, `paymentStatus`, tổng gốc `amount`, `collectibleAmount` (loại Order CANCELLED/RETURNED), `collectedAmount`, `outstandingAmount`, currency và needsReview. Tổng tiền snapshot gốc không bị sửa khi hủy một Order. Checkout COD tổng hợp UNPAID/PARTIALLY_COLLECTED/COLLECTED/NOT_DUE/NEEDS_REVIEW từ từng Order, không đợi một IPN tổng. Có hồ sơ cần điều tra thì ưu tiên NEEDS_REVIEW; collectibleAmount=0 thì NOT_DUE; chưa thu đồng nào thì UNPAID; thu một phần thì PARTIALLY_COLLECTED; thu đủ collectibleAmount thì COLLECTED. outstandingAmount = collectibleAmount - collectedAmount; không cho số âm hoặc collection vượt tổng cần thu.

#### Nhận hàng, hủy và hoàn về

`canFulfill=true` khi Order COD CONFIRMED không có hold hoặc Order VNPAY PAID không có hold. Buyer xác nhận nhận hàng COD sau shippedAt chuyển Order CONFIRMED → COMPLETED; xác nhận nhận hàng không tự xác nhận Seller đã thu tiền. Seller ghi nhận thu tiền không tự làm Order COMPLETED. Courier có thể báo/đối soát thu tiền sau khi Buyer đã nhận, nên COMPLETED với UNPAID được hiển thị là “đã nhận hàng, chờ Seller ghi nhận thu tiền”, không tự tạo bằng chứng đã trả.

Buyer được hủy từng Order COD trước shippedAt, khi chưa có bản ghi thu, Order CONFIRMED và không bị hold. Hủy nguyên tử cập nhật CANCELLED/NOT_DUE và trả món về AVAILABLE chỉ khi quyền SOLD còn đúng Checkout/Order và không có reservation/quyền nhận khác. Cờ ẩn/duyệt/hold khác được giữ; AVAILABLE không đồng nghĩa lập tức công khai. Hủy và gửi hàng/thu tiền phải dùng cập nhật có điều kiện để chỉ một thao tác thắng. Seller không có quyền tự hủy thay Buyer. VNPAY tiếp tục dùng hủy Checkout trước attempt.

Sau khi đã gửi, Buyer không tự hủy. Không nhận hàng, mất hàng hoặc hoàn chưa về đều đưa vào xử lý giao nhận/DELIVERY, Order NEEDS_REVIEW, Listing vẫn SOLD; không tự mở bán khi hết giờ hoặc khi chỉ có lời báo “Buyer không nhận”.

Seller có thể gửi yêu cầu xác nhận đã nhận lại **toàn bộ** hàng của Order COD, bắt buộc lý do và mã vận đơn đang lưu; Order phải đã gửi, chưa COMPLETED và chưa COLLECTED. Yêu cầu làm Order NEEDS_REVIEW. Admin xử lý bằng quyết định có lý do, kiểm tra hồ sơ giao nhận/đối chiếu thủ công và việc hàng đã về, chưa thu tiền. Chấp nhận nguyên tử chuyển Order RETURNED/NOT_DUE và giải phóng đúng quyền nhận khi không còn xung đột; từ chối giữ NEEDS_REVIEW. Thiếu hàng, đã thu tiền, Buyer khai đã nhận hoặc dữ liệu mâu thuẫn thì giữ điều tra, không tự hoàn tiền/mở bán. Đây là xác nhận nghiệp vụ thủ công có audit, không phải xác minh hãng vận chuyển.

Checkout COD giữ CONFIRMED khi các Order đang được thực hiện hoặc đã hoàn thành; NEEDS_REVIEW nếu có Order đang bị điều tra; CANCELLED nếu tất cả Order đều CANCELLED/RETURNED. Trạng thái từng Order và paymentStatus tổng hợp thể hiện kết quả chi tiết; không thêm COMPLETED cho Checkout. Hủy một Order không hủy Order của Seller khác.

#### API bổ sung và cập nhật

Tất cả POST mới yêu cầu đăng nhập, email xác minh nếu là Buyer/Seller, Idempotency-Key và body allowlist; replay giữ kết quả, payload khác trả conflict. Thời điểm do server ghi.

| Route | Quyền/request | Điều kiện và kết quả |
| --- | --- | --- |
| `POST /checkouts` | Thêm paymentMethod bắt buộc | VNPAY theo A-01; COD tạo CONFIRMED/UNPAID, SOLD nguyên tử, không attempt/expiry |
| `POST /checkouts/{id}/payment-attempts` | Chỉ Checkout VNPAY | COD trả 409 PAYMENT_METHOD_NOT_SUPPORTED, không tạo attempt |
| `GET /checkouts/{id}/payment` | Buyer sở hữu | Trả DTO phân biệt hai phương thức; COD có summary theo Order, không query cổng |
| `POST /orders/{orderId}/cancel` | Buyer của Order COD; body rỗng | Trước shippedAt, chưa thu và không hold; 200 CANCELLED/NOT_DUE; lặp idempotent; trạng thái sai trả 409 |
| `POST /orders/{orderId}/cod-collection` | Seller của Order; `{amount, note?}`; note ≤1000 ký tự | Order CONFIRMED hoặc COMPLETED, đã gửi, chưa thu/hold; 201 bản ghi mới/200 replay; sai amount trả 422, trạng thái sai 409; không nhận collectedAt từ client |
| `POST /orders/{orderId}/cod-return-requests` | Seller; `{reason}` 10–2000 ký tự | Đã gửi, chưa hoàn thành/thu; một yêu cầu đang mở/Order; 201/200 replay, Order NEEDS_REVIEW |
| `POST /admin/orders/{orderId}/cod-return-decisions` | Admin; `{requestId, decision: ACCEPT_RETURN | REJECT_RETURN, reason}`; reason 10–2000 ký tự | Quyết định đúng yêu cầu đang mở; 200 kết quả; ACCEPT_RETURN chỉ khi đủ điều kiện giải phóng; REJECT_RETURN giữ điều tra; quyết định khác trên yêu cầu đã đóng trả 409 |
| `PUT /orders/{orderId}/shipment` và `POST /orders/{orderId}/receipt-confirmation` | Quyền giao nhận hiện có | Bổ sung nhánh COD theo canFulfill/nhận hàng ở trên; không tự cập nhật collection |

Quyền đọc Admin của hồ sơ COD trả thông tin thu/hoàn đã lọc. `/admin/payments` vẫn chỉ tra cứu attempt VNPAY; không nhét collection COD thành attempt. Quyền xử lý return là nghiệp vụ đơn COD riêng, không mở quyền Admin tự gán VNPAY PAID. Ghi audit COD_ORDER_CANCELLED/COD_COLLECTION_RECORDED/COD_RETURN_REQUESTED/COD_RETURN_ACCEPTED/COD_RETURN_REJECTED cùng thay đổi trạng thái; actor và idempotency theo hợp đồng chung.

#### Dữ liệu, kiểm thử và ranh giới triển khai

- Bổ sung paymentMethod bắt buộc trên Checkout/Order, enum CONFIRMED/RETURNED và trường paymentStatus/collection theo nhánh; COD có expiresAt null và bị loại khỏi mọi job VNPAY. Worker chỉ xử lý Checkout VNPAY đến hạn.
- Unique collection còn hiệu lực/Order, unique yêu cầu hoàn đang mở/Order, cùng điều kiện ownership/version/hold; không tạo Payment VNPAY cho COD. Migrate COD cũ phải phân loại, không mặc định đã thu hoặc đã nhận chỉ vì SOLD/PLACED.
- Bộ test bắt buộc: cả hai phương thức cùng tranh một món; đổi method với key cũ; COD nhiều Seller thu/hủy riêng; giao hàng khi chưa thu; Seller khác/Buyer không ghi collection; sai amount; thu/nhận lặp và ngược thứ tự; hủy đua shipment/collection; COD không bị job 15 phút/IPN tác động; hoàn chưa về không mở bán; Admin chỉ nhận lại đủ hàng chưa thu mới giải phóng; hold/owner khác luôn được giữ.
- Nghiệm thu phần COD cần cả API thu/hủy/hoàn trong cụm đơn hàng và nhánh shipment/receipt/DELIVERY của cụm giao nhận. Chưa đủ các luồng đó thì chỉ ghi hoàn tất phần đã làm. Sandbox thật vẫn bắt buộc riêng cho VNPAY, không phải cho COD.

**Lịch sử cập nhật 28/10/2026:** Bổ sung COD theo yêu cầu người dùng; một provider trực tuyến vẫn là VNPAY. Bước A cập nhật hợp đồng, chưa chứng nhận luồng COD hoạt động. Bước B thêm cấu hình mẫu và kiểm tra khởi động; không chứa secret và chưa chứng nhận tích hợp Sandbox.

## 4. Hợp đồng API nền cho VNPAY và các route dùng chung

Prefix ứng dụng là `/api/v1`. ID chuỗi ObjectId; thời gian ISO UTC; tiền VND nguyên. Dùng `{data, meta:{requestId, serverNow, ...}}` và lỗi `{error:{code,message,retryable}, meta:{requestId}}`. HTTP 503 có thể đánh dấu retryable khi lỗi tạm; thay đổi helper nếu cần phải tương thích route cũ. IPN có hợp đồng riêng ở mục 7.

Danh sách dùng page bắt đầu 1, limit mặc định 20/tối đa 100, mới nhất trước với ID làm khóa phụ; trả page/limit/total. Không nhận tham số query ngoài allowlist.

| Route | Quyền và request | Thành công/tác dụng | Lỗi chính và audit |
| --- | --- | --- | --- |
| `POST /checkouts` | Buyer xác minh email; body mục A-02; Idempotency-Key | 201 tạo mới/200 replay; checkoutId, status, totalAmount, currency, expiresAt, orderIds; transaction giữ/tạo/dọn giỏ | 422 validation/own item; 409 giá/version/khả dụng/key conflict; CHECKOUT_CREATED và ORDER_CREATED |
| `GET /me/checkouts?status=&page=&limit=` | Buyer; status thuộc enum Checkout | Danh sách Checkout và tổng/trạng thái; không trả paymentUrl | 401/422; không có audit thay đổi |
| `GET /checkouts/{checkoutId}` | Buyer sở hữu | Checkout, các Order, total/currency, expiresAt, attemptId nếu có; canPay/canCancel theo trạng thái server | 404 tài nguyên riêng; không thay trạng thái chỉ để đọc |
| `POST /checkouts/{checkoutId}/cancel` | Buyer; body rỗng; chỉ trước attempt | 200 CANCELLED, transaction Order/reservation; lặp giữ kết quả | 409 CHECKOUT_NOT_CANCELLABLE; CHECKOUT_CANCELLED/ORDER_CANCELLED |
| `GET /me/orders?perspective=buying|selling&status=&page=&limit=` | Tài khoản; perspective mặc định buying | Danh sách Order theo góc nhìn, snapshot tối thiểu và canFulfill; che thông tin theo A-08 | 422 bộ lọc; không có audit thay đổi |
| `GET /me/sales?status=&page=&limit=` | Tài khoản | Alias chỉ đọc của perspective=selling; giữ tương thích route cũ | Cùng hợp đồng phân trang/quyền; không có service riêng |
| `GET /orders/{orderId}` | Buyer/Seller của Order | Snapshot và trạng thái; địa chỉ được lọc theo A-08 | 404 nếu không liên quan |
| `POST /checkouts/{checkoutId}/payment-attempts` | Buyer xác minh email; body rỗng; Idempotency-Key | 201/200 replay; attemptId, status, paymentUrl, expiresAt, canRedirect | 409 attempt exists/checkout unavailable/key conflict; PAYMENT_ATTEMPT_CREATED |
| `GET /checkouts/{checkoutId}/payment` | Buyer sở hữu | attemptId hoặc null, status hoặc NOT_STARTED (chỉ là DTO), checkoutStatus, amount/currency, verifiedAt, needsReview; không tự QueryDr | 404 không thuộc quyền |
| `GET /integrations/payments/vnpay/ipn` | Cổng; chữ ký/tham số giao thức; không session Buyer | JSON RspCode/Message; commit trước ACK thành công | Mục 7; PAYMENT_RESULT_APPLIED/IGNORED, kết quả bất thường và log từ chối |
| `GET /admin/payments?orderId=&providerReference=&status=&page=&limit=` | Admin; lọc kết hợp AND; status thuộc enum Payment | Attempt đã lọc, Checkout/Order liên quan và trạng thái đối chiếu | 403/422; PAYMENT_LOOKUP_READ |
| `GET /admin/payments/{attemptId}` | Admin | Hồ sơ attempt, sự kiện đã lọc, lịch đối chiếu/hold/xung đột | 404/403; PAYMENT_DETAIL_READ |
| `POST /checkouts/{checkoutId}/confirm` | Route cũ bị ngừng | 410 ENDPOINT_RETIRED, không tác dụng phụ | Không có nghiệp vụ xác nhận thanh toán từ client |

`providerReference` trên API Admin là merchant reference gửi bằng `vnp_TxnRef`; response trả riêng `providerTransactionNo` để tránh nhầm hai mã. Khi chưa có frontend, Return URL dùng trang thông báo chờ ở backend; trang không tin query để kết luận PAID. Khi frontend có trang kết quả, cấu hình Return URL về giao diện và đọc PAY-02.

Giỏ giữ các route hiện tại `/cart`, `/cart/items`; đổi tên giỏ không thuộc Bước A này. HTTP GET đọc không giải phóng món hoặc sửa trạng thái tài chính; worker xử lý hết hạn.

## 5. Ma trận trạng thái và bất biến VNPAY (COD theo A-09)

Checkout: `PENDING_PAYMENT/PAID/PAYMENT_FAILED/EXPIRED/CANCELLED/NEEDS_REVIEW`. Order: `PENDING/PAID/PAYMENT_FAILED/EXPIRED/CANCELLED/NEEDS_REVIEW/COMPLETED`. Payment: `INITIATED/PENDING/SUCCESS/FAILED/EXPIRED/NEEDS_REVIEW`. Listing giữ `AVAILABLE/RESERVED/SOLD` cùng các cờ độc lập.

| Sự kiện | Payment | Checkout/Order | Listing và tác dụng |
| --- | --- | --- | --- |
| Xác nhận mua | Chưa có | PENDING_PAYMENT / PENDING | RESERVED; chưa SOLD |
| Cấp URL attempt | INITIATED → PENDING | Giữ pending | Không đổi hạn giữ |
| Hủy trước attempt | Không có | CANCELLED / CANCELLED | Giải phóng đúng reservation |
| Hết hạn không attempt, xác nhận nguyên tử | Không có | EXPIRED / EXPIRED | Giải phóng đúng reservation |
| Thành công đã xác minh và mọi món đủ quyền nhận | SUCCESS | PAID / PAID | SOLD, lưu quyền nhận |
| Thất bại cuối đã xác minh, không còn mâu thuẫn | FAILED | PAYMENT_FAILED / PAYMENT_FAILED | Giải phóng nếu an toàn |
| Hết hạn đã xác minh chưa trả | EXPIRED | EXPIRED / EXPIRED | Giải phóng nếu an toàn |
| Chưa rõ trước mốc cuối | PENDING hoặc NEEDS_REVIEW nếu rủi ro tài chính | Giữ pending hoặc NEEDS_REVIEW nếu có xung đột | Hết giờ vẫn RESERVED; payment hold khi đang đối chiếu quá hạn |
| Chưa rõ sau +5 phút | NEEDS_REVIEW, không hạ SUCCESS đã có | NEEDS_REVIEW / NEEDS_REVIEW | Tiếp tục khóa bán/giao |
| Thành công muộn có xung đột | SUCCESS | Các hồ sơ liên quan NEEDS_REVIEW | Không ghi đè chủ món; khóa điều tra |
| Kết quả giả/sai chữ ký hoặc dữ liệu đối chiếu sai | Không đổi kết quả tài chính | Không tự đổi | Không bán/giải phóng từ sự kiện sai |
| Xác minh gỡ xung đột, Checkout đã trả có toàn bộ quyền nhận | Giữ SUCCESS | NEEDS_REVIEW → PAID | Cấp quyền đúng một Buyer, chỉ gỡ hold tương ứng |

FAILED/EXPIRED đã ghi nhưng có bằng chứng SUCCESS hợp lệ đến muộn: ghi SUCCESS và kiểm lại toàn bộ quyền nhận; PAID nếu an toàn, NEEDS_REVIEW nếu không. CANCELLED mà xuất hiện bằng chứng trả tiền là bất thường: ghi tài chính thật và NEEDS_REVIEW, không tự cấp hàng. Không dùng trạng thái kết thúc cũ để bỏ mất khoản tiền đã xác minh.

PAID có thể chuyển NEEDS_REVIEW khi phát hiện xung đột mới. COMPLETED thuộc giao nhận; không xóa lịch sử đã giao khi điều tra, dùng hold/cờ sự cố riêng cho hồ sơ đó. Chi tiết chuyển giao nhận được chốt trong cụm giao nhận.

Các bất biến bắt buộc: tổng Checkout = tổng Order = amount Payment; một attempt/Checkout; một Order/Seller/Checkout; một quyền nhận đang hiệu lực cho một Listing; không hạ SUCCESS bởi sự kiện cũ; không giải phóng hold của vụ khác; chưa xác minh thì không PAID/SOLD; cập nhật kết quả và audit/sự kiện cùng transaction hoặc cơ chế nguyên tử tương đương.

## 6. Mapping VNPAY và giới hạn xác nhận

**Mức xác nhận:** Đã đối chiếu tài liệu chính thức qua kết quả truy vấn web ngày 28/10/2026. Trang mở trực tiếp bị timeout; chưa chạy merchant Sandbox. Mapping dưới đây là hợp đồng triển khai thận trọng, chưa phải bằng chứng tương thích thực tế. B/L phải kiểm chứng trước khi đóng tích hợp.

Giao thức mục tiêu VNPAY PAY 2.1.0, VND; đổi amount tại adapter theo tài liệu. IPN và QueryDr không dùng chung cách ký một cách suy đoán: mỗi giao thức phải có vector kiểm chứng riêng. Không kết luận từ HTTP status hoặc từ một field đơn lẻ. Trường currency không có trong response không được tự dựng; đối chiếu currency của attempt/cấu hình đã ký và mọi trường giao thức thực sự cung cấp.

| Nguồn/điều kiện sau kiểm tra chữ ký và liên kết | Quyết định nội bộ |
| --- | --- |
| IPN responseCode=00 và transactionStatus=00 | SUCCESS, rồi kiểm quyền nhận để PAID hoặc NEEDS_REVIEW |
| QueryDr responseCode=00, transactionStatus=00, giao dịch thanh toán gốc | SUCCESS; responseCode của QueryDr chỉ cho biết yêu cầu tra cứu xử lý được |
| transactionStatus=01 | Chưa kết thúc; giữ chờ/đối chiếu |
| IPN responseCode=11, transactionStatus xác nhận thất bại cuối và không có bằng chứng tiền thành công | EXPIRED; cần fixture Sandbox cho tổ hợp trường cụ thể |
| transactionStatus=02 với kết quả thất bại cuối hợp lệ, không có nghi vấn tiền đã trừ | FAILED; các tổ hợp IPN/QueryDr cho phép phải nằm trong allowlist đã kiểm chứng |
| responseCode=07 hoặc status=04/05/06/07/09 | NEEDS_REVIEW, không coi là chưa trả và không giải phóng |
| QueryDr responseCode=91/94 hoặc lỗi cấu hình/format/checksum/timeout/5xx | Không chứng minh chưa trả; ghi lỗi và giữ khóa theo lịch; lỗi checksum không được áp dụng dữ liệu |
| Mã/tổ hợp chưa có fixture, amount/reference lệch hoặc kết quả mâu thuẫn | Không suy thành FAILED/EXPIRED; lưu điều tra/đối chiếu theo mức tin cậy, giữ khóa |

Các mã response khác ngoài 00 không mặc định FAILED. “Không tìm thấy giao dịch” dù lặp nhiều lần chưa được dùng làm điều kiện giải phóng cho attempt đã cấp URL nếu chưa có quy tắc chắc chắn được xác minh với cổng. Sau mốc cuối giữ NEEDS_REVIEW.

Nguồn giao thức: [VNPAY PAY và IPN](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), [QueryDr](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html), [bảng mã](https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/). Các quyết định giữ khóa và mốc đối chiếu là chính sách an toàn của project dựa trên BR-PAYMENT-009, không phải lịch do VNPAY bảo đảm.

## 7. Hợp đồng ACK IPN

IPN dùng GET HTTPS; không yêu cầu session/Origin của Buyer. Kiểm checksum trước thay đổi dữ liệu; từ chối tham số trùng/mảng gây mơ hồ, không tin parser đã gộp. Sau đó kiểm merchant/reference/số tiền và cặp kết quả.

| Tình huống | RspCode dự kiến | Hành vi |
| --- | --- | --- |
| Kết quả hợp lệ đã ghi bền, kể cả NEEDS_REVIEW đã tiếp nhận để điều tra | 00 | Chỉ trả sau commit |
| Cùng kết quả đã áp dụng, không có dữ liệu mâu thuẫn mới | 02 | Không lặp hiệu ứng |
| Reference không tìm thấy hoặc không thuộc merchant đang cấu hình | 01 | Không đổi tài chính; log an toàn |
| Amount không khớp | 04 | Không đổi tài chính; log an toàn |
| Checksum sai hoặc input không thể xác minh chữ ký | 97 | Không áp dụng nội dung |
| Lỗi DB/hệ thống chưa lưu bền kết quả | 99 | Không ACK thành công; cho phép retry theo cổng |

Response IPN là JSON `{RspCode, Message}` với HTTP 200 khi ứng dụng trả ACK theo giao thức; không bọc `{data, meta}`. Bảng mã này được đối chiếu ví dụ chính thức, vẫn cần B/L xác nhận retry/ACK thực tế. Mâu thuẫn với kết quả cũ không trả 02 như thể trùng bình thường: phải lưu sự kiện, khóa/điều tra thích hợp rồi mới ACK đã nhận.

## 8. Lỗi ứng dụng và tác dụng phụ

| Tình huống | HTTP/code |
| --- | --- |
| Chưa đăng nhập / email chưa xác minh | 401 UNAUTHORIZED / 403 EMAIL_NOT_VERIFIED |
| Role sai / tài nguyên không thuộc quyền | 403 FORBIDDEN / 404 NOT_FOUND |
| ID/body/query/header key sai, món trùng hoặc mua của mình | 422 VALIDATION_ERROR hoặc OWN_LISTING |
| Giá/version thay đổi | 409 PRICE_CHANGED / LISTING_VERSION_CONFLICT |
| Món không thể mua hoặc reservation không thuộc Checkout | 409 LISTING_UNAVAILABLE / RESERVATION_LOST |
| Key bị dùng với payload khác | 409 IDEMPOTENCY_CONFLICT |
| Checkout đã có attempt / không thể tạo attempt | 409 PAYMENT_ATTEMPT_EXISTS / CHECKOUT_UNAVAILABLE |
| Không đủ điều kiện hủy | 409 CHECKOUT_NOT_CANCELLABLE |
| Route confirm cũ | 410 ENDPOINT_RETIRED |
| Cấu hình thanh toán chưa sẵn sàng hoặc lỗi cổng tạm thời | 503 PAYMENT_UNAVAILABLE; không tạo thêm attempt |

Audit nghiệp vụ gồm tạo/hủy Checkout/Order, tạo attempt, nhận/áp dụng/bỏ qua kết quả, đối chiếu từng mốc, tạo/gỡ hold, chuyển NEEDS_REVIEW và Admin tra cứu. Chi tiết từ chối payload không tin cậy chỉ ghi allowlist, không dùng actorId giả. Thông báo email/SMS không phải điều kiện của cụm này; API trạng thái và audit là đầu ra bắt buộc.

## 9. Những việc chưa thực hiện và tiêu chí mở bước tiếp theo

- Merchant Sandbox đã cấp credential và cấu hình được giữ trong `.env` local bị Git ignore; không ghi giá trị vào report. Chưa có giao dịch PAY/IPN/QueryDr thật.
- Chưa gọi thanh toán/IPN/QueryDr Sandbox, chưa có fixture thực tế; mapping và ACK chưa được chứng thực bằng giao dịch.
- Schema và index definitions đã thêm ở Bước C; chưa xác minh MongoDB đã tạo các index và chưa migrate/xóa dữ liệu. VNPAY attempt/IPN/worker đã có code. Chốt migrate tại chỗ, không reset demo; cần backup và dry-run trước khi cập nhật bản ghi.
- Người dùng xác nhận backend trên máy đã lắng nghe cổng 4000; môi trường công cụ không kết nối được API local hoặc DNS tunnel nên chưa xác nhận callback public. Kết quả test cục bộ không phải bằng chứng thanh toán Sandbox.

Code B/F–J đã có; cấu hình merchant được nạp ở worktree Dung và validation cấu hình đạt. `VNPAY_RETURN_URL` cũ trỏ tới host tạo thanh toán; nay chuyển sang route thông báo tĩnh của backend và cấu hình chặn nhầm host thanh toán. Đóng L còn cần lưu IPN URL tại VNPAYGW SIT, xác nhận tunnel public, chạy API và worker, rồi hoàn thành giao dịch Sandbox có bằng chứng đã che. Schema C đã chuẩn bị; dữ liệu cũ vẫn chờ backup/dry-run. Trường hợp kết quả chưa chắc tiếp tục giữ chờ/điều tra.

## 10. Bước B — Môi trường và hợp đồng VNPAY Sandbox

### Đã chuẩn bị trong repo

- Thêm `VNPAY_ENABLED=false` cùng các tên biến `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`, `VNPAY_IPN_URL`, `VNPAY_QUERY_SERVER_IP` vào `backend/.env.example`; mẫu không chứa secret.
- Thêm `backend/src/config/vnpay.js`: mặc định tắt; khi bật, kiểm tra TmnCode 8 ký tự chữ/số, hash secret không rỗng, Return/IPN là HTTPS DNS URL không dùng host local, và QueryDr IP có cú pháp địa chỉ IP hợp lệ. Kiểm tra IP chỉ xác nhận cú pháp; chưa chứng minh đó là IP public/outbound đã đăng ký với VNPAY.
- `backend/src/server.js` gọi kiểm tra cấu hình trước khi kết nối MongoDB. PAY và QueryDr dùng endpoint Sandbox cố định trong code; cấu hình không nhận URL cổng tùy ý và không ghi giá trị cấu hình ra log.
- Ghi rõ hai phương thức của MVP: VNPAY trực tuyến và COD thu thủ công theo từng Order. Bước B chỉ chuẩn bị VNPAY; không tạo payment attempt cho COD.

### Hợp đồng giao thức đã đối chiếu

- PAY v2.1.0: endpoint Sandbox cố định; số tiền gửi theo đơn vị VND × 100; ký HMAC-SHA512 theo bộ tham số đã sắp xếp. Buyer IP lấy từ request theo cấu hình proxy tin cậy; QueryDr dùng IP outbound của backend đã đăng ký.
- IPN là GET từ VNPAY tới URL HTTPS công khai; backend xác minh chữ ký và đối chiếu giao dịch trước khi cập nhật, rồi trả JSON `RspCode`/`Message`. Return URL chỉ đưa Buyer về giao diện, không phải bằng chứng thanh toán.
- QueryDr là POST JSON tới endpoint Sandbox; `vnp_RequestId` duy nhất theo ngày, thời gian GMT+7 và chữ ký theo chuỗi field trong tài liệu. `vnp_ResponseCode` của yêu cầu tra cứu khác với `vnp_TransactionStatus` của giao dịch; response 00 không tự có nghĩa là đã thanh toán thành công.
- Mã 94 giới hạn request QueryDr lặp trong 5 phút. Lịch nghiệp vụ vẫn giữ checkpoint tuyệt đối lúc hết hạn và +1/+3/+5; các mốc +1/+3 kiểm tra IPN/state đã lưu, request QueryDr tiếp theo cách lần trước ít nhất 5 phút 10 giây. Timeout/mã 94/mã chưa rõ không giải phóng món.

### Còn chờ để nghiệm thu B đầy đủ

- Merchant Sandbox đã cấp thông tin và `.env` local được bật; không commit secret. Người dùng báo API đã chạy ở cổng 4000, còn xác nhận IPN URL trong VNPAYGW SIT và tính truy cập công khai của tunnel.
- Dùng fixture/tài khoản được cấp để xác minh request/response, checksum và ACK; lưu bằng chứng đã che dữ liệu. Chưa có giao dịch Sandbox nào được thực hiện trong bước này.

Nguồn: [PAY và IPN](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), [QueryDr](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html), [bảng mã lỗi](https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/).

## 11. Bước C — Schema, index và dữ liệu cũ

### Đã bổ sung trong repo

- `backend/src/models/commerce.js`: Checkout/Order có `contractVersion`, payment method/status, VND totals, địa chỉ nhận, snapshot đầy đủ, hạn giữ, liên kết attempt và COD collection/return. Snapshot, method, tổng, địa chỉ và hạn giữ là immutable sau tạo. Version 1 giữ tương thích với route hiện tại; version 2 yêu cầu phương thức/tổng/địa chỉ, VNPAY phải có hạn giữ, COD không được có hạn hoặc payment attempt.
- OrderItem có `_id` riêng và `quantity=1`; Order có carrier/tracking/shipped/received timestamps để các bước giao nhận dùng cùng snapshot.
- Thêm `PaymentAttempt` VNPAY duy nhất trên Checkout với merchant reference, amount/currency, trạng thái, idempotency và thông tin lịch đối chiếu/lease. Các unique index chặn attempt thứ hai theo Checkout, reference và key.
- Thêm `PaymentEvent` lưu nguồn IPN/QUERY, mã giao dịch, request IDs, kết quả kiểm chữ ký/merchant/reference/amount và hash payload; không lưu payload callback thô.
- Thêm `CodCollection` duy nhất theo Order với `SELLER_DECLARATION`; `CodReturnRequest` giới hạn một yêu cầu OPEN mỗi Order và lưu quyết định Admin/idempotency.
- Listing lưu `soldCheckoutId` và các Checkout payment-review đang ảnh hưởng đến món. AuditEvent hỗ trợ actor USER/PROVIDER/SYSTEM; actor PROVIDER/SYSTEM không cần giả `actorId`.
- Server và seed khởi tạo các model/index mới. Chưa chạy server nên index mới chỉ được xác nhận có khai báo trong schema, chưa xác nhận tồn tại trong MongoDB.

### Quyết định migrate dữ liệu cũ

**Migrate tại chỗ; không reset demo và không xóa collection.** Bản ghi lịch sử giữ `contractVersion=1`; Checkout/Order mới của luồng mới sẽ dùng version 2. Trước backfill phải dừng ghi, tạo backup và chạy dry-run phân loại.

- Checkout `COMPLETED` có Order cũ `PLACED/COD/UNPAID`: chuyển Checkout/Order sang `CONFIRMED`, giữ COD `UNPAID`; không tạo COD collection vì chưa có bằng chứng Seller đã thu tiền. Cấp `_id` cho OrderItem cũ.
- Checkout `OPEN` không có Order/PaymentAttempt: phân loại là hold legacy, đóng như hết hạn và chỉ giải phóng Listing còn đang RESERVED bởi đúng Checkout đó. Không áp dụng khi liên kết bị lệch.
- Có thể suy ra Checkout tổng/địa chỉ từ Orders cũ chỉ khi toàn bộ snapshot nhất quán; Listing `soldCheckoutId` chỉ backfill khi quan hệ Order → Checkout → Listing là duy nhất.
- Checkout hoàn tất nhưng thiếu Order, địa chỉ/tổng khác nhau, Listing đã thuộc luồng khác, hoặc xuất hiện PaymentAttempt cũ: dừng record đó để rà soát; không tự sửa thành PAID, không mở bán và không suy luận đã thu COD.

### Phần còn chờ nghiệm thu C

Chưa kết nối DB hoặc xem `.env`; chưa biết số lượng/độ nhất quán của dữ liệu cũ. Cần backup, báo cáo dry-run và duyệt các record ngoại lệ trước khi chạy backfill. Chưa cập nhật dữ liệu trong lượt này.

## 12. Tiến độ cập nhật dần

| Bước | Trạng thái | Kết quả hoặc điều kiện cần cập nhật |
| --- | --- | --- |
| A — Hợp đồng, trạng thái, ma trận thanh toán | Hoàn tất về tài liệu, đã bổ sung COD | API hai phương thức, collection/return COD, snapshot, quyền, idempotency, VNPAY lịch/hold/ACK; xác nhận cổng còn B/L |
| B — Môi trường và giao thức Sandbox | Cấu hình local hợp lệ; SIT/IPN còn chờ xác nhận | Tunnel và Return URL công khai hoạt động với backend `w2-be`; worker kết nối MongoDB. Chưa xác minh IPN URL đã lưu ở SIT |
| C — Model, index, dữ liệu cũ | Schema/index definitions và kế hoạch migration hoàn tất; DB migration chờ backup/dry-run | Models Payment/COD, snapshot, lease, ownership/audit và index đã khai báo; chưa xác minh index trên MongoDB hoặc backfill dữ liệu cũ |
| D — Checkout/Order theo phương thức | Đã triển khai; kiểm thử tích hợp đạt trong K | POST /checkouts rẽ nhánh COD/VNPAY trong transaction; idempotency fingerprint, kiểm giá/version, snapshot, cập nhật có điều kiện và dọn giỏ |
| E — Đơn mua/bán, COD và hủy | Đã triển khai; kiểm thử tích hợp đạt trong K | Lịch sử/DTO có quyền, hủy VNPAY trước attempt, COD hủy/thu/hoàn, Admin tra cứu, shipment/receipt tối thiểu, cập nhật media theo Order |
| F — Payment attempt | Đã triển khai; có kiểm thử tích hợp | Một attempt/reference mỗi Checkout, PAY URL ký, replay đúng idempotency, COD bị từ chối |
| G — IPN/settlement | Đã triển khai; có kiểm thử tích hợp | IPN GET, xác minh checksum/tham số/merchant/reference/amount, settlement transaction và ACK; trùng/sai được xử lý an toàn |
| H — QueryDr/hết hạn | Đã triển khai; có kiểm thử tích hợp | Worker `worker:vnpay`, lease lưu DB, hết hạn không attempt, checkpoint 0/1/3/5, throttle tối thiểu 5 phút 10 giây; timeout/94 giữ khóa |
| I — Muộn/xung đột | Đã triển khai; có kiểm thử tích hợp | Thành công đến muộn giữ SUCCESS tài chính; xung đột một hoặc hai Buyer khóa quyền nhận, không ghi đè Listing hoặc tự hoàn tiền |
| J — Điều tra, quyền và log | Đã triển khai; có kiểm thử tích hợp | GET Admin lọc/chi tiết chỉ đọc, audit lần tra cứu, không trả payment URL/địa chỉ hoặc payload thô |
| K — Kiểm thử tự động | Đạt trên MongoDB replica set dành riêng cho test | Domain 8/8, protocol 4/4, commerce/COD/VNPAY 1/1, moderation regression 1/1; QueryDr dùng response giả lập có checksum, chưa gọi Sandbox thật |
| L — Sandbox thật | Chưa nghiệm thu; đang chờ xác nhận SIT và giao dịch thật | Backend, tunnel, Return URL và worker hoạt động; cần xác nhận IPN URL trong SIT và hoàn tất các ca thanh toán thật |
| M — Bàn giao | Chưa thực hiện | Docs, seed, mẫu request, worker và bằng chứng nghiệm thu |

Các lần cập nhật sau giữ lịch sử quyết định quan trọng tại đây; nếu thay hợp đồng A phải ghi lý do, ảnh hưởng code/API/test và ngày quyết định mới.

## 13. Bước D–E — Checkout, Order, COD và lịch sử (28/10/2026)

> Đây là ảnh chụp tiến độ khi cập nhật D–E ngày 28/10. F–K được triển khai và kiểm tra tiếp ở mục 14.

### Đã triển khai

- `backend/src/services/checkout.js` tạo Checkout, giữ/chốt Listing, tạo một Order cho mỗi Seller, lưu snapshot/địa chỉ/tổng, dọn giỏ và ghi audit trong một MongoDB transaction. VNPAY tạo `PENDING_PAYMENT/PENDING` và `RESERVED` trong 15 phút; COD tạo `CONFIRMED/UNPAID`, `SOLD` gắn đúng Checkout và không có hạn giữ.
- `POST /checkouts` nhận `Idempotency-Key`, body allowlist, giá/version mong đợi và `paymentMethod`. Replay cùng fingerprint trả lại Checkout/Order; key khác payload conflict. Server lấy giá/tổng từ revision đang được duyệt. Một món lỗi làm rollback toàn bộ.
- Đã bỏ giải phóng reservation theo request và không cho Checkout mới chiếm reservation hết hạn. `POST /checkouts/:id/confirm` trả `410 ENDPOINT_RETIRED`. VNPAY attempt chưa có ở F; route attempt tạm trả `409 PAYMENT_METHOD_NOT_SUPPORTED` cho COD và `501 PAYMENT_ATTEMPT_NOT_READY` cho VNPAY.
- `GET /me/checkouts`, `GET /checkouts/:id`, `GET /checkouts/:id/payment`, `/me/orders?perspective=buying|selling`, `/me/sales` và `/orders/:id` có phân trang/lọc phù hợp và giới hạn dữ liệu theo Buyer/Seller. Seller chỉ nhận địa chỉ khi đơn đủ điều kiện giao; ảnh snapshot đọc qua quan hệ Order.
- COD có API Buyer hủy từng Order; Seller ghi nhận thu đúng `Order.total` sau khi gửi; Seller yêu cầu hàng hoàn; Admin có danh sách collection/return và quyết định có lý do/audit. Mỗi hành động nghiệp vụ cập nhật trong transaction; chỉ giải phóng món nếu quyền SOLD đúng Checkout và không có payment hold.
- Thêm `PUT /orders/:id/shipment` và `POST /orders/:id/receipt-confirmation` mức tối thiểu để luồng COD đi qua trạng thái giao/nhận. COD có thể gửi khi `CONFIRMED/UNPAID`; xác nhận nhận hàng giữ nguyên payment status; collection không tự hoàn tất Order. Chưa tích hợp hay xác minh với hãng vận chuyển.
- `backend/src/services/codOrders.js` ghi COD source=`SELLER_DECLARATION`; đây là lời khai có audit của Seller, không phải bằng chứng ngân hàng/hãng giao hàng. Admin chấp nhận hoàn COD là quyết định nghiệp vụ thủ công có lý do, cần xác nhận hàng đã về đủ và chưa thu; backend không tự hoàn tiền.
- Xóa `backend/src/services/confirmCheckout.js` cũ để không còn lối service nội bộ tạo Order COD/SOLD từ lệnh confirm của Buyer.

### Kiểm tra trong lượt này

Đã chạy kiểm tra cú pháp Node cho các file JavaScript vừa sửa/thêm và `git diff --check`; đều thành công. Không chạy test tự động, không kết nối MongoDB, không tạo index thực tế và không thực hiện Sandbox. Bộ test cũ cần được đồng bộ với hợp đồng mới trong K.

### Giới hạn và phụ thuộc còn lại

- VNPAY chưa có attempt/URL/IPN/settlement/worker. Khi VNPAY Checkout hết 15 phút, reservation cố ý vẫn giữ; chỉ H được phép giải phóng sau khi kết luận an toàn. Không dùng request GET hoặc đồng hồ để mở bán lại.
- Khi F triển khai tạo attempt, phải cập nhật `Checkout.paymentAttemptId` và trạng thái Checkout trong cùng transaction có điều kiện như thao tác hủy; đây là điểm tranh chấp bắt buộc để chỉ một thao tác thắng.
- COD collection/return chỉ hoạt động sau khi Order có `shippedAt`; API shipment tối thiểu hiện ghi trạng thái do Seller cung cấp, chưa xác nhận hãng. Cụm giao nhận vẫn cần tích hợp khiếu nại/DELIVERY và đối chiếu vận chuyển nếu MVP yêu cầu.
- Step C chưa được nghiệm thu trên dữ liệu thật: cần backup/dry-run trước migrate; index mới chưa xác minh trong MongoDB.
- Vì chưa chạy test race, phân quyền và luồng COD đầu-cuối, D/E được ghi nhận là **đã triển khai code, chưa nghiệm thu hành vi**. K là điều kiện tiếp theo để xác nhận toàn bộ acceptance.

## 14. Bước F–K — Payment attempt, settlement, đối chiếu và kiểm thử (29/10/2026)

### F — Payment attempt

- `POST /checkouts/:id/payment-attempts` tạo tối đa một attempt cho Checkout VNPAY, kiểm tra Buyer/email xác minh, hạn Checkout, tổng VND, Order và reservation thuộc Checkout. Attempt/reference/URL PAY được ghi cùng liên kết Checkout trong transaction.
- Idempotency-Key cùng fingerprint trả lại attempt và URL đã tạo; key khác hoặc Checkout đã có attempt bị từ chối. COD trả `409 PAYMENT_METHOD_NOT_SUPPORTED`. URL được lưu với `select:false`; trạng thái checkout không nhận Return URL làm bằng chứng thanh toán.
- `backend/src/services/vnpayProtocol.js` dùng Node `crypto` HMAC-SHA512, sort và URL-encode field theo PAY; thời điểm giao thức định dạng GMT+7. Không thêm SDK/provider abstraction.
- K phát hiện immutable ở mảng gốc chưa chặn nested update. Đã đặt `immutable` ở từng trường snapshot/địa chỉ và có test xác nhận cập nhật tiêu đề Order hoặc địa chỉ Checkout/Order không làm đổi dữ liệu.

### G — IPN và settlement

- `GET /integrations/payments/vnpay/ipn` là route công khai riêng, không đòi session/Origin. Parser từ chối tham số VNPAY trùng; kiểm tra hình dạng và checksum trước settlement.
- IPN và QueryDr đưa kết quả tin cậy vào chung `settleVerifiedResult()`. Service đối chiếu attempt ↔ Checkout ↔ Orders ↔ Listings và tổng tiền; cập nhật trong MongoDB transaction rồi route mới trả ACK. Sai chữ ký/merchant/reference/amount, duplicate và kết quả mâu thuẫn có quyết định/event/audit riêng.
- Thành công hợp lệ không xung đột đưa Attempt/Checkout/Orders sang SUCCESS/PAID và Listing sang SOLD theo quyền nhận; failure đã xác minh chỉ mở lại reservation đúng chủ nếu không còn hold/xung đột. Return URL giả không có route settlement.

### H — QueryDr và hết hạn

- `backend/src/workers/vnpay.js` chạy bằng `npm run worker:vnpay`. Job chỉ xử lý VNPAY; Checkout hết hạn chưa từng tạo attempt được giải phóng bằng transaction và kiểm tra attempt/ràng buộc reservation lần cuối. COD không đi qua job.
- Attempt lưu `nextAt`, checkpoint, request count, `lastRequestedAt` và lease trong DB. Checkpoint +1/+3 không gọi QueryDr; lần đầu tại hết hạn và mốc +5 cách lần gọi QueryDr trước ít nhất 5 phút 10 giây. Worker reclaim lease hết hạn vẫn tuân thủ throttle.
- QueryDr timeout, 94, response sai chữ ký hoặc trạng thái chưa rõ không giải phóng hàng; kết thúc checkpoint cuối chuyển NEEDS_REVIEW và đặt hold. `npm run worker:vnpay` yêu cầu MongoDB replica set và biến môi trường VNPAY bật.

### I — Kết quả muộn và xung đột

- Kết quả SUCCESS đã xác minh đến muộn vẫn được ghi nhận. Nếu món còn AVAILABLE hoặc còn reservation của Checkout đó, quyền nhận được hoàn tất; nếu món đã thuộc Checkout khác, transaction giữ nguyên chủ sở hữu hiện tại, ghi SUCCESS cho tiền đã xác minh, đưa các Checkout/Order liên quan vào NEEDS_REVIEW và khóa Listing/fulfillment.
- Test có ca Checkout sau chưa thanh toán và ca cả hai Buyer đều đã nhận kết quả thành công. Hệ thống không tự đổi Listing sang chủ khác, tự chọn Buyer hoặc tự hoàn tiền. `Order.paymentReviewHold` chặn giao hàng độc lập với trạng thái SUCCESS của attempt.
- `sellerHidden`, `adminHidden` và hold kiểm duyệt không bị settlement, hủy hoặc COD return gỡ nhầm.

### J — Tra cứu và bảo mật

- Thêm `GET /admin/payments` (lọc Order/reference/status, phân trang) và `GET /admin/payments/:id` (attempt, Checkout, Order, event history). Chỉ Admin đọc; không có route admin đánh dấu SUCCESS/PAID.
- Response không chứa payment URL, secret, payload IPN thô hay địa chỉ nhận hàng. Audit ghi việc xem danh sách/chi tiết; Event giữ allowlist và hash payload. Buyer/Seller chỉ đọc Order theo quan hệ sở hữu.

### K — Kiểm thử tự động

Chạy `npm test` với MongoDB 8 replica set tạm trong `/tmp`, database riêng có hậu tố `_test`. Kết quả:

| Nhóm | Kết quả |
| --- | ---: |
| Domain và quy tắc | 8/8 đạt |
| Chữ ký PAY/IPN, QueryDr và mapping | 4/4 đạt |
| Tích hợp Checkout, VNPAY, COD, race, quyền và worker | 1/1 đạt |
| Regression moderation | 1/1 đạt |

Tích hợp cover attempt/idempotency, nhiều Seller, snapshot/địa chỉ bất biến và rollback, IPN success/failure/duplicate/đồng thời/sai chữ ký/merchant/reference/amount/thiếu/trùng tham số, transaction rollback rồi retry, kết quả cũ sau SUCCESS, QueryDr success/94/timeout/throttle, worker reclaim lease, hết hạn, xung đột một hoặc hai Buyer, COD collection/return/cancel/shipment/receipt, phân quyền và không lộ URL/địa chỉ. Không đợi thời gian thật để kiểm tra checkpoint.

### Giới hạn còn lại sau F–K

- Credential merchant đã có trong cấu hình local; chưa có bằng chứng IPN HTTPS public hay giao dịch PAY/IPN/QueryDr thật. HMAC/mapping được kiểm thử cục bộ; bước L chưa hoàn tất.
- Chưa kết nối MongoDB dự án để xác minh index trên dữ liệu đang chạy hoặc backfill dữ liệu cũ. C vẫn cần backup/dry-run/migrate có kiểm soát.
- Restart được kiểm tra bằng lease hết hạn được worker khác nhận lại, không bằng việc kill/restart một tiến trình production; cần nghiệm thu vận hành khi triển khai worker thật.
- Toàn bộ thay đổi trạng thái cần chạy trên MongoDB hỗ trợ transaction/replica set. Không kết luận đã chạy Sandbox hoặc migrate dữ liệu thật từ bộ test này.

## 15. Hoàn thiện Return URL Sandbox trong worktree Dung (29/10/2026)

- Cấu hình `.env` ban đầu gửi trình duyệt quay lại `sandbox.vnpayment.vn/paymentv2/vpcpay.html`, tức endpoint tạo thanh toán, không phải website merchant. Trong worktree `w2-be`, Return URL local đã được đặt cùng host Cloudflare với IPN và trỏ `/api/v1/integrations/payments/vnpay/return`; file `.env` bị Git ignore.
- Thêm trang Return tĩnh thông báo backend đang xác nhận kết quả. Trang không dùng query callback làm căn cứ thanh toán, không ghi Payment/Checkout/Order. IPN/QueryDr vẫn là nguồn trạng thái tài chính.
- Thêm validation fail-fast để từ chối Return URL trỏ cùng host trang thanh toán VNPAY. Cập nhật `.env.example`, API Routes và API Contracts.
- Người dùng xác nhận backend trước đó đã chạy trên cổng 4000 sau khi sửa IP QueryDr; riêng worktree này, cấu hình VNPAY được nạp thành công và Return/IPN paths hợp lệ. Chưa xác minh MongoDB/API trong phiên công cụ, tunnel public hoặc IPN đã lưu ở VNPAYGW SIT.
- `node backend/test/vnpay.test.js` đạt 5/5; `node --check` cho config/route/test, nạp cấu hình local và `git diff --check` đều đạt. Chưa chạy bộ integration MongoDB trong worktree hoặc giao dịch Sandbox thật.
- Cần khởi động lại `npm run dev` trong worktree `w2-be` để nạp `.env` đã chỉnh. Worker chạy terminal riêng bằng `npm run worker:vnpay`. Chưa chạy giao dịch Sandbox thật; do đó L còn mở.

## 16. Kiểm tra ban đầu cổng SIT và tunnel công khai (29/10/2026)

- Email Merchant cung cấp trang thanh toán TEST `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html` và cổng kiểm thử SIT `https://sandbox.vnpayment.vn/vnpaygw-sit-testing/user/login`. Trang thanh toán trùng endpoint cố định trong adapter; cổng SIT mở được nhưng yêu cầu đăng nhập.
- Từ trình duyệt, `https://arrangement-prisoners-ping-undertaken.trycloudflare.com/health/ready` trả `{"data":{"status":"ready"}}`; tunnel HTTPS đang tới một backend có MongoDB sẵn sàng.
- Ở lần kiểm tra đầu, URL `https://arrangement-prisoners-ping-undertaken.trycloudflare.com/api/v1/integrations/payments/vnpay/return` trả `NOT_FOUND`, do cổng 4000 đang chạy từ checkout chính thay vì worktree `w2-be`. Đã chuyển runtime; kết quả sau chuyển được ghi ở mục 17.
- `.env` local trong worktree `w2-be` đang đặt IPN là `https://arrangement-prisoners-ping-undertaken.trycloudflare.com/api/v1/integrations/payments/vnpay/ipn` và Return là cùng host với path `/api/v1/integrations/payments/vnpay/return`. Không ghi giá trị bí mật vào báo cáo.
- Worktree `w2-be` chưa có `backend/node_modules` nhưng có `package-lock.json`; cần chạy `npm ci` trong thư mục `backend` trước khi khởi động API/worker.
- Hướng xử lý 404 ban đầu là chuyển tiến trình cổng 4000 sang worktree `w2-be`, giữ tunnel trỏ tới `localhost:4000`, và xác minh lại Return URL. Phần chuyển runtime đã hoàn tất ở mục 17. Cổng SIT vẫn cần đăng nhập để lưu IPN URL; nếu hostname Quick Tunnel đổi, cập nhật cả `.env` lẫn SIT.
- Chạy `npm run worker:vnpay` trong một terminal riêng. Sau khi API, IPN public, worker và dữ liệu Buyer/Seller demo hoạt động, tiếp tục các ca L: thanh toán nhiều Seller thành công; thất bại/hủy và QueryDr; IPN lặp/sai; đối chiếu số tiền, reference, mapping và lưu bằng chứng đã che dữ liệu nhạy cảm.
- **Trạng thái L:** chưa hoàn tất. Phiên công cụ không có phiên đăng nhập Merchant hoặc phiên Buyer/Seller để tạo giao dịch; việc đăng ký IPN và thanh toán cần thao tác trong tài khoản Sandbox. Sau khi người dùng hoàn tất các mục setup trên, có thể tiếp tục nghiệm thu phần còn lại.

## 17. Chuyển runtime sang worktree w2-be và chạy worker (29/10/2026)

- Cài dependencies từ `backend/package-lock.json` bằng `npm ci` trong worktree `w2-be`; kiểm tra module `bcrypt` được nạp thành công.
- Dừng API cũ chạy từ checkout chính trên cổng 4000; khởi động `npm run dev` từ worktree `w2-be`. API báo `listening on port 4000`.
- Giữ nguyên Cloudflare Quick Tunnel hiện có. Truy cập URL Return công khai trả trang “Đã quay lại từ VNPAY”; route không cập nhật trạng thái thanh toán.
- Khởi động `npm run worker:vnpay` từ worktree `w2-be`. Kết nối MongoDB read-only được xác minh `ready`; worker chạy vòng đối soát định kỳ và không in log khi không có việc đến hạn.
- Không ghi nhận giao dịch Sandbox, IPN thật hoặc QueryDr thật trong bước này. Bước L còn mở đến khi IPN URL được lưu trong SIT và chạy đủ các ca giao dịch ở mục 12.
