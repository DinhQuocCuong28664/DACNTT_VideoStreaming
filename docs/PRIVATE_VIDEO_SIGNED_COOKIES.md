# Bảo vệ nội dung riêng tư bằng CloudFront Signed Cookies

> ⚠️ **Cập nhật trạng thái (2026-08-10):** Trong lúc chuẩn bị số liệu thực nghiệm cho báo cáo, việc kiểm tra trực tiếp bằng AWS CLI (`aws s3api get-bucket-policy`, `aws cloudfront list-distributions`) phát hiện tài khoản AWS dùng cho môi trường dev **chưa từng có CloudFront Distribution nào được tạo**, và bucket `dacntt-dev-processed-bucket` đang có bucket policy `Principal: "*"` được thêm thủ công (không qua Terraform) để video vẫn phát được trong lúc CloudFront chưa sẵn sàng. Khi thử `terraform apply` để vá lỗ hổng này, AWS từ chối với lỗi `AccessDenied: Your account must be verified before you can add new CloudFront resources` — tài khoản cần được AWS Support xác minh trước. Ticket đã được mở, đang chờ xử lý. Toàn bộ thiết kế và mã nguồn dưới đây **đã sẵn sàng và đã `terraform validate` thành công**, chỉ còn chặn ở bước xác minh tài khoản ngoài tầm kiểm soát của dự án.

## 1. Vấn đề cần giải quyết

Yêu cầu tại Mục 5 của đề tài quy định người dùng có thể chia sẻ video ở chế độ công khai hoặc riêng tư, còn Mục 7 yêu cầu hệ thống phải ngăn chặn việc truy cập trái phép vào nội dung video. Trong thiết kế ban đầu, hai yêu cầu này mới chỉ được đáp ứng một phần.

Cụ thể, cơ sở dữ liệu đã có trường `visibility` và toàn bộ các truy vấn ở tầng API đều lọc đúng theo trường này: video riêng tư không xuất hiện trong danh sách trang chủ, không hiện trên kênh của người khác, và khi truy vấn trực tiếp theo mã định danh thì máy chủ trả về lỗi 404. Tuy nhiên, các tệp `.m3u8` và `.ts` trên Amazon CloudFront vẫn được phân phối công khai. Điều đó có nghĩa là bất kỳ ai từng biết đường dẫn tệp manifest — chẳng hạn người dùng đã xem video khi nó còn ở chế độ công khai, hoặc người quan sát lưu lượng mạng — đều vẫn tải được nội dung ngay cả sau khi video đã chuyển sang riêng tư.

Đây là hạn chế mà **Origin Access Control (OAC) không thể khắc phục**. OAC chỉ bảo đảm rằng không ai truy cập trực tiếp được vào Amazon S3, buộc mọi lượt tải phải đi qua CloudFront; nhưng bản thân OAC không phân biệt được người yêu cầu là ai và có quyền xem nội dung hay không.

## 2. Lựa chọn giải pháp

Amazon CloudFront cung cấp hai cơ chế bảo vệ nội dung là Signed URL và Signed Cookie. Hệ thống lựa chọn **Signed Cookie** vì đặc thù của giao thức HLS.

Một phiên phát HLS không tải về một tệp duy nhất mà gồm tệp manifest cùng hàng trăm segment `.ts` riêng lẻ, mỗi segment là một yêu cầu HTTP độc lập. Nếu dùng Signed URL, hệ thống sẽ phải ký riêng từng segment và viết lại toàn bộ địa chỉ bên trong manifest — thường phải nhờ tới Lambda@Edge, làm tăng đáng kể độ phức tạp và chi phí. Ngược lại, Signed Cookie chỉ cần cấp một lần cho toàn bộ thư mục của video; sau đó trình duyệt tự động đính kèm cookie vào mọi yêu cầu segment tiếp theo mà không cần can thiệp gì thêm.

Hệ thống cũng chọn ký theo **Custom Policy** thay vì Canned Policy. Lý do là Canned Policy không chấp nhận ký tự đại diện trong đường dẫn tài nguyên, trong khi phạm vi cần cấp quyền là toàn bộ thư mục video. Custom Policy cho phép khai báo `Resource` dạng `https://cdn.zelostech.site/videos/*/<videoId>/*`, tức là một bộ cookie phủ trọn manifest và mọi segment của đúng video đó, đồng thời không cấp quyền sang bất kỳ video nào khác.

## 3. Kiến trúc luồng cấp quyền

```
1. Người xem mở trang xem video
2. Frontend gọi GET /api/videos/:id                 → lấy metadata
3. Frontend gọi GET /api/videos/:id/playback-auth   → xin quyền phát
4. Backend kiểm tra quyền bằng videoService.getVideoById
   ├─ Video riêng tư và người gọi không phải chủ sở hữu → 404, dừng lại
   └─ Hợp lệ → ký Custom Policy, đặt 3 cookie vào phản hồi
5. Frontend khởi tạo HLS.js với xhrSetup bật withCredentials
6. Trình duyệt đính kèm cookie vào mọi yêu cầu manifest và segment
7. CloudFront xác thực chữ ký
   ├─ Hợp lệ  → phục vụ nội dung từ Edge Location
   └─ Không hợp lệ hoặc thiếu cookie → HTTP 403
```

Điểm cốt lõi của thiết kế này là **quyền truy cập chỉ được định nghĩa tại một nơi duy nhất**. Endpoint `playback-auth` không tự viết lại logic phân quyền mà gọi lại chính `videoService.getVideoById` — cùng hàm mà endpoint xem chi tiết video đang dùng. Nhờ đó không thể xảy ra tình trạng API chặn truy cập nhưng CDN vẫn cho phép tải nội dung, vốn là loại lỗi rất khó phát hiện khi hai tầng có logic phân quyền tách rời.

## 4. Các bước triển khai

### Bước 1 — Sinh cặp khóa RSA

CloudFront yêu cầu khóa RSA 2048-bit. Chạy các lệnh sau tại máy cục bộ:

```bash
openssl genrsa -out cloudfront-private.pem 2048
```

```bash
openssl rsa -pubout -in cloudfront-private.pem -out cloudfront-public.pem
```

Tệp `cloudfront-private.pem` là bí mật và **tuyệt đối không được đưa vào Git**. Chỉ tệp khóa công khai được khai báo trong Terraform.

### Bước 2 — Khai báo biến Terraform

Bổ sung vào `infrastructure/environments/dev/terraform.tfvars` (tệp này đã nằm trong `.gitignore`):

```hcl
enable_cloudfront       = true
enable_signed_urls      = true
signing_public_key_pem  = file("../../../cloudfront-public.pem")
cdn_aliases             = ["cdn.zelostech.site"]
cdn_acm_certificate_arn = "arn:aws:acm:us-east-1:<account-id>:certificate/<id>"
cors_allowed_origins    = ["https://zelostech.site", "https://www.zelostech.site"]
```

Cần lưu ý rằng chứng chỉ ACM dùng cho CloudFront **bắt buộc phải được cấp tại vùng us-east-1**, bất kể hạ tầng còn lại đặt ở vùng nào.

### Bước 3 — Áp dụng hạ tầng

```bash
terraform apply
```

Sau khi hoàn tất, lấy giá trị định danh khóa để cấu hình cho Backend:

```bash
terraform output cloudfront_signing_key_pair_id
```

### Bước 4 — Trỏ bản ghi DNS

Tạo bản ghi CNAME đưa `cdn.zelostech.site` về tên miền phân phối của CloudFront. Đây là bước bắt buộc: trình duyệt chỉ gửi kèm cookie khi ứng dụng và CDN dùng chung tên miền cha, nên nếu CDN vẫn nằm ở tên miền `*.cloudfront.net` thì cookie sẽ không bao giờ được đính kèm.

### Bước 5 — Cấu hình Backend

Đặt các biến môi trường sau cho Backend (trong môi trường production nên đọc từ AWS Secrets Manager thay vì ghi vào tệp `.env`):

```
CLOUDFRONT_DOMAIN=cdn.zelostech.site
CLOUDFRONT_KEY_PAIR_ID=<giá trị từ terraform output>
CLOUDFRONT_PRIVATE_KEY=<nội dung cloudfront-private.pem>
COOKIE_DOMAIN=.zelostech.site
```

Khi ba biến `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID` và `CLOUDFRONT_PRIVATE_KEY` chưa được cấu hình đầy đủ, hệ thống tự động chạy ở chế độ không ký. Cơ chế này giữ cho môi trường phát triển cục bộ hoạt động bình thường mà không cần dựng CloudFront.

## 5. Kiểm chứng kết quả

Kịch bản kiểm thử dưới đây cũng chính là phần trình diễn trực quan khi bảo vệ đồ án:

1. Đăng nhập, tải lên một video và đặt ở chế độ **riêng tư**.
2. Mở trang xem video bằng tài khoản chủ sở hữu — video phát bình thường.
3. Mở công cụ dành cho nhà phát triển, sao chép đường dẫn tệp `master.m3u8` từ tab Network.
4. Dán đường dẫn đó vào một cửa sổ ẩn danh (không mang cookie).

Kết quả mong đợi là **CloudFront trả về HTTP 403**. Trước khi áp dụng cơ chế này, thao tác tương tự sẽ tải về tệp manifest thành công.

Có thể kiểm tra nhanh bằng dòng lệnh:

```bash
curl -I "https://cdn.zelostech.site/videos/<userId>/<videoId>/master.m3u8"
```

## 6. Hạn chế đã biết

Thiết kế hiện tại còn ba điểm hạn chế cần được nêu rõ trong phần Kết luận và Hướng phát triển của báo cáo.

Thứ nhất, cookie có hiệu lực trong hai giờ kể từ lúc cấp. Nếu chủ sở hữu chuyển một video từ công khai sang riêng tư, những người đã nhận cookie trước đó vẫn xem được cho tới khi cookie hết hạn. Việc thu hồi tức thì đòi hỏi phải luân chuyển khóa ký hoặc bổ sung một lớp kiểm tra tại biên bằng Lambda@Edge.

Thứ hai, khi bật cơ chế ký thì **mọi video đều cần cookie**, kể cả video công khai. Backend vẫn cấp cookie cho khách vãng lai đối với video công khai nên trải nghiệm người dùng không thay đổi, nhưng điều này làm phát sinh thêm một lượt gọi API trước mỗi phiên phát. Giải pháp thay thế là tách video công khai và riêng tư sang hai tiền tố lưu trữ khác nhau trên S3, song cách đó buộc phải di chuyển tệp mỗi lần người dùng đổi chế độ hiển thị.

Thứ ba, hệ thống chưa chống được việc người dùng hợp lệ chủ động chia sẻ lại cookie của mình cho người khác. Việc ngăn chặn triệt để hành vi này thuộc phạm vi của các giải pháp quản lý bản quyền số (DRM) như Widevine hoặc FairPlay, vượt ra ngoài phạm vi đề tài.
