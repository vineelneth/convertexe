const { Worker } = require('../queues/queues');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '..', 'uploads');

function sanitizeBase(originalName) {
  return path.basename(originalName || 'file', path.extname(originalName || ''))
    .replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/, '').slice(0, 60) || 'file';
}

function outputName(originalName, suffix, ext) {
  const uid = Math.random().toString(36).substr(2, 5);
  return `${sanitizeBase(originalName)}${suffix ? '_' + suffix : ''}_${uid}.${ext}`;
}

async function compressToTargetSize(inputPath, fmt, targetBytes) {
  let lo = 1, hi = 95, bestBuffer = null, bestQuality = null;
  for (let i = 0; i < 14; i++) {
    const mid = Math.floor((lo + hi) / 2);
    let buf;
    if (fmt === 'jpeg')      buf = await sharp(inputPath).jpeg({ quality: mid }).toBuffer();
    else if (fmt === 'png')  buf = await sharp(inputPath).png({ compressionLevel: Math.round((100 - mid) / 11) }).toBuffer();
    else if (fmt === 'webp') buf = await sharp(inputPath).webp({ quality: mid }).toBuffer();
    else if (fmt === 'avif') buf = await sharp(inputPath).avif({ quality: mid }).toBuffer();
    else                     buf = await sharp(inputPath).jpeg({ quality: mid }).toBuffer();
    if (buf.length <= targetBytes) { bestBuffer = buf; bestQuality = mid; lo = mid + 1; }
    else { hi = mid - 1; }
    if (lo > hi) break;
  }
  return { buffer: bestBuffer, quality: bestQuality };
}

const imageWorker = new Worker('img', async (job) => {
  const { operation, inputPath, originalName, options } = job.data;

  if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
  const originalSize = fs.statSync(inputPath).size;
  const ext = path.extname(inputPath).toLowerCase().slice(1) || 'jpg';

  await job.updateProgress(10);

  if (operation === 'convert') {
    const { format } = options;
    const outExt = format === 'jpg' ? 'jpg' : format;
    let sharpFormat = format === 'jpg' ? 'jpeg' : format;
    const outFilename = outputName(originalName, null, outExt);
    const outPath = path.join(uploadsDir, outFilename);

    if (sharpFormat === 'ico') {
      const icoName = outputName(originalName, null, 'png');
      const icoPath = path.join(uploadsDir, icoName);
      await sharp(inputPath).resize(256, 256).png().toFile(icoPath);
      fs.unlink(inputPath, () => {});
      await job.updateProgress(100);
      const size = fs.statSync(icoPath).size;
      return { downloadUrl: `/api/download/${icoName}`, filename: icoName, size, originalSize };
    }

    if (sharpFormat === 'heic') {
      await sharp(inputPath).heif({ compression: 'hevc' }).toFile(outPath);
    } else if (sharpFormat === 'heif') {
      await sharp(inputPath).heif({ compression: 'av1' }).toFile(outPath);
    } else {
      await sharp(inputPath).toFormat(sharpFormat).toFile(outPath);
    }
    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  if (operation === 'compress') {
    const outFilename = outputName(originalName, 'compressed', ext === 'jpg' ? 'jpg' : ext);
    const outPath = path.join(uploadsDir, outFilename);
    const metadata = await sharp(inputPath).metadata();
    const fmt = metadata.format || (ext === 'jpg' ? 'jpeg' : ext);

    if (options.targetSizeKB) {
      const targetBytes = parseFloat(options.targetSizeKB) * 1024;
      const { buffer, quality } = await compressToTargetSize(inputPath, fmt, targetBytes);
      if (!buffer) { fs.unlink(inputPath, () => {}); throw new Error('Cannot reach that target size — try a larger target.'); }
      fs.writeFileSync(outPath, buffer);
      fs.unlink(inputPath, () => {});
      await job.updateProgress(100);
      return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size: buffer.length, originalSize, qualityUsed: quality };
    }

    const quality = parseInt(options.quality) || 80;
    if (fmt === 'jpeg')      await sharp(inputPath).jpeg({ quality }).toFile(outPath);
    else if (fmt === 'png')  await sharp(inputPath).png({ compressionLevel: Math.round((100 - quality) / 11) }).toFile(outPath);
    else if (fmt === 'webp') await sharp(inputPath).webp({ quality }).toFile(outPath);
    else if (fmt === 'avif') await sharp(inputPath).avif({ quality }).toFile(outPath);
    else                     await sharp(inputPath).jpeg({ quality }).toFile(outPath);

    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  if (operation === 'resize') {
    const { width, height, maintainAspectRatio } = options;
    const outFilename = outputName(originalName, 'resized', ext);
    const outPath = path.join(uploadsDir, outFilename);
    await sharp(inputPath)
      .resize(width || null, height || null, { fit: maintainAspectRatio !== false ? 'inside' : 'fill', withoutEnlargement: false })
      .toFile(outPath);
    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  if (operation === 'rotate') {
    const { angle, flip } = options;
    const suffix = flip ? `flipped_${flip}` : `rotated_${angle}`;
    const outFilename = outputName(originalName, suffix, ext);
    const outPath = path.join(uploadsDir, outFilename);
    let s = sharp(inputPath);
    if (angle) s = s.rotate(parseInt(angle));
    if (flip === 'horizontal') s = s.flop();
    if (flip === 'vertical')   s = s.flip();
    await s.toFile(outPath);
    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  if (operation === 'grayscale') {
    const outFilename = outputName(originalName, 'grayscale', ext);
    const outPath = path.join(uploadsDir, outFilename);
    await sharp(inputPath).grayscale().toFile(outPath);
    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize };
  }

  throw new Error(`Unknown operation: ${operation}`);
}, { concurrency: 8 });

imageWorker.on('failed', (job, err) => {
  if (job?.data?.inputPath) try { fs.unlink(job.data.inputPath, () => {}); } catch {}
  console.error(`[img] job ${job?.id} failed:`, err.message);
});

module.exports = imageWorker;
