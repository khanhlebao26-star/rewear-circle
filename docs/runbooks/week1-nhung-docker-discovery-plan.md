# Kế hoạch bổ sung tuần 1 — cấu trúc, Docker và khám phá tin

Ngày lập: 31/10/2026. Trạng thái: kế hoạch thực hiện, chưa triển khai hoặc nghiệm thu.

## 1. Mục tiêu và phạm vi

- Bổ sung phần nền tảng tuần 1 trên mã hiện tại, bảo toàn nghiệp vụ tuần 2.
- Chạy frontend, backend, MongoDB và Mailpit bằng Docker Compose.
- Chuyển mọi thao tác vận hành đang phụ thuộc Node/npm/MongoDB Tools trên máy sang container: build, dev, test, seed, audit, migration, retention, backup và restore.
- Kiểm chứng API khám phá hiện có; chỉ bổ sung khi thiếu hoặc có lỗi được tái hiện.
- Bàn giao cho thành viên khác chạy được từ bản clone mới, không cần cài Node/npm/MongoDB Tools trên host.
- Không viết lại lịch sử Git, không push trong đợt triển khai này; SSH của Nhung được xử lý riêng.

Máy host vẫn cần Docker Engine và Compose, Git, trình duyệt cùng nơi lưu cấu hình/backup. “Chạy qua Docker” nghĩa là không có tiến trình ứng dụng hoặc công cụ nghiệp vụ bắt buộc chạy trực tiếp trên host; truy cập localhost bằng trình duyệt vẫn bình thường.

Giả định: môi trường phát triển/demo trên một máy, dữ liệu thử và lưu lượng nhỏ; không cam kết SLA hoặc hiệu năng production. Dùng cùng dữ liệu kiểm thử để so sánh trước/sau, ghi thời gian phản hồi và lỗi quan sát được; chưa đặt ngưỡng tải không có trong yêu cầu. Secret và dữ liệu nhận hàng không được đưa vào Git/log. Nhóm dự án tiếp quản Compose, cấu hình mẫu và runbook.

Không mở rộng sang Kubernetes, CI/CD, toàn bộ giao diện tuần 2 hoặc bật lại VNPAY. VNPAY hiện bị tắt; không tự bật worker, callback hay tunnel để hoàn thành yêu cầu Docker.

## 2. Hiện trạng đã kiểm tra

- Có backend Express, chưa có thư mục frontend. Tài liệu đã chọn Next.js App Router JavaScript và Node.js 24 LTS.
- Compose có MongoDB replica set và Mailpit, chưa có frontend/backend, healthcheck hoặc bước khởi tạo replica set tự động.
- MongoDB đang dùng external volume `rewear-mongo-data`; không được dùng volume này cho kiểm thử phá hủy.
- API DISC nằm trong `backend/src/routes/commerce.js`: GET `/api/v1/listings` và GET `/api/v1/listings/:id`.
- Có bộ đọc query `backend/src/domain/discoveryRules.js`, aggregation lấy đúng approvedVersionId và quy tắc hiển thị chung.
- Kế hoạch tin đăng cũ còn ghi DISC chưa có; cần cập nhật phân công và trạng thái dựa trên bằng chứng.
- Upload và seed sử dụng `backend/uploads`; retention cần truy cập cùng kho ảnh.
- Script npm dùng `--env-file=.env`, cần tương thích cấu hình được Docker inject mà không đóng gói secret vào image.
- Migration apply chỉ cho URI loopback và database `rewear_circle`, đồng thời gọi trực tiếp `mongorestore` để kiểm tra backup.
- Retention mặc định dry-run, chưa có lịch tự động. Worker VNPAY không thuộc runtime đang bật.
- Thư mục `plan/` đang bị Git ignore; lưu kế hoạch này trong `docs/runbooks/` để có thể bàn giao qua Git.

## 3. Quyết định và phương án

Chọn bổ sung Compose trên cấu trúc hiện hữu, dùng lại backend và quy tắc nghiệp vụ. Không chuyển toàn bộ source sang monorepo mới vì làm tăng phạm vi xung đột; không duy trì backend local song song vì không đạt yêu cầu chạy bằng Docker.

Frontend tối thiểu gồm trang danh sách và chi tiết để chứng minh tích hợp DISC; tìm kiếm/lọc được kiểm thử bằng session đăng nhập thật. Không cần dựng lại toàn bộ màn hình tài khoản/đơn hàng trong phạm vi này.

Runtime chính: frontend → `/api/v1` qua Next.js rewrite → backend → MongoDB; backend gửi mail tới Mailpit. Trình duyệt dùng origin localhost, container dùng DNS dịch vụ nội bộ. Giữ cơ chế session và kiểm tra Origin hiện có.

Tách môi trường nghiệm thu bằng Compose project, volume, database và cổng riêng. Chỉ chuyển môi trường hiện tại sang Docker sau khi backup và restore thử thành công. Không để hai MongoDB cùng mở một data directory.

Lệnh bảo trì dùng image có Node và MongoDB Database Tools. Đối với migration apply hiện có, ưu tiên maintenance container chia sẻ network namespace của MongoDB để giữ URI loopback và database guard; không bỏ guard để chấp nhận hostname tùy ý. Kiểm chứng cách này trong môi trường phục hồi riêng trước khi áp dụng dữ liệu hiện tại.

Retention có lệnh container chạy một lần và lịch trong container nếu cần vận hành hằng ngày. Mặc định lịch chỉ dry-run; apply là bước riêng có backup guard. Docker hóa không đồng nghĩa cho phép tự động xóa dữ liệu.

## 4. Các bước thực hiện

### Bước A — Ghi nhận mốc và lập danh mục phụ thuộc

- [x] Đọc lại Git status và lịch sử tại thời điểm bắt đầu; HEAD là `57b8051`, còn file kế hoạch này mới là untracked.
- [x] Liệt kê API, MongoDB, Mailpit, job, tunnel và tiến trình local đang chạy; không có tiến trình ứng dụng dự án nào được thấy. Docker/socket inspection bị hạn chế quyền; xem baseline để biết mục nào chưa xác minh.
- [x] Kiểm kê tên biến môi trường, cổng, replica-set member hostname, volumes, ảnh upload và lệnh vận hành; không in giá trị secret. Các cổng khai báo và điểm cần kiểm tra được ghi trong baseline.
- [x] Ghi kết quả kiểm thử nền; phân biệt pass, fail và skip do thiếu cấu hình. Xem [baseline Bước A](week1-nhung-docker-discovery-baseline.md).
- [x] Chốt DISC thuộc phần bàn giao của Nhung; cập nhật chỗ tài liệu đang giao trùng cho cụm tin đăng. Code hiện đã có DISC-01/02; kế hoạch cụm Khanh được cập nhật theo bằng chứng.

Đầu ra: danh mục chuyển đổi local → Docker và mốc đối chiếu; chưa ghi dữ liệu dự án.

### Bước B — Chuẩn bị an toàn dữ liệu

- [x] Tạo backup MongoDB bằng công cụ trong container, kiểm tra archive; backup cả ảnh upload và thông tin cấu hình cần phục hồi với quyền truy cập hạn chế. Backup ở `/tmp/rewear-circle-stepB-20261031`, quyền thư mục `700`, file `600`.
- [ ] Khi lấy bản backup dùng để chuyển môi trường, dừng các tiến trình ghi liên quan để DB và ảnh có mốc nhất quán. Chưa dừng runtime vì điều kiện ở mục 6 yêu cầu Docker mới phải được kiểm chứng trước; snapshot hiện tại dùng oplog và chỉ là recovery drill.
- [x] Restore thử vào MongoDB/volume riêng, đối chiếu số lượng và liên kết User, Listing, Checkout, Order, Case, Media cùng các bản ghi thanh toán cũ nếu có. Xem [báo cáo backup/restore Bước B](week1-nhung-docker-data-restore-check.md).
- [x] Ghi lệnh rollback, đường dẫn backup và điều kiện chuyển môi trường; không ghi secret. Xem [báo cáo backup/restore Bước B](week1-nhung-docker-data-restore-check.md).

Đầu ra: bản phục hồi thử đọc được dữ liệu và ảnh; không coi archive tồn tại hoặc dry-run thành công là đủ thay cho restore thử.

### Bước C — Chốt cấu trúc và image

- [x] Giữ `backend/`, `docs/`; thêm `frontend/`, Dockerfile và `.dockerignore` cần thiết.
- [x] Giữ Node 24 theo tài liệu; dùng lockfile và cài dependency bên trong image/container. Frontend lockfile được tạo từ Node 24 container.
- [x] Không copy `.env`, backup, uploads hoặc host `node_modules` vào build context/image.
- [x] Backend nhận biến môi trường Docker và giữ được cách đọc cấu hình phát triển hiện hữu nếu cần; không bắt buộc mount secret thành file `.env` trong image. Dùng `--env-file-if-exists=.env`.
- [x] Tách dependency container khỏi host khi bind mount source cho dev; README yêu cầu named volume tại `/app/node_modules`, Compose mount sẽ được khai báo ở Bước D.
- [x] Ghi README gốc: cấu trúc, chuẩn bị cấu hình, build/up, kiểm tra và dừng. Các lệnh runtime được ghi rõ chỉ dùng sau khi hoàn tất Compose Bước D.

Đầu ra: build frontend/backend thành công mà không dùng npm trên host.

### Bước D — Compose đủ dịch vụ và lưu trữ

- [x] Khai báo frontend, backend, MongoDB, Mailpit; MongoDB có healthcheck và init replica set chỉ khi chưa khởi tạo.
- [x] Chọn hostname replica set truy cập được từ các container; không tự reconfig replica set dữ liệu cũ khi startup.
- [x] Backend chỉ chạy sau khi replica set có primary; readiness kiểm tra kết nối DB, thử transaction riêng để chứng minh nghiệp vụ tuần 2 hoạt động.
- [x] Cấu hình URI nội bộ tới mongo, SMTP tới mailpit và rewrite tới backend; giữ APP_ORIGIN khớp địa chỉ trình duyệt.
- [x] Chỉ mở các cổng localhost cần dùng; tránh trùng các dịch vụ đang chạy.
- [x] Tạo volume bền vững cho DB và media; backend, seed và retention dùng đúng cùng media volume.
- [x] Cấu hình restart và log rotation có giới hạn dung lượng; mô tả rõ giới hạn dung lượng không bảo đảm lưu đủ 30 ngày.
- [x] Kiểm tra cookie/session qua frontend, tránh đặt secure cookie khi demo HTTP local.

Chi tiết kiểm chứng: [Compose runtime Bước D](week1-nhung-docker-compose-runtime.md).

Đầu ra: một lệnh Compose khởi động runtime chính; restart/recreate giữ nguyên dữ liệu và ảnh.

### Bước E — Chuyển toàn bộ lệnh vận hành sang Docker

- [x] Có cách chạy dev, build, test và seed trong container; các lệnh có trong README và runbook vận hành.
- [x] Có lệnh audit, migration dry-run, retention dry-run trong container, không thay đổi mặc định an toàn.
- [x] Có maintenance image/service với Node và Database Tools; đã chạy `mongorestore --version` thành công.
- [x] Có backup/restore chạy bằng container, archive mount đúng đường dẫn; đã restore và đối chiếu trong volume riêng.
- [x] Seed chỉ chạy theo lệnh riêng trên dữ liệu demo/test, không gắn vào startup mặc định.
- [x] Test dùng MongoDB replica set riêng và database `_test`; các suite hiện tại chạy tuần tự.
- [x] Có profile retention chạy hằng ngày trong container; mặc định dry-run, log tóm tắt, không có Docker socket.
- [x] VNPAY giữ trạng thái tắt. Worker/tunnel là phụ thuộc có điều kiện của đợt tích hợp VNPAY; khi bật lại cũng phải chạy trong Docker và nghiệm thu riêng.

Kết quả và lệnh thay thế local → Docker: [Báo cáo vận hành Bước E](week1-nhung-docker-operations.md).

Đầu ra: từng mục trong bảng local → Docker có lệnh thay thế thực thi được. Không còn yêu cầu mở terminal chạy Node hoặc MongoDB Tools trên host.

### Bước F — Nghiệm thu API khám phá và giao diện tối thiểu

- [x] Giữ nguyên URL/hợp đồng; không đăng ký route DISC trùng trong listings.js.
- [x] Guest xem feed/phân trang; tìm kiếm và bộ lọc yêu cầu session đăng nhập.
- [x] Kiểm tra q, category, size, condition, minPrice/maxPrice riêng lẻ và kết hợp; input sai có mã lỗi theo hợp đồng.
- [x] Feed mặc định 20, tối đa 100, mới nhất trước với thứ tự ổn định; total khớp bộ lọc.
- [x] Chỉ tìm trên phiên bản approvedVersionId; revision cũ hoặc đang chờ không làm tin xuất hiện sai.
- [x] Tin bị Seller/Admin ẩn, giữ duyệt, yêu cầu sửa hoặc payment review không lộ qua feed/chi tiết/ảnh ngoài quyền.
- [x] Feed loại RESERVED/SOLD; chi tiết hợp lệ vẫn xem được với canBuy=false, SOLD có watermark.
- [x] DTO không lộ dữ liệu riêng hoặc ghi chú nội bộ; ảnh trả đúng quyền.
- [x] Frontend hiển thị danh sách/chi tiết từ backend thật qua rewrite; có loading, lỗi và danh sách trống.
- [x] Không phát hiện lỗi cần sửa trong backend DISC; đã thêm trang giao diện và test tích hợp DISC, ghi rõ trước/sau trong báo cáo nghiệm thu.

Chi tiết ma trận, smoke UI và test: [Báo cáo nghiệm thu DISC Bước F](week1-nhung-docker-discovery-check.md).

Đầu ra: kiểm thử DISC qua container và bằng chứng giao diện dùng API thật.

### Bước G — Hồi quy tuần 2 và thử độc lập host

- [x] Chạy đầy đủ bộ test hiện có từ Docker; các suite MongoDB bắt buộc có URI test để không bị skip âm thầm.
- [x] Thử đăng nhập, gửi email/xác minh qua Mailpit, duyệt/ẩn tin và upload/đọc ảnh.
- [x] Thử COD: tạo đơn, điều kiện giao hàng, xác nhận nhận hàng, khiếu nại, quyền Support/Admin, audit và notification.
- [x] Chạy audit/migration/retention dry-run qua Docker; kiểm tra apply guard bằng ca kiểm thử không phá dữ liệu. Ca apply được chạy trên database `rewear_circle` rỗng trong Compose project cô lập.
- [x] Dừng worker VNPAY local thuộc phạm vi bằng SIGTERM; không dừng tiến trình TutorLink hoặc MongoDB/Mailpit legacy ngoài phạm vi. Khởi động Compose rồi chạy lại smoke test từ trình duyệt.
- [x] Thử stop/start, build lại image và force-recreate; số lượng DB/media/session còn nguyên, trình duyệt tải feed thành công.
- [x] Thử từ bản clone sạch với cấu hình mẫu và volume trống; không mượn node_modules, `.env`, MongoDB hay ảnh local có sẵn.
- [x] Đối chiếu dữ liệu phục hồi; không giải phóng hold hoặc đổi trạng thái thanh toán cũ.

Chi tiết kết quả, phạm vi và đường dẫn snapshot: [Báo cáo hồi quy Bước G](week1-nhung-docker-regression-check.md).

Đầu ra: bằng chứng chạy độc lập các runtime/tool local và không làm hỏng tuần 2.

### Bước H — Bàn giao

- [ ] Rà soát README, cấu hình mẫu, API contract và runbook tuần 2; README/config mẫu cùng báo cáo nghiệm thu đã được cập nhật. API contract giữ nguyên vì DISC không đổi hợp đồng; runbook tuần 2 cần rà soát riêng nếu có nội dung cần đồng bộ.
- [x] Tài liệu phân biệt thao tác mặc định, seed/test và thao tác có ghi dữ liệu; không hướng dẫn `down -v` như cách dừng thông thường.
- [x] Bảng tổng kết có lệnh Docker đã chạy, pass/fail/skip, phạm vi dữ liệu và phần phụ thuộc chưa bật.
- [x] Chia diff/commit theo cấu hình Docker, điều chỉnh vận hành, DISC nếu có và tài liệu; không rewrite commit cũ, không push.

Tài liệu bàn giao: [week1-nhung-docker-handoff.md](week1-nhung-docker-handoff.md).

## 5. Điều kiện hoàn thành bắt buộc

1. Máy mới chỉ cần Docker/Compose, Git và trình duyệt; build và khởi động được đủ frontend/backend/MongoDB/Mailpit.
2. Không cần tiến trình Node, MongoDB, SMTP hoặc MongoDB Tools cài trên host để chạy/kiểm thử/vận hành dự án.
3. MongoDB transaction, session, email và media hoạt động; restart/recreate không mất dữ liệu.
4. Seed, test, audit, migration, retention, backup và restore có đường chạy Docker đã kiểm chứng; thao tác apply vẫn giữ guard.
5. API khám phá đạt ma trận quyền/trạng thái/bộ lọc; hồi quy tuần 2 đạt trong phạm vi kiểm thử đã ghi rõ.
6. Có bằng chứng clone sạch và phục hồi dữ liệu; không sử dụng nhầm volume/DB dự án cho test.
7. VNPAY vẫn được ghi đúng là chưa bật/chưa nghiệm thu Sandbox; hoàn thành Docker không được dùng làm bằng chứng thanh toán thành công.

## 6. Điểm dừng và rollback

- Nếu restore thử, replica set, transaction, media hoặc hồi quy thất bại: dừng chuyển môi trường; sửa trong môi trường riêng.
- Chỉ dừng runtime local khi đã xác định đúng tiến trình và có môi trường Docker đã kiểm chứng; tránh ảnh hưởng luồng làm việc khác.
- Không xóa external volume cũ hoặc ghi đè backup. Khi rollback, dừng bên mới trước khi khởi động bên cũ để tránh hai bên cùng ghi.
- Sau khi môi trường mới đã phát sinh dữ liệu, không quay lại bản backup cũ mà bỏ qua dữ liệu mới; cần sao lưu/đối chiếu trước khi rollback.
