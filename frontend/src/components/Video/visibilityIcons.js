import { MdOutlinePublic, MdLink, MdLockOutline, MdPeopleOutline } from 'react-icons/md';

/** Biểu tượng của các chế độ hiển thị, dùng ở bộ chọn và nhãn trên thẻ video. */
export const VISIBILITY_ICON = {
  public: MdOutlinePublic,
  members_only: MdPeopleOutline,
  unlisted: MdLink,
  private: MdLockOutline,
};
