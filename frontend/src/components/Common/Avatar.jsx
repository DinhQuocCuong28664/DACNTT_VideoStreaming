import { useState } from 'react';

/**
 * Ảnh đại diện kèm phương án dự phòng.
 *
 * Mỗi nơi hiển thị ảnh đại diện đều đã có sẵn khối chữ cái đầu để dùng khi
 * người dùng chưa đặt ảnh. Nhưng đường dẫn *có* mà ảnh không tải được thì
 * khối đó không được dùng tới, và trình duyệt vẽ biểu tượng ảnh vỡ kèm chữ
 * alt: tệp bị xoá khỏi kho, đường dẫn trỏ sang bucket cũ, hoặc quyền truy cập
 * đã đổi. VideoCard từng xử lý riêng trường hợp này cho ảnh bìa; ở đây gom
 * lại một chỗ cho ảnh đại diện, để năm nơi gọi không phải chép lại cùng một
 * đoạn state.
 *
 * `alt` để trống là cố ý: tên kênh luôn nằm ngay cạnh ảnh, nên đọc lại tên
 * lần nữa chỉ làm trình đọc màn hình lặp thừa.
 */
const Avatar = ({ src, className = '', fallbackClassName = '', children, ...rest }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className={fallbackClassName || className}>{children}</div>;
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
};

export default Avatar;
