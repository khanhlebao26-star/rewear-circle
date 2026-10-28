# **ACC | TÀI KHOẢN, HỒ SƠ & QUYỀN TRUY CẬP**

Cập nhật 26/10/2026: đồng bộ ACC, ORD, PAY và MOD theo Business Rules.

ĐẶC TẢ CHỨC NĂNG • REWEAR CIRCLE

ACC sở hữu việc đăng ký tài khoản, xác thực, danh tính đăng nhập đáng tin cậy và quyền truy cập hồ sơ. ACC cung cấp danh tính cho LST, ORD, PAY và MOD; mỗi mô-đun nhận vẫn ủy quyền cho các tài nguyên được bảo vệ riêng của mình. Một Sinh viên đã đăng ký có thể mua và bán bằng một tài khoản duy nhất (BR-USER-001).

# **AI CÓ THỂ SỬ DỤNG ACC?**

| **VAI TRÒ** | **TRUY CẬP ACC** | **RANH GIỚI** |
| --- | --- | --- |
| **Khách mời** | Đăng ký; đăng nhập. | Không có thao tác nào được thực hiện với tài khoản đã xác thực. |
| **Sinh viên mua hàng** | Đăng nhập/đăng xuất; quản lý hồ sơ cá nhân; mua hàng qua ORD. | Danh tính phiên đáng tin cậy; ORD xác thực các đơn đặt hàng của người mua. |
| **Sinh viên bán hàng** | Cùng một tài khoản; bán hàng thông qua LST. | Người mua/người bán chia sẻ thông tin nhận dạng. Một tài khoản người dùng đã đăng nhập có thể mua và gửi tin bán; không có bước Admin duyệt hồ sơ Seller riêng. Tin bán vẫn phải được Admin duyệt trước khi công khai. |
| **Quản trị viên** | Xác thực; xem xét/ẩn danh sách MOD đã được phê duyệt. | Việc quản lý tài khoản tiếp theo chưa được xác nhận. |

# **01 QUY TRÌNH LÀM VIỆC CHÍNH**

Việc xác thực danh tính và quyền hạn được thực hiện ở phía máy chủ. Các cờ trình duyệt không bao giờ cấp quyền.

KHÁCH → ĐĂNG KÝ / ĐĂNG NHẬP → MÁY CHỦ XÁC THỰC THÔNG TIN ĐĂNG NHẬP → PHIÊN ĐÃ XÁC MINH → DANH TÍNH NGƯỜI DÙNG ĐÁNG TIN CẬY → MÔ-ĐUN KIỂM TRA HÀNH ĐỘNG YÊU CẦU → CHO PHÉP / TỪ CHỐI

Khi cùng một tài khoản mua hoặc bán, ACC sử dụng lại danh tính đã xác thực. MVP chỉ yêu cầu xác minh email thông thường; không bắt buộc email trường hoặc xác minh tư cách sinh viên bằng trường (BR-USER-003, đã chốt).

# **02 YÊU CẦU CHỨC NĂNG**

| **NHẬN DẠNG** | **YÊU CẦU/TRẠNG THÁI MVP** |
| --- | --- |
| **ACC-FR-01** | Đăng ký tài khoản bằng email duy nhất và xác minh email. Hồ sơ cơ bản gồm tên hiển thị, email và ảnh đại diện tùy chọn; một tài khoản có thể mua và gửi tin bán. |
| **ACC-FR-02** | Xác minh thông tin đăng nhập trên máy chủ; từ chối thông tin đăng nhập không hợp lệ (đề xuất). |
| **ACC-FR-03** | Cấp phát và xác thực các phiên đã được xác thực; không bao giờ tin tưởng vào danh tính của máy khách (đề xuất). |
| **ACC-FR-04** | Cho phép đăng xuất và hủy bỏ phiên làm việc hiện tại (đề xuất). |
| **ACC-FR-05** | Một tài khoản có thể đóng vai trò là người mua và người bán (BR-USER-001, đã xác nhận). |
| **ACC-FR-06** | Chỉ trả về dữ liệu hồ sơ được cho phép của người dùng đã đăng nhập (đề xuất). |
| **ACC-FR-07** | Thực thi xác thực máy chủ phụ trợ trên các tuyến đường được bảo vệ (BR-SEC-001, MVP đề xuất). |
| **ACC-FR-08** | Ngăn chặn việc leo thang đặc quyền quản trị viên phía máy khách (BR-USER-002, MVP đề xuất). |
| **ACC-FR-09** | Cho phép chỉnh sửa hồ sơ cá nhân, ngoại trừ các trường vai trò/trạng thái được bảo vệ (đề xuất). |
| **ACC-FR-10** | Cung cấp thông tin đăng nhập Quản trị viên đáng tin cậy để xem xét/ẩn báo cáo MOD (BR-TRUST-002). |
| **ACC-FR-11** | MVP xác minh email thông thường; không bắt buộc xác minh tư cách sinh viên bằng email trường (BR-USER-003, đã chốt). |
| **ACC-FR-12** | đình chỉ tài khoản, thiết lập lại và quản lý người dùng quản trị vẫn là những quyết định chưa được giải quyết. |

# **03 CHU KỲ ĐỀ XUẤT CỦA TÀI KHOẢN & QUYỀN TRUY CẬP**

Chỉ mang tính chất minh họa. Vui lòng xác nhận tên tiểu bang và chính sách trước khi thực hiện.

TÀI KHOẢN: Khách → Sinh viên đã đăng ký → Phiên đăng nhập đã xác thực → Đã đăng xuất / Phiên đăng nhập hết hạn.

VAI TRÒ: STUDENT, SUPPORT hoặc ADMIN (do máy chủ chỉ định). Sinh viên có thể mua và bán (BR-USER-001).

UserStatus ACTIVE / INACTIVE / SUSPENDED là các kiểu liệt kê kỹ thuật có thể được chấp thuận; các trình kích hoạt nghiệp vụ, quyền hạn của tác nhân và các chuyển đổi KHÔNG được chấp thuận.

# **04 DỮ LIỆU THUỘC SỞ HỮU CỦA ACC**

ACC chỉ lưu trữ thông tin cần thiết cho việc xác minh danh tính, đăng nhập và truy cập tài khoản đã được phê duyệt. ACC không sở hữu danh sách sản phẩm, đơn đặt hàng hoặc các giao dịch thanh toán.

| **NHÓM DỮ LIỆU** | **ACC LƯU TRỮ NHỮNG GÌ?** |
| --- | --- |
| **Thông tin tài khoản** | Mã định danh duy nhất; mã định danh đăng nhập được chuẩn hóa; các trường thông tin hồ sơ đã được phê duyệt. |
| **Xác thực** | Mã băm mật khẩu và siêu dữ liệu thông tin đăng nhập tối thiểu; không có thông tin đăng nhập dạng văn bản thuần. |
| **Vai trò và điều kiện** | Vai trò đáng tin cậy; Chỉ được sử dụng với tư cách Người dùng/Người bán theo chính sách đã được phê duyệt. |
| **Phiên họp** | Thông tin siêu dữ liệu về định danh phiên/mã thông báo, thời hạn hết hạn và thu hồi. |
| **Thời gian** | Thời gian tạo/cập nhật tài khoản và thời gian phê duyệt thay đổi bảo mật. |
| **Ranh giới dữ liệu** | Không có số thẻ hoặc mã bảo mật thẻ; ACC không sở hữu dữ liệu đơn đặt hàng/thanh toán. |

# **05 PHỤ THUỘC VÀO MÔ-ĐUN**

| **MÔ-ĐUN** | **CHUYỂN GIAO** | **GIỚI HẠN TRÁCH NHIỆM** |
| --- | --- | --- |
| **LST** | Mã định danh người dùng đáng tin cậy. | LST kiểm tra quyền sở hữu danh sách; Một tài khoản đã đăng ký có thể gửi tin bán; không có bước Admin duyệt hồ sơ Seller riêng. LST kiểm tra chủ sở hữu tin, còn Admin duyệt từng tin và bản sửa trước khi công khai. |
| **ORD** | Xác minh danh tính người mua đáng tin cậy. | ORD kiểm tra quyền sở hữu người mua/đơn hàng. |
| **PAY** | Ngữ cảnh người dùng đã đăng nhập khi cần thiết. | PAY tự mình xác minh kết quả thanh toán. |
| **MOD** | Thông tin đăng nhập quản trị viên đã được xác thực. | MOD sở hữu quyền xem xét báo cáo và các quyết định ẩn danh sách. |
| **DISC** | Ngữ cảnh công khai / đã đăng nhập. | DISC chịu trách nhiệm khám phá; ACC bảo vệ quyền truy cập đã được xác thực. |

# **06 QUY TẮC NGHIỆP VỤ**

| **LUẬT LỆ** | **ACC PHẢI** |
| --- | --- |
| **Tài khoản dùng chung (BR-USER-001)** | Hãy sử dụng cùng một tài khoản đã đăng ký cho cả việc mua và bán. [Đề xuất đã được định nghĩa] |
| **Quản trị viên bị hạn chế (BR-USER-002)** | Từ chối quyền kiểm duyệt trái phép và việc nâng cấp vai trò của người dùng. [MVP đề xuất] |
| **Điều kiện đủ điều kiện (BR-USER-003)** | Một tài khoản đăng ký với email được xác minh có thể mua và gửi tin bán; MVP không bắt buộc email trường hoặc duyệt hồ sơ Seller. Việc xác minh tư cách sinh viên bằng email trường được để ngoài MVP. |
| **Giấy phép (BR-SEC-001)** | Cho phép các yêu cầu được bảo vệ ở phía máy chủ. [MVP đề xuất] |
| **Kiểm duyệt của quản trị viên (BR-TRUST-002)** | Cung cấp thông tin đăng nhập quản trị viên đáng tin cậy cho MOD để xem xét/ẩn báo cáo. [Đề xuất đã được xác định] |
| **Thông tin quyền sở hữu niêm yết (BR-LISTING-002)** | LST kiểm tra quyền sở hữu danh sách; ACC cung cấp thông tin nhận dạng. [MVP đề xuất] |
| **Dữ liệu nhạy cảm (BR-PAYMENT-002 / BR-SEC-002)** | Không lưu giữ số thẻ hoặc mã bảo mật thẻ. [Đề xuất-định nghĩa] |

# **07 THẤT BẠI & PHỤC HỒI**

| **TÌNH HUỐNG** | **CÁCH XỬ LÝ DỰ KIẾN** |
| --- | --- |
| **Chưa đăng nhập** | Từ chối các yêu cầu được bảo vệ; yêu cầu xác thực. |
| **Đăng nhập không chính xác** | Từ chối mà không cần tiết lộ thông tin đăng nhập hoặc chi tiết tài khoản không cần thiết. |
| **Đăng ký trùng lặp** | Từ chối mã định danh đăng nhập chuẩn hóa hiện có (đề xuất). |
| **Phiên đã hết hạn** | Từ chối sử dụng thông tin đăng nhập đã hết hạn/bị thu hồi (đề xuất). |
| **Sai thông tin hồ sơ hoặc quản trị viên giả mạo** | Ngăn chặn việc đọc dữ liệu giữa các người dùng và leo thang vai trò trên máy chủ. |
| **Tài khoản muốn gửi tin bán ** | Không có bước Admin duyệt hồ sơ Seller riêng. Tài khoản đã đăng nhập có thể gửi tin bán; từng tin và bản sửa phải được Admin duyệt trước khi công khai. |
| **Tài khoản bị đình chỉ** | Các quy tắc về thao tác bị chặn và khôi phục vẫn đang được xem xét. |
| **Xác minh sinh viên** | Không nên áp dụng yêu cầu sử dụng email trường học cho đến khi được phê duyệt. |

# **08 DANH SÁCH KIỂM TRA CHẤP NHẬN**

| **KIỂM TRA** | **ĐIỀU KIỆN CHẤP NHẬN** |
| --- | --- |
| **Tài khoản dùng chung** | Sinh viên có thể mua và bán bằng một tài khoản duy nhất (BR-USER-001). |
| **Đăng nhập** | Phiên xác thực cung cấp danh tính đã được xác thực (đề xuất). |
| **Quyền sở hữu hồ sơ** | Không thể xem hoặc chỉnh sửa hồ sơ được bảo vệ của người dùng khác (đề xuất). |
| **Tính toàn vẹn của quản trị viên** | Thao tác thay đổi vai trò máy khách không thể cấp quyền Quản trị (đề xuất BR-USER-002). |
| **Ranh giới mô-đun** | ORD và LST kiểm tra quyền sở hữu tài nguyên một cách độc lập. |
| **Sự điều độ** | Danh tính Quản trị viên đáng tin cậy hỗ trợ các thao tác xem xét MOD và ẩn danh sách. |
| **Phạm vi xác minh** | MVP không bắt buộc email trường hoặc xác minh tư cách sinh viên bằng trường; tài khoản cần xác minh email thông thường. |
| **Phạm vi của người bán** | Tài khoản đã đăng nhập gửi được tin bán mà không cần duyệt hồ sơ Seller riêng. |
| **Bảo mật dữ liệu** | Không có số thẻ hoặc mã bảo mật nào được lưu trữ. |
| **Giao diện người dùng đáp ứng** | Các chức năng tài khoản có thể sử dụng được trên máy tính để bàn và thiết bị di động (đề xuất). |

# **09 QUYẾT ĐỊNH CẦN GIẢI QUYẾT**

| **PHÁN QUYẾT** | **ĐỂ XÁC NHẬN** |
| --- | --- |
| **Xác minh sinh viên** | MVP xác minh email thông thường; không bắt buộc email trường hoặc duyệt hồ sơ Seller. Tài khoản đã đăng nhập có thể mua và gửi tin bán. |
| **Các trường đăng ký** | Hồ sơ MVP gồm tên hiển thị, email và ảnh đại diện tùy chọn; các trường vai trò/Admin không cho người dùng tự sửa. |
| **Thiết kế xác thực** | Cookie/phiên hoặc mã thông báo; thời hạn và thu hồi phiên? |
| **Khôi phục tài khoản** | Xác minh email thuộc MVP; đặt lại mật khẩu có thể làm sau MVP. |
| **Quyền quản trị** | Admin MVP duyệt/từ chối và ẩn/hiện tin, xử lý vụ việc, tra cứu giao dịch có phân quyền và giao vụ Support; không sửa tin thay Seller, tự ghi PAID, quản lý chi trả hay quản trị tài khoản nâng cao. |
| **Vòng đời tài khoản** | MVP chỉ yêu cầu tài khoản hoạt động sau khi xác minh email; quy trình khóa/tạm ngừng và khôi phục tài khoản nâng cao để ngoài MVP. |
| **Xóa tài khoản** | Quyền xóa tài khoản qua giao diện và quản trị vòng đời tài khoản nâng cao để ngoài MVP; hồ sơ vụ việc vẫn theo thời hạn lưu đã chốt. |
| **Kiểm soát an ninh** | Chính sách mật khẩu, giới hạn số lượt truy cập và nhật ký kiểm toán? |
| **phê duyệt quy tắc** | Xác nhận BR-USER-002 và BR-SEC-001 là các quy tắc MVP. |

Cập nhật 26/10/2026

ACC-FR-VERIFY — Đăng ký tạo tài khoản chưa xác minh; email có mã một lần, có hạn. Xác minh thành công mới cho phép mua/đăng bán; gửi lại mã có giới hạn. SUPPORT chỉ được truy cập vụ được giao, không có quyền Admin.
