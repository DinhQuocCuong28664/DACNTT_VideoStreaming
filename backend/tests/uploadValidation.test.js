const express = require('express');
const request = require('supertest');
const {
  validateRequest,
  validateUploadMetadata,
  MAX_VIDEO_SIZE_BYTES,
} = require('../src/middleware/validateRequest');

/**
 * Kiểm thử ở mức HTTP cho lớp kiểm tra dữ liệu đầu vào của luồng tải video lên.
 *
 * Việc kiểm tra định dạng và dung lượng ở phía máy chủ là bắt buộc: nếu chỉ dựa
 * vào kiểm tra phía trình duyệt, người dùng hoàn toàn có thể gọi thẳng API để
 * lấy Pre-signed URL rồi tải lên tệp bất kỳ, biến kho lưu trữ S3 của hệ thống
 * thành nơi chứa dữ liệu tùy ý.
 */
const buildTestApp = () => {
  const app = express();
  app.use(express.json());

  app.post(
    '/api/videos/initiate-upload',
    validateRequest(['filename', 'mimetype']),
    validateUploadMetadata,
    (req, res) => res.status(201).json({ success: true })
  );

  return app;
};

describe('Kiểm tra dữ liệu đầu vào khi khởi tạo tải lên (HTTP)', () => {
  const app = buildTestApp();

  const validPayload = {
    filename: 'video-mau.mp4',
    mimetype: 'video/mp4',
    fileSize: 50 * 1024 * 1024,
  };

  it('nên chấp nhận yêu cầu hợp lệ', async () => {
    const res = await request(app).post('/api/videos/initiate-upload').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('nên trả về 400 khi thiếu trường bắt buộc', async () => {
    const res = await request(app)
      .post('/api/videos/initiate-upload')
      .send({ mimetype: 'video/mp4' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/filename/);
  });

  it('nên từ chối tệp không phải video (ví dụ PDF)', async () => {
    const res = await request(app)
      .post('/api/videos/initiate-upload')
      .send({ ...validPayload, mimetype: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('nên từ chối tệp ảnh giả dạng video', async () => {
    const res = await request(app)
      .post('/api/videos/initiate-upload')
      .send({ ...validPayload, mimetype: 'image/png' });

    expect(res.status).toBe(400);
  });

  it('nên từ chối tệp thực thi', async () => {
    const res = await request(app)
      .post('/api/videos/initiate-upload')
      .send({ ...validPayload, mimetype: 'application/x-msdownload' });

    expect(res.status).toBe(400);
  });

  it('nên chấp nhận các định dạng video phổ biến khác', async () => {
    const dinhDangHopLe = ['video/quicktime', 'video/x-matroska', 'video/webm'];

    for (const mimetype of dinhDangHopLe) {
      const res = await request(app)
        .post('/api/videos/initiate-upload')
        .send({ ...validPayload, mimetype });

      expect(res.status).toBe(201);
    }
  });

  it('nên từ chối tệp vượt quá dung lượng tối đa', async () => {
    const res = await request(app)
      .post('/api/videos/initiate-upload')
      .send({ ...validPayload, fileSize: MAX_VIDEO_SIZE_BYTES + 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/dung lượng/i);
  });

  it('nên chấp nhận tệp đúng bằng ngưỡng dung lượng tối đa', async () => {
    const res = await request(app)
      .post('/api/videos/initiate-upload')
      .send({ ...validPayload, fileSize: MAX_VIDEO_SIZE_BYTES });

    expect(res.status).toBe(201);
  });

  it('nên từ chối dung lượng âm hoặc bằng không', async () => {
    for (const fileSize of [0, -1]) {
      const res = await request(app)
        .post('/api/videos/initiate-upload')
        .send({ ...validPayload, fileSize });

      expect(res.status).toBe(400);
    }
  });

  it('nên từ chối dung lượng không phải số', async () => {
    const res = await request(app)
      .post('/api/videos/initiate-upload')
      .send({ ...validPayload, fileSize: 'rat-lon' });

    expect(res.status).toBe(400);
  });

  it('nên cho phép bỏ trống dung lượng vì trường này không bắt buộc', async () => {
    const { fileSize, ...khongCoDungLuong } = validPayload;

    const res = await request(app)
      .post('/api/videos/initiate-upload')
      .send(khongCoDungLuong);

    expect(res.status).toBe(201);
    expect(fileSize).toBeDefined();
  });
});
