const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * @route   GET /api/users/:id
 * @desc    Get a user's public profile (Channel page header)
 *          Works even if the user has zero videos, unlike deriving the
 *          channel owner info from the first video's populated `user` field.
 * @access  Public
 */
const getPublicProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error('Invalid user ID');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(id).select(
      'username displayName avatar channelDescription createdAt'
    );

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPublicProfile };
