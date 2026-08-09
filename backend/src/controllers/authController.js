const authService = require('../services/authService');
const emailService = require('../services/emailService');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const registerUser = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    const { user, token } = await authService.register(
      username,
      email,
      password
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { user, token } = await authService.login(email, password);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged-in user profile
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: { user: req.user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const { user, resetToken } = await authService.forgotPassword(email);

    // Build reset URL — must point to the FRONTEND page, not the backend API
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    // Send email
    try {
      await emailService.sendPasswordResetEmail(user.email, resetUrl);

      res.status(200).json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (emailError) {
      // If email fails, clear the reset token from DB
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      console.error('❌ Email send failed:', emailError.message);
      const error = new Error('Email could not be sent. Please try again later.');
      error.statusCode = 500;
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/reset-password/:token
 * @desc    Reset password using token from email
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token: resetToken } = req.params;
    const { password } = req.body;

    const { user, token } = await authService.resetPassword(
      resetToken,
      password
    );

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change password (authenticated user)
 * @access  Private
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const { user, token } = await authService.changePassword(
      req.user._id,
      currentPassword,
      newPassword
    );

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
};
