# Ý tưởng thiết kế UI — chưa triển khai

Ghi lại các hướng thiết kế được cân nhắc nhưng chưa (hoặc chưa quyết định) đưa vào code, để không mất ý tưởng và để hiểu lại bối cảnh khi quay lại sau.

---

## Sidebar trái cố định cho HomePage (29/08/2026)

**Nguồn**: Bản mockup Stitch (`stitch_streamhub_video_platform`, xem `screen.png`/`code.html` trong Downloads của người dùng lúc đề xuất) — ban đầu được tạo ra để làm landing page nhưng thực chất là thiết kế **trang chủ đã đăng nhập** (home/discovery dashboard kiểu Netflix/YouTube), không phải trang marketing.

**Ý tưởng đáng cân nhắc lại sau này** (khi làm HomePage, không phải LandingPage):
- Sidebar trái cố định: Home / Trending / Subscriptions / Library / History — thay cho chỉ có Navbar trên cùng như hiện tại.
- Hero banner lớn cho 1 video nổi bật (kiểu "Continue watching" / featured), có nút Watch Now + More Info đè lên ảnh nền mờ.
- Dải "Khuyến nghị cho bạn" và "Trending Hiện Nay" tách riêng thành từng khối ngang, mỗi khối có avatar kênh + view count + thời gian đăng.
- Category chip dạng pill, chip đang chọn có nền đặc + bo tròn hoàn toàn.

**Vì sao chưa làm ngay**:
- Đây là thay đổi kiến trúc điều hướng của toàn app (`MainLayout.jsx` hiện chỉ có Navbar + Footer, không có sidebar) — không phải việc đổi màu/CSS đơn thuần, cần đánh giá lại toàn bộ layout responsive (mobile sẽ không có chỗ cho sidebar cố định, cần bottom-tab hoặc drawer thay thế).
- Cần dữ liệu thật để làm hero "video nổi bật" có ý nghĩa (hiện tại theo `isOwner`/`videoApi` chưa có khái niệm "featured video" hay "continue watching" trong schema).

**Bảng màu của bản mockup này KHÔNG dùng được** — `primary-container: #e50914` là đúng mã màu thương hiệu Netflix, phải đổi sang tông tím-ngọc (`--accent-primary: #6c5ce7`, `--accent-secondary`) của VidShare nếu triển khai hướng này sau này.
