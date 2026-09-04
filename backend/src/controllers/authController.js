const authService = require('../services/authService');
const emailService = require('../services/emailService');
const { clearPlaybackCookies } = require('../services/cloudfrontService');
const { t, languageOf } = require('../config/i18n');

/**
 * @route   POST /api/auth/logout
 * @desc    Thu hồi CloudFront Signed Cookie của phiên xem
 * @access  Public
 *
 * Xác thực bằng JWT vốn không cần máy chủ tham gia lúc đăng xuất, nhưng cookie
 * phát video thì có: chúng đặt `httpOnly` nên chỉ máy chủ mới xoá được. Không
 * có endpoint này, đăng xuất chỉ dọn localStorage còn quyền tải segment video
 * riêng tư vẫn nằm lại trong trình duyệt cho tới khi cookie hết hạn.
 *
 * Cố ý KHÔNG đặt sau middleware `auth`: người dùng hay bấm đăng xuất đúng lúc
 * token đã hết hạn hoặc vừa bị truất quyền, và đó chính là lúc cần dọn cookie
 * nhất. Endpoint chỉ xoá cookie của chính người gọi nên không cần danh tính.
 */
const logout = (req, res) => {
  clearPlaybackCookies(res);
  res.status(200).json({ success: true, message: t(req, 'auth.loggedOut') });
};

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
 * @route   POST /api/auth/google
 * @desc    Login or register via Google Sign-In (Google Identity Services)
 * @access  Public
 */
const googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;

    const { user, token } = await authService.loginWithGoogle(credential);

    res.status(200).json({
      success: true,
      message: 'Google login successful',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/link-google
 * @desc    Link Google sign-in to the currently authenticated account
 * @access  Private
 */
const linkGoogle = async (req, res, next) => {
  try {
    const { credential } = req.body;

    const { user } = await authService.linkGoogleAccount(req.user._id, credential);

    res.status(200).json({
      success: true,
      message: 'Google account linked successfully',
      data: { user },
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
  // Phan hoi duy nhat cho moi ket cuc.
  //
  // Endpoint nay phai khong tiet lo email co ton tai trong he thong hay
  // khong, nen ca ba truong hop — khong co tai khoan, gui mail thanh cong,
  // gui mail that bai — deu tra ve dung chuoi nay. Neu de truong hop gui
  // mail that bai tra 500 thi 500 do tu no da la bang chung tai khoan co
  // that, dung lo hong vua bit lai o duoi mot hinh thuc khac.
  //
  // Danh doi: nguoi dung gap su co ha tang mail se khong duoc bao gi. Su
  // co do duoc ghi log day du phia server de con phat hien duoc.
  const genericResponse = {
    success: true,
    message: t(req, 'auth.resetLinkSent'),
  };

  try {
    const { email } = req.body;

    const result = await authService.forgotPassword(email);

    if (!result) {
      return res.status(200).json(genericResponse);
    }

    const { user, resetToken } = result;

    // Build reset URL — must point to the FRONTEND page, not the backend API
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    try {
      await emailService.sendPasswordResetEmail(user.email, resetUrl, languageOf(req));
    } catch (emailError) {
      // Gui mail hong thi thu hoi token vua cap, tranh de lai mot token
      // dat lai mat khau con hieu luc ma nguoi dung khong bao gio nhan duoc.
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      console.error('❌ Email send failed:', emailError.message);
    }

    return res.status(200).json(genericResponse);
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
  googleAuth,
  linkGoogle,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
  logout,
};
