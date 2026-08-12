const security = require('eslint-plugin-security');

module.exports = [
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    plugins: {
      security,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        node: true,
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',

      // ── Phân tích tĩnh về bảo mật (SAST) ──────────────
      // Thay thế cho SonarQube: các quy tắc dưới đây phát hiện những mẫu mã
      // nguồn dễ dẫn tới lỗ hổng như thực thi lệnh hệ thống từ dữ liệu người
      // dùng, biểu thức chính quy có nguy cơ ReDoS, hay dùng bộ sinh số ngẫu
      // nhiên không an toàn cho mục đích mật mã.
      'security/detect-child-process': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-new-buffer': 'error',
    },
  },
];
