const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Token co duoc cap TRUOC lan doi mat khau gan nhat khong?
 *
 * JWT o day khong luu trang thai phia server, nen chu ky hop le khong du
 * de ket luan token con gia tri: doi mat khau phai truat quyen moi phien
 * da mo truoc do, neu khong thi thao tac "doi mat khau" khong duoi duoc
 * ke dang chiem tai khoan — dung luc no can lam duoc dieu do nhat.
 *
 * Tai khoan chua tung doi mat khau khong co `passwordChangedAt`, khi do
 * khong co gi de so sanh va token duoc chap nhan.
 */
const isTokenStale = (decoded, user) => {
  if (!user.passwordChangedAt || !decoded.iat) {
    return false;
  }

  // `iat` tinh bang giay, `passwordChangedAt` tinh bang mili giay.
  return decoded.iat * 1000 < user.passwordChangedAt.getTime();
};

/**
 * JWT Authentication Middleware (Required)
 * Reads token from Authorization header: "Bearer <token>"
 * Attaches user info to req.user for downstream handlers
 */
const auth = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized — no token provided',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized — user no longer exists',
      });
    }

    if (isTokenStale(decoded, user)) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized — password was changed, please log in again',
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Not authorized — invalid token',
    });
  }
};

/**
 * Optional Authentication Middleware
 * If token exists and is valid, attaches req.user.
 * If no token or invalid token, proceeds without error (req.user remains undefined).
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      // Cung ap dung kiem tra o day: neu khong, token da bi truat quyen van
      // duoc coi la dang nhap tren cac route dung optionalAuth (vd. xem video
      // rieng tu), khien viec doi mat khau chi co tac dung mot nua.
      if (user && !isTokenStale(decoded, user)) {
        req.user = user;
      }
    }

    next();
  } catch {
    // Proceed without req.user
    next();
  }
};

module.exports = auth;
module.exports.optionalAuth = optionalAuth;
