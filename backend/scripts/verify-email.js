#!/usr/bin/env node
/**
 * Đánh dấu email của một tài khoản là đã xác minh, không cần bấm liên kết.
 *
 * Từ khi bắt buộc xác minh email trước khi tải video lên (middleware
 * requireVerifiedEmail), tài khoản dùng cho các script đo đạc
 * (scripts/measure-transcode.js, scripts/k6-load-test.js,
 * scripts/node-load-test.js) phải ở trạng thái đã xác minh. Script này dành
 * cho người vận hành và chạy bằng chính chuỗi kết nối MongoDB trong
 * backend/.env, giống set-role.js; không có API nào làm được việc này.
 *
 * CÁCH DÙNG
 *   node backend/scripts/verify-email.js <email>       # đánh dấu đã xác minh
 *   node backend/scripts/verify-email.js --unverified  # liệt kê tài khoản chưa xác minh
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../src/models/User');

const main = async () => {
  const [arg] = process.argv.slice(2);

  if (!process.env.MONGODB_URI) {
    console.error('Thiếu MONGODB_URI trong backend/.env');
    process.exit(1);
  }

  if (!arg) {
    console.error('Cách dùng: node backend/scripts/verify-email.js <email>');
    console.error('           node backend/scripts/verify-email.js --unverified');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    if (arg === '--unverified') {
      // Tài khoản Google coi như đã xác minh (User.hasVerifiedEmail), nên bỏ qua.
      const users = await User.find({ emailVerified: { $ne: true }, googleId: { $exists: false } })
        .select('email username createdAt')
        .lean();
      if (users.length === 0) console.log('Không có tài khoản nào chưa xác minh.');
      for (const u of users) console.log(`- ${u.email} (@${u.username})`);
      return;
    }

    const email = arg.trim().toLowerCase();
    const user = await User.findOneAndUpdate(
      { email },
      {
        $set: { emailVerified: true },
        $unset: { emailVerificationToken: 1, emailVerificationExpire: 1 },
      },
      { returnDocument: 'after' }
    );

    if (!user) {
      console.error(`Không tìm thấy tài khoản với email ${email}`);
      process.exitCode = 1;
      return;
    }

    console.log(`✅ ${user.email} (@${user.username}) → đã xác minh email`);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
