# Bộ đo QoE bằng trình duyệt thật

Đo **tỉ lệ nghẽn**, **số lần đổi bitrate** và **bitrate trung bình thực nhận** bằng cách
cho Chromium headless phát video qua đúng trình phát hls.js của hệ thống.

## Vì sao cần bộ này, đã có `benchmark-qoe.js` rồi

`scripts/benchmark-qoe.js` dùng `fetch` thuần: tải master playlist → sub-playlist → segment
đầu tiên. Nó đo Time-to-First-Frame rất tốt, nhưng **về nguyên tắc không quan sát được** ba
chỉ số trên, vì nó không có bộ đệm, không có đồng hồ phát, và không chạy thuật toán ABR nào —
nó tải đúng một rendition cố định.

| Chỉ số | `benchmark-qoe.js` | Bộ này |
|---|---|---|
| Time-to-First-Frame | ✅ đo được | — (dùng bản cũ) |
| Tỉ lệ nghẽn | ❌ không có bộ đệm | ✅ |
| Số lần đổi bitrate | ❌ không có ABR | ✅ |
| Bitrate trung bình thực nhận | ❌ | ✅ |

Hai bộ **bổ sung cho nhau**, không thay thế nhau.

## Cấu trúc

```
metrics.js       Tính toán thuần — không phụ thuộc Playwright, test được không cần trình duyệt
metrics.test.js  34 test khoá lại định nghĩa của từng chỉ số
collect.js       Điều khiển Playwright, sinh ra nhật ký sự kiện cho metrics.js
bitrate.test.js  30 test khoá lại cách quy đổi số byte đã tải thành bitrate
```

`collect.js` gọi `require('playwright')` bên trong hàm chứ không ở đầu tệp, nên các hàm
thuần của nó (đọc playlist, quy đổi bitrate) vẫn test được mà không cần cài Chromium.

Tách đôi như vậy để phần dễ sai nhất — **định nghĩa** của từng chỉ số — được kiểm chứng bằng
dữ liệu dựng sẵn, không lệ thuộc vào việc mạng hôm đó nhanh hay chậm.

## Chuẩn bị (chạy một lần)

```bash
cd scripts/qoe && npm run setup
```

Lệnh này cài `jest`, `playwright`, rồi tải bản Chromium riêng của Playwright (**~150 MB**).
Cần khoảng 1 GB RAM trống lúc chạy đo.

## Chạy đo

```bash
node collect.js --url https://zelostech.site/watch/<videoId> --runs 5 --duration 60
```

| Tuỳ chọn | Mặc định | Ý nghĩa |
|---|---|---|
| `--url` | *(bắt buộc)* | Trang xem video |
| `--runs` | 5 | Số lần đo thật |
| `--duration` | 60 | Số giây phát mỗi lần |
| `--profile` | `unthrottled` | `unthrottled` \| `dsl` \| `fast3g` \| `slow3g` |
| `--warmups` | 2 | Số lượt chạy khởi động bị loại khỏi kết quả |
| `--out` | `docs/results/qoe-playback-<profile>.json` | Nơi ghi kết quả |
| `--headed` | tắt | Hiện cửa sổ trình duyệt để quan sát |

### Vì sao mặc định là **hai** lượt khởi động

Một lượt không đủ, và điều này đo được chứ không phải phỏng đoán. Trên `slow3g`,
với một lượt khởi động thì lần đo thứ nhất có thời gian chờ **26,04 giây** trong
khi bốn lần còn lại đều quanh **1,9 giây**. Thêm lượt khởi động thứ hai thì điểm
lệch biến mất hoàn toàn — cả năm lần đều nằm trong khoảng 1,88–1,90 giây:

| | Lần 1 | Các lần sau | Lớn nhất |
|---|---|---|---|
| 1 lượt khởi động | 26,04 s | ~1,90 s | 26,04 s |
| 2 lượt khởi động | 1,90 s | ~1,89 s | **1,90 s** |

Nguyên nhân là cache cần hai lượt mới nóng hẳn (cache trình duyệt và Edge Location
của CloudFront). Trên mạng nhanh hiệu ứng này không thấy được, nên nếu chỉ thử ở
`unthrottled` sẽ tưởng một lượt là đủ.

Muốn thấy ABR hoạt động thì phải **giới hạn băng thông** — mạng không giới hạn thì trình phát
chọn 1080p ngay từ đầu rồi giữ nguyên, và số lần đổi bitrate sẽ luôn bằng 0:

```bash
node collect.js --url ... --profile fast3g
```

## Chạy test (không cần Chromium)

```bash
cd scripts/qoe && npm test
```

Hoặc không cần cài gì, mượn jest có sẵn của backend:

```bash
cd backend && npx jest --rootDir ../scripts/qoe --runInBand
```

## Cách đo — những chỗ đã cân nhắc

**Không sửa mã trình phát.** `VideoPlayer.jsx` giữ đối tượng hls.js trong một React ref, không
phơi ra `window`. Thay vì thêm mã chỉ để phục vụ việc đo, bộ này lấy tín hiệu từ chính phần tử
`<video>`: sự kiện `waiting`/`playing`/`ended` cho nghẽn, và `videoHeight` đổi (360/720/1080)
cho mức chất lượng.

**Mức hiển thị, không phải mức tải về.** `videoHeight` phản ánh rendition đang *hiển thị*, trễ
hơn rendition đang *tải về* đúng bằng độ sâu bộ đệm. Với QoE thì mức hiển thị mới là thứ người
xem nhìn thấy, nên đây là lựa chọn có chủ đích. Nhật ký mạng (`renditionsDownloaded`) được ghi
kèm để đối chiếu.

**Loại trừ buffering khởi động.** Chờ lúc mở video là kỳ vọng bình thường; đứng hình giữa chừng
thì không. Gộp chung sẽ thổi phồng tỉ lệ nghẽn ở mọi phép đo.

**Lần chọn mức đầu tiên không phải một lần "đổi".** Nếu tính, mọi phép đo đều dư ra đúng một
lần đổi mức.

**Bitrate trung bình có trọng số thời gian.** Phát 1080p 1 giây rồi 360p 59 giây mà lấy trung
bình cộng hai mức thì không phản ánh thứ người xem nhận được.

**Bitrate lấy từ số byte thật, không lấy từ BANDWIDTH.** `transcoder/src/transcoder.js` sinh
`BANDWIDTH` bằng cách cộng cứng hai giá trị trong config (`videoBitrate + audioBitrate`), không
hề đo lại sản phẩm thật. x264 ở chế độ ABR chỉ *bám* mục tiêu, và mức chênh **không đồng đều
giữa các bậc thang**. Đo thử 30 giây trên một clip dọc 576×1024 — đúng loại nội dung đang có
trong thư viện:

| Bậc | Khai trong master | Đo được | Đạt |
|---|---|---|---|
| 360p | 464 kbit/s | 421 | 91% |
| 720p | 1.628 kbit/s | 1.340 | 82% |
| 1080p | 4.192 kbit/s | 3.242 | 77% |

Lấy `BANDWIDTH` làm "bitrate thực nhận" vì thế thổi phồng kết quả khoảng 20–25%. Sai lệch tăng
dần theo bậc nên **chạy thêm bao nhiêu lần đo cũng không trung hoà được** — đây là sai số hệ
thống, không phải nhiễu ngẫu nhiên. Vì vậy bộ đo cộng số byte thật của từng segment rồi chia cho
tổng `#EXTINF` của chính những segment đó, và in ra bảng đối chiếu "khai báo → đo được" sau mỗi
lượt chạy.

Mẫu số là thời lượng của các segment đã tải, **không phải** thời gian của phiên đo: trình phát
luôn tải trước, nên chia cho thời gian phiên sẽ trộn độ sâu bộ đệm vào con số. Thứ P.1203 cần là
bitrate của representation, và nó được lấy trọng số theo thời gian hiển thị ở bước sau.

**Một lần chạy khởi động bị loại.** Lần tải trang đầu sau khi mở trình duyệt luôn chậm hơn hẳn
(JIT chưa nóng, cache DNS/TLS còn rỗng).

**Trung vị cho thời gian chờ — nhưng KHÔNG chỉ trung vị cho tỉ lệ nghẽn.** Nghẽn là hiện tượng
thưa nhưng nặng: trong một loạt 5 lần đo trên `slow3g`, có 3 lần bằng 0 và 2 lần khoảng 20%.
Trung vị khi ấy bằng 0, và viết "không nghẽn" vào báo cáo là **sai sự thật**. Vì vậy kết quả
luôn in kèm trung bình, giá trị lớn nhất, và số lần đo thực sự có nghẽn; kịch bản còn tự cảnh
báo khi trung vị bằng 0 mà vẫn có lần đo bị nghẽn.

**Signed Cookies tự động.** Trang tự gọi `/api/videos/:id/playback-auth` và Chromium giữ cookie
như trình duyệt thật — không phải tự đọc `Set-Cookie` rồi ghép tay như bản `fetch`.

## ⚠️ Cách phát biểu đúng trong báo cáo

`toP1203Mode0Input()` xuất dữ liệu theo đúng định dạng đầu vào của mô hình ITU-T P.1203
(`I13` video, `I11` âm thanh, `I23` nghẽn dạng cặp `[mốc bắt đầu, thời lượng]`, `IGen`).

Nhưng **kịch bản này không tính điểm MOS** và cũng không tự nhận là triển khai P.1203.
Ba chỉ số đo được là **đầu vào** của mô hình, không phải kết quả của nó. Muốn có MOS thì phải
đưa tệp JSON này qua bản cài đặt tham chiếu:

```
https://github.com/itu-p1203/itu-p1203
```

Ba điều bản cài đặt đó tự ghi rõ, cần tôn trọng khi viết báo cáo:

1. *"This software is not an official ITU-T publication"* — không phải ấn phẩm chính thức.
2. Giấy phép **chỉ cho nghiên cứu phi thương mại**.
3. **Bắt buộc trích dẫn** Raake et al. (2017) và Robitza et al. (2018), kèm liên kết kho mã.

Vì vậy câu đúng là:

> ✅ "Mode 0 của mô hình P.1203, tính bằng bản cài đặt tham chiếu công khai"

Không phải:

> ❌ "Đo theo chuẩn ITU-T P.1203"

Mode 0 là mức duy nhất dựng được từ một trình duyệt bên ngoài, vì Mode 1–3 cần đọc tới
bitstream (Mode 2 lấy mẫu 2%, Mode 3 đọc toàn bộ giá trị QP).
