# Dựng lại hệ thống trên tài khoản AWS mới

> Viết ngày 2026-08-18, sau khi tài khoản `881415010110` bị AWS đóng.
> Mục đích: đưa toàn bộ hạ tầng trở lại hoạt động trên một tài khoản AWS khác,
> với ít thao tác thủ công nhất.

## Điều quan trọng nhất phải biết trước

**Tên S3 bucket là duy nhất trên toàn cầu, không chỉ trong một tài khoản.** Nếu
bucket cũ vẫn tồn tại thì `terraform apply` trên tài khoản mới sẽ báo
`BucketAlreadyExists` và dừng.

**Ngày 2026-08-18 đã chủ động xoá toàn bộ bucket của tài khoản cũ** (xem phần
"Hiện trạng đã xoá" ở cuối tài liệu), nên các tên sau **đã được giải phóng và
dùng lại được ngay**:

- `dacntt-terraform-state`
- `dacntt-dev-raw-bucket`
- `dacntt-dev-processed-bucket`
- `zelostech.site`

→ **Không cần đổi `project_name`.** Giữ nguyên `dacntt` để mọi thứ khớp với báo
cáo, tài liệu và tên tài nguyên đã mô tả trong đồ án.

*(Nếu không xoá trước, sẽ phải chờ AWS purge tài khoản đã đóng — thường tới
khoảng 90 ngày — rồi mới lấy lại được tên.)*

## Những gì KHÔNG mất, không phải làm lại

| Thành phần | Ghi chú |
|---|---|
| MongoDB Atlas | Nằm ngoài AWS — toàn bộ user, video metadata, comment còn nguyên |
| Tên miền `zelostech.site` | Ở Hostinger, không liên quan AWS |
| Cloudflare (DNS + HTTPS) | Còn nguyên, chỉ cần trỏ lại IP/endpoint mới |
| Mã nguồn + 11 Terraform module | Trong git |
| Báo cáo LaTeX + số liệu thực nghiệm | Trong git |
| Video demo (HLS) | Đã sao lưu ở `backup-aws/demo-video/` |

## Các bước

### 1. Cấu hình credentials tài khoản mới

```bash
aws configure
aws sts get-caller-identity   # xác nhận đúng account mới trước khi làm tiếp
```

### 2. Giữ nguyên tên — không cần sửa gì

Vì bucket cũ đã được xoá, tất cả tên đều dùng lại được. **Không sửa**
`project_name`, `backend.tf`, `bootstrap-terraform-state.sh` hay `frontend.tf`.

Chỉ kiểm tra lại `infrastructure/environments/dev/terraform.tfvars` có đủ các
giá trị nhạy cảm (tệp này không nằm trong git):

```hcl
mongodb_uri = "mongodb+srv://<user>:<pass>@..."   # Atlas cũ vẫn dùng được
jwt_secret  = "<chuỗi ngẫu nhiên >= 32 ký tự>"
enable_cloudfront = false   # giữ false cho tới khi chắc chắn tài khoản mới
                            # được phép tạo CloudFront (tài khoản cũ bị chặn)
```

### 3. Tạo backend lưu Terraform state

```bash
bash scripts/bootstrap-terraform-state.sh
```

### 4. Dựng toàn bộ hạ tầng

```bash
cd infrastructure/environments/dev
# -reconfigure để Terraform quên bản ghi backend đã cache trong .terraform/ của
# tài khoản cũ; tên bucket không đổi nhưng tài khoản thì đổi.
terraform init -reconfigure
terraform apply
```

**Về CloudFront:** giữ `enable_cloudfront = false` (mặc định hiện tại) cho lần
apply đầu tiên. Tài khoản cũ bị AWS chặn tạo CloudFront với lỗi
`AccessDenied: Your account must be verified before you can add new CloudFront
resources`, và chưa rõ tài khoản mới có bị chặn tương tự không. Cách kiểm tra rẻ
nhất là dựng xong phần còn lại trước, rồi thử riêng:

```bash
terraform apply -target=aws_cloudfront_distribution.frontend
```

Nếu lệnh trên chạy được thì bật `enable_cloudfront = true` và apply lại để có
đúng kiến trúc gốc trong báo cáo. Nếu vẫn bị chặn thì tiếp tục dùng Cloudflare
làm lớp HTTPS tạm thời như hiện nay — hệ thống vẫn chạy đầy đủ, chỉ khác ở lớp
CDN (xem Chương 6 của báo cáo).

### 5. Build và đẩy Docker image transcoder

```bash
cd transcoder
ECR=$(cd ../infrastructure/environments/dev && terraform output -raw ecr_repository_url)
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin "${ECR%%/*}"
docker build -t "$ECR:latest" .
docker push "$ECR:latest"
```

### 6. Trỏ lại DNS trên Cloudflare

| Bản ghi | Trỏ tới |
|---|---|
| `zelostech.site` (CNAME) | Endpoint S3 website mới, hoặc domain CloudFront nếu đã bật |
| `api` (A) | IP public của EC2 backend mới |

Giữ nguyên Proxy (đám mây cam) và SSL/TLS ở chế độ **Flexible** như hiện tại.

### 7. Khôi phục backend trên EC2

- Tạo file `.env` trên máy chủ (không nằm trong git — xem `backend/.env.example`)
- Cài Node 24, `npm install --production`, chạy bằng pm2
- Cài Nginx reverse proxy port 80 → 5000 (bắt buộc, vì Cloudflare free không
  chuyển tiếp port 5000)
- Cập nhật GitHub Secrets: `EC2_HOST`, `EC2_SSH_KEY`, `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`

### 8. Nạp lại video demo

MongoDB vẫn còn bản ghi video cũ nhưng `hlsUrl` trỏ tới bucket đã chết. Hai lựa
chọn:

- **Đơn giản nhất:** upload lại video qua giao diện web để pipeline tự chạy và
  sinh bản ghi mới.
- **Giữ nguyên bản ghi cũ:** đẩy thư mục `backup-aws/demo-video/` lên bucket
  processed mới đúng đường dẫn `videos/<videoId>/`, rồi cập nhật `hlsUrl` và
  `thumbnailUrl` trong MongoDB cho khớp tên bucket mới.

## Kiểm tra lại sau khi dựng xong

```bash
# 1. Hạ tầng hợp lệ
cd infrastructure/environments/dev && terraform validate

# 2. Pipeline chạy thật đầu-cuối
export API_URL="https://api.zelostech.site/api"
export JWT_TOKEN="<token đăng nhập>"
node scripts/measure-transcode.js samples/video-100mb.mp4 verify-rebuild
# → phải kết thúc ở trạng thái READY, có hlsUrl và thumbnail
```

## Bẫy đã gặp trước đây — đừng lặp lại

1. **Secret rỗng làm sập pipeline.** Nếu chưa cấu hình email thông báo, để trống
   `email_app_password`; module đã sửa để khi đó không tạo secret và Job
   Definition không tham chiếu tới nó. Đừng tạo secret rỗng thủ công.
2. **Tên ECR repository phải khớp Terraform.** `.github/workflows/ci-transcoder.yml`
   dùng biến `ECR_REPOSITORY`; nếu đổi `project_name` thì phải sửa biến này theo,
   nếu không CI sẽ đẩy image vào một repo khác với repo mà Batch đang đọc.
3. **Kiểm tra `statusReason` của job Batch khi thất bại**, đừng chỉ nhìn trạng
   thái FAILED. Một lỗi cấu hình từng làm mọi container chết trước khi chạy, và
   nó bị bỏ sót vì lúc đó đang chạy thí nghiệm mà job vốn dĩ được dự kiến sẽ fail.

---

# Hiện trạng đã xoá — bản ghi ngày 2026-08-18

Tài khoản cũ: `881415010110` (đã bị AWS đóng). Toàn bộ tài nguyên được chủ động
xoá để **giải phóng tên S3 bucket** cho tài khoản mới, thay vì chờ AWS purge.

## Danh sách dịch vụ đã xoá — dùng để đối chiếu khi dựng lại

Cột "Dựng lại bằng" cho biết sau này khôi phục bằng cách nào.

| # | Dịch vụ / Tài nguyên | Tên | Dựng lại bằng |
|---|---|---|---|
| 1 | S3 bucket (video gốc) | `dacntt-dev-raw-bucket` | `terraform apply` (module `s3`) |
| 2 | S3 bucket (HLS đã chuyển mã) | `dacntt-dev-processed-bucket` | `terraform apply` (module `s3`) |
| 3 | S3 bucket (frontend) | `zelostech.site` | `terraform apply` (`frontend.tf`) |
| 4 | S3 bucket (Terraform state) | `dacntt-terraform-state` | `scripts/bootstrap-terraform-state.sh` |
| 5 | DynamoDB (khoá state) | `dacntt-terraform-locks` | `scripts/bootstrap-terraform-state.sh` |
| 6 | SQS queue chính | `dacntt-dev-transcode-queue` | `terraform apply` (module `sqs`) |
| 7 | SQS dead-letter queue | `dacntt-dev-transcode-dlq` | `terraform apply` (module `sqs`) |
| 8 | ECR repository | `dacntt-dev-transcoder` | `terraform apply` (module `ecr`) + `docker push` |
| 9 | ECR repository (thừa) | `dacntt-transcoder` | **KHÔNG dựng lại** — xem ghi chú (a) |
| 10 | Batch job queue | `dacntt-dev-transcode-queue` | `terraform apply` (module `batch`) |
| 11 | Batch job definition | `dacntt-dev-transcoder-job` | `terraform apply` (module `batch`) |
| 12 | Lambda job submitter | `dacntt-dev-job-submitter` | `terraform apply` (module `lambda`) — xem ghi chú (b) |
| 13 | EC2 backend API | `i-00e3512648190a36c` | Tạo mới + `scripts/ec2-userdata.sh`, xem bước 7 |
| 14 | Secrets Manager | `dacntt-dev/mongodb-uri`, `dacntt-dev/jwt-secret` | `terraform apply` (module `secrets`) |
| 15 | SNS topic | `dacntt-dev-dlq-alert` | `terraform apply` (module `sns`) |
| 16 | CloudWatch log groups | `/ecs/dacntt-dev/*`, `/aws/batch/job`, `/aws/lambda/*` | Tự tạo lại khi dịch vụ chạy |
| 17 | CloudWatch dashboard | `dacntt-dev-overview` | `terraform apply` (module `monitoring`) |
| 18 | IAM roles + policies | 6 role `dacntt-dev-*` | `terraform apply` (module `iam`) |
| 19 | ACM certificate | `zelostech.site` (us-east-1) | `terraform apply` — chỉ khi bật CloudFront |
| 20 | S3 bucket cũ (trước Terraform) | `vidshare-raw-bucket`, `vidshare-processed-bucket` | **KHÔNG dựng lại** — di sản giai đoạn đầu |

### Kiểm chứng sau khi xoá (chạy lúc 2026-08-18)

```
S3 buckets          : 0
SQS queues          : 0
ECR repos           : 0
Batch job queues    : 0
EC2 (chưa terminate): 0
Secrets             : 0
SNS topics          : 0
Log groups          : 0
DynamoDB tables     : 0
ACM certificates    : 0
```

## Hai tài nguyên KHÔNG xoá được (đều miễn phí)

| Tài nguyên | Lý do |
|---|---|
| Batch compute environment `dacntt-dev-fargate-ce` | Kẹt ở trạng thái `INVALID`. AWS đã thu hồi quyền `ecs:ListClusters` của chính service role mà Batch dùng để dọn ECS cluster, nên nó không tự xoá được. Đã thử cấp lại quyền tạm thời nhưng không gỡ được. |
| VPC `dacntt-dev-vpc` + 2 subnet + security group | Bị compute environment ở trên giữ tham chiếu nên không xoá theo được. |

Cả hai **không phát sinh chi phí** (VPC, subnet, security group, IAM role đều
miễn phí) và sẽ bị AWS xoá khi purge tài khoản. Không ảnh hưởng tới việc dựng lại
trên tài khoản mới, vì chúng nằm ở tài khoản cũ và không chiếm tên toàn cục.

## Ghi chú

**(a) `dacntt-transcoder` là repository thừa.** Nó sinh ra từ một lỗi cũ: biến
`ECR_REPOSITORY` trong `.github/workflows/ci-transcoder.yml` từng thiếu tiền tố
môi trường, khiến CI đẩy image vào `dacntt-transcoder` trong khi Batch lại đọc từ
`dacntt-dev-transcoder`. Lỗi đã sửa; khi dựng lại **chỉ cần đúng một repository**
là `dacntt-dev-transcoder`.

**(b) Lambda phải xoá khỏi Terraform state thủ công.** Lúc dọn dẹp, AWS đã chặn
API Lambda (403 `AccessDeniedException`) trước các dịch vụ khác, khiến
`terraform destroy` không refresh được state và dừng giữa chừng. Đã gỡ bằng
`terraform state rm` cho `aws_lambda_function.job_submitter` và
`aws_lambda_event_source_mapping.sqs_trigger` rồi mới destroy tiếp. Trên tài
khoản mới không gặp vấn đề này.

**(c) Thứ tự xoá quan trọng.** Bucket `zelostech.site` có `force_destroy = false`
nên phải xoá sạch object trước khi xoá bucket. Bucket `dacntt-terraform-state`
bật versioning nên phải xoá cả object version lẫn delete marker (dùng
`list-object-versions` + `delete-objects`), xoá object thường là chưa đủ.

## Còn nguyên vẹn ngoài AWS — không phải dựng lại

- **MongoDB Atlas** — toàn bộ user, video metadata, comment
- **Tên miền** `zelostech.site` (Hostinger)
- **Cloudflare** — DNS, HTTPS, cấu hình proxy
- **Bản sao lưu cục bộ** `backup-aws/` — Terraform state cũ (tham khảo) và video
  demo dạng HLS (17 MB)
