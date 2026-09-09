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
metrics.test.js  29 test khoá lại định nghĩa của từng chỉ số
collect.js       Điều khiển Playwright, sinh ra nhật ký sự kiện cho metrics.js
```

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
| `--runs` | 5 | Số lần đo, chưa kể một lần chạy khởi động |
| `--duration` | 60 | Số giây phát mỗi lần |
| `--profile` | `unthrottled` | `unthrottled` \| `dsl` \| `fast3g` \| `slow3g` |
| `--out` | `docs/results/qoe-playback-<profile>.json` | Nơi ghi kết quả |
| `--headed` | tắt | Hiện cửa sổ trình duyệt để quan sát |

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

**Một lần chạy khởi động bị loại.** Lần tải trang đầu sau khi mở trình duyệt luôn chậm hơn hẳn
(JIT chưa nóng, cache DNS/TLS còn rỗng).

**Trung vị, không phải trung bình cộng.** Một lần đo dính nhiễu mạng có thể kéo lệch hẳn trung
bình cộng.

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
