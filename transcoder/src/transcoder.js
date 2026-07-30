const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

/**
 * ★ Core FFmpeg HLS Transcoder
 *
 * Transcode a video file into HLS format with multiple renditions (ABR).
 * Output structure:
 *   outputDir/
 *   ├── master.m3u8        (Master Playlist)
 *   ├── 360p/
 *   │   ├── playlist.m3u8  (Media Playlist)
 *   │   ├── segment_000.ts
 *   │   └── ...
 *   ├── 720p/
 *   │   ├── playlist.m3u8
 *   │   └── ...
 *   ├── 1080p/
 *   │   ├── playlist.m3u8
 *   │   └── ...
 *   └── thumbnail.jpg
 */
const transcodeToHLS = async (inputPath, outputDir) => {
  console.log('\n🎬 ════════════════════════════════════════');
  console.log('   FFmpeg HLS Transcoding Starting...');
  console.log('════════════════════════════════════════\n');

  // Step 1: Probe input file for duration
  const duration = await getVideoDuration(inputPath);
  console.log(`📊 Input video duration: ${duration.toFixed(1)}s`);

  // Step 2: Create output directories
  const renditions = config.ffmpeg.renditions;
  for (const r of renditions) {
    const dir = path.join(outputDir, r.name);
    fs.mkdirSync(dir, { recursive: true });
  }

  // Step 3: Build FFmpeg command for all renditions simultaneously
  const args = buildFFmpegArgs(inputPath, outputDir, renditions);
  console.log(`🔧 FFmpeg command: ffmpeg ${args.join(' ').substring(0, 200)}...`);

  await runFFmpeg(args, duration);

  // Step 4: Generate master playlist
  generateMasterPlaylist(outputDir, renditions);

  // Step 5: Extract thumbnail
  await extractThumbnail(inputPath, outputDir);

  console.log('\n✅ ════════════════════════════════════════');
  console.log('   Transcoding Complete!');
  console.log('════════════════════════════════════════\n');

  return { duration };
};

/**
 * Build FFmpeg arguments for multi-rendition HLS output
 * Single-pass encoding with one input read → multiple outputs
 */
const buildFFmpegArgs = (inputPath, outputDir, renditions) => {
  const args = [
    '-i', inputPath,
    '-hide_banner',
    '-loglevel', 'warning',
    '-stats',
    '-y', // Overwrite output
  ];

  for (const r of renditions) {
    const playlistPath = path.join(outputDir, r.name, 'playlist.m3u8');
    const segmentPath = path.join(outputDir, r.name, 'segment_%03d.ts');

    args.push(
      // Video settings
      '-vf', `scale=${r.width}:${r.height}:force_original_aspect_ratio=decrease,pad=${r.width}:${r.height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', 'libx264',
      '-b:v', r.videoBitrate,
      '-maxrate', r.maxrate,
      '-bufsize', r.bufsize,
      '-preset', 'fast',
      '-profile:v', 'main',
      '-level', '3.1',
      '-g', String(config.ffmpeg.segmentDuration * 30), // GOP = segment * framerate
      '-keyint_min', String(config.ffmpeg.segmentDuration * 30),
      '-sc_threshold', '0',

      // Audio settings
      '-c:a', 'aac',
      '-b:a', r.audioBitrate,
      '-ar', '44100',
      '-ac', '2',

      // HLS settings
      '-f', 'hls',
      '-hls_time', String(config.ffmpeg.segmentDuration),
      '-hls_list_size', '0', // Include all segments
      '-hls_segment_filename', segmentPath,
      playlistPath
    );
  }

  return args;
};

/**
 * Generate master.m3u8 that references all rendition playlists
 */
const generateMasterPlaylist = (outputDir, renditions) => {
  let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

  for (const r of renditions) {
    const bandwidth = parseInt(r.videoBitrate) * 1000 + parseInt(r.audioBitrate) * 1000;
    content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${r.width}x${r.height},NAME="${r.name}"\n`;
    content += `${r.name}/playlist.m3u8\n\n`;
  }

  const masterPath = path.join(outputDir, 'master.m3u8');
  fs.writeFileSync(masterPath, content);
  console.log(`📋 Generated master.m3u8 with ${renditions.length} renditions`);
};

/**
 * Extract thumbnail from video at specified time
 */
const extractThumbnail = async (inputPath, outputDir) => {
  const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
  const thumbTime = config.ffmpeg.thumbnailTime;

  const args = [
    '-i', inputPath,
    '-ss', String(thumbTime),
    '-vframes', '1',
    '-q:v', '2',
    '-vf', 'scale=640:-1',
    '-y',
    thumbnailPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`🖼️  Thumbnail extracted at ${thumbTime}s → thumbnail.jpg`);
        resolve(thumbnailPath);
      } else {
        console.warn(`⚠️  Thumbnail extraction failed (code ${code}), skipping`);
        resolve(null);
      }
    });
    proc.on('error', (err) => {
      console.warn(`⚠️  Thumbnail extraction error: ${err.message}, skipping`);
      resolve(null);
    });
  });
};

/**
 * Get video duration using ffprobe
 */
const getVideoDuration = (inputPath) => {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      inputPath,
    ];

    const proc = spawn('ffprobe', args);
    let stdout = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed with code ${code}`));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        resolve(parseFloat(info.format.duration) || 0);
      } catch (e) {
        reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
      }
    });
    proc.on('error', reject);
  });
};

/**
 * Run FFmpeg process with progress logging
 */
const runFFmpeg = (args, totalDuration) => {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    const startTime = Date.now();

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      // Parse progress from FFmpeg stderr
      const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        const progress = totalDuration > 0 ? Math.min((currentTime / totalDuration) * 100, 100) : 0;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        process.stdout.write(`\r   ⏳ Progress: ${progress.toFixed(1)}% | Elapsed: ${elapsed}s`);
      }
    });

    proc.on('close', (code) => {
      process.stdout.write('\n');
      if (code === 0) {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ FFmpeg finished in ${totalTime}s`);
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg process error: ${err.message}`));
    });
  });
};

module.exports = {
  transcodeToHLS,
  getVideoDuration,
};
