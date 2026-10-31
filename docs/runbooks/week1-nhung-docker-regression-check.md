# Báo cáo hồi quy Docker — Bước G

Ngày nghiệm thu: 31/10/2026. Kết quả: **PASS trong phạm vi kiểm thử đã nêu**.

## Kết quả

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Bộ test backend chạy trong Docker | PASS — 17 test, 0 fail, 0 skip; 7 suite | `docker compose --profile test run --build --rm test-runner` |
| Đăng ký/đăng nhập và xác minh email | PASS | Trên clone cô lập, test đăng ký tài khoản ngẫu nhiên, nhận OTP qua Mailpit, xác minh email, đăng nhập và lọc feed; kết quả chỉ ghi boolean và tổng số: `registered=true`, `mailpit_received=true`, `email_verified=true`, `signed_in_filter_total=3`. |
| Quy trình tuần 2 | PASS | Bộ `commerce-flow` kiểm thử COD, giao/nhận, khiếu nại, quyền Support/Admin, audit, notification và receipt; `moderation-flow` kiểm thử report/case/audit. Test discovery còn kiểm thử admin ẩn/hiện listing, visibility ảnh và audit/notification. |
| Ảnh và quyền đọc | PASS | Upload PNG qua API; chủ listing đọc được (200), guest bị từ chối (404), audit private read được bảo vệ. |
| Audit, migration và retention dry-run | PASS | Chạy qua maintenance container trên demo; cả ba dry-run không ghi dữ liệu. Audit không phát hiện index bắt buộc bị thiếu. |
| Migration apply guard | PASS | Apply trên cấu hình demo bị từ chối trước khi thay đổi dữ liệu. Chạy guard đúng điều kiện trên DB `rewear_circle` rỗng trong Compose project cô lập thành công; 0 checkout/order được migrate và 0 listing được liên kết. Không apply lên dữ liệu nguồn. |
| Stop/start và force-recreate | PASS | Đã stop/start rồi build lại image và force-recreate stack demo. Backend, frontend, MongoDB, Mailpit đều healthy; browser tải lại feed được. Trước/sau: 4 user, 5 listing, 2 media record, 2 session; media volume còn 1 file. |
| Clone sạch | PASS | Clone thử có `.env` mới từ mẫu, project/volume/network riêng, MongoDB/media volume ban đầu trống, frontend `localhost:3012`, Mailpit `localhost:8027`. Không dùng host `.env`, `node_modules`, DB hay uploads. Các dịch vụ hiện vẫn healthy. |
| Đối chiếu dữ liệu phục hồi | PASS | Đối chiếu theo báo cáo Bước B và restore drill Bước E; không giải phóng payment hold hoặc đổi trạng thái thanh toán cũ. |
| Cấu hình và diff | PASS | `docker compose config --quiet`; `git diff --check`. |

## Tách biệt dữ liệu và trạng thái vận hành

- DB runtime demo `rewear_circle_demo`, DB nguồn `rewear_circle`, test DB và DB clone sạch nằm trên project/database/volume riêng. Không import dữ liệu lịch sử vào demo.
- Đã dừng worker VNPAY chạy local trong worktree Rewear bằng SIGTERM sau khi Docker thay thế được xác nhận. VNPAY vẫn chưa bật/nghiệm thu; không có worker hoặc tunnel VNPAY trong Compose.
- Không dừng tiến trình TutorLink, MongoDB legacy hoặc Mailpit legacy vì chúng ngoài phạm vi bước này.
- Snapshot recovery cuối ở `/tmp/rewear-circle-stepG-final-20261031`; thư mục quyền `700`, file quyền `600`. Archive MongoDB có oplog và archive uploads đã được xác minh. Thư mục còn chứa bản sao cấu hình backend nhạy cảm phục vụ phục hồi; giữ nguyên quyền hạn chế và không đưa vào Git.
- MongoDB test đã dừng sau khi test hoàn tất. Runtime demo và clone sạch vẫn đang chạy.

## Giới hạn

Kết quả xác nhận hồi quy trên dữ liệu demo và môi trường clone cô lập. Không phải nghiệm thu production, hiệu năng tải, VNPAY/Sandbox hoặc chuyển đổi dữ liệu thật. Giao diện được smoke test trên feed/chi tiết và luồng tìm kiếm; không thay thế kiểm thử thủ công toàn bộ UI.
