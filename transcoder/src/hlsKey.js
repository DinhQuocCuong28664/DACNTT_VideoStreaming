const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Key files for HLS AES-128 (RFC 8216 §5.2), shared by the single-job and the
 * chunked paths.
 *
 * ffmpeg reads the key from a file named in its key info file. Both files
 * live in a directory of their own under the OS temp directory, never in the
 * output directory: that directory is uploaded to the processed bucket, so a
 * key left behind by a failed cleanup would be published next to the segments
 * it protects.
 */

const toHex = (iv) => (Buffer.isBuffer(iv) ? iv.toString('hex') : iv);

/**
 * Write the key and ffmpeg's key info file (key URI, key path, optional IV).
 *
 * @param {{key: Buffer, uri: string, iv?: Buffer|string}} encryption
 * @returns {{keyInfoPath: string, remove: Function}} remove() deletes both files
 */
const writeKeyInfo = ({ key, uri, iv }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-key-'));
  const keyPath = path.join(dir, 'enc.key');
  const keyInfoPath = path.join(dir, 'enc.keyinfo');
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  fs.writeFileSync(keyInfoPath, `${uri}\n${keyPath}\n${iv ? `${toHex(iv)}\n` : ''}`, 'utf-8');

  const remove = () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      // Outside the output directory, so a leftover is never uploaded; the
      // container's disk goes away with the task.
      console.warn(`⚠️  Could not remove the HLS key directory ${dir}: ${err.message}`);
    }
  };
  return { keyInfoPath, remove };
};

/** A 128-bit big-endian IV holding a media sequence number. */
const sequenceIv = (sequence) => {
  const iv = Buffer.alloc(16);
  iv.writeBigUInt64BE(BigInt(sequence), 8);
  return iv;
};

/**
 * The IV of every segment of a media playlist, by segment URI.
 *
 * RFC 8216 §5.2: a segment uses the IV attribute of the EXT-X-KEY tag in force,
 * and without one its own media sequence number. ffmpeg writes the attribute
 * even when it chose the IV itself, so this is mostly the first case.
 *
 * @returns {Map<string, Buffer>}
 */
const segmentIvs = (playlistText) => {
  const ivs = new Map();
  let sequence = 0;
  let explicitIv = null;
  for (const raw of playlistText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      sequence = Number(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length));
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const match = line.match(/IV=0[xX]([0-9a-fA-F]{32})/);
      explicitIv = match ? Buffer.from(match[1], 'hex') : null;
    } else if (line && !line.startsWith('#')) {
      ivs.set(line, explicitIv || sequenceIv(sequence));
      sequence += 1;
    }
  }
  return ivs;
};

/**
 * Decrypt one AES-128 segment (CBC, PKCS7 padding) into a temporary file, for
 * tools such as ffprobe that cannot read the encrypted one.
 *
 * @returns {{path: string, remove: Function}}
 */
const decryptSegmentToTemp = (segmentPath, key, iv) => {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(fs.readFileSync(segmentPath)), decipher.final()]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-plain-'));
  const plainPath = path.join(dir, path.basename(segmentPath));
  fs.writeFileSync(plainPath, plain);
  return { path: plainPath, remove: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

module.exports = { writeKeyInfo, segmentIvs, sequenceIv, decryptSegmentToTemp };
