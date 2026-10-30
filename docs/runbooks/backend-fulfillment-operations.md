# Runbook backend giao nhận, khiếu nại và vận hành

## Khởi động và kiểm tra API

Tại thư mục `backend`, chạy `npm start` để đọc cấu hình local và khởi động API. MongoDB phải là replica set để các transaction giao nhận/khiếu nại hoạt động. Không chép URI hoặc secret từ `.env` vào log, chat hay tài liệu.

- `GET /health/live` xác nhận tiến trình API đang phản hồi.
- `GET /health/ready` xác nhận API kết nối được MongoDB. Endpoint này không xác nhận worker đang chạy.
- Request log là JSON một dòng trên stdout; trường gồm requestId, method, route template, statusCode, durationMs và mã lỗi chuẩn hóa nếu có. Không có query string, body, header hoặc object Error.
- Cấu hình host/container giữ log tối đa 30 ngày và đặt quyền đọc phù hợp. Log rotation/alert của host chưa được cấu hình trong repo.

## Audit và migration dữ liệu

- `npm run audit:fulfillment-data` chỉ đọc dữ liệu/index và luôn báo `writesPerformed: 0`.
- `npm run migrate:fulfillment-data` mặc định dry-run. Chỉ dùng `--apply` sau khi có backup MongoDB đã kiểm tra và xác nhận các candidate đủ căn cứ.
- Không tự gắn Checkout/Order vào Listing `SOLD` mồ côi; không giải phóng Listing của Checkout/Payment đang `NEEDS_REVIEW`.

## Retention hồ sơ Case

Job dùng mốc 12 tháng lịch UTC sau `closedAt`, kẹp ngày về ngày cuối tháng nếu tháng đích ngắn hơn. Mỗi lượt tối đa 100 Case và 100 tệp. Mặc định là dry-run:

```sh
npm run retention:cases -- --dry-run
```

Job chỉ xem Case `CLOSED` đã qua mốc. Khi áp dụng, job thay nội dung tự do bằng marker lưu trữ, xóa tham chiếu evidence và metadata snapshot của Complaint, xóa ghi chú tự do trong Case/Audit/Notification. Tệp evidence chỉ được xóa nếu không còn tham chiếu từ Listing, Order hoặc Case/Complaint/Report khác. Tệp đang xử lý chuyển sang `RETENTION_PENDING`, API media trả 404; nếu xóa tệp lỗi, chạy lại job để retry.

Áp dụng trên database riêng có tên kết thúc `_test` bằng `npm run retention:cases -- --apply`. Với database khác, trước tiên cần tạo và xác minh backup; chỉ sau đó mới chạy với `CASE_RETENTION_BACKUP_VERIFIED=1` và `--confirm-live-db`. Mỗi lượt giới hạn 100 Case và 100 tệp; chạy lại đến khi `eligibleCasesRemaining` và `pendingMediaRemaining` cùng bằng 0. Nếu `deferred` khác 0 vì tệp còn tham chiếu, dừng và điều tra tham chiếu; không ép xóa. Không áp dụng retention lên dữ liệu tài chính, Checkout, Order hoặc ảnh snapshot Order.

Sau khi nội dung Complaint được ẩn danh, Buyer vẫn xem được receipt trong danh sách; gọi detail trả `410 CONTENT_REDACTED`. Admin thấy cờ `contentRedacted` và metadata tombstone, không thấy nội dung cũ.

Job chưa được đặt lịch tự động trong môi trường triển khai. Người vận hành cần lên lịch chạy hằng ngày, kiểm tra dry-run/summary và cấu hình lưu log phù hợp trước khi dùng production.

## VNPAY và worker

VNPAY runtime đang tạm tắt: checkout mới chỉ nhận COD, API không mount IPN/Return, không nạp cấu hình VNPAY khi khởi động. Không khởi chạy worker VNPAY trong giai đoạn này. Các attempt cũ `NEEDS_REVIEW` vẫn phải giữ hold cho tới khi có bằng chứng đối chiếu đáng tin cậy; không chuyển trạng thái bằng Return URL hoặc mã QueryDr chưa xác minh. Worker heartbeat, QueryDr thật, callback/IPN và giao dịch Sandbox thật chưa được nghiệm thu.

## Bàn giao sau triển khai

- Xác nhận replica set, volume MongoDB, media volume và quyền truy cập/backup.
- Xác nhận health API, log rotation 30 ngày và cảnh báo worker nếu VNPAY được bật lại.
- Đặt lịch retention hằng ngày; xem dry-run trước khi bật áp dụng.
- Chạy bộ hồi quy trên database riêng `_test`; không reset database đang vận hành.
- Merchant Sandbox, IPN công khai, giao dịch thật và QueryDr thật cần nghiệm thu riêng.
