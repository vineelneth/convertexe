const { Worker } = require('../queues/queues');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const uploadsDir = path.join(__dirname, '..', 'uploads');

const CODEC_MAP = {
  mp3:  { audioCodec: 'libmp3lame',        format: 'mp3' },
  aac:  { audioCodec: 'aac',               format: 'adts' },
  ogg:  { audioCodec: 'libvorbis',         format: 'ogg' },
  oga:  { audioCodec: 'libvorbis',         format: 'ogg' },
  opus: { audioCodec: 'libopus',           format: 'ogg' },
  wma:  { audioCodec: 'wmav2',             format: 'asf' },
  mp2:  { audioCodec: 'mp2',               format: 'mp2' },
  webm: { audioCodec: 'libopus',           format: 'webm' },
  m4a:  { audioCodec: 'aac',               format: 'ipod' },
  m4b:  { audioCodec: 'aac',               format: 'ipod' },
  '3gp':{ audioCodec: 'aac',               format: '3gp' },
  amr:  { audioCodec: 'libopencore_amrnb', format: 'amr' },
  awb:  { audioCodec: 'libvo_amrwbenc',    format: 'amr' },
  gsm:  { audioCodec: 'libgsm',            format: 'gsm' },
  wav:  { audioCodec: 'pcm_s16le',         format: 'wav' },
  flac: { audioCodec: 'flac',              format: 'flac' },
  alac: { audioCodec: 'alac',              format: 'ipod' },
  aiff: { audioCodec: 'pcm_s16le',         format: 'aiff' },
  tta:  { audioCodec: 'tta',               format: 'tta' },
  wv:   { audioCodec: 'wavpack',           format: 'wv' },
  au:   { audioCodec: 'pcm_mulaw',         format: 'au' },
  voc:  { audioCodec: 'pcm_s16le',         format: 'voc' },
};

function sanitizeBase(originalName) {
  return path.basename(originalName || 'file', path.extname(originalName || ''))
    .replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/, '').slice(0, 60) || 'file';
}

function outputName(originalName, suffix, ext) {
  const uid = Math.random().toString(36).substr(2, 5);
  return `${sanitizeBase(originalName)}${suffix ? '_' + suffix : ''}_${uid}.${ext}`;
}

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
}

function runFfmpeg(command) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    command
      .on('stderr', (line) => { stderr += line + '\n'; })
      .on('end', resolve)
      .on('error', (err) => reject(new Error(stderr.slice(-800) || err.message)))
      .run();
  });
}

const audioWorker = new Worker('aud', async (job) => {
  const { operation, inputPath, originalName, options } = job.data;

  if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
  const originalSize = fs.statSync(inputPath).size;
  const ext = path.extname(inputPath).toLowerCase().slice(1) || 'mp3';

  await job.updateProgress(10);

  if (operation === 'convert') {
    const { format } = options;
    const outFilename = outputName(originalName, null, format);
    const outPath = path.join(uploadsDir, outFilename);
    const codec = CODEC_MAP[format];

    let cmd = ffmpeg(inputPath).noVideo();
    if (codec) cmd = cmd.audioCodec(codec.audioCodec).toFormat(codec.format);
    else        cmd = cmd.toFormat(format);
    cmd.output(outPath);

    await runFfmpeg(cmd);
    await job.updateProgress(100);
    fs.unlink(inputPath, () => {});
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  if (operation === 'trim') {
    const { start } = options;
    let { end } = options;
    const duration = await getAudioDuration(inputPath);
    if (!duration) throw new Error('Could not read audio duration');

    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if (start >= duration) throw new Error(`Start time (${fmt(start)}) is past the end of the file (${fmt(duration)})`);
    if (end !== null && end > duration) end = duration;

    const outputExt = ['mp3','aac','ogg','m4a','flac','wav','wma'].includes(ext) ? ext : 'mp3';
    const outFilename = outputName(originalName, 'trimmed', outputExt);
    const outPath = path.join(uploadsDir, outFilename);
    const codec = CODEC_MAP[outputExt];

    let cmd = ffmpeg(inputPath).noVideo();
    if (start > 0) cmd = cmd.seekInput(start);
    if (end !== null) cmd = cmd.duration(end - start);
    if (codec) cmd = cmd.audioCodec(codec.audioCodec).toFormat(codec.format);
    else cmd = cmd.toFormat(outputExt);
    cmd.output(outPath);

    await runFfmpeg(cmd);
    await job.updateProgress(100);
    fs.unlink(inputPath, () => {});
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  if (operation === 'fade') {
    const { fadeIn, fadeOut } = options;
    const outputExt = ['mp3','aac','ogg','m4a','flac','wav','wma'].includes(ext) ? ext : 'mp3';
    const outFilename = outputName(originalName, 'fade', outputExt);
    const outPath = path.join(uploadsDir, outFilename);
    const codec = CODEC_MAP[outputExt];

    const duration = await getAudioDuration(inputPath);
    if (!duration) throw new Error('Could not read audio duration');
    const filters = [];
    if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn}`);
    if (fadeOut > 0) {
      const st = Math.max(0, duration - fadeOut).toFixed(3);
      filters.push(`afade=t=out:st=${st}:d=${fadeOut}`);
    }

    let cmd = ffmpeg(inputPath).noVideo().audioFilters(filters.join(','));
    if (codec) cmd = cmd.audioCodec(codec.audioCodec).toFormat(codec.format);
    else cmd = cmd.toFormat(outputExt);
    cmd.output(outPath);

    await runFfmpeg(cmd);
    await job.updateProgress(100);
    fs.unlink(inputPath, () => {});
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  if (operation === 'normalize') {
    const { targetLUFS } = options;
    const outputExt = ['mp3','aac','ogg','m4a','flac','wav','wma'].includes(ext) ? ext : 'mp3';
    const outFilename = outputName(originalName, 'normalized', outputExt);
    const outPath = path.join(uploadsDir, outFilename);
    const codec = CODEC_MAP[outputExt];

    let cmd = ffmpeg(inputPath).noVideo()
      .audioFilters(`loudnorm=I=${targetLUFS}:TP=-1.5:LRA=11`);
    if (codec) cmd = cmd.audioCodec(codec.audioCodec).toFormat(codec.format);
    else cmd = cmd.toFormat(outputExt);
    cmd.output(outPath);

    await runFfmpeg(cmd);
    await job.updateProgress(100);
    fs.unlink(inputPath, () => {});
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  if (operation === 'compress') {
    const outputFormat = ['mp3','aac','ogg','m4a','flac','wav','wma'].includes(ext) ? ext : 'mp3';
    const outFilename = outputName(originalName, 'compressed', outputFormat);
    const outPath = path.join(uploadsDir, outFilename);
    const codec = CODEC_MAP[outputFormat];

    let bitrate = options.bitrate || '128k';
    if (options.targetSizeKB) {
      const targetBytes = parseFloat(options.targetSizeKB) * 1024;
      const duration = await getAudioDuration(inputPath);
      if (!duration) throw new Error('Could not read audio duration');
      const bitrateKbps = Math.floor((targetBytes * 8) / duration / 1000);
      bitrate = `${Math.max(32, Math.min(320, bitrateKbps))}k`;
    }

    let cmd = ffmpeg(inputPath).noVideo().audioBitrate(bitrate);
    if (codec) cmd = cmd.audioCodec(codec.audioCodec).toFormat(codec.format);
    else        cmd = cmd.toFormat(outputFormat);
    cmd.output(outPath);

    await runFfmpeg(cmd);
    await job.updateProgress(100);
    fs.unlink(inputPath, () => {});
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize, bitrateUsed: bitrate };
  }

  throw new Error(`Unknown operation: ${operation}`);
}, { concurrency: 4 });

audioWorker.on('failed', (job, err) => {
  if (job?.data?.inputPath) try { fs.unlink(job.data.inputPath, () => {}); } catch {}
  console.error(`[aud] job ${job?.id} failed:`, err.message);
});

module.exports = audioWorker;
