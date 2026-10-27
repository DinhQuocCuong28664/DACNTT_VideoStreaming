const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { writeKeyInfo, segmentIvs, sequenceIv, decryptSegmentToTemp } = require('../src/hlsKey');

describe('segmentIvs', () => {
  it('uses the IV attribute of the key tag in force', () => {
    const ivs = segmentIvs(
      [
        '#EXTM3U',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-KEY:METHOD=AES-128,URI="https://k",IV=0x0000000000000000000000000000000a',
        '#EXTINF:6.000000,',
        'a.ts',
        '#EXT-X-KEY:METHOD=AES-128,URI="https://k",IV=0X000000000000000000000000000000FF',
        '#EXTINF:6.000000,',
        'b.ts',
      ].join('\r\n')
    );

    expect(ivs.get('a.ts').toString('hex')).toBe('0000000000000000000000000000000a');
    expect(ivs.get('b.ts').toString('hex')).toBe('000000000000000000000000000000ff');
  });

  it('falls back to each segment\'s media sequence number (RFC 8216 §5.2)', () => {
    const ivs = segmentIvs(
      ['#EXTM3U', '#EXT-X-MEDIA-SEQUENCE:7', '#EXT-X-KEY:METHOD=AES-128,URI="https://k"', '#EXTINF:6,', 'a.ts', '#EXTINF:6,', 'b.ts'].join('\n')
    );

    expect(ivs.get('a.ts')).toEqual(sequenceIv(7));
    expect(ivs.get('b.ts')).toEqual(sequenceIv(8));
  });
});

describe('decryptSegmentToTemp', () => {
  it('returns the plaintext of an AES-128-CBC segment and removes it afterwards', () => {
    const key = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const plaintext = Buffer.alloc(188 * 3, 0x47);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-enc-'));
    const segment = path.join(dir, 'segment_000.ts');
    fs.writeFileSync(segment, Buffer.concat([cipher.update(plaintext), cipher.final()]));
    try {
      const plain = decryptSegmentToTemp(segment, key, iv);
      expect(fs.readFileSync(plain.path)).toEqual(plaintext);
      plain.remove();
      expect(fs.existsSync(plain.path)).toBe(false);
      expect(() => decryptSegmentToTemp(segment, crypto.randomBytes(16), iv)).toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

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
