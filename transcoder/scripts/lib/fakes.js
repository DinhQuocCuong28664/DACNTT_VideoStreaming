/**
 * Đối tượng giả cho MongoDB, email và Batch, dùng để chạy pipeline chia đoạn mà không cần dịch vụ thật.
 * Hành vi bám sát dbHandler.js thật (ghi có điều kiện theo status), chỉ khác là lưu trong bộ nhớ.
 */

const createFakeDb = ({ status = 'UPLOADING', exists = true } = {}) => {
  const state = { exists, status, hlsUrl: null, thumbnailUrl: null, duration: null, moderation: null, error: null };
  const calls = [];

  const db = {
    state,
    calls,

    getVideo: async (id) => {
      calls.push(['getVideo', id]);
      return state.exists ? { _id: id, status: state.status, title: 'test' } : null;
    },
    markVideoProcessing: async (id) => {
      calls.push(['markVideoProcessing', id]);
      if (!state.exists || state.status === 'READY') return { updated: false };
      state.status = 'PROCESSING';
      return { updated: true };
    },
    // Khớp touchVideoProcessing thật: chỉ "sống" khi đang PROCESSING, không hồi sinh ERROR.
    touchVideoProcessing: async (id) => {
      calls.push(['touchVideoProcessing', id]);
      if (state.exists && state.status === 'PROCESSING') return { alive: true, status: 'PROCESSING' };
      return { alive: false, status: state.exists ? state.status : null };
    },
    updateVideoReady: async (id, data) => {
      calls.push(['updateVideoReady', id]);
      if (!state.exists) throw new Error(`Video not found: ${id}`);
      if (state.status === 'READY') return { updated: false };
      Object.assign(state, { status: 'READY', hlsUrl: data.hlsUrl, thumbnailUrl: data.thumbnailUrl, duration: data.duration, moderation: data.moderation });
      return { updated: true };
    },
    updateVideoError: async (id, message) => {
      calls.push(['updateVideoError', id, message]);
      if (!state.exists || state.status === 'READY') return { updated: false };
      state.status = 'ERROR';
      state.error = message;
      return { updated: true };
    },
  };
  return db;
};

const createFakeNotify = () => {
  const sent = { ready: [], failed: [] };
  return {
    sent,
    videoReady: async (videoId, moderation) => sent.ready.push({ videoId, moderation }),
    videoFailed: async (videoId) => sent.failed.push({ videoId }),
  };
};

/** Bộ nộp job giả: ghi lại từng spec và trả về jobId tăng dần. */
const createFakeSubmit = () => {
  const specs = [];
  const submit = async (spec) => {
    specs.push(spec);
    return `job-${specs.length}`;
  };
  submit.specs = specs;
  return submit;
};

module.exports = { createFakeDb, createFakeNotify, createFakeSubmit };
