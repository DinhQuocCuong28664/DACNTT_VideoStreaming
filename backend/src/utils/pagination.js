/**
 * Đọc `page` và `limit` từ query string cho các endpoint trả danh sách.
 *
 * Trước đây mỗi controller tự `parseInt` rồi dùng thẳng, không có giới hạn
 * trên: `?limit=100000` kéo toàn bộ collection kèm populate người đăng trong
 * một lần gọi, còn `?page=-1` tạo ra skip âm và làm truy vấn MongoDB ném lỗi
 * thành HTTP 500. Endpoint gợi ý video (`getRelatedVideos`) đã chặn trên ở 24
 * từ trước; hàm này đưa cùng cách làm đó về một chỗ cho các danh sách còn lại.
 *
 * Giá trị không hợp lệ (thiếu, không phải số, nhỏ hơn 1) quay về mặc định thay
 * vì trả lỗi, để khớp hành vi cũ với mọi client đang gọi đúng.
 */
const MAX_PAGE_SIZE = 50;

const parsePaging = (query = {}, defaultLimit = 12, maxLimit = MAX_PAGE_SIZE) => {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;

  return { page, limit };
};

module.exports = { parsePaging, MAX_PAGE_SIZE };
