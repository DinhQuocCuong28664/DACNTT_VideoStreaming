const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

const registerUser = async ({ username, email, password, displayName }) => {
  const userExists = await User.findOne({ $or: [{ email }, { username }] });

  if (userExists) {
    const field = userExists.email === email ? 'Email' : 'Username';
    const error = new Error(`${field} is already registered`);
    error.statusCode = 400;
    throw error;
  }

  const user = await User.create({
    username,
    email,
    password,
    displayName: displayName || username,
  });

  const token = generateToken(user._id);

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar,
    token,
  };
};

const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user._id);

  return {
    _id: user._id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar,
    token,
  };
};

module.exports = {
  registerUser,
  loginUser,
  generateToken,
};
