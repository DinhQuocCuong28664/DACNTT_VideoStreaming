# Dựng lại hệ thống trên tài khoản AWS mới

> Viết ngày 2026-08-18, sau khi tài khoản `881415010110` bị AWS đóng.
> Mục đích: đưa toàn bộ hạ tầng trở lại hoạt động trên một tài khoản AWS khác,
> với ít thao tác thủ công nhất.

## Điều quan trọng nhất phải biết trước

**Tên S3 bucket là duy nhất trên toàn cầu, không chỉ trong một tài khoản.** Các
bucket của tài khoản cũ (`dacntt-terraform-state`, `dacntt-dev-raw-bucket`,
`dacntt-dev-processed-bucket`, `zelostech.site`) **vẫn đang giữ chỗ tên đó** cho
tới khi AWS thực sự xoá dữ liệu của tài khoản đã đóng — thường mất tới khoảng 90
ngày. Nếu dùng lại nguyên tên cũ, `terraform apply` sẽ báo
`BucketAlreadyExists` và dừng.

→ **Bắt buộc đổi tiền tố tên** khi dựng lại. Cách gọn nhất là đổi `project_name`,
vì hầu hết tên bucket đều sinh ra từ biến này.

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

### 2. Đổi tên project để tránh trùng bucket

Sửa `infrastructure/environments/dev/terraform.tfvars`:

```hcl
project_name = "dacntt2"   # hoặc tên bất kỳ chưa ai dùng
```

Sửa `infrastructure/environments/dev/backend.tf` (tên hard-code, không đọc biến):

```hcl
bucket = "dacntt2-terraform-state"
```

Sửa `scripts/bootstrap-terraform-state.sh`:

```bash
STATE_BUCKET="dacntt2-terraform-state"
```

Bucket frontend trong `frontend.tf` đang hard-code là `zelostech.site`. Tên này
phải trùng tên miền **chỉ khi** dùng S3 static website hosting trực tiếp. Vì hiện
tại Cloudflare đứng trước làm proxy, có thể đổi thành tên bất kỳ (ví dụ
`dacntt2-frontend`) rồi trỏ Cloudflare tới endpoint mới — xem bước 6.

### 3. Tạo backend lưu Terraform state

```bash
bash scripts/bootstrap-terraform-state.sh
```

### 4. Dựng toàn bộ hạ tầng

```bash
cd infrastructure/environments/dev
terraform init -reconfigure    # -reconfigure vì backend đã đổi bucket
terraform apply
```

Nếu tài khoản mới **được phép tạo CloudFront** (tài khoản cũ bị chặn, phải chờ
xác minh), thì đặt `enable_cloudfront = true` trong `terraform.tfvars` để chạy
đúng kiến trúc gốc mô tả trong báo cáo, thay cho phương án Cloudflare tạm thời.

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
