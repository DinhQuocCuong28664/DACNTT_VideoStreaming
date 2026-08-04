# 📚 KẾ HOẠCH BÁO CÁO & THỰC HIỆN ĐỒ ÁN DACNTT
## (Tuân thủ 100% Hướng dẫn & Quy định của Thầy ThS. Mai Văn Mạnh)

> **Dự án:** Cloud-Native Video Sharing Platform with HLS Transcoding Pipeline  
> **Sinh viên thực hiện:**  
> - Đinh Quốc Cường (MSSV: 523H0008)  
> - Võ Huỳnh Minh Đức (MSSV: 523H0014)  
> **Giảng viên hướng dẫn:** ThS. Mai Văn Mạnh  
> **Môi trường soạn thảo Báo cáo:** LaTeX (MiKTeX engine đã cài đặt sẵn trên máy)

---

## 🛠️ 1. XÁC NHẬN MÔI TRƯỜNG & CÔNG CỤ (SYSTEM CHECK)

### 1.1. Công cụ biên dịch Báo cáo (LaTeX Engine)
- ✅ **MiKTeX Distribution:** Đã cài đặt hoàn chỉnh tại `C:\Users\cbzer\AppData\Local\Programs\MiKTeX\miktex\bin\x64\`
- ✅ **Trình biên dịch khả dụng:** `pdflatex`, `xelatex`, `lualatex`, `miktex`
- ✅ **Template LaTeX chuẩn từ Thầy / Khoa:** Nằm tại thư mục `guild_from_teacher/Sample Report-20260803T081024Z-1-001/Sample Report/latex-thesis-report-template/`

### 1.2. Công cụ Quản lý Tiến độ (Schedule & Tracking)
- ✅ **Excel Tool:** Sử dụng file `Template Schedule.xlsx` làm chuẩn cấu hình bảng phân công công việc (WBS), người phụ trách, thời hạn và sản phẩm bàn giao.

---

## 📜 2. TỔNG HỢP QUY ĐỊNH KỶ LUẬT VÀ TIÊU CHUẨN BÁO CÁO (THẦY MẠNH)

### ❌ 2.1. CÁC ĐIỀU CẤM TUYỆT ĐỐI (ABSOLUTE DON’Ts)
1. **KHÔNG** viết sai chính tả tên Trường, tên Khoa, Tên đề tài, MSSV và Họ tên thành viên.
2. **KHÔNG** viết sai Họ tên hoặc Học vị/Học hàm của Giảng viên hướng dẫn (**ThS. Mai Văn Mạnh**).
3. **KHÔNG** sao chép (copy-paste) thô nội dung từ Internet hoặc lạm dụng AI để sinh văn bản thiếu biên tập.
4. **KHÔNG** lạm dụng định dạng gạch đầu dòng (bullet points). Nội dung phải được trình bày thành các **đoạn văn hoàn chỉnh (continuous prose)**, giải thích lập luận mạch lạc.
5. **KHÔNG** để lại các văn bản rác, comment mẫu hoặc dữ liệu placeholder (`Nguyễn Văn A`, sample code...) từ template.
6. **KHÔNG** chụp ảnh màn hình IDE nền đen dán vào báo cáo. Mã nguồn (nếu có) phải đưa vào fenced block nền sáng với font chuyên dụng.
7. **KHÔNG** chèn hình vẽ, bảng biểu mà không có văn bản dẫn dắt, phân tích và giải thích đi kèm.

### 🌟 2.2. NGUYÊN TẮC KHUYÊN KHUYẾN & TIÊU CHUẨN HÌNH THỨC (RECOMMENDED PRACTICES)
1. **Trang Bìa:** Trình bày chỉn chu, Tên đề tài VIẾT HOA, Logo TDTU nét cao, đúng định dạng.
2. **Cấu trúc đoạn văn:** Mỗi mục phải có câu mở đầu dẫn dắt, các đoạn văn giải thích lý do, ưu/nhược điểm và kết luận.
3. **Hình ảnh & Bảng biểu (Figures & Tables):**
   - Đều phải có Đánh số & Chú thích (Caption) đặt căn giữa, in nghiêng (Ví dụ: *Hình 4.1: Kiến trúc hệ thống Serverless Transcoding* hoặc *Bảng 5.2: Bảng so sánh thời gian xử lý*).
   - Font chữ trong bảng nhỏ hơn body text 1-2pt. Đầu bảng (Header) viết HOA, in đậm.
4. **Tham chiếu tự động:** Bắt buộc dùng `\ref{}` và `\cite{}` trong LaTeX để tham chiếu hình vẽ, bảng biểu và tài liệu tham khảo.
5. **Tính hoàn thiện của Sản phẩm:** Sản phẩm thực tế (`zelostech.site`, HLS Player, Transcoder Container) phải chạy thực sự, không báo cáo dở dang hoặc hứa hẹn "sẽ làm sau".

---

## 📐 3. BỐ CỤC CHƯƠNG BÁO CÁO CHUẨN (6 CHƯƠNG LATEX)

Báo cáo sẽ được biên dịch bằng LaTeX theo đúng khung chương mục quy định:

```
REPORT COVER & PREAMBLE
├── Title Page (Trang bìa chính & bìa phụ)
├── Abstract (Tóm tắt đề tài - không quá 1 trang A4)
├── Table of Contents (Mục lục tự động)
├── List of Figures (Danh mục hình vẽ tự động)
├── List of Tables (Danh mục bảng biểu tự động)
└── Glossary / Abbreviations (Danh mục thuật ngữ & viết tắt)

CHAPTER 1: INTRODUCTION (MỞ ĐẦU)
├── 1.1 Background & Rationale (Bối cảnh & Lý do chọn đề tài)
├── 1.2 Project Objectives (Mục tiêu đề tài)
├── 1.3 Scope & Deliverables (Phạm vi & Sản phẩm bàn giao)
├── 1.4 Main Contributions (Đóng góp chính của đề tài)
└── 1.5 Report Structure (Bố cục báo cáo)

CHAPTER 2: LITERATURE REVIEW & TECHNOLOGIES (TỔNG QUAN TÀI LIỆU & CÔNG NGHỆ)
├── 2.1 Related Works & Product Comparison (So sánh các sản phẩm liên quan: YouTube, Vimeo...)
├── 2.2 Core Models & Principles (Mô hình Serverless Container, Event-Driven, ABR Streaming)
└── 2.3 Technology Stack Justification (Lý do chọn React.js, Node.js, AWS Batch/S3/SQS, Docker, Terraform, DevSecOps)

CHAPTER 3: REQUIREMENTS ANALYSIS (PHÂN TÍCH YÊU CẦU)
├── 3.1 User Requirements & Stakeholders (Yêu cầu người dùng)
├── 3.2 Functional Requirements (Yêu cầu chức năng: Auth, Upload Pre-signed URL, Watch HLS, Channel)
├── 3.3 Non-Functional Requirements (Yêu cầu phi chức năng: Latency, Throughput, Scalability, Security)
└── 3.4 Use Case Diagrams & Specifications (Sơ đồ Use Case & Mô tả chi tiết)

CHAPTER 4: SYSTEM DESIGN (THIẾT KẾ HỆ THỐNG)
├── 4.1 High-Level Architecture (Kiến trúc hệ thống tổng quan & Sơ đồ tương tác các thành phần)
├── 4.2 Database Design (Thiết kế CSDL MongoDB Atlas, ERD & Class Diagram)
└── 4.3 Interface & Interaction Design (Thiết kế Giao diện UI/UX & Sequence Diagrams)

CHAPTER 5: IMPLEMENTATION & RESULTS (TRIỂN KHAI & KẾT QUẢ THỰC NGHIỆM)
├── 5.1 Core System Implementation (Chi tiết triển khai Frontend, Backend API & Transcoder Engine)
├── 5.2 Infrastructure as Code & CI/CD Pipeline (Terraform modules & GitHub Actions)
├── 5.3 DevSecOps & Security Reports (SonarQube SAST, Trivy Container Scan, Gitleaks Scan)
└── 5.4 Performance Evaluation & Load Testing (Kết quả k6 Load Test, QoE Time-to-First-Frame)

CHAPTER 6: CONCLUSION & FUTURE WORK (KẾT LUẬN & HƯỚNG PHÁT TRIỂN)
├── 6.1 Project Summary (Tóm tắt kết quả đạt được)
└── 6.2 Limitations & Future Enhancements (Hạn chế & Hướng phát triển)

REFERENCES & APPENDIX
├── References (Tài liệu tham khảo BibTeX)
└── Appendix (Phụ lục mã nguồn, cấu hình Docker/Terraform/k6)
```

---

## 🗓️ 4. KHAI THÁC FILE `Template Schedule.xlsx` CHO QUẢN LÝ TIẾN ĐỘ

Để đáp ứng file Excel mẫu từ Thầy, chúng ta sẽ lập file **`Schedule_DACNTT.xlsx`** (hoặc quản lý công việc song song) chia làm các cột chuẩn:
1. **Module / Task Name:** Tên hạng mục công việc
2. **Assignee (Người thực hiện):** Đinh Quốc Cường (523H0008) hoặc Võ Huỳnh Minh Đức (523H0014)
3. **Start Date & End Date:** Ngày bắt đầu và Hạn hoàn thành
4. **Status:** `NOT_STARTED` | `IN_PROGRESS` | `COMPLETED`
5. **Deliverable (Sản phẩm bàn giao):** Link code GitHub, Docker image, file `.tex`, báo cáo PDF.

---

## 🚀 5. LỘ TRÌNH THỰC HIỆN TIẾP THEO (ACTION PLAN)

### 📌 Bước 1: Hoàn thiện Mã nguồn các Phase kỹ thuật
- [x] **Phase 0:** Khởi tạo monorepo cấu trúc chuẩn. `(100%)`
- [x] **Phase 1:** Backend API + Auth JWT + MongoDB + S3 Presigned URL. `(100%)`
- [x] **Phase 2:** Frontend React.js + Dark Mode UI + HLS.js Player (ABR). `(100%)`
- [x] **Phase 3:** Transcoder Engine (Docker Multi-stage + FFmpeg + SQS Handler + Heartbeat). `(100%)`
- [x] **Phase 4:** Terraform IaC (11 modules AWS — S3, SQS, ECR, IAM, VPC, Batch, CloudFront, Lambda, Secrets, SNS, Monitoring) + CI/CD Pipeline (4 GitHub Actions Workflows). `(100%)`
- [ ] **Phase 5:** DevSecOps (SonarQube, Trivy, Gitleaks) + Monitoring (CloudWatch) + Load Testing (k6).

### 📌 Bước 2: Biên soạn Báo cáo LaTeX (`report.tex`)
1. Tạo thư mục `report/` chứa toàn bộ mã nguồn LaTeX dựa trên template của Khoa/Thầy.
2. Viết nội dung từng Chương (Chương 1 đến Chương 6) theo định dạng văn bản chuẩn, chèn hình sơ đồ kiến trúc và bảng số liệu thực nghiệm.
3. Dùng lệnh `pdflatex` / `xelatex` biên dịch thành file `Report_DACNTT_VideoStreaming.pdf`.

---
*Kế hoạch này được lưu tại `TEACHER_GUIDELINE_PLAN.md` và sẵn sàng triển khai.*
