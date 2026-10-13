#!/usr/bin/env node
/**
 * Cấp hoặc thu hồi quyền quản trị viên cho một tài khoản.
 *
 * Không có API nào đổi được vai trò — cố ý như vậy, để một lỗ hổng ở tầng
 * HTTP không thể trở thành lỗ hổng leo thang đặc quyền. Người vận hành chạy
 * script này bằng chính chuỗi kết nối MongoDB trong backend/.env.
 *
 * Vai trò được đọc lại từ cơ sở dữ liệu ở MỖI request (middleware auth), nên
 * thay đổi có hiệu lực ngay, không cần người dùng đăng nhập lại.
 *
 * CÁCH DÙNG
 *   node backend/scripts/set-role.js <email> admin      # toàn quyền
 *   node backend/scripts/set-role.js <email> operator   # rà soát, xử lý khiếu nại, kiểm tra mẫu
 *   node backend/scripts/set-role.js <email> auditor    # chỉ đọc số liệu và nhật ký
 *   node backend/scripts/set-role.js <email> user       # thu hồi
 *   node backend/scripts/set-role.js --list             # liệt kê đội ngũ vận hành
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../src/models/User');
const { ROLES } = require('../src/utils/roles');

const main = async () => {
  const [first, second] = process.argv.slice(2);

  if (!process.env.MONGODB_URI) {
    console.error('Thiếu MONGODB_URI trong backend/.env');
    process.exit(1);
  }

  if (first !== '--list' && (!first || !ROLES.includes(second))) {
    console.error(`Cách dùng: node backend/scripts/set-role.js <email> <${ROLES.join('|')}>`);
    console.error('           node backend/scripts/set-role.js --list');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    if (first === '--list') {
      const staff = await User.find({ role: { $ne: 'user' } }).select('email username role createdAt').lean();
      if (staff.length === 0) console.log('Chưa có ai trong đội ngũ vận hành.');
      for (const a of staff) console.log(`- ${a.role.padEnd(8)} ${a.email} (@${a.username})`);
      return;
    }

    const email = first.trim().toLowerCase();
    const user = await User.findOneAndUpdate({ email }, { $set: { role: second } }, { returnDocument: 'after' });

    if (!user) {
      console.error(`Không tìm thấy tài khoản với email ${email}`);
      process.exitCode = 1;
      return;
    }

    console.log(`✅ ${user.email} (@${user.username}) → role = ${user.role}`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
