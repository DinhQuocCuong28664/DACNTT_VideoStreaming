const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeKeyInfo } = require('../src/hlsKey');

describe('writeKeyInfo', () => {
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const uri = 'https://api.example.test/api/videos/v1/key';

  it('writes the key and key info outside any output directory and removes them', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-out-'));
    try {
      const files = writeKeyInfo({ key, uri });
      const [line1, line2, line3] = fs.readFileSync(files.keyInfoPath, 'utf-8').split('\n');

      expect(line1).toBe(uri);
      expect(fs.readFileSync(line2)).toEqual(key);
      expect(line3).toBe('');
      expect(path.relative(outputDir, files.keyInfoPath).startsWith('..')).toBe(true);
      expect(fs.readdirSync(outputDir)).toEqual([]);

      files.remove();
      expect(fs.existsSync(files.keyInfoPath)).toBe(false);
      expect(fs.existsSync(line2)).toBe(false);
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('writes the IV as hex whether it is given as a Buffer or a string', () => {
    const iv = Buffer.from('0f0e0d0c0b0a09080706050403020100', 'hex');
    const fromBuffer = writeKeyInfo({ key, uri, iv });
    const fromString = writeKeyInfo({ key, uri, iv: iv.toString('hex') });
    try {
      expect(fs.readFileSync(fromBuffer.keyInfoPath, 'utf-8').split('\n')[2]).toBe(iv.toString('hex'));
      expect(fs.readFileSync(fromString.keyInfoPath, 'utf-8').split('\n')[2]).toBe(iv.toString('hex'));
    } finally {
      fromBuffer.remove();
      fromString.remove();
    }
  });

  it('logs instead of throwing when the files cannot be removed', () => {
    const files = writeKeyInfo({ key, uri });
    const rm = jest.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('EBUSY');
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => files.remove()).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('EBUSY'));
    } finally {
      rm.mockRestore();
      warn.mockRestore();
      files.remove();
    }
  });
});
