# Dựng lại hệ thống trên tài khoản AWS mới

Tài liệu này dùng khi phải đưa toàn bộ hệ thống v2 sang một tài khoản AWS khác, ví dụ khi tài khoản
hiện tại (B, `749680934725`) bị đóng hoặc hết tín dụng. Lệnh triển khai chi tiết nằm ở
[`docs/ops/deploy.md`](ops/deploy.md). Ở đây chỉ ghi những gì **khác** khi tài khoản là mới.

Bản cũ của tài liệu này mô tả lần dựng lại v1 (EC2) ngày 2026-08-18. Bản đó vẫn đọc được trong lịch sử git.

## 1. Cái gì còn, cái gì mất

| Thành phần | Khi đổi tài khoản |
|---|---|
| Mã nguồn, Terraform, báo cáo, số đo | Còn: nằm trong git |
| MongoDB Atlas (người dùng, metadata video, bình luận) | Còn: nằm ngoài AWS. Nhưng mọi video cũ trỏ tới tệp không còn tồn tại (xem §4) |
| Tên miền `zelostech.site`, DNS và Worker Cloudflare | Còn: chỉ phải trỏ lại về tài nguyên mới |
| Bucket raw, processed, work, keys, web, artifacts | **Mất**, cả tệp gốc, HLS và khoá AES |
| Secrets Manager (`zelos-<env>/api`, `zelos-<env>/mongodb-uri`, `dacntt-dev/cloudflare-api-token`) | **Mất**: phải nhập lại từ nguồn gốc (Atlas, Google Cloud Console, Gmail, Cloudflare) |
| Khoá riêng ký CloudFront | **Mất** nếu chỉ lưu trong secret. Phải có bản sao ngoài AWS, nếu không thì tạo cặp khoá mới (§3, bước 4) |
| Image transcoder trong ECR, state Terraform | **Mất**: build lại và tạo lại |

## 2. Kiểm tra trước khi bắt đầu

1. **Tên bucket state là duy nhất toàn cầu.**
   - `dacntt-terraform-state` còn nằm ở tài khoản cũ thì tài khoản mới không tạo được. `scripts/bootstrap-terraform-state.sh` sẽ in "already exists" như thể không có lỗi.
   - Cách xử lý: xoá bucket cũ trước, hoặc dùng tên mới và sửa khối `backend "s3"` trong cả ba file `infra/envs/{shared,staging,prod}/main.tf`.
   - Các bucket khác không gặp vấn đề này, vì tên của chúng có gắn ID tài khoản (`zelos-<env>-raw-<account>`, `zelos-artifacts-<account>`).
2. **Quota của tài khoản mới rất thấp.** Xin nâng quota trước, vì mỗi yêu cầu mất vài ngày.
   - Lambda concurrent executions: API prod giữ trước 80, staging 20, mà AWS buộc phải để trống ít nhất 100. Cần ít nhất khoảng 250. Quota mặc định 10 sẽ làm `terraform apply` lỗi.
   - Fargate On-Demand và Fargate Spot vCPU: prod cần 24 + 24, staging 8 + 8.
   - Kiểm tra bằng `python ~/.claude/aws-quota-report.py` sau khi thêm profile mới.
3. **CloudFront phải được bật cho tài khoản mới.** Tài khoản B từng bị chặn tạo distribution cho tới khi được AWS xác minh (`docs/ops/cdn-to-b.md`).
4. **Tên host của CloudFront.** Một host (`zelostech.site`, `cdn.zelostech.site`) chỉ gắn được vào một distribution tại một thời điểm.
   - Nếu distribution cũ còn sống, apply lần đầu với `-var attach_hosts=false`, rồi chuyển host theo cách của `docs/ops/cdn-to-b.md`.
   - Nếu tài khoản cũ đã đóng thì bỏ qua bước này.

## 3. Các bước

Chạy từ gốc repo trong Git Bash, với `MSYS_NO_PATHCONV=1` và profile `default` trỏ tới tài khoản mới.

1. **Credentials:** `aws configure` cho tài khoản mới, vùng `ap-southeast-1`, rồi kiểm tra bằng `aws sts get-caller-identity`.
2. **State:** chạy `scripts/bootstrap-terraform-state.sh`. Tạo lại secret token Cloudflare (lấy từ dashboard Cloudflare) với tên `dacntt-dev/cloudflare-api-token`, rồi export `CLOUDFLARE_API_TOKEN`.
3. **Hạ tầng chung:**

   ```bash
   terraform -chdir=infra/envs/shared init -reconfigure
   terraform -chdir=infra/envs/shared apply
   ```

   `-reconfigure` để Terraform bỏ cấu hình backend đã cache trong `.terraform/` của tài khoản cũ.
4. **Khoá ký CloudFront** (chỉ khi mất khoá riêng):

   ```bash
   openssl genrsa -out cdn-signing-private.pem 2048
   openssl rsa -in cdn-signing-private.pem -pubout -out infra/envs/<env>/cdn-signing-public.pem
   ```

   Commit khoá công khai (giữ đuôi dòng LF). Khoá riêng giữ ngoài repo và chỉ đưa vào secret ở bước 7.
5. **Image transcoder:** build và push lên ECR mới, gắn tag là SHA của commit (`deploy.md` §5.2).
6. **Từng môi trường** (staging trước, rồi prod): build mã Lambda và layer ffprobe, rồi `terraform init -reconfigure` và `apply -var transcoder_image_tag=<sha>` (`deploy.md` §5.1, §5.3). Terraform tự tạo:
   - chứng chỉ ACM ở `us-east-1`, xác thực qua bản ghi Cloudflare;
   - các CNAME của web và CDN.
7. **Secret:** điền `zelos-<env>/api` và `zelos-<env>/mongodb-uri` theo danh sách khoá ở `deploy.md` §4. `cloudfrontKeyPairId` lấy từ `terraform output cdn_key_pair_id` của tài khoản mới.
8. **Worker:**
   - Function URL đã đổi, nên sửa `TARGET_HOST` của môi trường đó trong `infra/cloudflare-worker/wrangler.toml` theo `terraform output api_function_url`.
   - Chạy `npx wrangler deploy --env <env>`, rồi commit `wrangler.toml`.
   - `ORIGIN_VERIFY_SECRET` còn nguyên trên Cloudflare. Chỉ phải chạy lại `wrangler secret put` nếu tạo `originSecret` mới.
9. **Index, web, seed:**
   - Chạy `scripts/ensure-indexes.sh <env>` và `scripts/deploy-web.sh <env>`.
   - Nếu dùng database mới, chạy `node scripts/seed.mjs role` và `node scripts/seed.mjs e2e`.

## 4. Video cũ

Tệp HLS, tệp gốc và khoá AES đều nằm trong bucket của tài khoản cũ. Vì vậy mọi video cũ trong MongoDB sẽ không phát được nữa. Chọn một trong hai cách:

- **Database mới (đơn giản nhất):** tạo database hoặc cluster mới, rồi nạp lại video demo bằng `node scripts/seed.mjs demo --env <env> --manifest .local-notes/demo-videos.json`. Lệnh này chạy video qua pipeline thật.
- **Giữ database cũ:**
  - Cách 1: chép bucket `processed` và `keys` sang tài khoản mới trước khi tài khoản cũ đóng (`aws s3 sync` giữa hai tài khoản), với đúng key cũ (`videos/{videoId}/v{uploadVersion}/...`).
  - Cách 2: xoá các video không còn tệp.

  Có một lưu ý: URI khoá trong playlist chứa host API, và host này không đổi (`api.zelostech.site`). Vì vậy chép nguyên trạng thì video vẫn phát được.

## 5. Kiểm tra sau khi dựng xong

Kiểm tra theo `deploy.md` §6. Tối thiểu cần:

- `/health` của API trả về 200.
- Một video tải lên mới đi tới `READY` và phát được ở mọi mức chất lượng.
- Bộ E2E chạy qua, kể cả khi đặt `E2E_PIPELINE=1`.

Nếu job Batch thất bại, đọc `statusReason` của job chứ đừng chỉ nhìn trạng thái `FAILED`. Lỗi cấu hình như thiếu quyền ECR hoặc sai tag image làm container chết trước khi chạy, và chỉ thấy được trong trường đó.

Sau khi xong, cập nhật ID tài khoản mới trong `docs/ARCHITECTURE.md` mục 2 và trong tài liệu chính sách tài khoản của người vận hành.
