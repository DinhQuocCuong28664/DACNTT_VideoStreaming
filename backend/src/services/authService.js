const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

  // Create user (password is hashed via pre-save hook)
  const user = await User.create({
    username,
    email,
    password,
    displayName: username, // Default display name = username
  });

  const token = generateToken(user._id);

  return { user, token };
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
 */
const loginWithGoogle = async (idToken) => {
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

  // Tài khoản Google đã từng đăng nhập trước đây — nhận diện qua googleId.
  const existingGoogleUser = await User.findOne({ googleId: payload.sub });
  if (existingGoogleUser) {
    return { user: existingGoogleUser, token: generateToken(existingGoogleUser._id) };
  }

  // Có tài khoản local (email/password) trùng email nhưng CHƯA từng liên kết
  // Google — không tự gộp, yêu cầu người dùng đăng nhập bằng mật khẩu trước.
  const existingLocalUser = await User.findOne({ email: payload.email });
  if (existingLocalUser) {
    const error = new Error(
      'An account with this email already exists. Please log in with your password to link Google sign-in from Settings.'
    );
    error.statusCode = 409;
    error.code = 'EMAIL_IN_USE';
    throw error;
  }

  // Tài khoản hoàn toàn mới, tạo qua Google.
  const username = await buildUniqueUsername(payload.email.split('@')[0]);
  const user = await User.create({
    username,
    email: payload.email,
    googleId: payload.sub,
    displayName: payload.name || username,
    avatar: payload.picture || '',
  });

  return { user, token: generateToken(user._id) };
};

/**
 * Generate password reset token and return it (raw, unhashed)
 * The hashed version is stored in DB.
 */
const forgotPassword = async (email) => {
  const user = await User.findOne({ email });

  if (!user) {
    const error = new Error('No account found with that email');
    error.statusCode = 404;
    throw error;
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

  // Set new password (will be hashed by pre-save hook)
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
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

  user.password = newPassword;
  await user.save();

  const token = generateToken(user._id);

  return { user, token };
};

module.exports = {
  register,
  login,
  loginWithGoogle,
  forgotPassword,
  resetPassword,
  changePassword,
  generateToken,
};
