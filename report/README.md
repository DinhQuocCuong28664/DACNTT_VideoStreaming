# Báo cáo đồ án — Mã nguồn LaTeX

Thư mục này chứa mã nguồn LaTeX của báo cáo đồ án, dựa trên template chính thức của Khoa Công nghệ Thông tin — Trường Đại học Tôn Đức Thắng.

## Biên dịch

Cần biên dịch bốn lượt theo đúng thứ tự dưới đây thì mục lục, danh mục hình, danh mục bảng và tài liệu tham khảo mới hiển thị đầy đủ:

```bash
pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
```

Lượt `pdflatex` đầu tiên sinh ra tệp `.aux` chứa các tham chiếu; `bibtex` đọc tệp này để dựng danh mục tài liệu tham khảo; hai lượt cuối lần lượt đưa danh mục vào tài liệu rồi cập nhật số trang cho toàn bộ tham chiếu chéo. Bỏ bớt lượt nào cũng sẽ khiến báo cáo xuất hiện dấu `??` thay cho số hình hoặc số trang.

Kết quả là tệp `main.pdf`, hiện dài 76 trang. Bản biên dịch sạch không phát sinh cảnh báo nào: không `Overfull`/`Underfull` box, không tham chiếu hay trích dẫn thiếu. Nếu sửa nội dung mà `main.log` xuất hiện các cảnh báo đó thì cần xử lý trước khi nộp, vì `Overfull hbox` nghĩa là có dòng tràn ra ngoài lề giấy.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `main.tex` | Tệp gốc, khai báo thứ tự các phần |
| `preamble.tex` | Khai báo gói, định dạng caption, cấu hình chèn mã nguồn |
| `frontmatter/` | Bìa, lời cảm ơn, xác nhận, cam đoan, tóm tắt, danh mục viết tắt |
| `chapters/` | Bảy chương nội dung |
| `appendices/` | Phụ lục |
| `images/` | Sơ đồ dạng ảnh, sinh từ `docs/diagrams/` |
| `references.bib` | Danh mục tài liệu tham khảo dạng BibTeX |

Bảy chương lần lượt là:

| Tệp | Chương |
|---|---|
| `chapters/chap1.tex` | 1. Introduction |
| `chapters/chap2.tex` | 2. Literature Review and Technologies |
| `chapters/chap3.tex` | 3. Requirements Analysis |
| `chapters/chap4.tex` | 4. System Design |
| `chapters/chap5.tex` | 5. Development and Testing |
| `chapters/chap6.tex` | 6. Deployment and Evaluation |
| `chapters/chap7.tex` | 7. Conclusion and Future Work |

## Những chỗ còn thiếu

Số liệu đo đã thu thập xong và đã điền vào các bảng của chương 6 (Time-to-First-Frame đo từ sáu vùng AWS và từ một đường truyền dân dụng, thời gian chuyển mã theo dung lượng tệp, kết quả kiểm thử chịu tải bằng k6). Tệp kết quả gốc nằm trong `docs/results/`, và điều kiện đo được ghi ngay dưới mỗi bảng.

Chỗ duy nhất còn để trống là **bốn ảnh chụp màn hình giao diện** trong chương 6, hiện là khung `\screenshotplaceholder` chứ chưa phải ảnh thật:

| Hình | Vị trí | Nội dung cần chụp |
|---|---|---|
| 6.1 | `chapters/chap6.tex:44` | Trang chủ: thanh tìm kiếm, nút đổi giao diện sáng/tối, lưới video |
| 6.2 | `chapters/chap6.tex:63` | Trang xem: trình phát tự dựng với menu chọn độ phân giải |
| 6.3 | `chapters/chap6.tex:80` | Trang tải lên: biểu mẫu nhập tiêu đề, mô tả, thẻ và chế độ hiển thị |
| 6.4 | `chapters/chap6.tex:94` | Trang quản lý kênh: danh sách video của chủ kênh, gồm cả video đang xử lý |

Muốn chụp được thì phải khởi động EC2, đăng nhập bằng tài khoản thật và có sẵn vài video đã chuyển mã xong trong danh mục. Macro `\screenshotplaceholder` khai báo trong `preamble.tex`; khi có ảnh thật thì thay bằng `\includegraphics` như các hình khác.

## Hình vẽ

Toàn bộ ảnh trong `images/` được sinh tự động từ `docs/diagrams/`, không vẽ tay. Sửa hình thì sửa mã nguồn sơ đồ rồi chạy lại lệnh sinh ảnh, đừng sửa trực tiếp tệp PNG. Hướng dẫn nằm trong `docs/diagrams/README.md`.

Mỗi hình được đặt kích thước theo cỡ chữ nhỏ nhất còn đọc được khi in chứ không mặc định kéo hết bề rộng vùng chữ, vì giảng viên yêu cầu sơ đồ phải rõ trên bản in giấy. Cả tám hình hiện ở mức 6,2pt trở lên.

## Lưu ý về quy định trình bày

Báo cáo đã tuân thủ các yêu cầu của giảng viên hướng dẫn: nội dung trình bày dưới dạng đoạn văn liên tục thay vì lạm dụng gạch đầu dòng; mọi hình và bảng đều có đánh số và chú thích căn giữa, in nghiêng; tham chiếu chéo dùng `\ref{}` và `\cite{}`; mã nguồn đưa vào môi trường `lstlisting` nền sáng; toàn bộ văn bản mẫu và dữ liệu giả của template đã được loại bỏ.

Trang *Important Notice to Students* của template đã được xoá theo đúng chỉ dẫn ghi trên chính trang đó.
