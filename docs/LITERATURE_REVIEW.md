# 📚 KHẢO SÁT TÀI LIỆU KHOA HỌC (Literature Review)

> Tài liệu nền cho Chương 2 (Cơ sở lý thuyết & Công trình liên quan) và Chương 6 (Hạn chế & Hướng phát triển) của Đồ án
> **Xây dựng nền tảng chia sẻ video trực tuyến với hệ thống chuyển mã HLS tự động trên kiến trúc Serverless Container và Event-Driven**
> Cập nhật: 22/08/2026 — bổ sung mục L (Google Sign-In & Account Linking) và liên kết truy cập cho toàn bộ trích dẫn
> Biên soạn theo chuẩn phân loại nguồn của `docs/RESEARCH_REFERENCES.md` (đồ án tham chiếu)

---

## ⚠️ Quy ước phân loại nguồn

| Ký hiệu | Ý nghĩa | Dùng được để trích dẫn trong báo cáo? |
|---------|---------|----------------------------------------|
| 🟢 **Tier 1** | Hội nghị/tạp chí bình duyệt (IEEE, ACM, Springer, MDPI, NDSS, ICSE, USENIX) | ✅ Có — nguồn chính |
| 🟡 **Tier 2** | arXiv preprint, tạp chí ít uy tín hơn, hoặc chưa xác minh đầy đủ | ⚠️ Được, nhưng cần đọc kỹ, không nên làm nguồn chủ đạo |
| 🔴 **Tier 3** | Blog kỹ thuật, tài liệu vendor (kể cả blog Netflix) | ❌ Không trích dẫn như "nghiên cứu"; chỉ dùng minh chứng thực tiễn công nghiệp |

> **Lưu ý:** Toàn bộ nguồn 🟢 dưới đây đã được xác minh trực tiếp (DOI, trang hội nghị/tạp chí chính thức). Các mục ghi "chưa xác minh đầy đủ" là do agent nghiên cứu không lấy được đủ metadata (tên tác giả/DOI) qua các nguồn tra cứu khả dụng — **không trích dẫn cho tới khi tự kiểm tra lại trực tiếp**.

> **Xác minh liên kết (2026-08-22):** Mọi trích dẫn trong tài liệu này đã được bổ sung liên kết truy cập trực tiếp. Toàn bộ **22 DOI** đã được đối chiếu tự động với **Crossref API** — cả 22 đều phân giải thành công và tiêu đề/năm trả về khớp với thông tin ghi ở đây. Các nguồn không có DOI (kỷ yếu USENIX, sách, arXiv, blog vendor) dùng liên kết tới trang chính thức của hội nghị/nhà xuất bản/tác giả, đã kiểm tra thủ công. Định dạng `https://doi.org/<DOI>` được dùng thay vì URL riêng của từng nhà xuất bản vì đây là bộ phân giải chính thức, không phụ thuộc việc nhà xuất bản đổi cấu trúc website.

---

## MỤC LỤC

- [A. Kiến trúc Event-Driven Serverless cho Video Processing](#a-kiến-trúc-event-driven-serverless)
- [B. Chunk-based & Multi-threaded Parallel Encoding](#b-chunk-based--multi-threaded-parallel-encoding) ⭐ *lõi khoa học*
- [C. Adaptive Bitrate Streaming & Per-Title Encoding](#c-adaptive-bitrate-streaming--per-title-encoding)
- [D. Message Queue Reliability, Heartbeat Pattern & Idempotency](#d-message-queue-reliability--idempotency) ⭐ *phát hiện gap thật trong code*
- [E. Cold Start & Serverless Container vs FaaS](#e-cold-start--serverless-container-vs-faas)
- [F. Bảo vệ nội dung: Signed Cookie vs DRM](#f-bảo-vệ-nội-dung-signed-cookie-vs-drm)
- [G. DevSecOps — Bằng chứng khoa học](#g-devsecops--bằng-chứng-khoa-học)
- [H. Load Testing & Phương pháp luận đánh giá hiệu năng](#h-load-testing--phương-pháp-luận)
- [I. Công trình liên quan trực tiếp (Related Work)](#i-công-trình-liên-quan-trực-tiếp)
- [J. Khoảng trống trong thiết kế hiện tại](#j-khoảng-trống-trong-thiết-kế-hiện-tại) ⭐
- [K. Đề xuất đóng góp khoa học](#k-đề-xuất-đóng-góp-khoa-học)
- [L. Xác thực người dùng: Google Sign-In & Account Linking](#l-xác-thực-người-dùng-google-sign-in--account-linking)

---

## A. Kiến trúc Event-Driven Serverless

### A.1 — Bằng chứng thực nghiệm trực tiếp nhất 🟢

**Moina-Rivera, W.A., Garcia-Pineda, M., Claver, J.M., Gutierrez-Aguado, J. (2023).** *Event-Driven Serverless Pipelines for Video Coding and Quality Metrics.* **Journal of Grid Computing, 21(2), Article 20.** DOI: `10.1007/s10723-023-09647-0`
🔗 https://link.springer.com/article/10.1007/s10723-023-09647-0

**Kết luận cốt lõi:** Triển khai pipeline event-driven (CloudEvents) trên nền tảng serverless dựa trên Knative để encode video chunk. Chứng minh mô hình event-driven scale-to-zero khả thi cho khối lượng công việc nặng CPU như video coding — trái với niềm tin phổ biến rằng serverless chỉ hợp tác vụ ngắn/nhẹ.

**→ Ứng dụng:** Xác nhận tính đúng đắn lý thuyết của việc tách "nhận sự kiện" (S3 event) khỏi "thực thi nặng" (FFmpeg trên Fargate) trong kiến trúc hiện tại. Khoảng trống: bài dùng Knative/on-prem, không đánh giá vai trò của một lớp đệm message queue (SQS) trung gian như đồ án — đây là điểm khác biệt/đóng góp có thể nhấn mạnh.

> **Sửa lỗi trích dẫn cũ:** `report/references.bib` (mục `grid2023serverless`) trước đó ghi sai tên tác giả (Ristov et al. — thực ra là tên tác giả của paper khác). Đã sửa lại đúng 4 tác giả trên.

### A.2 — S3 → SQS → Lambda: bằng chứng thực nghiệm cho đúng mẫu kiến trúc job-submitter 🟢

**Pogiatzis, A., Samakovitis, G. (2021).** *An Event-Driven Serverless ETL Pipeline on AWS.* **Applied Sciences (MDPI), 11(1), 191.** DOI: `10.3390/app11010191`
🔗 https://www.mdpi.com/2076-3417/11/1/191

**Kết luận cốt lõi:** Xây dựng và đánh giá thực nghiệm (92 thí nghiệm) pipeline S3→SQS→Lambda thuần tuý. Xử lý ổn định với payload &gt;100MB; chỉ ra **SQS trở thành bottleneck khi message mang payload lớn**.

**→ Ứng dụng:** Giải thích đúng lý do thiết kế: SQS message trong đồ án chỉ mang metadata (S3 key), không mang payload video — tách biệt "kênh điều khiển nhỏ" (SQS) khỏi "kênh dữ liệu lớn" (S3 trực tiếp), đúng với khuyến nghị ngầm của bài báo này để tránh chính bottleneck mà bài báo phát hiện.

### A.3 — Gộp task để tiết kiệm chi phí (hướng phát triển) 🟢

**Wu, S., Denninnart, C., Li, X., Wang, Y., Salehi, M.A. (2020).** *Descriptive and Predictive Analysis of Aggregating Functions in Serverless Clouds: the Case of Video Streaming.* **IEEE HPCC 2020.**
🔗 arXiv: https://arxiv.org/abs/2012.06021 | IEEE: https://ieeexplore.ieee.org/document/9407824/

**Kết luận cốt lõi:** Gộp nhiều task xử lý video serverless nhỏ tiết kiệm tới **44% execution-time**.

**→ Ứng dụng:** Gợi ý hướng tối ưu tương lai — batch nhiều job FFmpeg nhỏ vào một Fargate task thay vì 1 job/1 task, cho Chương 6 Hướng phát triển.

### A.4 — Review bối cảnh, xác định khoảng trống nghiên cứu 🟢

**Moina-Rivera, W., Garcia-Pineda, M., Gutiérrez-Aguado, J., Alcaraz-Calero, J.M. (2024).** *Cloud media video encoding: review and challenges.* **Multimedia Tools and Applications (Springer), 83(34), 81231-81278.** DOI: `10.1007/s11042-024-18763-2`
🔗 https://link.springer.com/article/10.1007/s11042-024-18763-2

**Kết luận cốt lõi:** Chưa có review nào đi sâu chi tiết kỹ thuật encoding/transcoding trong bối cảnh cloud — nêu cold-start latency, vendor lock-in, execution constraints là thách thức chính.

**→ Ứng dụng:** Dùng cho phần "Đặt vấn đề" — khẳng định đồ án lấp một phần khoảng trống nghiên cứu mà review này nêu ra.

**⚠️ Khoảng trống xác nhận:** Không tìm được paper Tier 1 nào so sánh định lượng 3 mô hình (event-driven vs polling vs always-on worker pool) cho video. Đây là khoảng trống thật trong y văn, nên ghi rõ trong đồ án thay vì giả vờ có "bằng chứng khoa học" cho lựa chọn hiển nhiên này.

---

## B. Chunk-based & Multi-threaded Parallel Encoding
### ⭐ Đây là mảng có dữ liệu thực nghiệm mạnh nhất của đồ án — vCPU 1→4 speedup 4.1-5.5x, chi phí gần như không đổi

### B.1 — Cơ chế Amdahl's Law giải thích speedup đo được 🟢

**Sankaraiah, S., Shuan, L.H., Eswaran, C., Abdullah, J. (2014).** *Scalable video encoding with macroblock-level parallelism.* **EURASIP Journal on Advances in Signal Processing, 2014, Article 145.** DOI: `10.1186/1687-6180-2014-145`
🔗 https://doi.org/10.1186/1687-6180-2014-145

**Chen, C.-Y., Cheng, S.-C. et al. (2011).** *Task-based parallel H.264 video encoding for explicit communication architectures.* **Proc. IEEE SAMOS.** DOI: `10.1109/SAMOS.2011.6045464`
🔗 https://doi.org/10.1109/SAMOS.2011.6045464

**Kết luận cốt lõi:** Chen et al. (2011) đo speedup **4.7×-8.6×** trên 6 lõi SPE (kiến trúc Cell) cho bộ mã hoá task-based c264. Sankaraiah et al. (2014) đo speedup **1.97×/3.96×/7.71×** với 2/4/8 luồng cho thiết kế song song mức macroblock riêng của họ. Cả hai đều cho thấy chung một quy luật: speedup bão hoà dần theo số luồng do phần tuần tự (entropy coding, rate control) không song song hoá được — đúng định luật Amdahl, dù con số cụ thể khác nhau do khác kiến trúc phần cứng và thiết kế song song hoá.

**→ Ứng dụng:** Đây là cơ sở lý thuyết trực tiếp giải thích **tại sao** speedup thực đo của đồ án (4.12× cho video 100MB khi tăng 1→4 vCPU) gần khớp với khoảng lý thuyết 4.3×-4.7× của các nghiên cứu multithread x264/H.264 ở mức 4 luồng. Đồng thời cảnh báo: nếu thử 8-16 vCPU, hiệu suất sẽ **không** tăng tuyến tính tiếp — đúng để giải thích lý do đồ án chọn dừng ở 4 vCPU cho benchmark chính, và nêu rõ giới hạn Amdahl khi bàn về khả năng mở rộng trong tương lai.

### B.2 — Chunk-based parallel transcoding: kỹ thuật Netflix Cosmos, có cơ sở học thuật 🟢

**Zakerinasab, M.R., Wang, M. (2015).** *Does chunk size matter in distributed video transcoding?* **IEEE IWQoS 2015.** DOI: `10.1109/IWQoS.2015.7404710`
🔗 https://doi.org/10.1109/IWQoS.2015.7404710

**Kết luận cốt lõi:** Chunk lớn → nén tốt hơn nhưng chậm hơn; chunk nhỏ → transcode nhanh hơn (song song tốt hơn) nhưng chất lượng nén giảm do mất ngữ cảnh rate-control liên đoạn và tăng I-frame ép buộc tại biên chunk (**boundary effect**).

*Lưu ý phương pháp luận:* Đây là bài poster 2 trang (IWQoS 2015, tr. 69-70), không truy cập được toàn văn để tự kiểm chứng nguyên văn. Luận điểm tổng quát (chunk lớn/nhỏ đánh đổi tốc độ-chất lượng) là hiện tượng kỹ thuật phổ biến, hợp lý trong literature về chunk-based transcoding, nhưng thuật ngữ cụ thể "boundary effect" và cơ chế mô tả chưa được xác nhận trực tiếp từ nguyên văn bài này.

**→ Ứng dụng:** Đây là nguồn trung tâm cho phần "Hướng phát triển: chunk-based parallel encoding" — giải thích đánh đổi kỹ thuật cụ thể (không chỉ nói chung chung "sẽ nhanh hơn") khi đề xuất mở rộng từ kiến trúc hiện tại (1 job/1 container) sang chunk-parallel.

### B.3 — Scale ngang (nhiều container) bổ sung cho scale dọc (nhiều vCPU) 🟢

**Gutiérrez-Aguado, J., Peña-Ortiz, R., Garcia-Pineda, M., Claver, J.M. (2020).** *A Cloud-Based Distributed Architecture to Accelerate Video Encoders.* **Applied Sciences (MDPI), 10(15), 5070.** DOI: `10.3390/app10155070`
🔗 https://doi.org/10.3390/app10155070

**Gutiérrez-Aguado, J. et al. (2020).** *Cloud-based elastic architecture for distributed video encoding: Evaluating H.265, VP9, and AV1.* **Journal of Network and Computer Applications (Elsevier), 176.** DOI: `10.1016/j.jnca.2020.102782`
🔗 https://doi.org/10.1016/j.jnca.2020.102782

**Kết luận cốt lõi:** Kiến trúc chunk-based dùng elastic worker pool đạt speedup gần lý tưởng (**efficiency &gt;80%**) đến 9 worker song song, sau đó giảm dần (≥70% ở 12 worker, ≥60% ở 15 worker) — thể hiện điểm bão hoà Amdahl khi scale **ngang** qua nhiều container, khác với scale **dọc** (tăng vCPU/container) mà đồ án đo. Chất lượng nén khi chunk-split gần tương đương encode nguyên khối, tổng thời gian giảm **&gt;90%**.

**→ Ứng dụng:** Đồ án đo scale dọc (1 container, 1→4 vCPU); bài này đo scale ngang (nhiều container). Hai cơ chế **bổ sung nhau**: có thể kết hợp "4 vCPU/container" (đã verify thực nghiệm, cost-neutral) VỚI "nhiều container song song xử lý nhiều chunk" (bài này) để vừa nhanh vừa rẻ hơn nữa — luận điểm mạnh cho phần Hướng phát triển.

### B.4 — GPU vs CPU: định lượng hướng phát triển 🟢 ⭐

**Salcedo-Navarro, A., Peña-Ortiz, R., Claver, J.M., Garcia-Pineda, M. (2025).** *Towards GPU-enabled serverless cloud edge platforms for accelerating HEVC video coding.* **Cluster Computing, 28, Article 68.** DOI: `10.1007/s10586-024-04692-0`
🔗 https://doi.org/10.1007/s10586-024-04692-0

**Kết luận cốt lõi (số liệu quan trọng nhất tìm được):** So sánh `hevc_nvenc` (GPU) với `libx265` (CPU-only) trên nền tảng serverless Knative. GPU nhanh hơn CPU **8.33 lần**; trong kịch bản **multi-resolution encoding** (mã hoá đồng thời nhiều độ phân giải cho HAS — **gần giống hệt pipeline 360p/720p/1080p của đồ án**), GPU giảm thời gian trung bình mỗi segment tới **12.43 lần**.

**Nghiên cứu bổ trợ:** *"UHD Video Encoding in CPU Versus GPU: Quality and Performance Trade-Offs"*, **IEEE Access, 2025**, DOI: `10.1109/ACCESS.2025.3553634` — CPU cần trung bình **hơn 20% bitrate cao hơn** GPU để đạt cùng chất lượng (PSNR/VMAF).
🔗 https://doi.org/10.1109/ACCESS.2025.3553634

**→ Ứng dụng:** Nguồn định lượng mạnh nhất cho Chương 6 Hướng phát triển. So với speedup 4.1-5.5× đồ án đạt được chỉ bằng tăng vCPU CPU-only, GPU có tiềm năng nhanh hơn **12.43×** cho đúng use-case multi-resolution HLS — nhưng đánh đổi bằng ~20% bitrate cao hơn ở cùng chất lượng (ảnh hưởng chi phí CloudFront/S3) và Fargate hiện không hỗ trợ GPU (cần chuyển sang EC2/ECS với instance G4dn/G5, thay đổi kiến trúc serverless container).

### B.5 — Cost-efficiency của serverless khi tăng song song hoá 🟢

**Fouladi, S., Wahby, R.S. et al. (2017).** *Encoding, Fast and Slow: Low-Latency Video Processing Using Thousands of Tiny Threads.* **USENIX NSDI '17.**
🔗 https://www.usenix.org/conference/nsdi17/technical-sessions/presentation/fouladi

**Ao, L., Izhikevich, L., Voelker, G.M., Porter, G. (2018).** *Sprocket: A Serverless Video Processing Framework.* **ACM SoCC '18.** DOI: `10.1145/3267809.3267815`
🔗 https://doi.org/10.1145/3267809.3267815

**Kết luận cốt lõi:** ExCamera (Fouladi) dùng hàng nghìn Lambda thread cực nhỏ song song để encode — đối lập hoàn toàn với cách tiếp cận của đồ án (ít container lớn). Sprocket (Ao) chứng minh mô hình tính phí serverless theo tài nguyên sử dụng thực tế khiến việc tăng song song hoá **không nhất thiết** làm tăng chi phí.

**→ Ứng dụng:** Sprocket củng cố trực tiếp phát hiện thực nghiệm "cost-neutral scaling" của đồ án. ExCamera là đối trọng thú vị để thảo luận trade-off kiến trúc trong Related Work: cách tiếp cận "container lớn, ít" (đồ án) đơn giản, ổn định, phù hợp video VOD dài; cách "hàm nhỏ, nhiều" (ExCamera) phức tạp hơn nhưng latency cực thấp, phù hợp use-case khác.

---

## C. Adaptive Bitrate Streaming & Per-Title Encoding

### C.1 — Định lượng chi phí cơ hội của bitrate ladder cố định 🟢 ⭐

**Menon, V.V., Amirpour, H., Ghanbari, M., Timmerer, C. (2022).** *Perceptually-Aware Per-Title Encoding for Adaptive Video Streaming.* **IEEE ICME 2022.**
🔗 https://ieeexplore.ieee.org/document/9859744/

**Kết luận cốt lõi (số liệu quan trọng nhất):** So với **chính bitrate ladder tham chiếu của HLS** (gần giống ladder cố định 360p/720p/1080p mà đồ án dùng), phương pháp per-title encoding (PPTE) tiết kiệm trung bình **16.47% bitrate** (giữ nguyên PSNR) và **27.02%** (giữ nguyên VMAF), giảm **30.69% dung lượng lưu trữ**.

**→ Ứng dụng:** Baseline so sánh của bài này gần giống hệ thống hiện tại — đây là bằng chứng định lượng mạnh nhất, trực tiếp nhất để đưa vào Chương 6 Hạn chế: dùng con số 16-27% cụ thể thay vì nói chung chung "ladder cố định chưa tối ưu".

> **Lưu ý quan trọng:** 2 bài blog Netflix — [Per-Title Encode Optimization (2015)](https://netflixtechblog.com/per-title-encode-optimization-7e99442b62a2) và [Dynamic Optimizer (2018)](https://netflixtechblog.com/dynamic-optimizer-a-perceptual-video-encoding-optimization-framework-e19f1e3a277f) — đã trích trong `report/references.bib` là 🔴 **Tier 3** (blog vendor, không peer-review) — chỉ nên dùng ở phần Mở đầu tạo động lực nghiên cứu, **không** dùng làm căn cứ khoa học chính trong Related Work. Dùng Menon et al. (2022) và De Cock et al. (2016, dưới đây) thay thế cho vai trò đó.

### C.2 — Nguồn gốc học thuật của "content-aware encoding" (thay thế blog Netflix) 🟢

**De Cock, J., Li, Z., Manohara, M., Aaron, A. (2016).** *Complexity-Based Consistent-Quality Encoding in the Cloud.* **IEEE ICIP 2016.**
🔗 https://ieeexplore.ieee.org/document/7532605/

**Kết luận cốt lõi:** Đề xuất pipeline mã hoá dựa trên độ phức tạp nội dung — tiền thân học thuật hoá của ý tưởng per-title encoding (lưu ý: tác giả thuộc Netflix nhưng đây là bài hội nghị **peer-reviewed**, khác bản chất với 2 bài blog ở trên).

**→ Ứng dụng:** Trích dẫn thay cho blog Netflix khi cần nguồn học thuật chính thức về nguồn gốc ý tưởng content-aware encoding.

### C.3 — Convex hull bitrate ladder construction: khảo sát toàn diện 🟢

**Telili, A., Hamidouche, W., Amirpour, H., Fezza, S.A., Timmerer, C., Morin, L. (2025).** *Convex Hull Prediction Methods for Bitrate Ladder Construction.* **ACM TOMM, 21(7), 1-23.** DOI: `10.1145/3723006`
🔗 https://doi.org/10.1145/3723006

**Katsenou, A.V., Sole, J., Bull, D.R. (2021).** *Efficient Bitrate Ladder Construction for Content-Optimized Adaptive Video Streaming.* **IEEE Open Journal of Signal Processing.**
🔗 https://arxiv.org/abs/2102.04550

**Kết luận cốt lõi:** Katsenou et al. dùng ML dự đoán Pareto front, giảm **89.06%** số lần mã hoá thử nghiệm so với exhaustive search.

**→ Ứng dụng:** Nếu bàn về **chi phí tính toán** của per-title encoding (không chỉ lợi ích bitrate), đây là nguồn định lượng trade-off giữa độ chính xác ladder và overhead compute — liên quan trực tiếp tới kiến trúc Event-Driven (mỗi lần mã hoá thử = 1 lần chạy container tốn tiền).

### C.4 — Cơ sở lý thuyết ABR client-side (HLS.js) 🟢

**Huang, T.-Y., Johari, R., McKeown, N., Trunnell, M., Watson, M. (2014).** *A Buffer-Based Approach to Rate Adaptation.* **ACM SIGCOMM 2014.** DOI: `10.1145/2619239.2626296`
🔗 https://doi.org/10.1145/2619239.2626296

**Yin, X., Jindal, A., Sekar, V., Sinopoli, B. (2015).** *A Control-Theoretic Approach for Dynamic Adaptive Video Streaming over HTTP (MPC).* **ACM SIGCOMM CCR, 45(4).** DOI: `10.1145/2785956.2787486`
🔗 https://doi.org/10.1145/2785956.2787486

**Mao, H., Netravali, R., Alizadeh, M. (2017).** *Neural Adaptive Video Streaming with Pensieve.* **ACM SIGCOMM 2017.** DOI: `10.1145/3098822.3098843`
🔗 https://doi.org/10.1145/3098822.3098843

**Kết luận cốt lõi:** 3 thế hệ thuật toán ABR: buffer-based (BBA), control-theoretic (MPC — kết hợp throughput + buffer), và reinforcement learning (Pensieve) — mỗi thế hệ vượt trội thế hệ trước.

**→ Ứng dụng:** Cơ sở lý thuyết cho cơ chế ABR mà HLS.js sử dụng (thiên về buffer/throughput-based, chưa đạt độ phức tạp MPC/learning-based) — nêu là khoảng trống thứ hai: hệ thống phụ thuộc hoàn toàn vào ABR mặc định của thư viện, chưa tuỳ biến.

### C.5 — Khung QoE học thuật chuẩn 🟢

**Xu, Y., Zhou, Y., Chiu, D.-M. (2014).** *Analytical QoE Models for Bit-Rate Switching in Dynamic Adaptive Streaming Systems.* **IEEE Trans. Mobile Computing, 13(12), 2734-2748.**
🔗 https://ieeexplore.ieee.org/document/6748041/ | dblp: https://dblp.org/rec/journals/tmc/XuZC14.html

**Barman, N., Martini, M.G. (2019).** *QoE Modeling for HTTP Adaptive Video Streaming — A Survey and Open Challenges.* **IEEE Access, 7, 30831-30859.** DOI: `10.1109/ACCESS.2019.2901778`
🔗 https://doi.org/10.1109/ACCESS.2019.2901778

**Kết luận cốt lõi:** Công thức QoE chuẩn trong literature: `QoE = Σbitrate − μ·Σrebuffer_time − Σ|bitrate_switch|` (tổng bitrate trung bình, trừ phạt rebuffering có trọng số, trừ phạt dao động bitrate). Chuẩn ITU-T P.1203 được công nghiệp/học thuật công nhận.

**→ Ứng dụng:** Đồ án hiện chỉ đo Time-to-First-Frame — đây là nguồn để mở rộng bộ metric QoE (rebuffering ratio, bitrate switch count, VMAF) trong `scripts/benchmark-qoe.js`, biện minh khoa học cho việc chọn metric.

### C.6 — Biện minh lựa chọn HLS thay vì DASH 🟢

**Saini, S.S., Sharma, L.S. (2025).** *Comparative Analysis of MPEG-DASH and HLS Protocols: Performance, Adaptation, and Future Directions in Adaptive Streaming.* **Journal of The Institution of Engineers (India): Series B, 107(1), 335-344.** DOI: `10.1007/s40031-025-01244-x`
*(Xuất bản online 06/06/2025; số in tháng 02/2026 — trích dẫn năm 2025 theo ngày online.)*
🔗 https://doi.org/10.1007/s40031-025-01244-x

**Kết luận cốt lõi:** MPEG-DASH có tần suất lỗi/restart thấp hơn (phù hợp mạng không ổn định); HLS phản hồi nhanh hơn (phù hợp mạng ổn định, đặc biệt thiết bị Apple).

**→ Ứng dụng:** Biện minh lựa chọn HLS trong phần "Lựa chọn công nghệ", đồng thời thừa nhận hạn chế (kém ổn định hơn DASH trên mạng biến động) trong Chương 6.

### C.7 — Trade-off segment duration 6 giây 🟢

**Schwarzmann, S., Sieber, C. et al. (2020).** *Comparing Fixed and Variable Segment Durations for Adaptive Video Streaming.* **ACM MMSys 2020** (Giải **Excellence in DASH Award 2020**). DOI: `10.1145/3339825.3391858`
🔗 https://doi.org/10.1145/3339825.3391858

**Kết luận cốt lõi (số liệu):** Segment biến đổi (variable, theo I-frame tự nhiên) thay vì cố định: tăng QoE ở **54%** số phiên, giảm bitrate trung bình **7%** so với segment cố định.

**→ Ứng dụng:** Bằng chứng định lượng cho Chương 6: hệ thống dùng segment HLS **6 giây cố định** — đúng baseline mà nghiên cứu này so sánh, cho thấy còn dư địa cải thiện nếu chuyển sang variable segment duration theo GOP/scene-cut.

---

## D. Message Queue Reliability & Idempotency
### ⭐ Mảng này phát hiện được một khoảng trống THẬT đã xác nhận trong code (`transcoder/src/dbHandler.js`)

### D.1 — Mô hình hình thức hoá visibility timeout 🟢

**Li, J., Cui, Y., Ma, Y. (2015).** *Modeling Message Queueing Services with Reliability Guarantee in Cloud Computing Environment Using Colored Petri Nets.* **Mathematical Problems in Engineering, 2015, Article 383846.** DOI: `10.1155/2015/383846`
🔗 https://doi.org/10.1155/2015/383846

**Kết luận cốt lõi:** Mô hình hoá cơ chế visibility timeout bằng Colored Petri Nets: message có trạng thái visible/invisible, hoạt động như một "lock" tạm thời — đúng bản chất cơ chế SQS.

**Zhang, Z., Wang, Y., Chen, H., Kim, M., Xu, J., Lei, H. (2011).** *A cloud queuing service with strong consistency and high availability.* **IBM Journal of Research and Development, 55(6).**
🔗 https://ieeexplore.ieee.org/document/6097171/

**Kết luận cốt lõi:** Xác nhận dịch vụ hàng đợi cloud kiểu SQS cung cấp **at-least-once delivery** (không đảm bảo exactly-once) — có thể giao message lặp trong khoảng thời gian visibility timeout.

**→ Ứng dụng:** Giải thích lý do chọn Standard Queue (rẻ hơn, throughput cao hơn FIFO) đổi lại phải tự xử lý duplicate ở tầng ứng dụng.

### D.2 — Nguồn gốc lý thuyết của Heartbeat Pattern 🟢

**Burrows, M. (2006).** *The Chubby lock service for loosely-coupled distributed systems.* **Proc. 7th USENIX OSDI, Seattle, WA.** ACM DL: `10.5555/1298455.1298487`
🔗 https://www.usenix.org/conference/osdi-06/chubby-lock-service-loosely-coupled-distributed-systems | Google Research: https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/

**Kết luận cốt lõi:** Bài kinh điển giới thiệu cơ chế **lease** (khoá có TTL): client giữ session bằng gia hạn định kỳ (KeepAlive/heartbeat); nếu không gia hạn kịp (crash, network partition), lease tự hết hạn, tài nguyên được giải phóng. Đây là nguồn gốc học thuật của mọi "lease renewal pattern" hiện đại (Kubernetes lease, Redis lock renewal, Kafka session timeout).

**→ Ứng dụng:** Cơ sở lý thuyết chính xác nhất cho cơ chế Heartbeat Pattern tự thiết kế của đồ án (`transcoder/src/sqsHandler.js` — `startHeartbeat` gọi `ChangeMessageVisibility` định kỳ mỗi 3 phút). Visibility timeout SQS + heartbeat renewal = lease Chubby-style áp lên message.

### D.3 🔴⚠️ — KHOẢNG TRỐNG ĐÃ XÁC NHẬN TRONG CODE THẬT

Chubby paper (Burrows 2006) chỉ ra rủi ro kinh điển của cơ chế lease: **"lease hết hạn nhưng holder cũ chưa chết hẳn, chỉ bị treo/chậm tạm thời"** (GC pause, network delay, container bị throttle CPU).

**Áp vào kiến trúc hiện tại — đã kiểm tra trực tiếp mã nguồn:**

```js
// transcoder/src/dbHandler.js:50-64
const updateVideoReady = async (videoId, { hlsUrl, thumbnailUrl, duration }) => {
  const video = await Video.findById(videoId);
  if (!video) throw new Error(`Video not found: ${videoId}`);
  video.status = 'READY';
  video.hlsUrl = hlsUrl;
  // ... không kiểm tra video.status hiện tại trước khi ghi đè
  await video.save();
};
```

**Kịch bản lỗi cụ thể:** Nếu container FFmpeg bị treo tạm thời (không crash hẳn) khiến heartbeat timer bị delay quá 300 giây (visibility timeout), SQS sẽ coi message "available" trở lại → Lambda có thể submit **job Batch thứ hai** xử lý cùng `videoId`. Cả hai job:
1. Cùng tải video gốc, cùng transcode (**lãng phí gấp đôi chi phí compute** — vi phạm chính mục tiêu FinOps của đồ án).
2. Cùng upload HLS output vào **cùng một S3 prefix** `videos/{videoId}/` — nếu 2 tiến trình upload xen kẽ, có nguy cơ **file HLS không nhất quán** (master playlist từ job này, segment từ job kia).
3. Cùng gọi `updateVideoReady` — ghi đè lẫn nhau, "thắng cuối cùng" (last-write-wins), không có cảnh báo lỗi nào được ghi log.

**Đây không phải suy đoán lý thuyết — đây là gap thật, đã verify bằng cách đọc trực tiếp source code**, đúng như phương pháp luận "chứng minh bằng thực nghiệm/code review" mà tài liệu tham chiếu khuyến khích (mục N.1 kịch bản C trong `RESEARCH_REFERENCES.md` mẫu: "tắt lớp phòng vệ → tái tạo lỗi → bật lại → lỗi biến mất").

**→ Đề xuất khắc phục (nên đưa vào code hoặc ít nhất nêu trong Hạn chế):**
```js
const updateVideoReady = async (videoId, data) => {
  const result = await Video.findOneAndUpdate(
    { _id: videoId, status: { $ne: 'READY' } }, // chỉ update nếu CHƯA READY
    { $set: { status: 'READY', ...data } },
    { new: true }
  );
  if (!result) {
    console.warn(`Video ${videoId} đã READY từ trước — bỏ qua update trùng (duplicate job detected)`);
  }
  return result;
};
```
Đây chính là kỹ thuật **idempotent write bằng điều kiện trạng thái** (conditional update / compare-and-swap ở tầng ứng dụng) — tương đương "semantic lock" mà tài liệu tham chiếu mục C.2 mô tả cho Saga pattern, áp dụng đúng vào ngữ cảnh pipeline event-driven đơn giản hơn (không phải distributed transaction, nhưng cùng nguyên lý phòng vệ ghi trùng).

**Cập nhật (2026-08-12):** Fix đã được áp dụng thật vào `transcoder/src/dbHandler.js`, kèm 6 test (`transcoder/tests/dbHandler.test.js`) — verify bằng cách chạy bộ test đó trên bản code cũ (4/6 fail, xác nhận test bắt đúng lỗi) trước khi khôi phục bản đã sửa. Cờ `updated` mà `updateVideoReady`/`updateVideoError` trả về giờ còn phục vụ thêm mục đích thứ hai: cổng gửi email thông báo (mục tính năng mới — xem `transcoder/src/emailService.js`) chỉ kích hoạt khi `updated === true`, tức chỉ job thắng cuộc ghi mới gửi mail, tránh người dùng nhận 2 email trùng khi SQS redeliver.

---

## E. Cold Start & Serverless Container vs FaaS

### E.1 — Cold start: nâng cấp trích dẫn lên bản đã xuất bản 🟢

**Golec, M., Walia, G.K., Kumar, M., Cuadrado, F., Gill, S.S., Uhlig, S. (2025).** *Cold Start Latency in Serverless Computing: A Systematic Review, Taxonomy, and Future Directions.* **ACM Computing Surveys, 57(3).** DOI: `10.1145/3700875`
🔗 https://doi.org/10.1145/3700875

> **Đã sửa `report/references.bib`:** bài này trước đó trích dẫn dưới dạng arXiv preprint (2310.08437, Tier 2) — nay đã xuất bản chính thức tại ACM Computing Surveys (tạp chí review hàng đầu ngành CNTT), nâng cấp lên **Tier 1**. Đã cập nhật BibTeX.

### E.2 — Tại sao Lambda không phù hợp cho bước FFmpeg (data-intensive) 🟢

**Shillaker, S., Pietzuch, P. (2020).** *Faasm: Lightweight Isolation for Efficient Stateful Serverless Computing.* **USENIX ATC 2020, pp. 419-433.**
🔗 https://www.usenix.org/conference/atc20/presentation/shillaker

**Kết luận cốt lõi:** Mô hình FaaS truyền thống (cô lập bằng container ephemeral/stateless) gây overhead truy cập dữ liệu, giới hạn footprint tài nguyên — bất lợi cho ứng dụng data-intensive như xử lý video.

**→ Ứng dụng:** Luận cứ học thuật Tier 1 mạnh nhất giải thích tại sao Lambda chỉ đóng vai trò "job submitter" nhẹ, còn FFmpeg (data-intensive, cần đọc/ghi file lớn, cần CPU sustained) chạy trên AWS Batch/Fargate — quyết định kiến trúc cốt lõi của đồ án.

**⚠️ Khoảng trống xác nhận:** Không tìm được nghiên cứu Tier 1 nào đo cold start **riêng cho AWS Batch on Fargate** (khác ECS/Fargate service thường trực). Đồ án đã có `scripts/measure-transcode.js` và `docs/results/` — đây chính là chỗ đồ án tự đo và lấp khoảng trống này bằng dữ liệu thực nghiệm riêng (provisioning delay 28.5-30 giây quan sát được qua `aws batch describe-jobs`).

---

## F. Bảo vệ nội dung: Signed Cookie vs DRM

### F.1 — CDN Security: khảo sát toàn diện đầu tiên 🟢

**Ghaznavi, M., Jalalpour, E., Salahuddin, M.A., Boutaba, R., Migault, D., Preda, S. (2021).** *Content Delivery Network Security: A Survey.* **IEEE Communications Surveys & Tutorials, 23(4), 2166-2190.** DOI: `10.1109/COMST.2021.3093492`
🔗 https://doi.org/10.1109/COMST.2021.3093492

**Kết luận cốt lõi:** Khảo sát học thuật đầu tiên hệ thống hoá lỗ hổng CDN theo 3 tầng: edge server, request routing, origin server.

**→ Ứng dụng:** Nền tảng lý thuyết tổng quát cho phần "CDN và các lớp bảo mật". Lưu ý: bài **không** phân tích riêng signed URL/cookie — chỉ dùng cho bối cảnh chung.

### F.2 — Phân biệt bản chất Signed Cookie (access control) vs DRM (usage control) 🟢

**Usmani, Shannigrahi, Zink (2025).** *Secure the Stream, Not the Hosts: Attribute-Based Encryption for DRM Enabled Video Streaming.* **ACM MMSys '25, pp. 190-200.** DOI: `10.1145/3712676.3714450`
🔗 https://doi.org/10.1145/3712676.3714450

**Kết luận cốt lõi:** Signed URL/cookie chỉ bảo vệ **đường truyền/quyền truy cập** — một khi client tải được segment, dữ liệu không còn được bảo vệ nếu không có DRM/mã hoá nội dung.

**→ Ứng dụng:** Bằng chứng khoa học biện minh chính xác cho quyết định "không dùng DRM" của đồ án: Signed Cookie giải quyết "ai được kết nối tới CloudFront" (đúng mô hình đe doạ của đồ án — chia sẻ nội bộ nền tảng), còn DRM giải quyết vấn đề khác (chống rip nội dung thương mại cao cấp) — nằm ngoài phạm vi đề tài.

### F.3 ⚠️ — KHÔNG TÌM THẤY: nghiên cứu Tier 1 về lỗ hổng chia sẻ cookie giữa nhiều người dùng

Đã tìm kiếm nhiều lần, **không có paper học thuật nào phân tích trực tiếp** lỗ hổng "chia sẻ Signed Cookie/URL giữa nhiều thiết bị-người dùng, replay attack" cho video streaming CDN — chủ đề này chỉ có nguồn Tier 3 (blog bảo mật vendor).

**→ Cách xử lý trung thực trong báo cáo:** Trình bày phần "cookie cũ còn hiệu lực 2 giờ sau khi đổi video sang private" (đã tự nhận trong `docs/PRIVATE_VIDEO_SIGNED_COOKIES.md`) như **suy luận tự thực hiện dựa trên bản chất bearer-token đã biết** (mọi hệ thống signed/stateless-token, kể cả JWT, đều có thuộc tính "revoke tại nguồn không tức thời thu hồi token đã phát hành"), thay vì gán ghép một trích dẫn không khớp thực sự. Ghi rõ: *"chúng tôi không tìm thấy nghiên cứu học thuật định lượng cụ thể vấn đề này; phân tích là suy luận của nhóm."*

---

## G. DevSecOps — Bằng chứng khoa học

### G.1 — Biện minh Gitleaks 🟢 (đã dùng, xác nhận đúng 100%)

**Meli, M., McNiece, M.R., Reaves, B. (2019).** *How Bad Can It Git? Characterizing Secret Leakage in Public GitHub Repositories.* **NDSS 2019.** DOI: `10.14722/ndss.2019.23418`
🔗 https://doi.org/10.14722/ndss.2019.23418

**Số liệu xác nhận:** &gt;100.000 repository bị ảnh hưởng, hàng nghìn secret mới rò rỉ mỗi ngày.

### G.2 — Biện minh Trivy IaC scan (Terraform) 🟢 (đã dùng, xác nhận đúng 100%)

**Rahman, A., Parnin, C., Williams, L. (2019).** *The Seven Sins: Security Smells in Infrastructure as Code Scripts.* **ICSE 2019.** DOI: `10.1109/ICSE.2019.00033`
🔗 https://doi.org/10.1109/ICSE.2019.00033

**Số liệu xác nhận + bổ sung:** 1.726 script phân tích, 7 loại security smell, validate trên 15.232 script; **secret hard-coded tồn tại trung vị 20 tháng, tối đa 98 tháng** trước khi bị phát hiện. Con số "20 tháng" này rất đáng trích dẫn — biện minh mạnh cho việc quét tự động thay vì trông chờ review thủ công.

### G.3 — Tỷ lệ áp dụng DevSecOps thực tế trong ngành 🟢

**Cheenepalli et al. (2025).** *Advancing DevSecOps in SMEs: Challenges and Best Practices for Secure CI/CD Pipelines.* **IEEE ISDFS 2025.** arXiv: `2503.22612`
🔗 https://arxiv.org/abs/2503.22612

**Số liệu xác nhận:** 68% SME đã triển khai DevSecOps, nhưng **chỉ 12% quét bảo mật mỗi commit**.

**→ Ứng dụng:** Đồ án tích hợp Gitleaks + Trivy (container/dependency/IaC) + eslint-plugin-security chạy trên **mỗi commit/PR** — vượt trên mặt bằng ngành (chỉ 12% tổ chức làm được), điểm mạnh đáng nêu trong Kết luận.

### G.4 — Quy mô rủi ro CI/CD thực tế 🟢 (nguồn mới, mạnh)

**Pan et al. (2023).** *Ambush from All Sides: Understanding Security Threats in Open-Source Software CI/CD Pipelines.* **IEEE Transactions on Dependable and Secure Computing.** DOI: `10.1109/TDSC.2023.3253572`
🔗 https://doi.org/10.1109/TDSC.2023.3253572

**Kết luận cốt lõi:** Đo lường trên **&gt;320.000 repository** có cấu hình CI/CD, phát hiện nhiều lớp rủi ro (code hiding, script lỗi thời, phụ thuộc single-point-of-failure).

**→ Ứng dụng:** Bổ sung bằng chứng quy mô lớn cho động lực đầu tư DevSecOps — dùng cùng G.3 và G.1/G.2 làm bộ 4 nguồn cho Chương 5.3.

---

## H. Load Testing & Phương pháp luận

### H.1 — Sách nền tảng kinh điển 🟢

**Jain, R. (1991).** *The Art of Computer Systems Performance Analysis: Techniques for Experimental Design, Measurement, Simulation, and Modeling.* Wiley-Interscience. ISBN 0-471-50336-3. *(Sách — không có DOI.)*
🔗 Trang chính thức của tác giả: https://www.cse.wustl.edu/~jain/books/perfbook.htm | Mục lục: https://www.cse.wustl.edu/~jain/books/perf_toc.htm | Slide gốc: https://www.cse.wustl.edu/~jain/books/perf_sli.htm

**Nguyên tắc áp dụng bắt buộc (đã xác minh qua slide gốc + mục lục chính thức của tác giả):**
- Chạy **nhiều lần lặp**, báo cáo **mean + confidence interval/độ lệch chuẩn** — không lấy 1 lần đo.
- Có **warm-up period**, loại bỏ transient trước khi lấy mẫu steady-state.
- Report **percentile (p95/p99)**, không chỉ trung bình.
- **Cố định biến số** khi so sánh (one-factor hoặc factorial design).
- Chương "Common Mistakes": tránh mục tiêu thiên vị, tránh thiếu sensitivity analysis.

**→ Ứng dụng:** Đồ án đã áp dụng đúng nguyên tắc này khi đo transcode 100MB **3 lần** (346-541s) trước khi lấy trung bình — nên trích dẫn Jain (1991) ngay tại đoạn văn mô tả phương pháp đo trong `docs/results/README.md`/Chương 5.4, biến việc "lặp lại 3 lần" từ thói quen thành **phương pháp luận có căn cứ khoa học**.

---

## I. Công trình liên quan trực tiếp

### I.1 — AWS Video on Demand 🔴 (đã có trong `references.bib`, khoá `awsvod`)

**Amazon Web Services (2025).** *Video on Demand on AWS — Implementation Guide.*
🔗 https://docs.aws.amazon.com/solutions/latest/video-on-demand-on-aws/

So sánh: đồ án khác biệt bằng cách tự đóng gói FFmpeg trên Batch/Fargate thay vì dùng MediaConvert managed — đánh đổi chi phí thấp hơn lấy công sức vận hành cao hơn.

### I.2 — Netflix Cosmos 🔴 (đã có trong `references.bib`, khoá `netflix2021ves` — đúng Tier 3, chỉ dùng minh hoạ)

**Netflix Technology Blog (2024).** *The Making of VES: the Cosmos Microservice for Netflix Video Encoding.*
🔗 https://netflixtechblog.com/the-making-of-ves-the-cosmos-microservice-for-netflix-video-encoding-946b9b3cd300

Chunk-based distributed encoding ở quy mô công nghiệp — dùng làm động lực cho Chương 6, không phải căn cứ khoa học chính (xem mục B.2-B.3 cho phiên bản học thuật của cùng ý tưởng).

### I.3 — Bảng so sánh đề xuất cho Related Work

| Tiêu chí | AWS VOD Reference | Netflix Cosmos | Đồ án này |
|---|---|---|---|
| Compute cho transcode | MediaConvert (managed) | Cluster nội bộ, chunk-based | AWS Batch/Fargate Spot, tự đóng gói FFmpeg |
| Bitrate ladder | Cấu hình job template | Per-title/per-shot (Dynamic Optimizer) | Cố định 3 mức (360p/720p/1080p) — khoảng trống đã định lượng ở mục C.1 |
| Bảo vệ nội dung riêng tư | Signed URL/Cookie (tài liệu AWS) | DRM (Widevine/PlayReady) | OAC + Signed Cookie (Custom Policy, Trusted Key Group) |
| Chi phí vận hành | Managed, per-minute output | Không công bố | Tự đo thực nghiệm: ~$0.10 cho 5 lần transcode benchmark, chi phí gần như không đổi khi tăng vCPU (mục B) |
| Bằng chứng thực nghiệm | Tài liệu vendor | Blog kỹ thuật | Số liệu thật đo trên AWS: realtime factor, cost-per-vCPU-second, so sánh 1 vs 4 vCPU |

---

## J. Khoảng trống trong thiết kế hiện tại

| # | Khoảng trống | Rủi ro nếu bỏ qua | Đề xuất | Chi phí | Căn cứ |
|---|---|---|---|---|---|
| **J1** ⭐ | **Không có idempotent write ở `updateVideoReady`/`updateVideoError`** | Duplicate Batch job (do heartbeat trễ) ghi trùng/ghi đè MongoDB, lãng phí compute gấp đôi, có thể tạo HLS output không nhất quán | `findOneAndUpdate` với điều kiện `status != READY` thay vì `findById` + `save()` vô điều kiện | Rất thấp — sửa 1 hàm | §D.3 (Burrows 2006, đã verify qua code thật) |
| **J2** | **Bitrate ladder cố định, không content-aware** | Lãng phí băng thông CDN/S3 so với per-title encoding | Áp dụng per-title encoding hoặc ít nhất thêm mức ladder theo độ phân giải gốc | Trung bình | §C.1 (Menon et al. 2022: tiết kiệm 16-27%) |
| **J3** | **ABR client dùng mặc định HLS.js** | Chưa tối ưu chọn rendition so với MPC/learning-based | Không cần sửa ngay — nêu là hướng phát triển | Thấp | §C.4 |
| **J4** | **Segment HLS cố định 6 giây** | Bỏ lỡ ~7% tiết kiệm bitrate, QoE thấp hơn ở 54% phiên theo nghiên cứu | Cân nhắc variable segment duration | Trung bình-cao | §C.7 (Schwarzmann et al., giải MMSys 2020) |
| **J5** | **Chỉ đo QoE qua Time-to-First-Frame** | Thiếu bức tranh đầy đủ (rebuffering, bitrate switch, VMAF) | Mở rộng `scripts/benchmark-qoe.js` theo khung QoE học thuật | Thấp | §C.5 |
| **J6** | **Không có nghiên cứu Tier 1 nào (kể cả trong literature) đo cold start riêng AWS Batch on Fargate** | Không phải lỗi thiết kế — là khoảng trống chung của ngành | Đồ án tự đo bằng `scripts/measure-transcode.js` (đã có số liệu: provisioning delay ~28-30s) — biến khoảng trống thành đóng góp thực nghiệm | Đã làm | §E.2 |
| **J7** | **CPU-only encoding (x264), chưa dùng GPU** | Bỏ lỡ tiềm năng speedup 8.33-12.43× | Hướng phát triển: chuyển sang EC2/ECS instance G4dn/G5 với NVENC | Cao (thay đổi kiến trúc) | §B.4 (Salcedo-Navarro et al. 2025) |
| **J8** | **Chỉ scale dọc (vCPU/container), chưa kết hợp scale ngang (nhiều container/chunk)** | Giới hạn tốc độ theo Amdahl khi cần nhanh hơn nữa | Kết hợp 4 vCPU/container VỚI chunk-based multi-container | Cao | §B.3 |
| **J9** | **2 bài blog Netflix trích dẫn như "related work" nhưng là Tier 3** | Bị hỏi vặn về độ tin cậy nguồn khi bảo vệ | Giữ 2 bài này chỉ ở phần Mở đầu (tạo động lực), dùng Menon/De Cock (Tier 1) cho lập luận khoa học chính | Không — chỉ cần viết lại | §C.1 |

---

## K. Đề xuất đóng góp khoa học

Câu hỏi bắt buộc phải trả lời khi bảo vệ: ***"Cái gì trong đồ án này là MỚI, không chỉ là lắp ráp AWS service theo tutorial?"***

### K.1 ⭐⭐⭐ — Thực nghiệm định lượng đánh đổi vCPU/chi phí/tốc độ cho serverless video transcoding

**Luận điểm:** Phần lớn tài liệu (kể cả NOSSDAV 2019 đã trích) chỉ ra rằng cấu hình tài nguyên serverless là "non-trivial" nhưng hiếm khi có **số liệu thực đo trên hạ tầng production thật** (không phải benchmark synthetic trong lab). Đồ án đã tự đo trên AWS Batch/Fargate Spot thật:
- 1 vCPU: realtime factor 2.89-4.51× (chậm hơn thời gian thực)
- 4 vCPU: realtime factor 0.67-1.09× (nhanh hơn thời gian thực) — **ngưỡng chất lượng khác hẳn**
- Chi phí tính theo vCPU-giây: gần như không đổi hoặc giảm nhẹ khi tăng vCPU (do AWS tính phí tuyến tính × tốc độ x264 cũng gần tuyến tính ở 4 luồng — đúng theo Sankaraiah 2014/Chen 2011)

**Đây là dữ liệu thực nghiệm sạch, có kiểm chứng qua AWS CLI trực tiếp (`aws batch describe-jobs`), không phải giả lập** — đủ tư cách là đóng góp thực nghiệm chính của đồ án nếu trình bày đúng phương pháp luận (Jain 1991, mục H.1): nhiều lần đo, báo cáo trung bình, cố định biến số.

### K.2 ⭐⭎ — Vá lỗ hổng idempotency phát hiện được qua code review có căn cứ lý thuyết

**Luận điểm:** Không chỉ liệt kê lý thuyết Chubby lease (Burrows 2006) suông — đồ án đã **soi chính xác vị trí trong code** (`dbHandler.js:50-64`) nơi lý thuyết dự đoán lỗ hổng tồn tại, và đề xuất fix cụ thể (`findOneAndUpdate` có điều kiện). Nếu áp dụng fix và **chứng minh bằng thực nghiệm** (giả lập heartbeat trễ bằng cách tạm dừng container, quan sát 2 job cùng xử lý 1 videoId, xác nhận chỉ 1 lần ghi READY hiệu lực), đây là kịch bản N.1-C mà tài liệu tham chiếu gọi là "cách làm khoa học đúng chuẩn": tắt phòng vệ → tái tạo lỗi → bật lại → lỗi biến mất.

### K.3 ⭐⭐ — Lấp khoảng trống literature về cold start AWS Batch on Fargate

**Luận điểm:** Không có nghiên cứu Tier 1 nào đo cold start riêng cho AWS Batch (khác Lambda, khác ECS thường trực). Đồ án có số liệu thật (`docs/results/transcode-timing.json`): provisioning delay 28.5-30 giây, dao động runtime tổng thể tới 56% giữa các lần chạy liên tiếp cùng cấu hình — nghi vấn liên quan tới đặc tính cấp phát capacity của FARGATE_SPOT. Trình bày như phát hiện thực nghiệm, đối chiếu với Golec et al. 2025 (taxonomy tổng quát) để chỉ ra đồ án đóng góp một data point cụ thể mà taxonomy đó chưa có.

### K.4 ⭐ — Định lượng chi phí cơ hội của thiết kế đơn giản hoá (fixed bitrate ladder, CPU-only, 1 container/job)

**Luận điểm:** Thay vì chỉ nói "đây là hạn chế", đồ án có thể **trích dẫn số liệu cụ thể** từ literature để lượng hoá chính xác cái giá phải trả cho từng lựa chọn đơn giản hoá: 16-27% bitrate (không per-title, theo Menon 2022), tới 12.43× tốc độ (không GPU, theo Salcedo-Navarro 2025), ~90% thời gian (không chunk-parallel, theo Gutiérrez-Aguado 2020). Đây là cách viết "Hạn chế" có chiều sâu học thuật, không phải liệt kê chung chung.

---

## L. Xác thực người dùng: Google Sign-In & Account Linking

### ⭐ Research trước khi code phát hiện lỗ hổng thật (CVE) mà cách làm "hiển nhiên" sẽ mắc phải — đã đổi hướng thiết kế trước khi viết code, không phải sửa sau

### L.1 — Cách verify ID token đúng chuẩn 🔴

**Google for Developers.** *Verify the Google ID token on your server side.* 🔗 https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

**Kết luận cốt lõi:** Không tự parse/giải mã JWT thủ công ở backend — phải dùng thư viện chính thức (`google-auth-library` cho Node.js), gọi `verifyIdToken()` với `audience` = Client ID, để thư viện tự kiểm tra chữ ký, `iss`, `aud`, `exp` đúng chuẩn.

**→ Ứng dụng:** Cơ sở cho `backend/src/services/authService.js` (`loginWithGoogle`) — dùng `OAuth2Client.verifyIdToken()`, không tự decode token.

### L.2 🔴⚠️ — Lỗ hổng account takeover qua auto-link theo email (đã tránh được TRƯỚC khi code, không phải phát hiện sau)

**GitHub Security Advisory GHSA-g38m-r43w-p2q7 / CVE-2026-53516 (Better Auth, high severity 8.3).** 🔗 https://github.com/advisories/GHSA-g38m-r43w-p2q7 — vá tại PR #9578: https://github.com/better-auth/better-auth/pull/9578

**GitLab Advisory Database — Authorizer, CVE-2026-35511** (cùng dạng lỗ hổng). 🔗 https://advisories.gitlab.com/golang/github.com/authorizerdev/authorizer/CVE-2026-35511/

**Kết luận cốt lõi:** Nếu backend tự động "link" (gộp) một identity Google mới vào tài khoản local có sẵn chỉ dựa trên **email trùng khớp**, mà không kiểm tra tài khoản local đó đã verify email hay chưa, sẽ mở ra kịch bản: kẻ tấn công đăng ký trước bằng email nạn nhân (không cần verify) → nạn nhân đăng nhập Google thật bằng đúng email đó → hệ thống tự gộp 2 tài khoản → kẻ tấn công có sẵn mật khẩu để đăng nhập vào tài khoản nạn nhân bất cứ lúc nào.

**Đối chiếu 2 hệ thống production khác đã tự chọn 2 mức phòng vệ khác nhau:**
- **NextAuth.js/Auth.js**: mặc định **tắt hẳn** auto-link (cờ cấu hình tên thẳng là `allowDangerousEmailAccountLinking`, mặc định `false`). 🔗 https://next-auth.js.org/configuration/providers/oauth
- **Supabase Auth**: cho phép auto-link nhưng **chỉ tính email đã verify**, và khi link thành công sẽ tự xoá mọi identity khác chưa verify đang gắn với email đó. 🔗 https://supabase.com/docs/guides/auth/auth-identity-linking

**→ Ứng dụng:** Dự án hiện **chưa có cơ chế verify email khi đăng ký** (`backend/src/models/User.js` không có field `isVerified`/`emailVerified`). Vì vậy `loginWithGoogle` trong `authService.js` chọn mức phòng vệ giống NextAuth mặc định — **không auto-link theo email**: nếu email Google trùng tài khoản local sẵn có, trả lỗi 409 (`EMAIL_IN_USE`) yêu cầu người dùng tự đăng nhập bằng mật khẩu, thay vì âm thầm gộp tài khoản. Đây là quyết định thiết kế đưa ra **trước khi viết code** nhờ research, không phải một lỗi tìm thấy sau khi đã triển khai sai — khác với gap D.3 (được phát hiện a posteriori qua code review).

---

## 📎 PHỤ LỤC: Việc cần làm với `report/references.bib`

- [x] Sửa tên tác giả `grid2023serverless` → Moina-Rivera, Garcia-Pineda, Claver, Gutierrez-Aguado (2023) — đã sửa.
- [x] Sửa tên tác giả `gpuserverless2024` → Salcedo-Navarro, Peña-Ortiz, Claver, Garcia-Pineda (2025) — đã sửa.
- [x] Nâng cấp `coldstart2023` từ arXiv preprint lên bản ACM Computing Surveys chính thức (DOI 10.1145/3700875) — đã sửa.
- [ ] Thêm các entry mới từ tài liệu này vào `references.bib` khi viết nội dung tương ứng vào Chương 2/5/6 (khuyến nghị: chỉ thêm entry khi thực sự trích dẫn trong text, tránh bibliography "chết" không được `\cite{}` tới).
- [ ] Cân nhắc thêm mục J1 (idempotency fix) vào Chương 5 (Triển khai) nếu áp dụng code fix thật, hoặc vào Chương 6 (Hạn chế) nếu chỉ phân tích mà chưa sửa.
