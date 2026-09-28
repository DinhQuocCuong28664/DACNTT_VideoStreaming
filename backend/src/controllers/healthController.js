const mongoose = require('mongoose');

/** mongoose.connection.readyState: 1 = connected (0 disconnected, 2 connecting, 3 disconnecting). */
const CONNECTED = 1;

/**
 * @route   GET /
 * @desc    Health check dạng readiness: API có phục vụ được người dùng không
 * @access  Public
 *
 * Trước đây endpoint luôn trả 200 miễn là tiến trình Node còn sống, kể cả khi
 * mất kết nối MongoDB — lúc đó mọi request thật đều lỗi mà canary vẫn báo
 * xanh. Ba nơi đọc endpoint này đều hỏi "người dùng có dùng được không": canary
 * giám sát (modules/monitoring/src/health-check.mjs), bước kiểm tra sau deploy
 * (cd-deploy.yml) và scripts/start-backend.sh. Tài liệu Kubernetes gọi đó là
 * readiness và xếp kiểm tra phụ thuộc như DB vào đúng loại này.
 *
 * Không nơi nào tự khởi động lại tiến trình dựa trên endpoint này (pm2 chỉ
 * khởi động lại khi tiến trình chết), nên trả 503 khi DB mất không gây vòng
 * khởi động lại dây chuyền mà tài liệu đó cảnh báo cho liveness probe.
 *
 * @param {() => number} readyState - tiêm vào để test; mặc định đọc từ mongoose
 */
const buildHealthCheck = (readyState = () => mongoose.connection.readyState) => (req, res) => {
  const databaseUp = readyState() === CONNECTED;

  res.status(databaseUp ? 200 : 503).json({
    message: databaseUp ? 'DACNTT Video Streaming API is running...' : 'API is up but cannot reach MongoDB',
    database: databaseUp ? 'connected' : 'disconnected',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
};

module.exports = { buildHealthCheck, healthCheck: buildHealthCheck() };
