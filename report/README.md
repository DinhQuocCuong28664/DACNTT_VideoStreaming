# Báo cáo đồ án — Mã nguồn LaTeX

Thư mục này chứa mã nguồn LaTeX của báo cáo đồ án, dựa trên template chính thức của Khoa Công nghệ Thông tin — Trường Đại học Tôn Đức Thắng.

## Biên dịch

Cần biên dịch bốn lượt theo đúng thứ tự dưới đây thì mục lục, danh mục hình, danh mục bảng và tài liệu tham khảo mới hiển thị đầy đủ:

```bash
pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
```

Lượt `pdflatex` đầu tiên sinh ra tệp `.aux` chứa các tham chiếu; `bibtex` đọc tệp này để dựng danh mục tài liệu tham khảo; hai lượt cuối lần lượt đưa danh mục vào tài liệu rồi cập nhật số trang cho toàn bộ tham chiếu chéo. Bỏ bớt lượt nào cũng sẽ khiến báo cáo xuất hiện dấu `??` thay cho số hình hoặc số trang.

Kết quả là tệp `main.pdf`.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `main.tex` | Tệp gốc, khai báo thứ tự các phần |
| `preamble.tex` | Khai báo gói, định dạng caption, cấu hình chèn mã nguồn |
| `frontmatter/` | Bìa, lời cảm ơn, xác nhận, cam đoan, tóm tắt, danh mục viết tắt |
| `chapters/` | Sáu chương nội dung |
| `appendices/` | Phụ lục |
| `images/` | Sơ đồ dạng ảnh, sinh từ `docs/diagrams/` |
| `references.bib` | Danh mục tài liệu tham khảo dạng BibTeX |

## Những chỗ cần điền số liệu

Chương 5 chứa bốn bảng đang để trống, chờ số liệu đo thực tế:

- Bảng 5.3 — Time-to-First-Frame, lấy từ `docs/results/qoe-ttff.json`
- Bảng 5.4 — Thời gian chuyển mã theo dung lượng, lấy từ `docs/results/transcode-timing.json`
- Bảng 5.5 — Kết quả kiểm thử chịu tải, lấy từ `docs/results/k6-summary.json`

Quy trình thu thập số liệu được mô tả trong `docs/results/README.md`. Cần ghi kèm điều kiện đo (vùng AWS, cấu hình vCPU/RAM của Fargate, thông số video mẫu) ngay dưới mỗi bảng, nếu không kết quả sẽ mất giá trị đối chứng.

## Lưu ý về quy định trình bày

Báo cáo đã tuân thủ các yêu cầu của giảng viên hướng dẫn: nội dung trình bày dưới dạng đoạn văn liên tục thay vì lạm dụng gạch đầu dòng; mọi hình và bảng đều có đánh số và chú thích căn giữa, in nghiêng; tham chiếu chéo dùng `\ref{}` và `\cite{}`; mã nguồn đưa vào môi trường `lstlisting` nền sáng; toàn bộ văn bản mẫu và dữ liệu giả của template đã được loại bỏ.

Trang *Important Notice to Students* của template đã được xoá theo đúng chỉ dẫn ghi trên chính trang đó.
