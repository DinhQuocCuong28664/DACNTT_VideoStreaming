/**
 * Kiểm thử emailService — thông báo video sẵn sàng/thất bại.
 *
 * Trọng tâm: (1) gửi đúng người, đúng nội dung; (2) email báo lỗi TUYỆT ĐỐI
 * không được để lộ nội dung lỗi kỹ thuật thô (có thể chứa đường dẫn hệ thống
 * nội bộ) — chỉ hiển thị thông điệp thân thiện chung chung.
 */

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-message-id' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

jest.mock('../src/config', () => ({
  frontendUrl: 'https://zelostech.site',
  email: {
    host: 'smtp.gmail.com',
    port: 587,
    user: 'test@gmail.com',
    appPassword: 'fake-app-password',
    from: 'DACNTT Video Platform <noreply@zelostech.site>',
  },
}));

const { sendVideoReadyEmail, sendVideoFailedEmail } = require('../src/emailService');

describe('emailService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendVideoReadyEmail', () => {
    it('nên gửi tới đúng địa chỉ email người nhận', async () => {
      await sendVideoReadyEmail('user@example.com', {
        title: 'Video test',
        videoId: 'vid123',
        displayName: 'Nguyễn Văn A',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail.mock.calls[0][0].to).toBe('user@example.com');
    });

    it('nên có chủ đề báo thành công và chứa link xem video đúng videoId', async () => {
      await sendVideoReadyEmail('user@example.com', {
        title: 'Video test',
        videoId: 'vid123',
        displayName: 'Nguyễn Văn A',
      });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toMatch(/sẵn sàng/i);
      expect(mail.html).toContain('https://zelostech.site/watch/vid123');
      expect(mail.html).toContain('Video test');
      expect(mail.html).toContain('Nguyễn Văn A');
    });

    it('nên dùng lời chào chung khi không có displayName', async () => {
      await sendVideoReadyEmail('user@example.com', {
        title: 'Video test',
        videoId: 'vid123',
      });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).toContain('Xin chào,');
    });
  });

  describe('sendVideoFailedEmail', () => {
    it('nên có chủ đề báo thất bại và nhắc tên video', async () => {
      await sendVideoFailedEmail('user@example.com', {
        title: 'Video lỗi',
        displayName: 'Nguyễn Văn A',
      });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.to).toBe('user@example.com');
      expect(mail.subject).toMatch(/thất bại/i);
      expect(mail.html).toContain('Video lỗi');
    });

    it('KHÔNG được để lộ nội dung lỗi kỹ thuật thô trong email', async () => {
      const rawTechnicalError =
        'ffmpeg exited with code 1: /tmp/vidshare-transcoder/abc123/input/file.mp4: No such file or directory at /app/src/transcoder.js:216';

      // Hàm sendVideoFailedEmail không hề nhận errorMessage làm tham số —
      // đây chính là điểm kiểm chứng: dù lỗi gốc có nội dung nhạy cảm này,
      // hàm gửi email không có cách nào vô tình chèn nó vào nội dung mail.
      await sendVideoFailedEmail('user@example.com', {
        title: 'Video lỗi',
        displayName: 'Nguyễn Văn A',
      });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).not.toContain(rawTechnicalError);
      expect(mail.html).not.toContain('/tmp/');
      expect(mail.html).not.toContain('ffmpeg exited');
      expect(mail.html).not.toContain('.js:');
    });

    it('nên dùng lời chào chung khi không có displayName', async () => {
      await sendVideoFailedEmail('user@example.com', { title: 'Video lỗi' });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).toContain('Xin chào,');
    });
  });
});
