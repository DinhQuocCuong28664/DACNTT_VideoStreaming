# Sơ đồ kiến trúc hệ thống

Thư mục này chứa các sơ đồ dùng cho báo cáo đồ án. Ảnh PNG xuất ra nằm ở thư mục gốc để chèn trực tiếp vào LaTeX. Mã nguồn sơ đồ nằm ở hai nơi tuỳ công cụ sinh ra nó, xem mục *Hai bộ sinh hình khác nhau* bên dưới.

| Tệp | Nội dung | Hình số trong báo cáo |
|---|---|---|
| `01-architecture-overview.png` | Kiến trúc tổng thể, ranh giới triển khai và luồng dữ liệu đánh số | 4.1 |
| `02-transcoding-sequence.png` | Sequence Diagram quy trình chuyển mã Event-Driven | 4.2 |
| `03-cicd-pipeline.png` | Bảy workflow CI/CD, đường dẫn kích hoạt và cổng chất lượng hai tầng | 5.1 |
| `04-database-erd.png` | ERD của MongoDB (User, Video, Comment) | 4.3 |
| `05-use-case.png` | Sơ đồ Use Case với 3 tác nhân, ký hiệu UML chuẩn | 3.1 |
| `06-hls-abr.png` | Các tệp HLS sinh ra từ một video nguồn và thứ tự player tải | 2.2 |
| `07-compute-models.png` | So sánh cụm luôn bật với container serverless, kèm thanh tỉ lệ giờ tính tiền | 2.1 |
| `08-user-flow.png` | Luồng người dùng từ lúc vào trang tới khi video được công bố | 4.4 |

## Tái sinh ảnh sau khi sửa sơ đồ

Sau khi chỉnh sửa tệp `.mmd` trong `src/`, chạy lệnh sau tại thư mục gốc của dự án để xuất lại hai ảnh dựng bằng Mermaid (hình 4.2 và 4.4). Sáu ảnh còn lại dựng bằng công cụ khác, lệnh riêng nằm ở mục kế tiếp:

```bash
for f in docs/diagrams/src/*.mmd; do npx --yes @mermaid-js/mermaid-cli -i "$f" -o "docs/diagrams/$(basename "$f" .mmd).png" -c docs/diagrams/mermaid-config.json -b white -s 3; done
```

Tham số `-b white` bảo đảm nền trắng và `-s 3` xuất ảnh ở độ phân giải gấp ba lần, đáp ứng yêu cầu hình ảnh nét khi in báo cáo. Cấu hình màu sắc và phông chữ nằm trong `mermaid-config.json`.

## Hai bộ sinh hình khác nhau

Thư mục này dùng hai công cụ, chọn theo loại sơ đồ.

**Mermaid** (`src/*.mmd`) chỉ còn dùng cho sơ đồ tuần tự và sơ đồ luồng người
dùng. Đây là hai loại Mermaid làm tốt và không cần icon dịch vụ.

**Bộ sinh SVG riêng** (`svg/`) cho sáu hình còn lại, vì các lý do sau. Thứ nhất,
Mermaid chỉ nạp được icon qua lời gọi JavaScript `registerIconPacks`, mà
mermaid-cli không phơi hàm đó ra, nên chạy qua CLI thì mọi icon đều thành dấu
hỏi. Thứ hai, bố cục tự động không đặt được các khối lồng nhau theo đúng ranh
giới tài khoản AWS mà sơ đồ cần thể hiện.

Icon lấy từ bộ `@iconify-json/logos`, đã trích sẵn phần cần dùng vào
`svg/icons.json` (khoảng 80 KB) nên dựng lại hình không cần mạng.

```bash
for f in docs/diagrams/svg/0*.mjs; do node "$f"; done
```

Lệnh trên ghi ra cả `svg/01-architecture-overview.svg` (bản gốc vector, để sửa
sau này) lẫn `01-architecture-overview.png` ở độ phân giải gấp ba lần. Cần thêm
icon mới thì bổ sung tên vào `WANTED` trong `svg/extract-icons.mjs` rồi chạy:

```bash
cd docs/diagrams/svg && npm i --no-save @iconify-json/logos @resvg/resvg-js && node extract-icons.mjs
```

## Kiểm tra cỡ chữ khi in

```bash
node docs/diagrams/check-print-size.mjs
```

Lệnh này in ra cỡ chữ nhỏ nhất của từng hình khi lên giấy và thoát với mã lỗi
nếu có hình nào tụt xuống dưới 6,2pt. Nên chạy sau mỗi lần sửa sơ đồ hoặc sửa
hệ số `\includegraphics` trong chương.

Có script vì việc này rất dễ nhầm: chữ nhỏ nhất trong hình thường là nhãn của
các cạnh, không phải dòng tiêu đề, mà nhìn bằng mắt thì hay bắt vào dòng tiêu
đề rồi kết luận hình đạt trong khi thực tế chưa đạt.

## Cỡ chữ khi in

Mỗi hình được đặt kích thước theo cỡ chữ nhỏ nhất còn đọc được trên bản in, chứ
không theo thói quen dùng `\textwidth`. Cỡ chữ hiện ra trên giấy bằng
`font_px / canvas_px × bề_rộng_in`, nên hình có nhiều nội dung phải xoay ngang
để dùng chiều cao trang (247 mm) làm bề rộng, còn hình cao và hẹp thì phải ràng
buộc theo chiều cao chứ không theo chiều rộng. Toàn bộ tám hình hiện ở mức
6,2pt trở lên.

Cỡ chữ của bộ sinh SVG khai báo trong bảng `TYPE` ở `svg/render.mjs`. Hình nào
có canvas rộng thì ghi đè bảng này ở đầu tệp của nó kèm phép tính, thay vì sửa
trong thân hàm và kéo theo cả bảy hình còn lại. Hình kiến trúc và hình use case
đang ghi đè vì canvas của chúng rộng hơn hẳn.
