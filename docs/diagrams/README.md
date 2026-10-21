# Sơ đồ kiến trúc hệ thống

Thư mục này chứa các sơ đồ dùng cho báo cáo đồ án. Ảnh PNG xuất ra nằm ở thư mục gốc để chèn trực tiếp vào LaTeX. Mã nguồn sơ đồ nằm ở hai nơi tuỳ công cụ sinh ra nó, xem mục *Hai bộ sinh hình khác nhau* bên dưới.

| Tệp | Nội dung | Hình số trong báo cáo |
|---|---|---|
| `01-architecture-overview.png` | Kiến trúc tổng thể, ranh giới triển khai và luồng dữ liệu đánh số | 4.1 |
| `02-transcoding-sequence.png` | Sequence Diagram quy trình chuyển mã Event-Driven | 4.2 |
| `03-cicd-pipeline.png` | Bảy workflow CI/CD, đường dẫn kích hoạt và cổng chất lượng hai tầng | 5.1 |
| `04-database-erd.png` | ERD của MongoDB (User, Video, Comment) | 4.3 |
| `05-use-case.png` | Sơ đồ Use Case của người dùng nền tảng: 3 tác nhân, 15 use case, ký hiệu UML chuẩn | 3.1 |
| `06-hls-abr.png` | Các tệp HLS sinh ra từ một video nguồn và thứ tự player tải | 2.2 |
| `07-compute-models.png` | So sánh cụm luôn bật với container serverless, kèm thanh tỉ lệ giờ tính tiền | 2.1 |
| `08-user-flow.png` | Luồng người dùng từ lúc vào trang tới khi video được công bố | 4.8 |
| `09-moderation-erd.png` | Năm collection phục vụ kiểm duyệt và vận hành (Report, ModerationEvent, Appeal, AuditSample, RoleChange) | 4.4 |
| `10-use-case-staff.png` | Sơ đồ Use Case của kiểm duyệt và vận hành: operator, auditor, administrator cùng sàng lọc tự động, báo cáo và khiếu nại | 3.2 |
| `17-playback-sequence.png` | Sequence Diagram cấp quyền phát: backend cấp Signed Cookie cho một video, CloudFront kiểm từng yêu cầu | 4.5 |
| `18-verification-sequence.png` | Sequence Diagram xác thực tài khoản: theo liên kết trong thư, hoặc đăng nhập Google cùng địa chỉ | 4.7 |
| `19-moderation-sequence.png` | Sequence Diagram kiểm duyệt: sàng lọc tự động, báo cáo của người xem, quyết định của operator, khiếu nại của chủ video | 4.6 |

## Tái sinh ảnh sau khi sửa sơ đồ

Sau khi chỉnh sửa tệp `.mmd` trong `src/`, chạy lệnh sau tại thư mục gốc của dự án để xuất lại ảnh dựng bằng Mermaid (bốn sơ đồ tuần tự: hình 4.2, 4.5, 4.6 và 4.7), rồi chép bản PNG sang `report/images/`. Các ảnh còn lại dựng bằng công cụ khác, lệnh riêng nằm ở mục kế tiếp. Ba sơ đồ 17 tới 19 phải giữ chữ in từ 6,2pt trở lên; cỡ đo tay của chúng ghi trong `check-print-size.mjs`. Sơ đồ 19 có dòng `%%{init: ...}%%` ở đầu để thu hẹp khoảng cách giữa các tác nhân, và trong nhãn không được dùng dấu `;` vì Mermaid coi đó là hết câu lệnh:

```bash
for f in docs/diagrams/src/*.mmd; do npx --yes @mermaid-js/mermaid-cli -i "$f" -o "docs/diagrams/$(basename "$f" .mmd).png" -c docs/diagrams/mermaid-config.json -b white -s 3; done
```

Tham số `-b white` bảo đảm nền trắng và `-s 3` xuất ảnh ở độ phân giải gấp ba lần, đáp ứng yêu cầu hình ảnh nét khi in báo cáo. Cấu hình màu sắc và phông chữ nằm trong `mermaid-config.json`.

## Hai bộ sinh hình khác nhau

Thư mục này dùng hai công cụ, chọn theo loại sơ đồ.

**Mermaid** (`src/*.mmd`) chỉ còn dùng cho **sơ đồ tuần tự**, loại Mermaid làm
tốt và không cần icon dịch vụ.

Sơ đồ luồng người dùng (hình 4.8) đã chuyển sang bộ sinh SVG, không phải vì
trình bày mà vì **tỉ lệ khung**: `graph TB` xếp mọi thứ thành một cột dọc và
không có cách nào bảo nó gấp lại, nên hình ra 1:2,15, phải đặt theo chiều cao
trang, và chữ in ra chỉ còn 6,4pt. Xếp tay thành ba cột đưa tỉ lệ về 1:1,47 và
chữ lên 8,5pt — lớn nhất trong các hình của báo cáo.

**Bộ sinh SVG riêng** (`svg/`) cho chín hình còn lại, vì các lý do sau. Thứ nhất,
Mermaid chỉ nạp được icon qua lời gọi JavaScript `registerIconPacks`, mà
mermaid-cli không phơi hàm đó ra, nên chạy qua CLI thì mọi icon đều thành dấu
hỏi. Thứ hai, bố cục tự động không đặt được các khối lồng nhau theo đúng ranh
giới tài khoản AWS mà sơ đồ cần thể hiện.

Icon lấy từ bộ `@iconify-json/logos`, đã trích sẵn phần cần dùng vào
`svg/icons.json` (khoảng 80 KB) nên dựng lại hình không cần mạng.

```bash
for f in docs/diagrams/svg/[0-9][0-9]-*.mjs; do node "$f"; done
```

Lệnh trên ghi ra cả `svg/01-architecture-overview.svg` (bản gốc vector, để sửa
sau này) lẫn `01-architecture-overview.png` ở độ phân giải gấp ba lần. Cần thêm
icon mới thì bổ sung tên vào `WANTED` trong `svg/extract-icons.mjs` rồi chạy:

```bash
cd docs/diagrams/svg && npm i --no-save @iconify-json/logos @resvg/resvg-js && node extract-icons.mjs
```

## Huy hiệu số và bước kiểm bố cục

Nhãn chữ trên cạnh dễ đè lên thẻ khi khe giữa hai thẻ hẹp hơn nhãn: nền trắng của nhãn xoá luôn
viền thẻ và cả chữ của thẻ kề bên. Bản đầu của hình 4.1 có 15 trong 18 nhãn dính lỗi này, vì nhãn
rộng 66 đến 314px mà khe giữa hai thẻ chỉ 36 đến 46px, còn hành lang giữa cột bên thứ ba và tài
khoản AWS chỉ rộng 136px mà chứa bốn làn dọc cùng năm nhãn.

Vì vậy `edge()` nhận thêm `{ badge: n }`: cạnh được đánh dấu bằng một huy hiệu tròn 26px mang số
bước, và nghĩa của số nằm trong bảng chú giải "Numbered steps" ngay trong hình. Chỗ đặt huy hiệu do
`placeBadges()` tự chọn lúc dựng tài liệu, ngay trên đường hoặc cạnh đường khi khe quá hẹp, sao cho
không chạm thẻ, viền và tiêu đề khung, nhãn khác, đường của cạnh khác hay mũi tên. Muốn dịch một huy
hiệu dọc theo cạnh thì đặt `badgeAt` (tỉ lệ từ 0 đến 1 theo chiều dài cạnh).

Hình nào gọi `enableLayoutCheck()` thì được bước kiểm bố cục: dựng sẽ dừng, không ghi tệp, và liệt
kê từng chỗ nếu có nhãn đè lên thẻ, viền hoặc tiêu đề khung, nhãn nằm trên đường của cạnh khác,
cạnh đi xuyên thẻ hoặc cắt tiêu đề khung, hay tiêu đề rộng hơn khung của nó. Trên bản dựng cũ của
hình 4.1 bước kiểm báo 39 chỗ; bản hiện tại không còn chỗ nào. Hiện hình 4.1 và hình luồng người dùng bật bước
kiểm này; các hình còn lại được kiểm bằng script đọc SVG ở mục sau, vì ellipse và các ký hiệu riêng
chưa đăng ký vào sổ hình học của `render.mjs`.

```bash
node docs/diagrams/svg/01-architecture-overview.mjs
node --test docs/diagrams/svg/layout-check.selftest.mjs
```

Tệp `layout-check.selftest.mjs` dựng lại đúng các lỗi cũ (nhãn rộng hơn khe, tiêu đề tràn khung,
cạnh xuyên thẻ, cạnh cắt tiêu đề) và xác nhận bước kiểm bắt được chúng, cùng với việc huy hiệu đặt
lọt chính cái khe đó.

## Kiểm tra chữ đè lên hình

`svg/check-text-overlap.mjs` đọc thẳng các tệp SVG đã dựng, không phụ thuộc cách từng hình được vẽ.
Nó đo chiều rộng thật của từng đoạn chữ bằng chính bộ dựng resvg (cùng phông chữ như khi ra PNG)
rồi báo: chữ cắt ngang viền hình chữ nhật hoặc ellipse (tràn khỏi thẻ, hoặc nằm đè lên viền); nền
trắng của nhãn cạnh cắt viền, vì chính nền đó xoá viền thẻ; chữ bị một đường nối cắt qua; hai đoạn
chữ đè nhau; và cảnh báo chữ lọt trong thẻ nhưng sát viền dưới 8px. Thoát với mã 1 nếu có phát hiện.

```bash
node docs/diagrams/svg/check-text-overlap.mjs          # mọi hình
node docs/diagrams/svg/check-text-overlap.mjs 04 08    # chọn theo số đầu tên tệp
```

Hai bước kiểm bổ sung cho nhau: bước trong `render.mjs` biết cạnh nào của nhãn nào nên bắt được
nhãn nằm trên đường của cạnh khác và đường đi xuyên thẻ; script đọc SVG thì thấy cả ellipse và bảng
thực thể, và bắt được chữ tràn khỏi thẻ.

Hình tuần tự (Mermaid) không có SVG nên không kiểm tự động được. Hai lỗi của nó đã được trị bằng cấu
hình trong `mermaid-config.json`: `messageAlign: left` đặt chữ ở đầu mũi tên thay vì giữa, nên nhãn
của mũi tên dài không còn bị các đường sống ở giữa cắt qua; `messageMargin`, `boxMargin` và
`noteMargin` giảm để thêm một bước tự gọi mà hình chỉ cao thêm 2,6%, vì hình đã nằm sát chiều cao
trang. Khi sửa nhãn thì xem bằng mắt rằng mỗi nhãn ngắn hơn khoảng cách tới đường sống kế tiếp
(khoảng 175px ở tỉ lệ một lần, tức chừng 22 ký tự).

## Biểu đồ số liệu (hình 11 đến 16)

Sáu hình cuối là biểu đồ, không phải sơ đồ, và thay cho bảy bảng đo ở chương đánh giá: hình nào trong
chương 6 chỉ kể một so sánh hay một xu hướng thì vẽ ra dễ thấy hơn đọc từng ô số. Bảng gốc không mất:
chúng nằm ở Phụ lục B (`report/appendices/appendixB.tex`), kèm ghi chú gốc, để tra số chính xác.

| Hình | Tệp | Thay cho bảng | Số liệu đọc từ |
|---|---|---|---|
| 11 | `11-chart-ttff-cdn.mjs` | `ttff-results`, `ttff-cloudfront` | `docs/results/qoe-ttff.json`, `qoe-ttff-cloudfront.json` |
| 12 | `12-chart-ttff-regions.mjs` | `ttff-multiregion` | `docs/results/qoe-ttff-multiregion.json` |
| 13 | `13-chart-qoe-sources.mjs` | `qoe-multisource` | `docs/results/qoe-comparison.json` |
| 14 | `14-chart-chunk-config.mjs` | `chunk-config` | `report/generated/chart-chunk-config-25min.json` |
| 15 | `15-chart-four-hour.mjs` | `four-hour-breakdown` | `report/generated/chart-four-hour-breakdown.json` |
| 16 | `16-chart-concurrent-four.mjs` | `concurrent-four` | `report/generated/chart-concurrent-four-videos.json` |

Ba hình cuối đọc các tệp `chart-*.json` do `scripts/results/build-report-tables.py` sinh cùng lúc, từ cùng
các lượt đo với bảng cùng tên, nên chúng không thể lệch nhau; sửa số liệu thì chạy lại script đó rồi dựng
lại hình. Ba hình đầu đọc thẳng các tệp kết quả thô vì bảng của chúng gõ tay.

`svg/chart.mjs` giữ phần vẽ chung. Khác với sơ đồ, biểu đồ không có toạ độ đặt tay: người viết khai
báo một thang đo (`linear`) và chữ, cột, trục đều đặt theo thang đó, còn việc nhãn nằm trong hay ngoài
cột thì quyết theo chiều rộng thật của chữ (`measure`). Quy ước chung:

- canvas rộng 800px và in ra 160mm, nên 1px bằng 0,2mm và chữ 12px ra 6,8pt (ngưỡng là 6,2pt);
- cột không có `stroke`, và lưới, trục vẽ bằng `<line>`, để `check-text-overlap.mjs` không coi chúng là
  thẻ hay đường nối của sơ đồ; chữ vẫn được kiểm chồng chữ lên nhau;
- ba tông độ sáng khác nhau cho mọi bộ màu, để in đen trắng vẫn phân biệt được;
- một cột chỉ đại diện cho một số đo; nơi dữ liệu không cho biết thứ tự (phần còn lại của thời gian chuyển
  mã trước hay sau pha chunk) thì vẽ phép cộng chứ không vẽ trục thời gian, và nơi hai cột đo khác phạm vi
  (vCPU-giây chỉ của job chunk hay của mọi job) thì tô khác nhau và ghi trong chú giải.

```bash
node docs/diagrams/svg/16-chart-concurrent-four.mjs     # dựng một hình, chép PNG sang report/images/
node docs/diagrams/svg/check-text-overlap.mjs 11 12 13 14 15 16
node --test docs/diagrams/svg/chart-data.selftest.mjs   # mọi số trên hình khớp bảng ở Phụ lục B
```

`chart-data.selftest.mjs` đọc chữ trong SVG đã dựng và các ô của bảng trong `.tex` rồi so từng số, kèm
đếm số nhãn để bắt cả trường hợp hình có thêm hoặc thiếu một giá trị. Chạy nó sau mỗi lần đổi số liệu,
hình hoặc bảng, vì LaTeX vẫn dịch sạch khi hai bên đã lệch nhau.

Hình 11 có một số không nằm trong tệp nào: trung vị 727,69 ms qua edge Marseille. Tệp JSON của lượt đo
đó bị lượt đo sau khi sửa ghi đè, nên con số chỉ còn trong chương 6 và thông điệp commit `b952fe3`; hình
ghi điều đó trong chú thích và không vẽ thời gian từng giai đoạn cho cấu hình này. Bài kiểm kiểm rằng chương
6 vẫn nhắc đúng số đó.

## Giới hạn của sơ đồ tuần tự

Hình 4.2 đã ở sát ngưỡng: thêm một hàng làm tỉ lệ khung đi từ 1:1,53 xuống 1:1,1 và chữ in ra
dưới 6,2pt. Vì vậy đường chia đoạn (planner, hai job âm thanh, mảng chunk, job ghép) không vẽ
thành các hàng riêng mà được ghi trong chú thích cuối hình và mô tả bằng bảng 4.1 trong mục 4.2.
Muốn vẽ đầy đủ thì tách thành hai sơ đồ, đừng nối dài sơ đồ hiện có.

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
buộc theo chiều cao chứ không theo chiều rộng. Toàn bộ chín hình hiện ở mức
6,2pt trở lên.

Cỡ chữ của bộ sinh SVG khai báo trong bảng `TYPE` ở `svg/render.mjs`. Hình nào
có canvas rộng thì ghi đè bảng này ở đầu tệp của nó kèm phép tính, thay vì sửa
trong thân hàm và kéo theo cả tám hình còn lại. Hình kiến trúc và hai hình use case
đang ghi đè vì canvas của chúng khác mức chuẩn.
