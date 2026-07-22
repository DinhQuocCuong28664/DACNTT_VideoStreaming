const authService = require('../services/authService');

const registerUser = async (req, res, next) => {
  try {
    const { username, email, password, displayName } = req.body;
    const result = await authService.registerUser({ username, email, password, displayName });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser({ email, password });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res) => {
  res.json({
    success: true,
    data: req.user,
  });
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
};
