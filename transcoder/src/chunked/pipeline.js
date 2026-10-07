const fs = require('fs');
const os = require('os');
const path = require('path');
const defaultConfig = require('../config');
const { planRenditions, probeSegmentCodecs, firstSegmentPath, extractThumbnail, buildMasterPlaylist } = require('../transcoder');
const { runWithConcurrency } = require('../s3Handler');
const { buildChunkPlan, audioBitratesFor } = require('./plan');
const { buildAudioArgs, buildChunkArgs, chunkLabel } = require('./ffmpegArgs');
const { evaluateEligibility, planningInputs } = require('./probe');
const {
  readChunkRendition,
  buildMediaPlaylist,
  collectSegments,
  renditionStats,
  validateChunkResults,
} = require('./playlist');
const { withAttempts } = require('./run');

/**
 * Điều phối bốn vai của pipeline chia đoạn (docs/CHUNKED_TRANSCODING_DESIGN.md §3):
 *
 *   plan      đọc nguồn, quyết định có chia đoạn không, ghi kế hoạch, nộp job con rồi thoát
 *   audio     mã hoá MỘT lần toàn bộ âm thanh ở một bitrate
 *   chunk     mã hoá một đoạn của mọi mức (array job, mỗi phần tử một đoạn)
 *   finalize  ghép playlist, đo BANDWIDTH, thumbnail, kiểm duyệt, đánh dấu READY
 *
 * Mọi thứ chạm AWS hay MongoDB đều được tiêm qua `deps` nên chạy được cục bộ bằng ffmpeg thật
 * (scripts/verify-pipeline.js) và kiểm thử được từng nhánh quyết định.
 *
 * @param {object} deps
 * @param {object} deps.io            - lớp I/O (s3io.js hoặc scripts/lib/localIo.js)
 * @param {object} deps.db            - getVideo, markVideoProcessing, touchVideoProcessing, updateVideoReady, updateVideoError
 * @param {Function} deps.submit      - nộp job Batch: (spec) → jobId
 * @param {Function} deps.probe       - (url) → bản tóm tắt ffprobe (chunked/probe.js)
 * @param {Function} deps.runFfmpeg   - ({args, label}) → Promise
 * @param {Function} deps.moderate    - (sourceUrl, duration, workDir) → kết quả kiểm duyệt
 * @param {object} deps.notify        - { videoReady(videoId, moderation), videoFailed(videoId) }
 * @param {object} [deps.config]
 * @param {string} [deps.tmpRoot]
 */
const createPipeline = (deps) => {
  const { io, db, submit, probe, runFfmpeg, moderate, notify } = deps;
  const config = deps.config || defaultConfig;
  const cfg = config.chunked;
  const tmpRoot = deps.tmpRoot || path.join(os.tmpdir(), 'vidshare-transcoder');

  const planKey = (videoId) => io.workKey(videoId, 'plan.json');
  const submittedKey = (videoId) => io.workKey(videoId, 'submitted.json');
  const audioKey = (videoId, bitrate) => io.workKey(videoId, `audio-${bitrate}.m4a`);
  const chunkResultKey = (videoId, index) => io.workKey(videoId, `chunks/${chunkLabel(index)}.json`);

  const scratch = (...parts) => {
    const dir = path.join(tmpRoot, ...parts);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const cleanup = (dir) => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`⚠️  Cleanup warning: ${err.message}`);
    }
  };

  /**
   * Chạy `fn`; nếu nó ném lỗi thì đánh dấu video ERROR (và báo chủ video) rồi ném tiếp.
   *
   * Job con thất bại hẳn phải tự đánh ERROR vì job ghép phụ thuộc vào nó sẽ KHÔNG chạy (Batch
   * bỏ qua job phụ thuộc vào job thất bại), nên sẽ không còn ai làm việc đó. Chỉ lỗi trong code
   * mới tới được đây; Spot bị thu hồi giết cả tiến trình nên Batch thử lại, không đánh ERROR.
   */
  const failVideoOnError = async (videoId, label, fn) => {
    try {
      return await fn();
    } catch (err) {
      console.error(`❌ ${label} failed for ${videoId}:`, err.message);
      const { updated } = await db.updateVideoError(videoId, `${label}: ${String(err.message).split('\n')[0]}`);
      if (updated) await notify.videoFailed(videoId);
      throw err;
    }
  };

  /** Job con chỉ làm việc khi video còn đang xử lý; xoá hoặc đã xong hoặc đã lỗi thì dừng sớm. */
  const requireAlive = async (videoId, role) => {
    const state = await db.touchVideoProcessing(videoId);
    if (!state.alive) {
      console.warn(`⚠️  ${role}: video ${videoId} is ${state.status || 'gone'}, nothing to do.`);
    }
    return state;
  };

  const loadPlan = async (videoId) => {
    const document = await io.getWorkJson(planKey(videoId));
    if (!document) throw new Error(`Không tìm thấy kế hoạch ${planKey(videoId)}`);
    return document;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // plan
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Quyết định đường xử lý của một video. Không bao giờ ném lỗi ở giai đoạn quyết định: mọi trục
   * trặc (không đọc được nguồn, nguồn VFR, video ngắn) đều lùi về đường một-job, vốn là hành vi
   * trước giờ. Chỉ sau khi đã nhận video (đánh PROCESSING) thì lỗi mới đánh ERROR.
   *
   * @returns {Promise<{mode: 'skipped'|'single'|'chunked', reason?: string, chunks?: number, jobs?: object}>}
   */
  const planJob = async ({ videoId, rawS3Key }) => {
    const video = await db.getVideo(videoId);
    if (!video) return { mode: 'skipped', reason: 'video no longer exists' };
    if (video.status === 'READY') return { mode: 'skipped', reason: 'video is already READY' };

    let summary;
    try {
      summary = await probe(await io.sourceUrl(rawS3Key));
    } catch (err) {
      return { mode: 'single', reason: `không đọc được nguồn qua HTTP: ${String(err.message).split('\n')[0]}` };
    }

    const duration = (summary.video && summary.video.duration) || summary.formatDuration || 0;
    if (!(duration > cfg.thresholdSeconds)) {
      return { mode: 'single', reason: `thời lượng ${Math.round(duration)}s không vượt ngưỡng ${cfg.thresholdSeconds}s` };
    }

    const verdict = evaluateEligibility(summary);
    if (!verdict.ok) {
      console.warn(`⚠️  Video dài ${Math.round(duration)}s nhưng không chia đoạn được (${verdict.reason}); dùng đường một-job.`);
      return { mode: 'single', reason: verdict.reason };
    }

    const inputs = planningInputs(summary);
    const plan = buildChunkPlan({
      ...inputs,
      segmentSeconds: config.ffmpeg.segmentDuration,
      gopsPerChunk: cfg.gopsPerChunk,
      tsOffsetBase: cfg.tsOffsetBase,
    });
    if (plan.chunks.length < 2) {
      return { mode: 'single', reason: `chỉ ra ${plan.chunks.length} đoạn, không đáng chia` };
    }

    if (await io.getWorkJson(submittedKey(videoId))) {
      return { mode: 'skipped', reason: 'pipeline for this video was already submitted (duplicate job)' };
    }

    // Từ đây là cam kết: video đã được nhận, lỗi nào cũng đánh ERROR.
    return failVideoOnError(videoId, 'plan', async () => {
      await db.markVideoProcessing(videoId);

      const renditions = planRenditions(summary.video.size, config.ffmpeg.renditions);
      const hasAudio = Boolean(summary.audio);
      const document = {
        version: 1,
        videoId,
        rawS3Key,
        createdAt: new Date().toISOString(),
        duration: inputs.duration,
        source: {
          videoStreamIndex: summary.video.index,
          audioStreamIndex: hasAudio ? summary.audio.index : null,
          width: summary.video.size && summary.video.size.width,
          height: summary.video.size && summary.video.size.height,
        },
        renditions,
        audio: hasAudio ? audioBitratesFor(renditions).map((bitrate) => ({ bitrate, key: audioKey(videoId, bitrate) })) : [],
        plan,
      };
      await io.putWorkJson(planKey(videoId), document);

      const environment = { VIDEO_ID: videoId, RAW_S3_KEY: rawS3Key };
      const audioJobIds = [];
      for (const track of document.audio) {
        audioJobIds.push(
          await submit({
            name: `audio-${track.bitrate}-${videoId}`,
            command: ['node', 'src/index.js', 'audio'],
            environment: { ...environment, AUDIO_BITRATE: track.bitrate },
            timeoutSeconds: cfg.longJobTimeoutSeconds,
          })
        );
      }
      const chunkJobId = await submit({
        name: `chunks-${videoId}`,
        command: ['node', 'src/index.js', 'chunk'],
        environment,
        arraySize: plan.chunks.length,
        dependsOn: audioJobIds,
      });
      const finalizeJobId = await submit({
        name: `finalize-${videoId}`,
        command: ['node', 'src/index.js', 'finalize'],
        environment,
        dependsOn: [chunkJobId],
        timeoutSeconds: cfg.longJobTimeoutSeconds,
      });

      const jobs = { audio: audioJobIds, chunks: chunkJobId, finalize: finalizeJobId };
      await io.putWorkJson(submittedKey(videoId), { jobs, submittedAt: new Date().toISOString() });

      console.log(
        `🧩 Video ${videoId} (${Math.round(duration)}s): ${plan.chunks.length} đoạn x ${plan.gopsPerChunk} GOP, ` +
          `${renditions.length} mức, ${audioJobIds.length} job âm thanh. Đã nộp ${audioJobIds.length + 2} job.`
      );
      return { mode: 'chunked', chunks: plan.chunks.length, jobs };
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // audio
  // ─────────────────────────────────────────────────────────────────────────

  const audioJob = async ({ videoId, rawS3Key, bitrate }) => {
    if (!(await requireAlive(videoId, 'audio')).alive) return { skipped: true };

    return failVideoOnError(videoId, `audio ${bitrate}`, async () => {
      const document = await loadPlan(videoId);
      const track = document.audio.find((a) => a.bitrate === bitrate);
      if (!track) throw new Error(`Kế hoạch không có bitrate âm thanh ${bitrate}`);

      const dir = scratch(`${videoId}-audio-${bitrate}`);
      try {
        const outputPath = path.join(dir, `audio-${bitrate}.m4a`);
        await withAttempts(cfg.ffmpegAttempts, `audio ${bitrate}`, async () =>
          runFfmpeg({
            label: `audio ${bitrate}`,
            args: buildAudioArgs({
              inputUrl: await io.sourceUrl(rawS3Key),
              streamIndex: document.source.audioStreamIndex,
              bitrate,
              outputPath,
            }),
          })
        );
        await io.putWorkFile(outputPath, track.key);
        await db.touchVideoProcessing(videoId);
        console.log(`🔊 Audio ${bitrate} → ${track.key} (${(fs.statSync(outputPath).size / 1048576).toFixed(1)} MB)`);
        return { skipped: false, key: track.key };
      } finally {
        cleanup(dir);
      }
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // chunk
  // ─────────────────────────────────────────────────────────────────────────

  const chunkJob = async ({ videoId, rawS3Key, index }) => {
    if (!(await requireAlive(videoId, `chunk ${index}`)).alive) return { skipped: true };

    return failVideoOnError(videoId, `chunk ${index}`, async () => {
      const document = await loadPlan(videoId);
      const { plan, renditions } = document;
      const chunk = plan.chunks[index];
      if (!chunk) throw new Error(`Kế hoạch chỉ có ${plan.chunks.length} đoạn, không có đoạn ${index}`);
      const isLast = index === plan.chunks.length - 1;

      const dir = scratch(`${videoId}-chunk-${chunkLabel(index)}`);
      try {
        const outputDir = path.join(dir, 'out');
        for (const r of renditions) fs.mkdirSync(path.join(outputDir, r.name), { recursive: true });

        await withAttempts(cfg.ffmpegAttempts, `chunk ${index}`, async () => {
          // Ký lại mọi URL ở MỖI lần thử: URL cũ có thể đã hết hạn, và đó chính là lý do thử lại.
          const audio = [];
          for (const track of document.audio) audio.push({ bitrate: track.bitrate, url: await io.workUrl(track.key) });
          return runFfmpeg({
            label: `chunk ${index}/${plan.chunks.length - 1}`,
            args: buildChunkArgs({
              videoUrl: await io.sourceUrl(rawS3Key),
              videoStreamIndex: document.source.videoStreamIndex,
              audio,
              renditions,
              chunk,
              gopFrames: plan.gopFrames,
              segmentSeconds: plan.segmentSeconds,
              outputDir,
            }),
          });
        });

        // Đọc kết quả TRƯỚC khi xoá playlist riêng của đoạn: bản playlist cuối do job ghép dựng.
        const result = { index, renditions: {}, finishedAt: new Date().toISOString() };
        for (const r of renditions) {
          const segments = readChunkRendition(path.join(outputDir, r.name));
          if (segments.length === 0 && !isLast) {
            throw new Error(`ffmpeg không sinh ra segment nào cho mức ${r.name}`);
          }
          result.renditions[r.name] = { segments };
        }

        // Chỉ đoạn 0 thăm dò CODECS: mọi đoạn dùng cùng cờ mã hoá nên chuỗi giống hệt nhau.
        if (index === 0) {
          result.codecs = {};
          for (const r of renditions) {
            const first = firstSegmentPath(path.join(outputDir, r.name));
            const codecs = first && (await probeSegmentCodecs(first));
            if (codecs) result.codecs[r.name] = codecs;
          }
        }

        for (const r of renditions) fs.rmSync(path.join(outputDir, r.name, 'playlist.m3u8'), { force: true });
        await io.uploadProcessedDir(outputDir, `videos/${videoId}`);

        // Ghi kết quả CUỐI CÙNG: có tệp này nghĩa là đoạn đã xong hẳn, kể cả phần upload.
        await io.putWorkJson(chunkResultKey(videoId, index), result);
        await db.touchVideoProcessing(videoId);

        const count = Object.values(result.renditions)[0].segments.length;
        console.log(`🧱 Chunk ${index}/${plan.chunks.length - 1}: ${count} segment x ${renditions.length} mức đã lên S3`);
        return { skipped: false, segments: count };
      } finally {
        cleanup(dir);
      }
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // finalize
  // ─────────────────────────────────────────────────────────────────────────

  const finalizeJob = async ({ videoId, rawS3Key }) => {
    const state = await requireAlive(videoId, 'finalize');
    if (!state.alive) {
      // Video đã bị xoá: dọn tệp tạm để không nằm lại tới khi lifecycle xoá (7 ngày). Phải nạp kế
      // hoạch trước vì chỉ nó biết khoá của âm thanh và của từng đoạn.
      if (state.status === null) {
        const document = await io.getWorkJson(planKey(videoId)).catch(() => null);
        await removeWorkFiles(videoId, document || undefined);
      }
      return { skipped: true };
    }

    return failVideoOnError(videoId, 'finalize', async () => {
      const startedAt = Date.now();
      const document = await loadPlan(videoId);
      const { plan, renditions } = document;
      const names = renditions.map((r) => r.name);

      const results = new Array(plan.chunks.length);
      await runWithConcurrency(plan.chunks, 8, async (chunk, k) => {
        results[k] = await io.getWorkJson(chunkResultKey(videoId, chunk.index));
      });

      const { errors, warnings } = validateChunkResults({ plan, results, renditionNames: names });
      for (const w of warnings) console.warn(`⚠️  ${w}`);
      if (errors.length > 0) {
        throw new Error(`Các đoạn không nhất quán, không công bố: ${errors.slice(0, 5).join('; ')}`);
      }

      const dir = scratch(`${videoId}-final`);
      try {
        const outputDir = path.join(dir, 'out');
        const stats = {};
        for (const r of renditions) {
          const segments = collectSegments(results, r.name);
          fs.mkdirSync(path.join(outputDir, r.name), { recursive: true });
          fs.writeFileSync(path.join(outputDir, r.name, 'playlist.m3u8'), buildMediaPlaylist(segments));
          stats[r.name] = renditionStats(segments);
        }

        const { content } = buildMasterPlaylist(renditions, stats, (results[0] && results[0].codecs) || {});
        fs.writeFileSync(path.join(outputDir, 'master.m3u8'), content);

        // Thumbnail và kiểm duyệt đọc nguồn qua HTTP (tua), không tải về.
        const sourceUrl = await io.sourceUrl(rawS3Key);
        const thumbnailPath = await extractThumbnail(sourceUrl, outputDir, document.duration);

        let moderation = null;
        if (config.moderation.enabled) {
          moderation = await moderate(sourceUrl, document.duration, dir);
        } else {
          console.warn('⚠️  MODERATION_ENABLED=false: this video will go public without content moderation.');
        }

        // master.m3u8 lên SAU CÙNG: hlsUrl trỏ vào nó, nên mọi thứ nó nhắc tới phải có mặt trước.
        const prefix = `videos/${videoId}`;
        for (const r of renditions) {
          await io.putProcessedFile(path.join(outputDir, r.name, 'playlist.m3u8'), `${prefix}/${r.name}/playlist.m3u8`);
        }
        if (thumbnailPath) await io.putProcessedFile(thumbnailPath, `${prefix}/thumbnail.jpg`);
        await io.putProcessedFile(path.join(outputDir, 'master.m3u8'), `${prefix}/master.m3u8`);

        const hlsUrl = config.getPublicUrl(`${prefix}/master.m3u8`);
        const thumbnailUrl = thumbnailPath ? config.getPublicUrl(`${prefix}/thumbnail.jpg`) : null;
        const { updated } = await db.updateVideoReady(videoId, {
          hlsUrl,
          thumbnailUrl,
          duration: document.duration,
          moderation,
        });

        console.log(
          `🎉 Video ${videoId} READY (${plan.chunks.length} đoạn ghép trong ${((Date.now() - startedAt) / 1000).toFixed(1)}s)\n   HLS URL: ${hlsUrl}`
        );

        if (updated) await notify.videoReady(videoId, moderation);
        await removeWorkFiles(videoId, document);
        return { skipped: false, hlsUrl };
      } finally {
        cleanup(dir);
      }
    });
  };

  /** Xoá mọi tệp tạm của một video. Lỗi xoá không làm hỏng video: lifecycle của bucket dọn nốt. */
  const removeWorkFiles = async (videoId, document) => {
    const chunkCount = document ? document.plan.chunks.length : 0;
    const keys = [
      planKey(videoId),
      submittedKey(videoId),
      ...(document ? document.audio.map((a) => a.key) : []),
      ...Array.from({ length: chunkCount }, (_, k) => chunkResultKey(videoId, k)),
    ];
    try {
      await io.deleteWork(keys);
    } catch (err) {
      console.warn(`⚠️  Không xoá được tệp tạm của ${videoId}: ${err.message}`);
    }
  };

  return { planJob, audioJob, chunkJob, finalizeJob, keys: { planKey, submittedKey, audioKey, chunkResultKey } };
};

module.exports = { createPipeline };
