/**
 * Danh mục được lưu trong cơ sở dữ liệu dưới dạng chuỗi tiếng Việt, và enum
 * của model Video kiểm tra đúng những chuỗi đó. Vì vậy nhãn hiển thị phải tách
 * khỏi giá trị gửi lên máy chủ: dịch giá trị sẽ làm bộ lọc và cả thao tác tải
 * video lên hỏng ngay. Mỗi mục ở đây gồm `value` là thứ đi vào API, và `key`
 * là khoá dùng để tra chuỗi hiển thị theo ngôn ngữ đang chọn.
 */
export const ALL_CATEGORY = 'Tất cả';

export const CATEGORIES = [
  { value: ALL_CATEGORY, key: 'all' },
  { value: 'Công nghệ', key: 'technology' },
  { value: 'Giáo dục', key: 'education' },
  { value: 'Giải trí', key: 'entertainment' },
  { value: 'Âm nhạc', key: 'music' },
  { value: 'Game', key: 'game' },
  { value: 'Khác', key: 'other' },
];

/** Danh mục chọn được khi tải video lên, tức là mọi mục trừ "Tất cả". */
export const UPLOAD_CATEGORIES = CATEGORIES.filter((c) => c.value !== ALL_CATEGORY);

const KEY_BY_VALUE = new Map(CATEGORIES.map((c) => [c.value, c.key]));

/**
 * Trả về nhãn hiển thị cho một giá trị danh mục đọc từ cơ sở dữ liệu. Nếu gặp
 * giá trị lạ, chẳng hạn dữ liệu cũ hoặc danh mục mới chưa khai báo ở đây, trả
 * về chính giá trị đó thay vì chuỗi rỗng.
 */
export function categoryLabel(t, value) {
  const key = KEY_BY_VALUE.get(value);
  return key ? t(`categories.${key}`) : value;
}
