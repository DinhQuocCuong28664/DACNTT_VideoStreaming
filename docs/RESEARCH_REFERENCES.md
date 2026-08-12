# 📚 KHẢO SÁT TÀI LIỆU KHOA HỌC (Literature Review)

> Tài liệu nền cho Chương 2 (Cơ sở lý thuyết & Công trình liên quan) của Đồ án Tốt nghiệp
> **Hệ thống Đặt vé Sự kiện Cloud-Native chịu tải cao**
> Cập nhật: 11/08/2026

---

## ⚠️ Quy ước phân loại nguồn

| Ký hiệu | Ý nghĩa | Dùng được để trích dẫn trong báo cáo? |
|---------|---------|----------------------------------------|
| 🟢 **Tier 1** | Hội nghị/tạp chí bình duyệt (IEEE, ACM, Springer, MDPI, NDSS, ICSE) | ✅ Có — nguồn chính |
| 🟡 **Tier 2** | arXiv preprint, tạp chí ít uy tín hơn (IJFMR, SSRN, ResearchGate PDF) | ⚠️ Được, nhưng cần đọc kỹ và không nên làm nguồn chủ đạo |
| 🔴 **Tier 3** | Blog kỹ thuật, tài liệu vendor, sách nghề | ❌ Không trích dẫn như "nghiên cứu"; chỉ dùng minh chứng thực tiễn công nghiệp |

> **Lưu ý quan trọng:** Với các mục 🟡/🔴, hãy tự tải bản full-text và verify lại tác giả/năm/DOI trước khi đưa vào danh mục tài liệu tham khảo. Danh sách này là *bản đồ định hướng*, không phải bibliography hoàn chỉnh.

---

## MỤC LỤC

- [A. Kiến trúc Microservices — nền tảng & bằng chứng thực nghiệm](#a-kiến-trúc-microservices)
- [B. Concurrency Control & Chống bán trùng vé](#b-concurrency-control--chống-bán-trùng-vé) ⭐ *lõi của đồ án*
- [C. Distributed Transactions — Saga & Outbox](#c-distributed-transactions--saga--outbox)
- [D. CQRS & Event Sourcing](#d-cqrs--event-sourcing)
- [E. Message Queue — Kafka vs RabbitMQ](#e-message-queue--kafka-vs-rabbitmq)
- [F. Caching Patterns dưới tải cao](#f-caching-patterns-dưới-tải-cao)
- [G. Virtual Waiting Room, Rate Limiting & Bot Mitigation](#g-virtual-waiting-room-rate-limiting--bot-mitigation)
- [H. Real-time Push / WebSocket ở quy mô lớn](#h-real-time-push--websocket-ở-quy-mô-lớn)
- [I. Kubernetes Autoscaling (HPA)](#i-kubernetes-autoscaling-hpa)
- [J. DevSecOps — SAST, SCA, Secret Detection, IaC Security](#j-devsecops)
- [K. Load Testing & Phương pháp đánh giá hiệu năng](#k-load-testing--phương-pháp-đánh-giá)
- [L. Công trình liên quan trực tiếp (Related Work)](#l-công-trình-liên-quan-trực-tiếp)
- [M. Khoảng trống phát hiện được trong thiết kế hiện tại](#m-khoảng-trống-trong-thiết-kế-hiện-tại) ⭐
- [N. Đề xuất "đóng góp khoa học" cho đồ án](#n-đề-xuất-đóng-góp-khoa-học)

---

## A. Kiến trúc Microservices

### A.1 — Bằng chứng thực nghiệm quan trọng nhất 🟢

**Blinowski, G. J., Ojdowska, A., & Przybyłek, A. (2022).** *Monolithic vs. Microservice Architecture: A Performance and Scalability Evaluation.* **IEEE Access, 10, 20357–20374.** DOI: `10.1109/ACCESS.2022.3152803`
🔗 https://ieeexplore.ieee.org/document/9717259/

**Kết luận cốt lõi (rất quan trọng cho đồ án này):**
- Trên **một máy đơn**, Monolith **chạy nhanh hơn** Microservices — vì microservices phải trả chi phí network I/O giữa các service.
- Lợi thế của Microservices chỉ xuất hiện khi **scale out theo chiều ngang** và khi cần **fault tolerance / recoverability**.
- Tác giả cảnh báo: doanh nghiệp nhỏ refactor monolith → microservices và kỳ vọng lợi ích giống Netflix/Amazon có thể là **ảo tưởng**.

**→ Ứng dụng vào đồ án:**
Đây là bài báo **bắt buộc phải trích dẫn** trong phần "Phương pháp đánh giá". Nó cho biết kịch bản benchmark Monolith vs Microservices của bạn **sẽ ra kết quả Monolith thắng nếu bạn test ở tải thấp / 1 node**. Vì vậy:
- Phải thiết kế benchmark có **nhiều mức tải** (100 → 1k → 10k → 50k VU), vẽ đường cong cắt nhau.
- Điểm bán được của đồ án không phải "microservices nhanh hơn" mà là **"microservices giữ được p95 latency và error rate khi tải vượt ngưỡng mà monolith đã sập"**.
- Nên đo thêm **fault tolerance**: kill 1 pod → monolith chết toàn bộ, microservices chỉ mất 1 chức năng.

### A.2 — Nền tảng lý thuyết 🟢

| Công trình | Nội dung | Dùng cho |
|-----------|----------|----------|
| **Dragoni et al. (2017),** *Microservices: Yesterday, Today, and Tomorrow*, Springer — Present and Ulterior Software Engineering | Định nghĩa chuẩn học thuật của microservices, lịch sử tiến hóa từ SOA | Chương 2.1 — định nghĩa thuật ngữ |
| **Jamshidi, Pahl, Mendonça, Lewis, Tilkov (2018),** *Microservices: The Journey So Far and Challenges Ahead*, IEEE Software 35(3) | Tổng hợp thách thức mở: data consistency, testing, observability | Chương 2.1 — nêu vấn đề nghiên cứu |
| **Taibi, Lenarduzzi, Pahl (2018),** *Architectural Patterns for Microservices: A Systematic Mapping Study* | Phân loại pattern: API Gateway, Service Discovery, Circuit Breaker… | Chương 3 — biện minh lựa chọn pattern |
| **Montesi & Weber (2016),** *Circuit Breakers, Discovery, and API Gateways in Microservices*, arXiv:1609.05830 🟡 | Hình thức hóa 3 pattern hạ tầng | Chương 3 — API Gateway |

🔴 Sách tham khảo (không phải paper nhưng chuẩn công nghiệp, được trích dẫn rộng rãi):
- **Newman, S. (2021).** *Building Microservices*, 2nd ed., O'Reilly.
- **Richardson, C. (2018).** *Microservices Patterns*, Manning. — Nguồn gốc của cách trình bày Saga/CQRS/Outbox mà phần lớn blog đang copy lại.
- **Kleppmann, M. (2017).** *Designing Data-Intensive Applications*, O'Reilly. — Chương 8-9 là nền lý thuyết cho toàn bộ phần concurrency của bạn.

---

## B. Concurrency Control & Chống bán trùng vé
### ⭐ Đây là phần "lõi khoa học" của đồ án — cần đầu tư nhiều nhất

### B.1 — Tranh luận kinh điển: Redlock có an toàn không? 🔴 (nhưng bắt buộc phải biết)

Đồ án dùng **Redis SETNX + TTL** làm cơ chế khóa ghế. Đây chính là chủ đề của một tranh luận nổi tiếng trong giới distributed systems:

| Nguồn | Lập luận |
|-------|----------|
| **Kleppmann, M. (2016).** *How to do distributed locking*<br>🔗 https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html | Redlock **KHÔNG an toàn** cho bài toán correctness. Lý do: (1) thuật toán phụ thuộc giả định về đồng hồ — Redis dùng **wall clock**, không dùng monotonic clock, nên clock jump có thể khiến 2 client cùng giữ khóa; (2) GC pause / network delay có thể khiến client tin rằng nó vẫn giữ khóa trong khi TTL đã hết; (3) thiếu **fencing token**. |
| **Sanfilippo, S. "antirez" (2016).** *Is Redlock safe?*<br>🔗 http://antirez.com/news/101 | Phản biện: các giả định về clock drift là thực tế chấp nhận được; Redlock phù hợp cho phần lớn use case thực tế. |
| **Redis Docs.** *Distributed Locks with Redis*<br>🔗 https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/ | Đặc tả chính thức của thuật toán Redlock |

**→ Ứng dụng vào đồ án (rất quan trọng):**

Đây là **cơ hội vàng để đồ án có chiều sâu học thuật**. Thay vì chỉ nói "em dùng Redis SETNX", hãy trình bày:

1. **Thừa nhận hạn chế:** Redis lock là **advisory lock** (khóa tư vấn), không đảm bảo mutual exclusion tuyệt đối trong mọi kịch bản (clock skew, GC pause, network partition).
2. **Thiết kế phòng thủ nhiều lớp** — đây mới là điểm ăn điểm:
   - **Lớp 1 (nhanh, optimistic):** Redis SETNX + TTL → chặn 99.9% tranh chấp, giữ UX mượt.
   - **Lớp 2 (an toàn, authoritative):** **UNIQUE constraint trên `(event_id, seat_id)` trong SQL Server** ở bước commit đơn hàng. Dù Redis lock có lỗi, DB vẫn từ chối bản ghi thứ hai → **double booking là bất khả thi về mặt toán học**.
   - **Lớp 3 (fencing):** Mỗi lock cấp một **monotonically increasing token** (dùng `INCR` trong Redis hoặc SQL `SEQUENCE`). Booking Service từ chối request mang token cũ hơn token đã thấy.
3. **Chứng minh bằng thực nghiệm:** Chạy k6 với kịch bản 5.000 VU cùng tranh 1 ghế → chứng minh chỉ có đúng 1 order thành công.

> 💡 Nếu bạn cài được **fencing token** và chứng minh nó chặn được kịch bản mà Redlock thuần bị lỗi, đó là một **đóng góp kỹ thuật thực sự** cho báo cáo, chứ không chỉ là "làm theo tutorial".

### B.2 — Optimistic vs Pessimistic Locking 🔴/🟢

Chủ đề này chủ yếu nằm trong sách giáo trình DBMS hơn là paper mới:

- **Kung, H. T., & Robinson, J. T. (1981).** *On Optimistic Methods for Concurrency Control.* **ACM TODS 6(2), 213–226.** 🟢
  → Bài gốc của Optimistic Concurrency Control. Trích dẫn bài này khi biện minh cho lựa chọn versioning/CAS thay vì `SELECT FOR UPDATE`.
- **Bernstein, P. A., & Goodman, N. (1981).** *Concurrency Control in Distributed Database Systems.* **ACM Computing Surveys 13(2).** 🟢
- **Berenson et al. (1995).** *A Critique of ANSI SQL Isolation Levels.* **SIGMOD.** 🟢 → Nền tảng để giải thích tại sao `READ COMMITTED` không đủ chống write skew.

**→ Ứng dụng:** Bảng so sánh trong báo cáo:

| Chiến lược | Throughput | Rủi ro | Phù hợp |
|-----------|-----------|--------|---------|
| Pessimistic (`SELECT … FOR UPDATE`) | Thấp (block, deadlock) | Contention cao → queue dài | Ghi ít, tranh chấp cao, transaction ngắn |
| Optimistic (version column + CAS) | Cao | Nhiều retry khi contention cao | Đọc nhiều, tranh chấp thấp |
| **Distributed Lock (Redis)** | Rất cao | Advisory, cần lớp DB backup | ✅ Lựa chọn của đồ án — vì cần giữ ghế **xuyên suốt 5-10 phút** người dùng thanh toán, không thể giữ DB transaction mở lâu như vậy |

> ⚠️ **Điểm mấu chốt cần nêu rõ trong báo cáo:** Bài toán "giữ ghế 5-10 phút" **không thể** giải bằng DB transaction (LLT — Long-Lived Transaction sẽ khóa tài nguyên quá lâu). Đây chính xác là vấn đề mà Garcia-Molina & Salem nêu ra năm 1987 → dẫn thẳng sang mục C (Saga). Mạch lập luận này rất chặt, nên dùng.

---

## C. Distributed Transactions — Saga & Outbox

### C.1 — Bài gốc 🟢 (bắt buộc trích dẫn)

**Garcia-Molina, H., & Salem, K. (1987).** *Sagas.* **Proc. ACM SIGMOD International Conference on Management of Data, pp. 249–259.** DOI: `10.1145/38713.38742`
🔗 https://dl.acm.org/doi/10.1145/38713.38742

**Nội dung:** Long-Lived Transactions (LLT) giữ tài nguyên DB quá lâu, làm chậm các transaction ngắn. Giải pháp: chia LLT thành chuỗi transaction cục bộ `T1, T2, …, Tn`, mỗi `Ti` có **compensating transaction `Ci`**. Hệ thống đảm bảo: hoặc tất cả `Ti` thành công, hoặc chạy `Ci` để hoàn tác phần đã thực thi.

**→ Ứng dụng:** Luồng đặt vé của bạn **chính xác là một Saga**:

```
T1: Lock ghế (Redis)          → C1: Release lock
T2: Tạo Order (PENDING)       → C2: Order = CANCELLED
T3: Trừ tiền (Payment GW)     → C3: Refund
T4: Ghế → SOLD (SQL Server)   → C4: Ghế → AVAILABLE
T5: Sinh e-Ticket + QR        → C5: Vô hiệu hóa ticket
```
Vẽ sơ đồ này trong báo cáo và **map từng bước về đúng thuật ngữ của Garcia-Molina** → rất ghi điểm khi bảo vệ.

### C.2 — Nghiên cứu mở rộng 🟢

**Daraghmi, E. Y., Zhang, C.-P., & Yuan, S.-M. (2022).** *Enhancing Saga Pattern for Distributed Transactions within a Microservices Architecture.* **Applied Sciences (MDPI), 12(12), 6242.**
🔗 https://www.mdpi.com/2076-3417/12/12/6242

**Vấn đề giải quyết:** Saga **thiếu tính Isolation** (chữ "I" trong ACID). Giữa lúc `T2` đã chạy và `T4` chưa xong, một transaction khác có thể đọc thấy dữ liệu "nửa vời" (dirty read). Bài báo đề xuất **quota cache** + **commit-sync service** để khắc phục.

**→ Ứng dụng:** Đây là bài để trích dẫn khi giải thích trạng thái `HELD` của ghế. Trạng thái `HELD` chính là một **semantic lock** — một trong các countermeasure kinh điển để bù đắp việc Saga thiếu isolation (xem thêm "Saga countermeasures": semantic lock, commutative updates, pessimistic view, reread value, version file, by value).

### C.3 — Khảo sát framework 🟡

- **A Survey of Saga Frameworks for Distributed Transactions in Event-driven Microservices** (2022) — Kết quả đáng chú ý: dùng Saga **bất đồng bộ** giảm thời gian thực thi **tới 9.74 lần** và cải thiện CPU utilization **tới 88%** so với Saga đồng bộ.
  🔗 https://www.researchgate.net/publication/370299398
  **→ Ứng dụng:** Biện minh cho việc chọn **Choreography-based Saga qua RabbitMQ** thay vì Orchestration đồng bộ qua HTTP.
- **Explication and Extension of Saga and Microservice Patterns to Enable Resilient Distributed Transaction** (Springer, 2022) 🟢 — mở rộng Saga bằng **Outbox pattern** và resiliency pattern.
  🔗 https://link.springer.com/chapter/10.1007/978-981-19-4960-9_18

### C.4 — ⚠️ Transactional Outbox (thiết kế hiện tại đang THIẾU)

**Vấn đề "dual write":** Booking Service phải (a) ghi Order vào SQL Server **và** (b) publish message vào RabbitMQ. Hai thao tác này **không nằm trong cùng một transaction**. Nếu (a) thành công mà (b) fail → đơn hàng treo vĩnh viễn, tiền không bị trừ nhưng ghế bị khóa (**ghost locking** — đúng cái lỗi mà README nói sẽ chứng minh là không xảy ra!).

**Giải pháp chuẩn:** **Transactional Outbox + Change Data Capture**
1. Ghi Order **và** một dòng vào bảng `outbox_events` trong **cùng 1 DB transaction** (atomic).
2. Một relay process (hoặc **Debezium** đọc CDC log) đọc `outbox_events` → publish sang RabbitMQ/Kafka.
3. Consumer xử lý idempotent (message có thể đến 2 lần — at-least-once).

**→ Tin tốt:** README **đã có CDC** cho CQRS read replica. Chỉ cần mở rộng CDC pipeline đó để phục vụ luôn Outbox → **tái sử dụng hạ tầng, tăng độ chặt chẽ của thiết kế**.

Tham khảo: Richardson, C. — *Microservices Patterns*, Ch. 3 (Transactional Outbox) 🔴; và bài Springer ở C.3 🟢.

---

## D. CQRS & Event Sourcing

| Công trình | Tier | Nội dung & ứng dụng |
|-----------|------|---------------------|
| **Dębski, A., Szczepanik, B., Malawski, M., Spahr, S., Muthig, D. (2018).** *A Scalable, Reactive Architecture for Cloud Applications.* **IEEE Software.**<br>🔗 https://home.agh.edu.pl/~malawski/DebskiSzczepanik-CQRS-IEEE-Software.pdf | 🟢 | **Case study CQRS + Event Sourcing tốt nhất để trích dẫn.** Dùng Akka, Cassandra, Kafka, Neo4J. Kết luận: CQRS/ES mang lại nhiều lợi thế mà **không hy sinh hiệu năng**. |
| **Zhong, Y., & Li, X. (2019).** *Using Event Sourcing and CQRS to Build a High Performance Point Trading System.* **Proc. ICEBA 2019, ACM.** DOI `10.1145/3317614.3317632`<br>🔗 https://dl.acm.org/doi/10.1145/3317614.3317632 | 🟢 | Hệ thống giao dịch điểm hiệu năng cao dùng Actor model + ES + CQRS. Có số liệu benchmark. **Rất gần với bài toán đặt vé** (đều là trừ "inventory" dưới tải cao). |
| **Decision-making on CQRS with Event Sourcing architectural variations** (2025), *Technology Audit and Production Reserves*<br>🔗 https://journals.uran.ua/tarp/article/view/337168 | 🟡 | So sánh các biến thể CQRS về độ phức tạp / hiệu năng / thời gian phát triển. Hữu ích để **biện minh tại sao chọn CQRS "nhẹ"** (chỉ tách read replica) thay vì full Event Sourcing. |
| **Analysis of Design Patterns and Benchmark Practices in Apache Kafka Event-Streaming Systems** (2025), arXiv:2512.16146<br>🔗 https://arxiv.org/pdf/2512.16146 | 🟡 | Systematic review 42 nghiên cứu (2015–2025), phân loại **9 pattern Kafka**: CQRS bus, exactly-once pipeline, CDC, event sourcing replay… |

**→ Khuyến nghị thực tế:** README đang mô tả **CQRS ở mức "read/write splitting"** (Write Primary + Read Replica đồng bộ qua CDC), **không phải full Event Sourcing**. Điều này **hoàn toàn hợp lý** cho đồ án — hãy nói rõ điều đó trong báo cáo để tránh bị hỏi vặn "event store của em đâu?". Trích Dębski et al. để chỉ ra rằng full ES có chi phí phức tạp cao.

---

## E. Message Queue — Kafka vs RabbitMQ

### E.1 — Bài so sánh học thuật kinh điển 🟢

**Dobbelaere, P., & Esmaili, K. S. (2017).** *Kafka versus RabbitMQ: A comparative study of two industry reference publish/subscribe implementations (Industry Paper).* **Proc. 11th ACM DEBS, pp. 227–238.** DOI: `10.1145/3093742.3093908` | arXiv: `1709.00333`
🔗 https://arxiv.org/abs/1709.00333

**Đây là bài PHẢI trích dẫn** khi biện minh lựa chọn RabbitMQ vs Kafka. Bài báo xây dựng **khung so sánh chung** rồi so sánh cả định tính lẫn định lượng, kết thúc bằng một **bảng quyết định (determination table)** — bạn có thể dùng chính bảng đó để biện minh lựa chọn.

### E.2 — Benchmark bổ sung 🟡/🔴

| Nguồn | Số liệu |
|-------|---------|
| **Confluent (2020),** *Benchmarking RabbitMQ vs Kafka vs Pulsar* 🔴<br>🔗 https://www.confluent.io/blog/kafka-fastest-messaging-system/ | Kafka: throughput cao nhất, p99.9 latency thấp nhất. RabbitMQ: latency rất thấp ở tải thấp nhưng **suy giảm nghiêm trọng khi > 30 MB/s**. ⚠️ Nguồn từ vendor Kafka → có thiên vị, phải nêu rõ khi trích. |
| **Comparative Performance Evaluation of Apache Kafka and RabbitMQ in High-Throughput Distributed Systems** (2025) 🟡<br>🔗 https://www.researchgate.net/publication/403962861 | Kafka 76.5k–100k+ msg/s, p99 < 18ms. RabbitMQ 7k–18k msg/s, p99 32–45ms nhưng tiêu tốn ít tài nguyên hơn nhiều. |

**→ Khuyến nghị cho đồ án:** **Chọn RabbitMQ**, và biện minh như sau:
- Khối lượng message của bạn là **đơn hàng** (~10k-50k message trong đợt flash sale), **không phải log stream hàng triệu msg/s** → chưa chạm ngưỡng RabbitMQ suy giảm.
- Cần **routing linh hoạt** (direct/topic exchange cho payment/notification/ticket) và **per-message ack** → thế mạnh của RabbitMQ.
- **DLQ là first-class citizen** trong RabbitMQ (`x-dead-letter-exchange`), trong khi Kafka phải tự implement.
- Chi phí vận hành trên K8s thấp hơn Kafka (không cần Zookeeper/KRaft cluster) → tiết kiệm chi phí AWS.

> ✍️ README hiện ghi "RabbitMQ **/** Kafka" — **hãy chốt một cái**. Việc để ngỏ sẽ bị hỏi khi bảo vệ. Nếu chốt RabbitMQ, dùng Dobbelaere & Esmaili làm căn cứ.

---

## F. Caching Patterns dưới tải cao

⚠️ Chủ đề này **hầu như không có paper Tier 1 gần đây** — chủ yếu là kiến thức công nghiệp. Cần trích dẫn khéo.

### F.1 — Nền tảng lý thuyết 🟢

- **Bloom, B. H. (1970).** *Space/Time Trade-offs in Hash Coding with Allowable Errors.* **Communications of the ACM, 13(7), 422–426.**
  → Bài gốc của Bloom Filter. Trích dẫn khi dùng Bloom filter chống **cache penetration** (query các `event_id` không tồn tại).
- **Broder, A., & Mitzenmacher, M. (2004).** *Network Applications of Bloom Filters: A Survey.* **Internet Mathematics 1(4).** 🟢
- **Vattani, A., Chierichetti, F., & Lowenstein, K. (2015).** *Optimal Probabilistic Cache Stampede Prevention.* **Proc. VLDB Endowment, 8(8), 886–897.** 🟢
  → **Bài quan trọng và ít người biết!** Đề xuất thuật toán **probabilistic early expiration** (`XFetch`) để chống cache stampede một cách tối ưu. Rất hợp để chống "thundering herd" khi cache sơ đồ ghế của một event hot hết hạn đồng loạt.

### F.2 — Ba bài toán cache kinh điển 🔴

| Vấn đề | Mô tả | Giải pháp | Áp dụng vào đâu trong đồ án |
|--------|-------|-----------|------------------------------|
| **Cache Penetration** | Query key **không tồn tại** → mọi request đều xuống DB | Bloom Filter, cache null value, validate input | Endpoint `GET /events/:id`, `GET /seats/:id` |
| **Cache Breakdown / Stampede** | Một **hot key** hết hạn → hàng ngàn request cùng rebuild cache | Distributed lock khi rebuild, **probabilistic early expiration** (Vattani et al.), logical expiration | Seat map của event đang flash sale |
| **Cache Avalanche** | **Nhiều key** hết hạn cùng lúc → DB sập | **Randomize TTL** (thêm jitter ±10%), cache nhiều tầng, pre-warming | Toàn bộ seat map khi mở bán đồng loạt nhiều event |

Tham khảo thực tiễn: [Redis — How to tame the thundering herd problem](https://redis.io/blog/how-to-tame-the-thundering-herd-problem/) 🔴

### F.3 — Kiến trúc flash sale công nghiệp 🔴

**Alibaba Cloud — Build a high concurrency system for flash sales**
🔗 https://www.alibabacloud.com/help/en/redis/use-cases/use-apsaradb-for-redis-to-build-a-business-system-that-can-handle-flash-sales

Kiến trúc phân tầng: CDN hấp thụ traffic tĩnh → read/write splitting lọc request không hợp lệ ở **>600.000 QPS** → master-replica xử lý trừ inventory ở **>100.000 QPS** bằng **Lua script atomic**.

**→ Ứng dụng cực kỳ thực tế:** Dùng **Redis Lua script** thay vì chuỗi lệnh `GET`/`SETNX`/`EXPIRE` riêng lẻ. Lua script chạy **atomic** trong Redis single-threaded → loại bỏ hoàn toàn race condition ở tầng Redis mà không cần round-trip nhiều lần. Đây là một cải tiến kỹ thuật cụ thể so với `SETNX` thuần mà README đang mô tả.

```lua
-- Ví dụ: khóa ghế atomic, trả về fencing token
-- KEYS[1] = seat:lock:{event}:{seat}, KEYS[2] = seat:token_seq:{event}
-- ARGV[1] = user_id, ARGV[2] = ttl_seconds
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
local token = redis.call('INCR', KEYS[2])
redis.call('SET', KEYS[1], ARGV[1] .. ':' .. token, 'EX', ARGV[2])
return token
```

---

## G. Virtual Waiting Room, Rate Limiting & Bot Mitigation

### G.1 — Cơ sở lý thuyết 🟢

- **Little, J. D. C. (1961).** *A Proof for the Queuing Formula: L = λW.* **Operations Research, 9(3), 383–387.**
  → **Định luật Little** là cơ sở toán học để tính **thời gian chờ dự kiến** hiển thị cho user trong phòng chờ ảo:
  `W (thời gian chờ) = L (số người đứng trước) / λ (tốc độ cho vào, người/giây)`
  Nếu bạn hiển thị "Bạn đứng thứ 12.483, ước tính còn 8 phút" và **giải thích công thức bằng Little's Law**, đó là điểm cộng học thuật rõ ràng.
- **Kendall, D. G. (1953).** — Ký hiệu hàng đợi `M/M/c`. Mô hình hóa phòng chờ như một hệ M/M/c với `c` = số slot đồng thời cho vào trang chọn ghế.
- **Queue-Based Load Leveling** — Azure Architecture Center (Cloud Design Pattern) 🔴
  🔗 https://learn.microsoft.com/azure/architecture/patterns/queue-based-load-leveling

### G.2 — Kinh tế học của ticket bot 🟢

- **Courty, P. (2019).** *Ticket Resale, Bots, and the Fair Price Ticketing Curse.* **Journal of Cultural Economics, 43, 345–363.**
  → Phân tích kinh tế: tại sao bot tồn tại, tại sao giá vé thấp hơn giá thị trường tạo ra "lời nguyền" cho hệ thống bán vé. **Rất hữu ích cho phần "Bối cảnh & Động cơ nghiên cứu"** — nó chứng minh bài toán của bạn không chỉ là kỹ thuật mà còn có nền tảng kinh tế.
- **BOTS Act (2016)** — Luật liên bang Mỹ cấm dùng bot mua vé, cho thấy đây là vấn đề xã hội thực sự.

### G.3 — Thực tiễn công nghiệp 🔴

**Queue-it** — https://queue-it.com/virtual-waiting-room/ | **Queue-Fair** — https://queue-fair.com/ticket-bot

Điểm kỹ thuật quan trọng rút ra:
- **Randomization + FIFO kết hợp:** người vào phòng chờ **trước giờ mở bán** được **xáo trộn ngẫu nhiên** (đảm bảo công bằng, bot vào sớm không có lợi thế); người vào **sau giờ mở bán** xếp FIFO. ✅ README đã mô tả đúng cơ chế này.
- **Outflow rate điều chỉnh động:** đo bằng visitor/phút, tăng giảm on-the-fly theo tải backend thực tế.
- Bot mitigation cần **nhiều lớp**, không có "silver bullet": CAPTCHA, rate limit, device fingerprint, behavioral analysis.

### G.4 — Rate Limiting 🔴

| Thuật toán | Ưu | Nhược | Dùng ở đâu |
|-----------|-----|-------|------------|
| **Fixed Window** | Đơn giản, ít bộ nhớ | Burst gấp đôi ở ranh giới window | Không khuyến nghị |
| **Sliding Window Log** | Chính xác nhất | Tốn bộ nhớ (lưu timestamp) | API nhạy cảm, low volume |
| **Sliding Window Counter** | Cân bằng tốt | Xấp xỉ | ✅ API Gateway chung |
| **Token Bucket** | Cho phép **burst có kiểm soát** | Cần tune 2 tham số | ✅ Mặc định tốt cho public API |
| **Leaky Bucket** | Output rate đều tuyệt đối | Không cho burst | Bảo vệ Payment Gateway (rate cứng của bên thứ 3) |

**→ Khuyến nghị:** Token Bucket ở API Gateway (dùng Redis, thuật toán GCRA hoặc `redis-cell`), Leaky Bucket cho lời gọi ra Payment Gateway.
Tham khảo: [Arcjet — Rate Limiting Algorithms](https://blog.arcjet.com/rate-limiting-algorithms-token-bucket-vs-sliding-window-vs-fixed-window/) 🔴

---

## H. Real-time Push / WebSocket ở quy mô lớn

⚠️ Mảng này **rất ít paper học thuật**, chủ yếu là engineering blog. Cần trích dẫn cẩn thận.

### H.1 — Nền tảng 🟢

- **Fette, I., & Melnikov, A. (2011).** **RFC 6455 — The WebSocket Protocol.** IETF.
  → Trích dẫn chuẩn RFC thay vì blog khi định nghĩa WebSocket.
- **Pimentel, V., & Nickerson, B. G. (2012).** *Communicating and Displaying Real-Time Data with WebSocket.* **IEEE Internet Computing, 16(4), 45–53.** 🟢
  → So sánh WebSocket vs polling/long-polling về băng thông và độ trễ. Bài học thuật hiếm hoi và phù hợp để biện minh lựa chọn WebSocket thay vì polling cho seat map.

### H.2 — Vấn đề kỹ thuật khi scale ngang 🔴

Nguồn: [Ably — The challenge of scaling WebSockets](https://ably.com/topic/the-challenge-of-scaling-websockets), [Ably — Horizontal vs vertical scaling for WebSockets](https://ably.com/blog/websockets-horizontal-vs-vertical-scaling)

Ba vấn đề cốt lõi khi có N instance WebSocket server:
1. **Fan-out giữa các instance:** User A kết nối instance-1, User B kết nối instance-2, cùng xem 1 seat map. A khóa ghế → instance-2 phải biết. → **Redis Pub/Sub Adapter** (`@socket.io/redis-adapter`). ✅ README đã có.
2. **Sticky session:** Socket.io dùng HTTP long-polling **fallback** ở handshake → nếu không sticky, handshake sẽ fail khi các request rơi vào instance khác nhau. → Cấu hình `nginx.ingress.kubernetes.io/affinity: cookie` **hoặc** ép `transports: ['websocket']` để bỏ qua polling (khuyến nghị hơn — bỏ được sticky session, giữ server thật sự stateless).
3. **Connection limit:** Mỗi WebSocket connection ngốn ~10-50KB RAM + 1 file descriptor. 50.000 concurrent connection → cần tune `ulimit -n`, `net.core.somaxconn`, và **HPA theo số connection** chứ không phải theo CPU (CPU của WS server rất thấp dù đầy connection!).

> ⚠️ **Cảnh báo quan trọng cho benchmark:** HPA mặc định scale theo CPU. WebSocket gateway có thể **đầy connection nhưng CPU chỉ 15%** → HPA sẽ **không scale** và server sẽ từ chối connection mới. **Bắt buộc dùng Prometheus Custom Metrics** (`socketio_connected_clients`) cho HPA của WS Gateway. Đây là một phát hiện thực nghiệm đáng đưa vào báo cáo — xem thêm mục I.

---

## I. Kubernetes Autoscaling (HPA)

### I.1 — Bài đánh giá toàn diện nhất 🟢

**Nguyen, T.-T., Yeom, Y.-J., Kim, T., Park, D.-H., & Kim, S. (2020).** *Horizontal Pod Autoscaling in Kubernetes for Elastic Container Orchestration.* **Sensors, 20(16), 4621.** DOI: `10.3390/s20164621`
🔗 https://pmc.ncbi.nlm.nih.gov/articles/PMC7471989/

**Phát hiện chính (áp dụng trực tiếp được vào đồ án):**

| Phát hiện | Ý nghĩa cho đồ án |
|-----------|-------------------|
| **Kubernetes Resource Metrics (KRM)** chỉ cập nhật mỗi chu kỳ scraping → phản ứng **chậm**. **Prometheus Custom Metrics (PCM)** tính theo giây → scale lên max **rất nhanh** | Với flash sale (tải tăng đột ngột trong vài giây), **KRM sẽ scale quá chậm**. → Phải dùng PCM. |
| **Scraping period** ảnh hưởng mạnh đến KRM (chu kỳ dài → tạo ít replica hơn), nhưng ít ảnh hưởng PCM | Nếu vẫn dùng KRM, phải giảm `--horizontal-pod-autoscaler-sync-period` |
| **Cluster lớn hơn deploy pod nhanh hơn** (4 worker > 2 worker) | Ảnh hưởng thiết kế node group AWS EKS |
| **Readiness Probe** loại bỏ hoàn toàn failed request nhưng **tăng latency** trong lúc scaling | Trade-off cần đo và báo cáo: error rate ↓ nhưng p95 ↑ |

**→ Đây là bài để thiết kế thí nghiệm HPA của bạn.** Bạn có thể **tái lập (replicate) thí nghiệm** của họ trên bài toán đặt vé → tạo giá trị học thuật mà không cần phát minh gì mới.

### I.2 — Nghiên cứu bổ sung 🟢/🟡

| Công trình | Nội dung |
|-----------|----------|
| **Tuning a Kubernetes Horizontal Pod Autoscaler for Meeting Performance and Load Demands in Cloud Deployments** (2024), *Applied Sciences (MDPI), 14(2), 646* 🟢<br>🔗 https://www.mdpi.com/2076-3417/14/2/646 | Phương pháp tối ưu tham số HPA dùng maximum entropy principle + kernel estimator. Tiết kiệm đáng kể tài nguyên ở peak load. |
| **Horizontal Pod Autoscaling based on Kubernetes with Fast Response and Slow Shrinkage** (2023) 🟡 | **Rất hợp với flash sale:** scale **lên nhanh**, scale **xuống chậm** — tránh thrashing khi tải dao động. → Cấu hình `behavior.scaleDown.stabilizationWindowSeconds: 300`. |
| **Graph-PHPA** — proactive HPA dùng LSTM + GNN 🟡 | Dự đoán tải **trước** khi nó đến. Với ticketing, bạn **biết trước giờ mở bán** → có thể dùng **scheduled pre-scaling** (KEDA Cron scaler) thay vì cần ML. Đây là một hướng đơn giản mà hiệu quả. |
| **On the Stability of the Kubernetes Horizontal Autoscaler Control Loop** (2024) 🟡 | Phân tích HPA như một hệ điều khiển (control theory) — dao động/oscillation. |

**→ Ý tưởng hay cho đồ án:** So sánh 3 chiến lược scaling trong benchmark:
1. **Reactive HPA (CPU)** — baseline mặc định
2. **Reactive HPA (Custom Metrics: RPS / queue depth / WS connections)**
3. **Predictive/Scheduled pre-scaling** (KEDA Cron: scale trước giờ mở bán 10 phút)

Đo `error rate` và `p95 latency` trong **60 giây đầu tiên** của flash sale — đây là lúc HPA reactive thất bại và là lúc pre-scaling tỏa sáng. **Đây có thể là đóng góp thực nghiệm chính của đồ án.**

---

## J. DevSecOps

### J.1 — Biện minh cho Gitleaks (Secret Detection) 🟢 ⭐

**Meli, M., McNiece, M. R., & Reaves, B. (2019).** *How Bad Can It Git? Characterizing Secret Leakage in Public GitHub Repositories.* **Proc. NDSS Symposium 2019.**
🔗 https://www.ndss-symposium.org/ndss-paper/how-bad-can-it-git-characterizing-secret-leakage-in-public-github-repositories/

**Phát hiện:** Nghiên cứu đo lường quy mô lớn đầu tiên về rò rỉ secret trên GitHub — quét gần 6 tháng commit công khai + snapshot 13% repo mã nguồn mở. Kết quả: rò rỉ secret **rất phổ biến — ảnh hưởng hơn 100.000 repository**, và **hàng ngàn secret mới bị lộ mỗi ngày**.

**→ Đây là bằng chứng học thuật hoàn hảo** để biện minh việc đưa Gitleaks vào pipeline. Đừng chỉ nói "em thêm Gitleaks cho an toàn" — hãy nói "theo Meli et al. (NDSS 2019), hơn 100.000 repository bị rò rỉ secret và hàng ngàn secret mới bị lộ mỗi ngày, do đó việc quét toàn bộ Git history là bắt buộc".

### J.2 — Biện minh cho quét Terraform / IaC 🟢 ⭐

**Rahman, A., Parnin, C., & Williams, L. (2019).** *The Seven Sins: Security Smells in Infrastructure as Code Scripts.* **Proc. 41st ICSE, pp. 164–175.** DOI: `10.1109/ICSE.2019.00033`
🔗 https://akondrahman.github.io/publication/icse2019

**Phát hiện:** Phân tích định tính 1.726 IaC script → xác định **7 "security smell"** (hard-coded secret, empty password, suspicious comment, invalid IP binding `0.0.0.0`, use of HTTP without TLS, use of weak crypto, missing default in case statement). Xây dựng công cụ **SLIC** và validate trên **15.232 IaC script**.

**→ Ứng dụng quan trọng:** README hiện chỉ quét **code (SonarQube)** và **container (Trivy)**, **chưa quét Terraform**. Đây là một lỗ hổng rõ ràng. Thêm:
- **`tfsec`** hoặc **`checkov`** hoặc **`trivy config`** vào pipeline để quét file `.tf`
- Trích Rahman et al. (ICSE 2019) làm căn cứ khoa học

> 💡 Trivy **đã hỗ trợ sẵn** quét IaC misconfiguration (`trivy config ./terraform`) — chỉ cần thêm một step, không cần thêm công cụ mới. Đây là cải tiến "chi phí thấp, giá trị cao".

### J.3 — Nghiên cứu về CI/CD Security 🟡

| Công trình | Số liệu đáng chú ý |
|-----------|---------------------|
| **Challenges and Best Practices for Secure CI/CD Pipelines** (2025), arXiv:2503.22612<br>🔗 https://arxiv.org/pdf/2503.22612 | **67%** người tham gia cho rằng tích hợp bảo mật sớm cải thiện chất lượng phần mềm, nhưng **chỉ 12% quét mỗi commit** → dư địa lớn cho tự động hóa. **Số liệu này rất hợp để mở đầu chương DevSecOps.** |
| **Integrating Security into CI/CD Pipelines: A DevSecOps Approach with SAST, DAST, and SCA Tools** (2025) 🟡<br>🔗 https://www.researchgate.net/publication/390459514 | Kết hợp SAST + DAST + SCA với use case production |
| **Marandi, M. (2023).** *Implementing and Automating Security Scanning to a DevSecOps CI/CD Pipeline* 🟡 | Triển khai image security scanning (Snyk, StackHawk) + dashboard |
| **Adaptive and AI-Augmented Security Testing: A Systematic Survey** 🟡 | Phát hiện: **phần lớn dự án chỉ dùng MỘT công cụ SAST hoặc dependency scanner** ở bước post-build; kết hợp nhiều cơ chế bổ trợ là **hiếm**. |

**→ Điểm bán quan trọng:** Bài survey cuối cùng nói rằng việc tích hợp **nhiều cơ chế bổ trợ là hiếm gặp**. Đồ án của bạn tích hợp **4 lớp** (SonarQube SAST + Trivy container + Trivy SCA + Gitleaks secret + có thể thêm IaC scan) → **hãy nhấn mạnh đây chính là điểm khác biệt so với thực tiễn phổ biến**, có bằng chứng khảo sát chống lưng.

### J.4 — ⚠️ Thiếu DAST

README có SAST (SonarQube), SCA + Container (Trivy), Secret (Gitleaks) — **nhưng không có DAST** (Dynamic Application Security Testing). Với hệ thống có payment và authentication, DAST là mảnh ghép còn thiếu.
**Đề xuất:** Thêm **OWASP ZAP** (miễn phí, có GitHub Action `zaproxy/action-baseline`) chạy quét baseline trên môi trường Staging sau khi deploy. Chi phí thêm: ~1 job trong pipeline. Giá trị: hoàn chỉnh bộ tứ **SAST + DAST + SCA + Secret**, đúng chuẩn được mô tả trong các paper ở J.3.

---

## K. Load Testing & Phương pháp đánh giá

### K.1 — Công cụ 🔴

| Nguồn | Số liệu |
|-------|---------|
| [Grafana — k6 vs JMeter](https://grafana.com/blog/k6-vs-jmeter-comparison/) | k6: script JavaScript, thiết kế cho developer & CI/CD |
| Benchmark thực tế 🔴 | JMeter chiếm **760 MB RAM**, k6 chỉ **256 MB**. Một node 16-core chạy được **~38.000 VU với k6** vs **~11.500 VU với JMeter** trước khi bão hòa |

**→ Củng cố lựa chọn k6:** Với mục tiêu mô phỏng **10k–50k VU**, k6 là lựa chọn đúng — JMeter sẽ cần cluster load generator lớn hơn nhiều lần. Dùng **`k6-operator`** trên chính cụm K8s để phân tán load generator.

> ⚠️ **Cảnh báo thực tế:** Để tạo 50.000 VU thật, bạn cần **load generator riêng biệt, KHÔNG chạy trên cùng cluster với hệ thống dưới test** (nếu không sẽ đo lẫn tài nguyên). Chi phí: ~2 node c5.4xlarge chạy trong thời gian test. Hãy tính vào ngân sách AWS.

### K.2 — Phương pháp luận đánh giá 🟢

- **Jain, R. (1991).** *The Art of Computer Systems Performance Analysis.* Wiley.
  → Sách kinh điển về thiết kế thí nghiệm hiệu năng: chọn metric, tránh sai lầm phổ biến, warm-up period, confidence interval. **Nên trích dẫn trong chương Phương pháp** để chứng minh benchmark được thiết kế có phương pháp, không phải "chạy đại".
- **Nguyên tắc bắt buộc phải áp dụng:**
  - Mỗi kịch bản chạy **≥ 3 lần**, báo cáo **trung bình + độ lệch chuẩn**, không lấy 1 lần chạy.
  - Có **warm-up period** (JIT của Node.js, cache priming) trước khi bắt đầu đo.
  - Báo cáo **p95/p99**, không chỉ trung bình — trung bình che giấu tail latency.
  - **Cố định biến số:** cùng instance type, cùng region, cùng dataset giữa Monolith và Microservices.

### K.3 — Thang đo đề xuất cho đồ án

| Nhóm | Metric | Công cụ đo | Ngưỡng mục tiêu gợi ý |
|------|--------|-----------|------------------------|
| **Hiệu năng** | Throughput (req/s) | k6 | ≥ 5.000 req/s ở tầng đọc seat map |
| | Latency p50/p95/p99 | k6 + Prometheus | p95 < 500ms ở tải đỉnh |
| | Error rate (%) | k6 | < 1% |
| **Tính đúng đắn** ⭐ | Double Booking count | Query SQL sau test | **= 0 (tuyệt đối)** |
| | Ghost Lock count | Redis scan sau TTL | **= 0** |
| | Double Charge count | Đối soát payment log | **= 0** |
| **Real-time** | WS broadcast latency | Custom instrumentation | p95 < 100ms |
| **Elasticity** | Time to scale (giây) | K8s event log | < 60s từ khi vượt ngưỡng |
| | Pod count over time | Prometheus | Biểu đồ scale out/in |
| **Tài nguyên** | CPU / Memory / node-hours | Prometheus | So sánh chi phí 2 kiến trúc |
| **Bảo mật** | # Critical/High vuln | SonarQube, Trivy | 0 Critical trước deploy |
| | # secret leaked | Gitleaks | 0 |
| | Code Coverage | SonarQube | ≥ 70% |

---

## L. Công trình liên quan trực tiếp

### L.1 — Bài gần nhất với đề tài 🟡

**Zhang, Z., Zhang, X., & Li, X. (2025).** *Securing High-Concurrency Ticket Sales: A Framework Based on Microservice.* **arXiv:2512.24941** (nộp 31/12/2025, revised 04/07/2026)
🔗 https://arxiv.org/abs/2512.24941

**Nội dung:** Nền tảng bán vé tàu hỏa dùng kiến trúc B/S + **Spring Cloud**. Chức năng: tra cứu tàu real-time, quản lý ghế động, chọn ghế online, thanh toán/hoàn tiền, thêm hành khách. Kỹ thuật đáng chú ý: **Bloom Filter + Redis** chống cache penetration → chặn **99% request không hợp lệ**, giảm thời gian phản hồi API core từ **200ms → 30ms**.

**→ Đây là "Related Work" gần nhất của bạn.** Cần đọc kỹ full-text và viết một đoạn so sánh trong báo cáo:

| Tiêu chí | Zhang et al. (2025) | Đồ án này | Ưu thế |
|----------|---------------------|-----------|--------|
| Stack | Java / Spring Cloud | Node.js / Express | — (khác nhau) |
| Triển khai | Không đề cập K8s/Cloud | **AWS EKS + Terraform IaC + HPA** | ✅ Ta |
| CI/CD & Bảo mật | Không đề cập | **DevSecOps 4 lớp + Quality Gate** | ✅ Ta |
| Real-time seat update | Không rõ | **WebSocket + Redis Adapter** | ✅ Ta |
| Phòng chờ ảo | Không có | **Virtual Waiting Room** | ✅ Ta |
| Đánh giá | "test data chứng minh ổn định" (định tính) | **Benchmark định lượng Monolith vs Microservices, 10k-50k VU** | ✅ Ta |
| Bloom Filter chống penetration | ✅ Có, có số liệu | Chưa có trong thiết kế | ❌ **Nên bổ sung** |

> 💡 **Hành động:** Bổ sung Bloom Filter vào Venue & Seat Service. Vừa lấp được điểm yếu so với related work, vừa cho phép bạn **so sánh trực tiếp số liệu** với bài của Zhang et al. — đó là cách viết Related Work đúng chuẩn học thuật.

### L.2 — Các nguồn khác cần đọc

- **Performance Comparison of Monolithic and Microservices Architectures in Handling High-Volume Transactions** (2025) 🟡 — https://www.researchgate.net/publication/392834604
- **Microservices: Migration of a Mission Critical System** (2017), arXiv:1704.04173 🟡 — case study migration thực tế
- **A Systematic Mapping Study on Architectural Approaches to Software Performance Analysis** (2024), arXiv:2410.17372 🟡

---

## M. Khoảng trống trong thiết kế hiện tại

Đây là những điểm mà **khảo sát tài liệu cho thấy thiết kế trong README đang thiếu**. Mỗi mục đều có căn cứ từ paper ở trên.

| # | Khoảng trống | Rủi ro nếu bỏ qua | Đề xuất | Chi phí | Căn cứ |
|---|--------------|-------------------|---------|---------|--------|
| **M1** ⭐ | **Không có Transactional Outbox** | Dual-write giữa SQL Server và RabbitMQ → **ghost locking** khi crash giữa chừng. Chính là lỗi README hứa sẽ chứng minh không xảy ra! | Bảng `outbox_events` ghi cùng transaction + relay/Debezium publish. Tái dùng CDC đã có. | Trung bình | §C.4 |
| **M2** ⭐ | **Không có Distributed Tracing** | Observability chỉ có Metrics (Prometheus) + Logs (Loki). **Thiếu trụ cột thứ 3 (Traces).** Khi 1 request đi qua 6 service, không thể tìm ra service nào chậm. | **OpenTelemetry SDK + Jaeger** (hoặc Grafana Tempo — tích hợp sẵn với Loki/Grafana bạn đã có) | Thấp–TB | Sigelman et al., *Dapper* (Google, 2010) |
| **M3** | **Không có Fencing Token** cho distributed lock | Lock có thể bị "vượt mặt" khi clock skew / GC pause | `INCR` tạo token đơn điệu tăng, validate ở Booking Service | Thấp | §B.1 (Kleppmann) |
| **M4** | **Không quét IaC (Terraform)** | Security smell trong `.tf` (hard-coded secret, `0.0.0.0/0`, thiếu encryption) lọt vào production | `trivy config ./terraform` — **1 step, không cần công cụ mới** | Rất thấp | §J.2 (Rahman ICSE'19) |
| **M5** | **Không có DAST** | Bộ DevSecOps chưa hoàn chỉnh; lỗ hổng runtime (auth bypass, IDOR) không được phát hiện | OWASP ZAP baseline scan trên Staging | Thấp | §J.3 |
| **M6** | **Không có Circuit Breaker / Bulkhead** | Payment Gateway bên thứ 3 chậm → thread pool cạn → **cascading failure** toàn hệ thống | `opossum` (Node.js circuit breaker) cho mọi lời gọi ra ngoài; timeout + retry với exponential backoff **và jitter** | Thấp | Montesi & Weber (2016); Nygard, *Release It!* |
| **M7** | **HPA scale theo CPU cho WebSocket Gateway** | WS server đầy connection nhưng CPU thấp → **HPA không scale** → từ chối connection mới | HPA theo **Prometheus Custom Metric** (`connected_clients`) | Thấp | §I.1 (Nguyen et al. 2020) |
| **M8** | **Chưa chốt RabbitMQ hay Kafka** | Bị hỏi khi bảo vệ; không thể thiết kế DLQ cụ thể | **Chốt RabbitMQ**, biện minh bằng Dobbelaere & Esmaili (DEBS 2017) | Không | §E |
| **M9** | **Không có Bloom Filter** chống cache penetration | Request `event_id` không tồn tại (bot dò) đi thẳng xuống DB | RedisBloom module hoặc `bloom-filters` npm | Thấp | §L.1 (Zhang et al.) |
| **M10** | **Chưa nêu chiến lược idempotency ở consumer** | RabbitMQ là **at-least-once** → message xử lý 2 lần → double charge | Bảng `processed_messages(message_id PK)` + `INSERT` trong cùng transaction nghiệp vụ | Thấp | Airbnb — [Avoiding double payments](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb) 🔴 |
| **M11** | **10 microservices có thể quá nhiều cho 24 tuần / 2 người** | Rủi ro không hoàn thành, chất lượng mỗi service thấp | Chia MVP (5 core service) → mở rộng. Xem §N.4 | — | Blinowski et al. cảnh báo về over-engineering |

> ⚠️ **Về "exactly-once":** README dùng cụm "đảm bảo Idempotency" — đúng. Nhưng **tránh viết "exactly-once delivery"** trong báo cáo. Exactly-once delivery là **bất khả thi về mặt toán học** (Two Generals Problem — Akkoyunlu, Ekanadham & Huber, 1975). Cái ta thực sự đạt được là **at-least-once delivery + idempotent processing = exactly-once *effect***. Diễn đạt chính xác điểm này sẽ gây ấn tượng tốt với hội đồng.

---

## N. Đề xuất "đóng góp khoa học"

Một đồ án tốt nghiệp cần trả lời được câu: ***"Cái gì trong đồ án này là MỚI, không phải copy tutorial?"***
Dưới đây là 4 hướng, xếp theo tỉ lệ **giá trị / công sức**.

### N.1 ⭐⭐⭐ — Kiến trúc khóa ghế phòng thủ nhiều lớp (Defense-in-Depth Seat Locking)

**Luận điểm:** Phần lớn hệ thống ticketing trong tài liệu chỉ dùng **một cơ chế** khóa (hoặc DB lock, hoặc Redis lock). Kleppmann (2016) đã chỉ ra Redis lock **không đủ an toàn** cho correctness. Đồ án đề xuất kiến trúc **3 lớp**: Redis Lua atomic lock (hiệu năng) → Fencing token (chống stale lock) → DB UNIQUE constraint (đảm bảo tuyệt đối).

**Chứng minh thực nghiệm:**
- Kịch bản A: 5.000 VU cùng tranh **1 ghế** → đếm số order thành công (kỳ vọng: đúng 1)
- Kịch bản B: **Chaos test** — chủ động `SIGSTOP` Booking Service pod 30 giây (mô phỏng GC pause) giữa lúc giữ lock → chứng minh fencing token chặn được request "zombie"
- Kịch bản C: Tắt lớp fencing → **tái tạo được lỗi** → bật lại → lỗi biến mất

> Kịch bản C là quan trọng nhất: **chứng minh cơ chế của bạn thực sự cần thiết**, chứ không phải "thêm cho đẹp". Đây là cách làm khoa học đúng chuẩn.

### N.2 ⭐⭐⭐ — So sánh 3 chiến lược Autoscaling cho tải Flash Sale

**Luận điểm:** Tải flash sale có đặc trưng **bậc thang gần như tức thời** (0 → 50.000 user trong < 30 giây), rất khác các workload web thông thường mà HPA được thiết kế cho. Nguyen et al. (2020) đã chứng minh Resource Metrics phản ứng chậm hơn Custom Metrics. Đồ án mở rộng: đánh giá cả chiến lược **proactive scheduled pre-scaling** — khả thi vì thời điểm mở bán vé là **biết trước**.

**Thí nghiệm:**

| Chiến lược | Cấu hình |
|-----------|----------|
| S1 (baseline) | HPA theo CPU, cấu hình mặc định |
| S2 | HPA theo Custom Metrics (RPS, RabbitMQ queue depth, WS connections) |
| S3 | S2 + KEDA Cron pre-scaling 10 phút trước giờ mở bán |

**Đo:** error rate & p95 latency trong **60 giây đầu**, tổng **node-hours** tiêu thụ (→ chi phí $).
**Giả thuyết:** S3 có error rate thấp nhất nhưng chi phí cao nhất; bài toán trở thành **trade-off SLO vs cost** — rất "học thuật".

### N.3 ⭐⭐ — Đánh giá định lượng hiệu quả của DevSecOps Pipeline

**Luận điểm:** Survey (arXiv:2503.22612) cho thấy **chỉ 12% dự án quét mỗi commit**, và việc kết hợp nhiều công cụ bổ trợ là **hiếm**. Đồ án đo lường **chi phí thực tế** của việc quét toàn diện.

**Thí nghiệm:** Chèn cố ý một tập lỗ hổng đã biết (SQL injection, hard-coded API key, dependency CVE đã biết, base image lỗi thời, Terraform `0.0.0.0/0`) → đo:
- **Detection rate** của từng công cụ (công cụ nào bắt được lỗi nào?)
- **Overlap** giữa các công cụ (có redundancy không?)
- **Pipeline overhead** (thêm bao nhiêu phút vào mỗi lần build?)
- **False positive rate**

→ Kết quả là một **bảng ma trận công cụ × loại lỗ hổng** — đóng góp thực tiễn rõ ràng, dễ thực hiện, ít rủi ro.

### N.4 ⭐ — Thu hẹp phạm vi để tăng chiều sâu (khuyến nghị chiến lược)

**Vấn đề:** 10 microservices + full DevSecOps + benchmark 50k VU trong 24 tuần cho 2 người là rất nhiều. Rủi ro: mọi thứ đều "chạy được" nhưng **không có gì đủ sâu để bảo vệ**.

**Đề xuất chia tầng ưu tiên:**

| Tầng | Service | Trạng thái |
|------|---------|-----------|
| **P0 — Bắt buộc** (lõi luận điểm) | API Gateway, Auth, Event, **Venue & Seat**, **Booking**, Payment | Làm đầy đủ, tối ưu, benchmark kỹ |
| **P1 — Quan trọng** | Queue (Waiting Room), Ticket, WS Gateway | Làm đủ chức năng |
| **P2 — Có thì tốt** | Notification, Admin Dashboard | Làm mức cơ bản, không tối ưu |

**Lý do:** Luận điểm khoa học của đồ án nằm ở **Booking + Venue/Seat + Queue** (concurrency, locking, scaling). Notification Service dù có làm hoàn hảo cũng không đóng góp gì cho luận điểm đó. **Dồn công sức vào P0 và benchmark, không dàn trải.**

---

## 📎 PHỤ LỤC: Checklist đọc tài liệu

Thứ tự đọc được khuyến nghị (từ quan trọng nhất):

**Tuần 1 — Nền tảng bắt buộc:**
- [ ] Blinowski et al. (2022), IEEE Access — *Monolith vs Microservices* → định hình toàn bộ phần benchmark
- [ ] Garcia-Molina & Salem (1987) — *Sagas* → nền tảng luồng đặt vé
- [ ] Kleppmann (2016) + antirez (2016) — tranh luận Redlock → nền tảng cơ chế khóa ghế
- [ ] Zhang et al. (2025), arXiv — *Related Work gần nhất*, đọc full-text

**Tuần 2 — Thiết kế:**
- [ ] Dobbelaere & Esmaili (2017), DEBS — chốt RabbitMQ vs Kafka
- [ ] Nguyen et al. (2020), Sensors — thiết kế thí nghiệm HPA
- [ ] Daraghmi et al. (2022), Applied Sciences — Saga isolation
- [ ] Kleppmann, *DDIA* Ch. 7–9 — nền tảng lý thuyết concurrency

**Tuần 3 — Bảo mật & Đánh giá:**
- [ ] Meli et al. (2019), NDSS — biện minh Gitleaks
- [ ] Rahman et al. (2019), ICSE — biện minh IaC scanning
- [ ] arXiv:2503.22612 — số liệu khảo sát CI/CD security
- [ ] Jain (1991), *The Art of Computer Systems Performance Analysis* — Ch. 2–4 về thiết kế thí nghiệm

---

> **Lưu ý cuối:** Các mục đánh dấu 🟡/🔴 **không nên** xuất hiện trong danh mục "Tài liệu tham khảo" như thể là công trình khoa học. Với các chủ đề chỉ có nguồn 🔴 (WebSocket scaling, cache patterns, rate limiting), cách xử lý đúng là: trích **chuẩn/RFC** hoặc **bài lý thuyết nền** (Little's Law, Bloom filter, RFC 6455) cho phần lý thuyết, và ghi rõ nguồn công nghiệp trong footnote khi mô tả thực tiễn triển khai.
