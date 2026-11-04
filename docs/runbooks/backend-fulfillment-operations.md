# Runbook backend giao nhận, khiếu nại và vận hành

## Khởi động và kiểm tra API

Runtime Docker được hỗ trợ dùng cả `compose.yaml` và `compose.operations.yaml`. Chạy tại thư mục gốc dự án:

```powershell
docker compose -f compose.yaml -f compose.operations.yaml --profile retention up --build -d --wait backend frontend retention-scheduler
docker compose -f compose.yaml -f compose.operations.yaml up -d --no-deps --force-recreate --wait gateway
```

Gateway nhận http://localhost:3001, chuyển API trực tiếp tới backend và trang tới frontend. Backend/frontend không xuất cổng riêng ra host; Nginx ghi đè forwarded headers và backend nhận TRUST_PROXY_HOPS=1. Demo HTTP giữ NODE_ENV=development. Tạo lại gateway sau khi thay container backend/frontend để làm mới địa chỉ upstream.

Nếu chạy backend trực tiếp trên host, tại thư mục `backend` dùng `npm start` và cấu hình riêng trong `backend/.env`. MongoDB phải là replica set để các transaction hoạt động. Không chép URI hoặc secret từ `.env` vào log, chat hay tài liệu.

- `GET /health/live` xác nhận tiến trình API đang phản hồi.
- `GET /health/ready` xác nhận API kết nối được MongoDB. Endpoint này không xác nhận worker đang chạy.
- Request log là JSON một dòng trên stdout và file API trong `/app/logs`; trường gồm requestId, method, route template, statusCode, durationMs và mã lỗi chuẩn hóa nếu có. Không có query string, body, header hoặc object Error.
- File `api-YYYY-MM-DD.jsonl` và `retention-YYYY-MM-DD.jsonl` nằm trong volume `rewear-circle-src-technical-logs`, quyền 600. Giữ ngày UTC hiện tại và 29 ngày trước; dọn khi ghi log ngày mới và trong mỗi lượt scheduler. Khi dịch vụ tắt, việc dọn tiếp tục lúc chạy lại. Log Docker chẩn đoán dùng json-file 10 MB × 3 tệp/container, không cam kết giữ đủ 30 ngày. AuditEvent/tài chính có chính sách riêng. Cảnh báo/metrics bên ngoài chưa được cấu hình.

## Audit và migration dữ liệu

- `npm run audit:fulfillment-data` chỉ đọc dữ liệu/index và luôn báo `writesPerformed: 0`.
- `npm run migrate:fulfillment-data` mặc định dry-run. Chỉ dùng `--apply` sau khi có backup MongoDB đã kiểm tra và xác nhận các candidate đủ căn cứ.
- Không tự gắn Checkout/Order vào Listing `SOLD` mồ côi; không giải phóng Listing của Checkout/Payment đang `NEEDS_REVIEW`.

## Retention hồ sơ Case

Job dùng mốc 12 tháng lịch UTC sau `closedAt`, kẹp ngày về ngày cuối tháng nếu tháng đích ngắn hơn. Mỗi lượt tối đa 100 Case và 100 tệp. Mặc định là dry-run:

```sh
npm run retention:cases -- --dry-run
```

Job chỉ ẩn danh Case `CLOSED` đã qua mốc. Khi áp dụng, job thay nội dung tự do bằng marker lưu trữ, xóa tham chiếu evidence và metadata snapshot của Complaint, xóa ghi chú tự do trong Case/Audit/Notification. Job cũng quét lại ảnh CASE_EVIDENCE gắn với Case đã hết hạn và đã ẩn danh, kể cả khi không còn Case mới cần xử lý. Tệp chỉ được đánh dấu RETENTION_PENDING khi không còn tham chiếu cần giữ từ Listing, Order, Case, Complaint hoặc Report; API media trả 404 cho tệp đang chờ. Nếu xóa tệp lỗi, lượt sau retry. Ảnh còn được dùng bởi Case active/recent không bị đánh dấu nên vẫn truy cập được theo quyền hiện có.

Áp dụng trên database riêng có tên kết thúc `_test` bằng `npm run retention:cases -- --apply`. Với database khác, ưu tiên scheduler có quy trình backup bên dưới; không đặt CASE_RETENTION_BACKUP_VERIFIED cố định trong .env. Mỗi lượt giới hạn 100 Case và tối đa 100 lần xóa tệp; scheduler chạy tiếp đến khi `eligibleCasesRemaining`, `pendingMediaRemaining` và `eligibleMediaRemaining` cùng bằng 0. Trường cuối đếm ảnh đã đủ điều kiện nhưng chưa được đưa vào hàng đợi của lô này. Nếu `deferred`/`errors` khác 0, dừng lượt xử lý và kiểm tra, không ép xóa. Không áp dụng retention lên dữ liệu tài chính, Checkout, Order hoặc ảnh snapshot Order.

Sau khi nội dung Complaint được ẩn danh, Buyer vẫn xem được receipt trong danh sách; gọi detail trả `410 CONTENT_REDACTED`. Admin thấy cờ `contentRedacted` và metadata tombstone, không thấy nội dung cũ.

Scheduler đã được cấu hình trong overlay, chạy ngay khi khởi động và khoảng mỗi 24 giờ; lỗi được thử lại sau 10 phút. Cấu hình mặc định cho môi trường mới là RETENTION_MODE=dry-run. Để bật apply trên demo:

```powershell
docker compose -f compose.yaml -f compose.operations.yaml --profile retention run --build --rm --no-deps retention-scheduler node src/scripts/retainCases.js --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Xem trước thất bại.' }
docker compose -f compose.yaml -f compose.operations.yaml --profile ops run --build --rm --no-deps maintenance sh /opt/rewear-ops/backup.sh
if ($LASTEXITCODE -ne 0) { throw 'Backup thất bại; chưa bật apply.' }
```

Xác nhận backup-manifest.txt có archive_verified=yes và uploads_verified=yes. Backup maintenance có thể chứa bản sao root .env; không đưa backups lên Git hoặc chia sẻ công khai. Sau đó sửa RETENTION_MODE=apply trong .env tại gốc dự án, giữ nguyên các biến khác, và chạy:

```powershell
docker compose -f compose.yaml -f compose.operations.yaml --profile retention up -d --no-deps --force-recreate retention-scheduler
docker compose -f compose.yaml -f compose.operations.yaml exec -T retention-scheduler printenv RETENTION_MODE
docker compose -f compose.yaml -f compose.operations.yaml exec -T retention-scheduler cat /app/logs/retention-health.json
docker compose -f compose.yaml -f compose.operations.yaml logs --tail=80 retention-scheduler
```

Cần status=ok, mode=APPLIED và biến thực tế apply. Nếu không có việc đủ điều kiện, writesPerformed=0 là đúng. Khi có việc, scheduler tạo và xác minh backup mới trước apply; backup lỗi thì không thay đổi dữ liệu. Chỉ sửa RETENTION_MODE trong .env không cập nhật container đang chạy: cần tạo lại scheduler. Muốn tạm ngừng thay đổi dữ liệu, chuyển về dry-run rồi tạo lại; scheduler vẫn dọn log hằng ngày. Backup có chính sách lưu riêng, hiện chưa tự dọn backup cũ. Admin xóa sớm vẫn hoãn.

## VNPAY và worker

VNPAY runtime đang tạm tắt: checkout mới chỉ nhận COD, API không mount IPN/Return, không nạp cấu hình VNPAY khi khởi động. Không khởi chạy worker VNPAY trong giai đoạn này. Các attempt cũ `NEEDS_REVIEW` vẫn phải giữ hold cho tới khi có bằng chứng đối chiếu đáng tin cậy; không chuyển trạng thái bằng Return URL hoặc mã QueryDr chưa xác minh. Worker heartbeat, QueryDr thật, callback/IPN và giao dịch Sandbox thật chưa được nghiệm thu.

## Bàn giao sau triển khai

- Xác nhận replica set, volume MongoDB, media volume và quyền truy cập/backup.
- Xác nhận health API, volume log API/retention 30 nhóm ngày UTC, Docker log xoay theo dung lượng và cảnh báo worker nếu VNPAY được bật lại.
- Xác nhận scheduler healthy, đúng RETENTION_MODE và summary không có errors/deferred; xem dry-run và kiểm tra backup trước khi bật apply.
- Chạy bộ hồi quy trên database riêng `_test`; không reset database đang vận hành.
- Merchant Sandbox, IPN công khai, giao dịch thật và QueryDr thật cần nghiệm thu riêng.
