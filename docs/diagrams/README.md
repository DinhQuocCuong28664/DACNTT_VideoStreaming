# Sơ đồ kiến trúc hệ thống

Thư mục này chứa các sơ đồ dùng cho báo cáo đồ án. Mã nguồn Mermaid được lưu trong `src/`, ảnh PNG xuất ra nằm ở thư mục gốc để chèn trực tiếp vào LaTeX.

| Tệp | Nội dung | Dùng cho chương |
|---|---|---|
| `01-architecture-overview.png` | Kiến trúc tổng thể 4 tầng và luồng dữ liệu 11 bước | 4.1 |
| `02-transcoding-sequence.png` | Sequence Diagram quy trình chuyển mã Event-Driven | 4.3 |
| `03-cicd-pipeline.png` | Sơ đồ 7 workflow CI/CD và DevSecOps Quality Gate | 5.2 |
| `04-database-erd.png` | ERD của MongoDB (User, Video, Comment) | 4.2 |
| `05-use-case.png` | Sơ đồ Use Case với 3 tác nhân | 3.4 |
| `06-hls-abr.png` | Các tệp HLS sinh ra từ một video nguồn và thứ tự player tải | 2.2 |
| `07-compute-models.png` | So sánh cụm luôn bật với container serverless theo yêu cầu | 2.2 |

## Tái sinh ảnh sau khi sửa sơ đồ

Sau khi chỉnh sửa tệp `.mmd` trong `src/`, chạy lệnh sau tại thư mục gốc của dự án để xuất lại toàn bộ ảnh:

```bash
for f in docs/diagrams/src/*.mmd; do npx --yes @mermaid-js/mermaid-cli -i "$f" -o "docs/diagrams/$(basename "$f" .mmd).png" -c docs/diagrams/mermaid-config.json -b white -s 3; done
```

Tham số `-b white` bảo đảm nền trắng và `-s 3` xuất ảnh ở độ phân giải gấp ba lần, đáp ứng yêu cầu hình ảnh nét khi in báo cáo. Cấu hình màu sắc và phông chữ nằm trong `mermaid-config.json`.
