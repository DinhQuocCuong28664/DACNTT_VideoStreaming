const { BatchClient, SubmitJobCommand } = require('@aws-sdk/client-batch');

/**
 * Nộp job con của pipeline chia đoạn vào AWS Batch.
 *
 * Mọi job con dùng CHUNG một job definition của transcoder (cùng image, cùng role, cùng
 * biến môi trường) và chỉ khác `command` qua `containerOverrides`. Nhờ vậy CI vẫn chỉ phải
 * đăng ký lại MỘT job definition khi có image mới (scripts/next-job-definition.py), thay vì
 * ba cái dễ lệch phiên bản với nhau.
 */

/** Giới hạn của Batch: array job có 2-10.000 phần tử, một job phụ thuộc tối đa 20 job khác. */
const MIN_ARRAY_SIZE = 2;
const MAX_ARRAY_SIZE = 10000;
const MAX_DEPENDENCIES = 20;

/** Tên job chỉ gồm chữ, số, gạch ngang, gạch dưới, tối đa 128 ký tự. */
const safeJobName = (name) => String(name).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 128);

/**
 * Dựng đầu vào SubmitJob. Hàm thuần để kiểm thử mà không cần AWS.
 *
 * @param {object} spec
 * @param {string} spec.jobQueue
 * @param {string} spec.jobDefinition - tên (không kèm revision) nên Batch luôn dùng bản mới nhất
 * @param {string} spec.name
 * @param {string[]} spec.command
 * @param {Object<string,string>} [spec.environment]
 * @param {string[]} [spec.dependsOn] - jobId; với array job cha thì chờ TẤT CẢ phần tử con
 * @param {number} [spec.arraySize]
 * @param {number} [spec.timeoutSeconds]
 */
const buildSubmitInput = ({ jobQueue, jobDefinition, name, command, environment = {}, dependsOn = [], arraySize, timeoutSeconds }) => {
  if (!jobQueue || !jobDefinition) {
    throw new Error('Thiếu hàng đợi hoặc job definition Batch (BATCH_JOB_QUEUE / BATCH_JOB_DEFINITION)');
  }
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error('Job con cần một command');
  }
  if (arraySize !== undefined && !(Number.isInteger(arraySize) && arraySize >= MIN_ARRAY_SIZE && arraySize <= MAX_ARRAY_SIZE)) {
    throw new Error(`Array job cần ${MIN_ARRAY_SIZE}-${MAX_ARRAY_SIZE} phần tử, nhận ${arraySize}`);
  }
  if (dependsOn.length > MAX_DEPENDENCIES) {
    throw new Error(`Một job chỉ phụ thuộc tối đa ${MAX_DEPENDENCIES} job khác, nhận ${dependsOn.length}`);
  }

  const input = {
    jobName: safeJobName(name),
    jobQueue,
    jobDefinition,
    containerOverrides: {
      command,
      environment: Object.entries(environment).map(([key, value]) => ({ name: key, value: String(value) })),
    },
  };
  if (dependsOn.length > 0) input.dependsOn = dependsOn.map((jobId) => ({ jobId }));
  if (arraySize !== undefined) input.arrayProperties = { size: arraySize };
  if (timeoutSeconds) input.timeout = { attemptDurationSeconds: timeoutSeconds };
  return input;
};

/**
 * Bộ nộp job dùng thông tin xác thực mặc định của task role (hoặc khoá cục bộ khi chạy thử).
 * Trả về hàm `submit(spec) → jobId`.
 */
const createBatchSubmitter = ({ jobQueue, jobDefinition, region, client } = {}) => {
  const batchClient = client || new BatchClient({ region });
  return async (spec) => {
    const input = buildSubmitInput({ jobQueue, jobDefinition, ...spec });
    const response = await batchClient.send(new SubmitJobCommand(input));
    return response.jobId;
  };
};

module.exports = {
  buildSubmitInput,
  createBatchSubmitter,
  safeJobName,
  MIN_ARRAY_SIZE,
  MAX_ARRAY_SIZE,
  MAX_DEPENDENCIES,
};
