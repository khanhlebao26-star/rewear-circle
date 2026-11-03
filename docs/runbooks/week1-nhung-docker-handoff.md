# Bàn giao Rewear Circle — Docker và khám phá tin

Ngày bàn giao: 31/10/2026<br>
Phạm vi: kế hoạch tuần 1 của Nhung, các bước A–G. Đây là runtime demo/kiểm thử cô lập, **chưa phải cutover dữ liệu hay nghiệm thu production**.

## Thành phần đã bàn giao

- Compose runtime: frontend Next.js, Express API, MongoDB replica set và Mailpit.
- Image Node 24, lockfile, cấu hình mẫu, healthcheck, log rotation và named volumes riêng cho DB/media.
- Profile riêng cho dev, test, maintenance, retention dry-run và restore cô lập.
- Feed/chi tiết DISC tối thiểu dùng API hiện có qua Next.js rewrite; bộ lọc yêu cầu session đăng nhập.
- Runbook build/chạy, backup/restore, thao tác vận hành, ma trận DISC và hồi quy.

## Khởi động và kiểm tra

1. Cần Git, Docker Engine/Compose và trình duyệt trên máy mới.
2. Tạo `.env` ở repo root từ `.env.example`; đặt `SESSION_SECRET` ngẫu nhiên riêng tư. Không commit `.env`.
3. Chạy từ thư mục gốc repository:

```sh
docker compose up --build -d
docker compose ps
```

- Giao diện: `http://localhost:3001`
- Mailpit: `http://localhost:8026`
- MongoDB/API/SMTP chỉ dùng trong Compose network; không publish cổng DB, API hoặc SMTP ra host.
- Dừng thông thường bằng `docker compose stop`; lệnh này giữ DB và media volumes. Không dùng `down -v` để dừng.

Các lệnh test, seed, audit, migration, retention, backup và restore nằm trong [runbook vận hành](week1-nhung-docker-operations.md). Seed là lệnh riêng; không chạy tự động khi startup. Migration/retention mặc định dry-run; xem guard và điều kiện apply trong runbook trước khi chạy thao tác ghi.

## Bằng chứng nghiệm thu

- [Baseline bước A](week1-nhung-docker-discovery-baseline.md)
- [Backup/restore bước B](week1-nhung-docker-data-restore-check.md)
- [Runtime Compose bước D](week1-nhung-docker-compose-runtime.md)
- [Vận hành Docker bước E](week1-nhung-docker-operations.md)
- [Nghiệm thu DISC bước F](week1-nhung-docker-discovery-check.md)
- [Hồi quy bước G](week1-nhung-docker-regression-check.md)

Bước G chạy toàn bộ suite trong Docker: 17 test, 0 lỗi, 0 skip; kiểm tra auth/email qua Mailpit, upload/quyền đọc ảnh, luồng COD và moderation, dry-run, apply guard, stop/start, build/recreate và clone sạch. DB demo giữ 4 user, 5 listing, 2 media record, 2 session; media volume giữ 1 file sau recreate. Cấu hình Compose và `git diff --check` đều đạt.

## Biên dữ liệu và an toàn

- Demo dùng database `rewear_circle_demo`, volume `rewear-circle-demo-mongo-data` và `rewear-circle-demo-media`; không dùng external volume `rewear-mongo-data` và không nhập dữ liệu nguồn vào demo.
- Test, restore drill và clone sạch dùng Compose project/database/volume riêng. Không chạy test lên dữ liệu nguồn.
- Recovery snapshot gần nhất nằm ngoài Git tại `/tmp/rewear-circle-stepG-final-20261031`, quyền thư mục `0700`, file `0600`. Snapshot có cấu hình backend nhạy cảm; không gửi qua chat, không đưa vào repository. `/tmp` không phải nơi lưu trữ backup bền vững; chuyển tới kho được nhóm phê duyệt trước khi cần phục hồi.
- Worker VNPAY local trong phạm vi Rewear đã được dừng graceful. VNPAY vẫn tắt và chưa nghiệm thu Sandbox. MongoDB/Mailpit legacy và tiến trình TutorLink ngoài phạm vi không bị dừng.
- Clone sạch nghiệm thu hiện dùng cấu hình tạm và Compose override dưới `/tmp`, cổng frontend `3012`, Mailpit `8027`; đây là fixture kiểm thử, không phải cấu hình khởi chạy cho nhóm.

## Việc cần làm trước cutover hoặc production

1. Chọn thời điểm bảo trì, xác định và dừng có kiểm soát tất cả writer nguồn thuộc Rewear (API, worker/job có ghi DB và upload), rồi tạo snapshot DB+uploads cùng mốc. Snapshot hiện tại là recovery drill đã xác minh, không thay thế backup transfer nhất quán.
2. Chuyển backup từ `/tmp` sang kho bền vững được phê duyệt, xác minh restore trên project/volume mới, đối chiếu dữ liệu và ảnh trước khi quyết định cutover.
3. Lên lịch thao tác cutover/rollback riêng. Giữ nguồn cũ nguyên vẹn đến khi đã đối chiếu và có kế hoạch xử lý mọi write mới; không chạy hai runtime cùng ghi một dữ liệu.
4. Nghiệm thu VNPAY/Sandbox riêng nếu dự án bật lại. Compose hiện cố ý không có worker hoặc tunnel thanh toán.
5. Bước H còn cần rà soát API contract và runbook tuần 2 nếu có nội dung cần cập nhật; hợp đồng API hiện hữu được giữ nguyên trong bước DISC.

Không có thao tác xóa volume legacy, dọn snapshot hoặc push remote trong phạm vi bàn giao này.
