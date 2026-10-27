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

module.exports = { writeKeyInfo };
