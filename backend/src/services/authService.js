const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const httpError = require('../utils/httpError');
const { findWeakness } = require('../utils/passwordBlocklist');
const pwnedPasswords = require('./pwnedPasswordService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Từ chối mật khẩu quá dễ đoán trước khi nó chạm tới model.
 *
 * Hai lớp (xem utils/passwordBlocklist.js): danh sách và mẫu hiển nhiên chạy cục
 * bộ, rồi danh sách mật khẩu đã bị lộ. Lớp thứ hai chỉ chặn khi dịch vụ trả lời
 * rằng mật khẩu đã lộ; không trả lời được thì cho qua, để đăng ký không hỏng vì
 * một dịch vụ ngoài. Mật khẩu ngắn hơn 8 ký tự bỏ qua ở đây, model từ chối chúng
 * bằng thông điệp riêng.
 */
const assertPasswordAllowed = async (password, identity) => {
  const weakness = findWeakness(password, identity);
  if (weakness === 'common') {
    throw httpError.localized(400, 'auth.passwordCommon', 'PASSWORD_TOO_COMMON');
  }
  if (weakness === 'personal') {
    throw httpError.localized(400, 'auth.passwordPersonal', 'PASSWORD_PERSONAL');
  }

  if (pwnedPasswords.isEnabled() && String(password).length >= 8) {
    const count = await pwnedPasswords.countBreaches(password);
    if (count !== null && count >= pwnedPasswords.MIN_BREACH_COUNT) {
      throw httpError.localized(400, 'auth.passwordBreached', 'PASSWORD_BREACHED');
    }
  }
};

/** Liên kết xác minh email dùng được trong 24 giờ. */
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

/**
 * Sinh token xác minh email: bản thô đi trong thư, bản băm vào cơ sở dữ liệu
 * (cùng cách với token đặt lại mật khẩu trong models/User.js).
 */
const newEmailVerificationToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return {
    rawToken,
    fields: {
      emailVerificationToken: hashToken(rawToken),
      emailVerificationExpire: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
  };
};

/**
 * Generate JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

/**
 * Register a new user
 *
 * Tài khoản mới chưa xác minh email. Trả kèm `verificationToken` (bản thô) để
 * controller gửi thư; token chỉ được lưu ở dạng băm.
 */
const register = async (username, email, password) => {
  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (existingUser) {
    const field = existingUser.email === email ? 'Email' : 'Username';
    const error = new Error(`${field} already exists`);
    error.statusCode = 409;
    throw error;
  }

  await assertPasswordAllowed(password, { username, email });

  const { rawToken, fields } = newEmailVerificationToken();

  // Create user (password is hashed via pre-save hook)
  const user = await User.create({
    username,
    email,
    password,
    displayName: username, // Default display name = username
    emailVerified: false,
    ...fields,
  });

  const token = generateToken(user._id);

  return { user, token, verificationToken: rawToken };
};

/**
 * Xác minh email bằng token trong thư.
 *
 * Một lần cập nhật có điều kiện vừa tìm vừa tiêu token: hai lần bấm cùng một
 * liên kết không thể cùng thành công. Không cần đăng nhập — người ta hay mở
 * thư trên máy khác với máy đã đăng ký.
 */
const verifyEmail = async (rawToken) => {
  if (typeof rawToken !== 'string' || !/^[a-f0-9]{64}$/.test(rawToken)) {
    throw httpError.localized(400, 'auth.verifyLinkInvalid', 'VERIFY_LINK_INVALID');
  }

  const user = await User.findOneAndUpdate(
    {
      emailVerificationToken: hashToken(rawToken),
      emailVerificationExpire: { $gt: new Date() },
    },
    {
      $set: { emailVerified: true },
      $unset: { emailVerificationToken: 1, emailVerificationExpire: 1 },
    },
    { returnDocument: 'after' }
  );

  if (!user) {
    throw httpError.localized(400, 'auth.verifyLinkInvalid', 'VERIFY_LINK_INVALID');
  }

  return { user };
};

/**
 * Cấp token xác minh mới cho người dùng đang đăng nhập (nút "Gửi lại email").
 * Token cũ bị thay, nên chỉ thư mới nhất còn dùng được.
 */
const prepareVerificationEmail = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw httpError(404, 'User not found');
  }
  if (user.hasVerifiedEmail()) {
    throw httpError.localized(400, 'auth.alreadyVerified', 'ALREADY_VERIFIED');
  }

  const { rawToken, fields } = newEmailVerificationToken();
  user.set(fields);
  await user.save({ validateBeforeSave: false });

  return { user, verificationToken: rawToken };
};

/**
 * Login user with email and password
 */
const login = async (email, password) => {
  // Find user and explicitly select password field
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Compare password
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user._id);

  return { user, token };
};

/**
 * Đảm bảo username không trùng bằng cách thêm hậu tố số nếu cần.
 */
const buildUniqueUsername = async (base) => {
  const cleanBase = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'user';
  let candidate = cleanBase;
  let suffix = 0;

  // Thử tối đa vài lần trước khi thêm hậu tố ngẫu nhiên để tránh vòng lặp vô hạn.
  while (await User.findOne({ username: candidate })) {
    suffix += 1;
    candidate = `${cleanBase}${suffix}`;
    if (suffix > 20) {
      candidate = `${cleanBase}${crypto.randomBytes(3).toString('hex')}`;
      break;
    }
  }

  return candidate;
};

/**
 * Đăng nhập/đăng ký qua Google Sign-In (Google Identity Services).
 *
 * Cố ý KHÔNG tự động liên kết (auto-link) vào tài khoản email/password đã
 * tồn tại sẵn — đây là nguyên nhân của nhiều lỗ hổng account-takeover thực tế
 * (vd. CVE-2026-53516 của Better Auth): kẻ tấn công đăng ký trước bằng email
 * nạn nhân (chưa verify), rồi khi nạn nhân đăng nhập Google thật, hệ thống tự
 * gộp 2 tài khoản khiến kẻ tấn công có sẵn mật khẩu để chiếm tài khoản đó.
 * Xem docs/LITERATURE_REVIEW.md mục "Xác thực & Account Linking".
 *
 * Ngoại lệ duy nhất là tài khoản local CHƯA xác minh email (claimUnverifiedAccount):
 * chủ thật của hộp thư được nhận lại tài khoản, còn mật khẩu và mọi phiên của
 * người đăng ký trước bị xoá — chính là chỗ CVE trên làm sai.
 */
const verifyGoogleIdToken = async (idToken) => {
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    const error = new Error('Invalid Google credential');
    error.statusCode = 401;
    throw error;
  }

  if (!payload.email_verified) {
    const error = new Error('Google email is not verified');
    error.statusCode = 401;
    throw error;
  }

  return payload;
};

const loginWithGoogle = async (idToken) => {
  const payload = await verifyGoogleIdToken(idToken);

  // Tài khoản Google đã từng đăng nhập trước đây — nhận diện qua googleId.
  const existingGoogleUser = await User.findOne({ googleId: payload.sub });
  if (existingGoogleUser) {
    return { user: existingGoogleUser, token: generateToken(existingGoogleUser._id) };
  }

  // Có tài khoản local (email/password) trùng email nhưng CHƯA từng liên kết
  // Google. Đã xác minh email: không tự gộp, yêu cầu đăng nhập bằng mật khẩu
  // trước. Chưa xác minh: người đăng ký đó chưa từng chứng minh sở hữu hộp
  // thư, còn Google vừa chứng minh — giao tài khoản cho chủ hộp thư.
  const existingLocalUser = await User.findOne({ email: payload.email });
  if (existingLocalUser) {
    if (!existingLocalUser.hasVerifiedEmail()) {
      const claimed = await claimUnverifiedAccount(existingLocalUser._id, payload);
      return { user: claimed, token: generateToken(claimed._id) };
    }
    throw emailInUseError();
  }

  // Tài khoản hoàn toàn mới, tạo qua Google.
  const username = await buildUniqueUsername(payload.email.split('@')[0]);
  const user = await User.create({
    username,
    email: payload.email,
    googleId: payload.sub,
    emailVerified: true,
    displayName: payload.name || username,
    avatar: payload.picture || '',
  });

  return { user, token: generateToken(user._id) };
};

const emailInUseError = () => {
  const error = new Error(
    'An account with this email already exists. Please log in with your password to link Google sign-in from Settings.'
  );
  error.statusCode = 409;
  error.code = 'EMAIL_IN_USE';
  return error;
};

/**
 * Giao một tài khoản local chưa xác minh cho người vừa đăng nhập Google bằng
 * đúng email đó.
 *
 * Người đăng ký trước có thể là kẻ chiếm chỗ biết mật khẩu, nên cùng lúc:
 * - xoá mật khẩu: tài khoản thành tài khoản Google, muốn có mật khẩu thì
 *   dùng "Quên mật khẩu" (thư về đúng hộp thư vừa được Google xác minh);
 * - đặt passwordChangedAt: middleware auth từ chối mọi JWT cấp trước đó;
 * - xoá token xác minh và token đặt lại mật khẩu còn treo.
 *
 * Một lần cập nhật có điều kiện, không qua save(): trường password bị ẩn khi
 * truy vấn (select: false) nên không thể dựa vào việc gán undefined trên
 * document để xoá nó, và điều kiện chặn trường hợp tài khoản vừa được xác
 * minh hoặc vừa liên kết Google trong lúc này.
 */
const claimUnverifiedAccount = async (userId, payload) => {
  const claimed = await User.findOneAndUpdate(
    { _id: userId, emailVerified: { $ne: true }, googleId: { $exists: false } },
    {
      $set: {
        googleId: payload.sub,
        emailVerified: true,
        // Trừ 1 giây như hook pre-save trong models/User.js, để token cấp
        // ngay dưới đây (iat làm tròn xuống theo giây) không bị coi là cũ.
        passwordChangedAt: new Date(Date.now() - 1000),
      },
      $unset: {
        password: 1,
        emailVerificationToken: 1,
        emailVerificationExpire: 1,
        resetPasswordToken: 1,
        resetPasswordExpire: 1,
      },
    },
    { returnDocument: 'after' }
  );

  if (!claimed) {
    throw emailInUseError();
  }
  return claimed;
};

/**
 * Liên kết Google vào tài khoản đang đăng nhập (gọi từ Settings, sau khi
 * người dùng đã tự chứng minh quyền sở hữu tài khoản bằng JWT — khác hẳn
 * loginWithGoogle vốn cố tình từ chối tự gộp khi chưa xác thực danh tính).
 *
 * Chỉ cho liên kết nếu email Google trùng đúng email tài khoản hiện tại —
 * không cho gắn một Google account bất kỳ vào tài khoản đang dùng, tránh mở
 * rộng phạm vi thành "nhiều danh tính bất kỳ" ngoài đúng use-case cần giải
 * quyết (email đã có tài khoản local, muốn thêm Google làm cách đăng nhập
 * thay thế cho CHÍNH email đó).
 */
const linkGoogleAccount = async (userId, idToken) => {
  const payload = await verifyGoogleIdToken(idToken);

  const currentUser = await User.findById(userId);
  if (!currentUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (payload.email !== currentUser.email) {
    const error = new Error(
      'This Google account email does not match your account email.'
    );
    error.statusCode = 409;
    error.code = 'EMAIL_MISMATCH';
    throw error;
  }

  // googleId đã gắn cho MỘT user khác — không cho gắn thêm vào user hiện tại.
  const googleIdOwner = await User.findOne({ googleId: payload.sub });
  if (googleIdOwner && String(googleIdOwner._id) !== String(currentUser._id)) {
    const error = new Error('This Google account is already linked to another user.');
    error.statusCode = 409;
    error.code = 'GOOGLE_ALREADY_LINKED';
    throw error;
  }

  currentUser.googleId = payload.sub;
  // Google vừa xác minh đúng email của tài khoản này.
  currentUser.emailVerified = true;
  await currentUser.save();

  return { user: currentUser };
};

/**
 * Generate password reset token and return it (raw, unhashed)
 * The hashed version is stored in DB.
 *
 * Tra ve `null` khi email khong ung voi tai khoan nao, thay vi nem loi 404.
 * Truoc day ham nay nem "No account found with that email" va loi do di
 * thang ra client, bien endpoint quen-mat-khau thanh cong cu do xem email
 * nao da dang ky (user enumeration). Rate limiter chi lam cham chu khong
 * bit duoc, vi no tinh theo IP.
 *
 * Quyet dinh "co tai khoan hay khong" gio nam lai o day; phia controller
 * tra ve cung mot phan hoi trong ca hai truong hop.
 */
const forgotPassword = async (email) => {
  const user = await User.findOne({ email });

  if (!user) {
    return null;
  }

  // Generate reset token (raw token returned, hashed stored in DB)
  const resetToken = user.generateResetToken();
  await user.save({ validateBeforeSave: false });

  return { user, resetToken };
};

/**
 * Reset password using token
 */
const resetPassword = async (rawToken, newPassword) => {
  // Hash the raw token to compare with stored hash
  const hashedToken = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }, // Token not expired
  });

  if (!user) {
    const error = new Error('Invalid or expired reset token');
    error.statusCode = 400;
    throw error;
  }

  await assertPasswordAllowed(newPassword, { username: user.username, email: user.email });

  // Set new password (will be hashed by pre-save hook)
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  // Liên kết đặt lại chỉ đi tới hộp thư của tài khoản, nên dùng được nó là đã
  // chứng minh sở hữu email. Đây cũng là đường để chủ thật nhận lại một tài
  // khoản bị người khác đăng ký trước mà không cần Google: đặt mật khẩu mới
  // làm mọi phiên của người kia hết hiệu lực (passwordChangedAt).
  user.emailVerified = true;
  await user.save();

  const token = generateToken(user._id);

  return { user, token };
};

/**
 * Change password (authenticated user)
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  // Verify current password
  const isMatch = await user.matchPassword(currentPassword);

  if (!isMatch) {
    const error = new Error('Current password is incorrect');
    error.statusCode = 401;
    throw error;
  }

  await assertPasswordAllowed(newPassword, { username: user.username, email: user.email });

  user.password = newPassword;
  await user.save();

  const token = generateToken(user._id);

  return { user, token };
};

module.exports = {
  assertPasswordAllowed,
  register,
  verifyEmail,
  prepareVerificationEmail,
  EMAIL_VERIFICATION_TTL_MS,
  login,
  loginWithGoogle,
  linkGoogleAccount,
  forgotPassword,
  resetPassword,
  changePassword,
  generateToken,
};
