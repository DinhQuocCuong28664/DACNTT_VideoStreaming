const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      // Tài khoản đăng nhập qua Google không có mật khẩu cục bộ.
      required: [
        function () {
          return !this.googleId;
        },
        'Password is required',
      ],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Do not return password by default in queries
    },
    // ID định danh (sub claim) từ Google ID token — dùng để nhận diện tài
    // khoản đăng nhập qua Google mà không phụ thuộc vào email.
    googleId: {
      type: String,
      unique: true,
      sparse: true, // cho phép nhiều user có googleId = null/undefined
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: [50, 'Display name cannot exceed 50 characters'],
    },
    avatar: {
      type: String,
      default: '',
    },
    channelDescription: {
      type: String,
      default: '',
      maxlength: [1000, 'Channel description cannot exceed 1000 characters'],
    },
    subscribers: {
      type: Number,
      default: 0,
    },
    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    /**
     * Thoi diem mat khau duoc doi lan gan nhat.
     *
     * Middleware xac thuc so truong nay voi claim `iat` cua JWT de tu choi
     * moi token cap TRUOC lan doi mat khau. Neu khong co no, doi mat khau
     * chi cap them token moi chu khong vo hieu hoa token cu — nghia la
     * nguoi chiem duoc tai khoan van truy cap duoc den khi token het han
     * (mac dinh 7 ngay), dung vao luc nan nhan tuong minh vua khoa lai
     * tai khoan.
     *
     * De trong voi tai khoan chua tung doi mat khau; middleware bo qua
     * kiem tra khi truong nay undefined.
     */
    passwordChangedAt: Date,
  },
  {
    timestamps: true, // Auto-create createdAt and updatedAt
  }
);

// Pre-save hook: Hash password before saving
// Note: Mongoose 9+ async hooks do NOT receive `next`. Just return or throw.
userSchema.pre('save', async function () {
  // Only hash if password is modified (or new)
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  // Ghi nhan moc doi mat khau de vo hieu hoa cac JWT cap truoc do.
  //
  // Bo qua khi tao tai khoan moi: luc dang ky chua co token nao can vo
  // hieu hoa, va de moc nay trong se don gian hon.
  //
  // Tru di 1 giay la co y. Claim `iat` cua JWT tinh bang GIAY (lam tron
  // xuong), con Date o day tinh bang MILI giay. Token cap ngay sau khi
  // doi mat khau se co iat = floor(t/1000), nho hon t neu t co phan le —
  // khong tru bu thi chinh token vua cap cho nguoi dung se bi tu choi
  // ngay lap tuc.
  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
});

// Instance method: Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Instance method: Generate password reset token
userSchema.methods.generateResetToken = function () {
  // Generate a random token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash the token and store in DB (do not store raw token)
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expiry: 15 minutes from now
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

  // Return the raw (unhashed) token — this is sent to user's email
  return resetToken;
};

// Remove sensitive fields when converting to JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpire;
  delete user.__v;
  return user;
};

module.exports = mongoose.model('User', userSchema);
