/**
 * Tải một tệp lớn lên S3 theo từng phần (multipart), song song và có thử lại.
 *
 * Thuần logic, không import gì của ứng dụng (axios, React): cách gọi mạng được
 * truyền vào, nên chạy và test được trong Node. Nối với API thật ở
 * `videoApi.uploadToS3Multipart`.
 *
 * Vì sao cấp URL theo nhóm, ngay trước khi tải: máy chủ ký URL bằng credential của
 * role EC2, vốn xoay vòng, nên URL ký sớm có thể hết hạn chỉ sau vài phút. Mỗi lần
 * cần URL của một phần chưa có, module xin luôn vài phần kế tiếp (tối đa
 * `maxPartUrlsPerRequest`) để một tệp 20 GB không cần 640 lần gọi API; phần nào
 * hỏng và phải thử lại thì xin URL mới.
 */

export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 1000;

/** Cùng hình dạng với lỗi huỷ của axios, để chỗ gọi chỉ cần một nhánh xử lý. */
const cancelledError = () =>
  Object.assign(new Error('Upload cancelled'), { name: 'CanceledError', code: 'ERR_CANCELED' });

const defaultSleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelledError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * @param {object} options
 * @param {Blob} options.file - tệp cần tải (cần `size` và `slice`)
 * @param {number} options.partSize - kích thước mỗi phần, do máy chủ quyết định
 * @param {number} options.partCount - số phần, do máy chủ quyết định
 * @param {number} [options.maxPartUrlsPerRequest=10] - số URL tối đa xin mỗi lần
 * @param {(partNumbers: number[]) => Promise<Array<{partNumber: number, url: string, size: number}>>} options.getPartUrls
 * @param {(args: {url: string, body: Blob, signal?: AbortSignal, onProgress: (loadedBytes: number) => void}) => Promise<void>} options.putPart
 * @param {() => Promise<unknown>} options.completeUpload - máy chủ liệt kê, kiểm tra và ghép
 * @param {(p: {loaded: number, total: number, percent: number}) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.concurrency]
 * @param {number} [options.maxAttempts] - số lần thử mỗi phần
 * @param {(ms: number, signal?: AbortSignal) => Promise<void>} [options.sleep] - tiêm vào để test
 */
export const uploadInParts = async ({
  file,
  partSize,
  partCount,
  maxPartUrlsPerRequest = 10,
  getPartUrls,
  putPart,
  completeUpload,
  onProgress,
  signal,
  concurrency = DEFAULT_CONCURRENCY,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  sleep = defaultSleep,
}) => {
  const total = file.size;
  const loadedByPart = new Map();
  const done = new Set();
  const urls = new Map();
  const inflight = new Map();
  let nextPart = 1;
  let failure = null;

  const reportProgress = () => {
    if (!onProgress) return;
    let loaded = 0;
    for (const bytes of loadedByPart.values()) loaded += bytes;
    loaded = Math.min(loaded, total);
    const percent = total > 0 ? Math.min(100, Math.round((loaded * 100) / total)) : 0;
    onProgress({ loaded, total, percent });
  };

  const expectedSize = (partNumber) => Math.min(partSize, total - (partNumber - 1) * partSize);

  const fetchUrls = (partNumbers) => {
    const request = getPartUrls(partNumbers).then((parts) => {
      for (const part of parts) urls.set(part.partNumber, part);
    });
    const tracked = request.finally(() => partNumbers.forEach((n) => inflight.delete(n)));
    partNumbers.forEach((n) => inflight.set(n, tracked));
    return tracked;
  };

  /** URL của một phần; xin cả vài phần kế tiếp chưa tải để dùng chung một lần gọi. */
  const ensureUrl = async (partNumber) => {
    while (!urls.has(partNumber)) {
      if (inflight.has(partNumber)) {
        await inflight.get(partNumber);
        continue;
      }
      const batch = [partNumber];
      for (let n = partNumber + 1; n <= partCount && batch.length < maxPartUrlsPerRequest; n += 1) {
        if (!done.has(n) && !urls.has(n) && !inflight.has(n)) batch.push(n);
      }
      await fetchUrls(batch);
      if (!urls.has(partNumber)) {
        // Máy chủ trả danh sách thiếu đúng phần cần: không xin lại vô hạn.
        throw new Error(`The server returned no upload URL for part ${partNumber}`);
      }
    }
    return urls.get(partNumber);
  };

  const uploadPart = async (partNumber) => {
    const start = (partNumber - 1) * partSize;
    const size = expectedSize(partNumber);
    const body = file.slice(start, start + size);

    for (let attempt = 1; ; attempt += 1) {
      if (signal?.aborted) throw cancelledError();
      try {
        const part = await ensureUrl(partNumber);
        if (part.size !== size) {
          // Máy chủ và trình duyệt chia phần khác nhau: thử lại cũng không đổi.
          throw Object.assign(new Error(`Part ${partNumber} size mismatch`), { retryable: false });
        }
        await putPart({
          url: part.url,
          body,
          signal,
          onProgress: (loadedBytes) => {
            loadedByPart.set(partNumber, Math.min(loadedBytes, size));
            reportProgress();
          },
        });
        loadedByPart.set(partNumber, size);
        done.add(partNumber);
        urls.delete(partNumber);
        reportProgress();
        return;
      } catch (err) {
        if (signal?.aborted || err.code === 'ERR_CANCELED' || err.name === 'CanceledError') throw cancelledError();
        loadedByPart.set(partNumber, 0);
        urls.delete(partNumber); // URL có thể đã hết hạn: lần sau xin URL mới
        if (err.retryable === false || attempt >= maxAttempts) {
          throw Object.assign(new Error(`Part ${partNumber} failed after ${attempt} attempt(s): ${err.message}`), { cause: err });
        }
        await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1), signal);
      }
    }
  };

  const worker = async () => {
    while (!failure && !signal?.aborted && nextPart <= partCount) {
      const partNumber = nextPart;
      nextPart += 1;
      try {
        await uploadPart(partNumber);
      } catch (err) {
        failure = failure || err;
        return;
      }
    }
  };

  if (signal?.aborted) throw cancelledError();
  await Promise.all(Array.from({ length: Math.min(concurrency, partCount) }, worker));

  if (failure) throw failure;
  if (signal?.aborted) throw cancelledError();

  await completeUpload();
  loadedByPart.clear();
  onProgress?.({ loaded: total, total, percent: 100 });
};
