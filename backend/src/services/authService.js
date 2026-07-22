const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

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
  forgotPassword,
  resetPassword,
  changePassword,
  generateToken,
};
