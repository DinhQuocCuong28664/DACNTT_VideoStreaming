const fs = require('fs');
const path = require('path');

/**
 * Lớp I/O cục bộ cho pipeline chia đoạn, cùng giao diện với chunked/s3io.js: "bucket raw" và
 * "bucket processed" là hai thư mục, "URL ký sẵn" là đường dẫn tệp. Dùng để chạy toàn bộ pipeline
 * bằng ffmpeg thật mà không cần AWS (scripts/verify-pipeline.js và kiểm thử).
 */
const createLocalIo = ({ root, sourcePath, workPrefix = 'work' }) => {
  const rawRoot = path.join(root, 'raw-bucket');
  const processedRoot = path.join(root, 'processed-bucket');
  const inRaw = (key) => path.join(rawRoot, key);
  const inProcessed = (key) => path.join(processedRoot, key);

  const write = (target, data) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  };
  const copy = (from, to) => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  };

  return {
    rawRoot,
    processedRoot,
    workKey: (videoId, name) => `${workPrefix}/${videoId}/${name}`,

    sourceUrl: async () => sourcePath,
    workUrl: async (key) => inRaw(key),

    putWorkJson: async (key, value) => write(inRaw(key), JSON.stringify(value)),
    getWorkJson: async (key) => (fs.existsSync(inRaw(key)) ? JSON.parse(fs.readFileSync(inRaw(key), 'utf-8')) : null),
    putWorkFile: async (localPath, key) => copy(localPath, inRaw(key)),
    deleteWork: async (keys) => {
      for (const key of keys) fs.rmSync(inRaw(key), { force: true });
    },

    uploadProcessedDir: async (localDir, prefix) => {
      fs.cpSync(localDir, inProcessed(prefix), { recursive: true });
    },
    putProcessedFile: async (localPath, key) => copy(localPath, inProcessed(key)),
  };
};

module.exports = { createLocalIo };
