/**
 * Request Validation Middleware Factory
 * Lightweight validation without external libraries (Joi, etc.)
 *
 * Usage:
 *   const { validateRequest } = require('../middleware/validateRequest');
 *   router.post('/register', validateRequest(['username', 'email', 'password']), controller);
 */

/**
 * Validate that required fields exist in request body
 * @param {string[]} requiredFields - Array of required field names
 */
const validateRequest = (requiredFields) => {
  return (req, res, next) => {
    const missing = [];

    for (const field of requiredFields) {
      if (
        req.body[field] === undefined ||
        req.body[field] === null ||
        req.body[field] === ''
      ) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Validate email format
 */
const validateEmail = (req, res, next) => {
  if (req.body.email) {
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }
  }
  next();
};

module.exports = { validateRequest, validateEmail };
