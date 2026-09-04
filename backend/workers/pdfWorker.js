const { Worker } = require('../queues/queues');
const { PDFDocument, degrees, rgb, StandardFonts } = require('pdf-lib');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const QPDF_PATH = process.env.QPDF_PATH || 'C:\\Program Files\\qpdf 12.4.1\\bin\\qpdf.exe';

const uploadsDir = path.join(__dirname, '..', 'uploads');

function sanitizeBase(originalName) {
  return path.basename(originalName || 'file', path.extname(originalName || ''))
    .replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/, '').slice(0, 60) || 'file';
}

function outputName(originalName, suffix, ext) {
  const uid = Math.random().toString(36).substr(2, 5);
  return `${sanitizeBase(originalName)}${suffix ? '_' + suffix : ''}_${uid}.${ext}`;
}

function uniqueName(ext) {
  return Math.random().toString(36).substr(2, 9) + '_' + Date.now() + '.' + ext;
}

function formatResult(outFilename, outPath, inputSize) {
  const size = fs.statSync(outPath).size;
  return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize: inputSize };
}

async function loadPdf(bytes, originalName) {
  try {
    return await PDFDocument.load(bytes);
  } catch (err) {
    if (err.message && err.message.includes('encrypted')) {
      const name = originalName ? `"${originalName}"` : 'This PDF';
      throw new Error(`${name} is password-protected. Remove the password and try again.`);
    }
    throw err;
  }
}

function parsePageRanges(str, totalPages) {
  const indices = new Set();
  str.split(',').forEach(part => {
    part = part.trim();
    if (!part) return;
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(n => parseInt(n.trim(), 10));
      for (let i = a; i <= b; i++) {
        if (i >= 1 && i <= totalPages) indices.add(i - 1);
      }
    } else {
      const n = parseInt(part, 10);
      if (n >= 1 && n <= totalPages) indices.add(n - 1);
    }
  });
  return Array.from(indices).sort((a, b) => a - b);
}

const pdfWorker = new Worker('pdf', async (job) => {
  const { operation } = job.data;

  if (operation === 'images-to-pdf') {
    const { imagePaths } = job.data;
    if (!imagePaths || imagePaths.length === 0) throw new Error('No images provided');

    let totalInputSize = 0;
    for (const p of imagePaths) {
      if (fs.existsSync(p)) totalInputSize += fs.statSync(p).size;
    }

    await job.updateProgress(5);

    // Encode all images to JPEG in parallel (4 at a time), single sharp call each.
    // .rotate() auto-corrects EXIF orientation (phone photos).
    const ENCODE_CONCURRENCY = 4;
    const encoded = new Array(imagePaths.length);
    let encodeIndex = 0;
    let encodeCompleted = 0;

    async function encodeWorker() {
      while (encodeIndex < imagePaths.length) {
        const i = encodeIndex++;
        const p = imagePaths[i];
        if (!fs.existsSync(p)) throw new Error(`Image file not found: ${path.basename(p)}`);
        const { data: imgBuf, info } = await sharp(p)
          .rotate()
          .resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer({ resolveWithObject: true });
        encoded[i] = { imgBuf, width: info.width, height: info.height };
        encodeCompleted++;
        await job.updateProgress(5 + Math.floor(encodeCompleted / imagePaths.length * 60));
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(ENCODE_CONCURRENCY, imagePaths.length) }, encodeWorker)
    );

    await job.updateProgress(65);

    // Build PDF sequentially — pdf-lib is not safe for concurrent mutation.
    // Null out each encode buffer after embedding to free memory sooner.
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < encoded.length; i++) {
      const { imgBuf, width, height } = encoded[i];
      encoded[i] = null;
      const jpgImage = await pdfDoc.embedJpg(imgBuf);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(jpgImage, { x: 0, y: 0, width, height });
      await job.updateProgress(65 + Math.floor((i + 1) / encoded.length * 25));
    }

    const outFilename = outputName('images', null, 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outPath, pdfBytes);

    for (const p of imagePaths) try { fs.unlink(p, () => {}); } catch {}
    await job.updateProgress(100);
    const size = fs.statSync(outPath).size;
    return { downloadUrl: `/api/download/${outFilename}`, filename: outFilename, size, originalSize: totalInputSize };
  }

  if (operation === 'merge') {
    const { pdfPaths } = job.data;
    let totalInputSize = 0;
    for (const entry of pdfPaths) {
      if (fs.existsSync(entry.path)) totalInputSize += fs.statSync(entry.path).size;
    }

    await job.updateProgress(10);
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < pdfPaths.length; i++) {
      const { path: filePath, originalName } = pdfPaths[i];
      const bytes = fs.readFileSync(filePath);
      let doc;
      try {
        doc = await PDFDocument.load(bytes);
      } catch (err) {
        if (err.message && err.message.includes('encrypted')) {
          for (const e of pdfPaths) try { fs.unlink(e.path, () => {}); } catch {}
          throw new Error(`"${originalName}" is password-protected. Remove the password before merging.`);
        }
        throw err;
      }
      const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
      copiedPages.forEach(p => mergedPdf.addPage(p));
      await job.updateProgress(10 + Math.floor((i + 1) / pdfPaths.length * 80));
    }

    const outFilename = outputName('merged', null, 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    const pdfBytes = await mergedPdf.save();
    fs.writeFileSync(outPath, pdfBytes);

    for (const entry of pdfPaths) try { fs.unlink(entry.path, () => {}); } catch {}
    await job.updateProgress(100);
    return formatResult(outFilename, outPath, totalInputSize);
  }

  if (operation === 'split') {
    const { inputPath, originalName, options } = job.data;
    if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
    const originalSize = fs.statSync(inputPath).size;

    await job.updateProgress(10);
    const srcBytes = fs.readFileSync(inputPath);
    const srcDoc = await loadPdf(srcBytes, originalName);
    const totalPages = srcDoc.getPageCount();
    const indices = parsePageRanges(options.pages, totalPages);
    if (!indices.length) throw new Error('No valid pages specified');

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(p => newDoc.addPage(p));

    await job.updateProgress(80);
    const pageLabel = options.pages.replace(/[^0-9,\-]/g, '').slice(0, 40);
    const outFilename = outputName(originalName, `pages_${pageLabel}`, 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    if (!outPath.startsWith(uploadsDir + path.sep) && outPath !== uploadsDir) throw new Error('Invalid output path');
    fs.writeFileSync(outPath, await newDoc.save());

    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    return formatResult(outFilename, outPath, originalSize);
  }

  if (operation === 'rotate') {
    const { inputPath, originalName, options } = job.data;
    if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
    const originalSize = fs.statSync(inputPath).size;

    await job.updateProgress(10);
    const srcBytes = fs.readFileSync(inputPath);
    const pdfDoc = await loadPdf(srcBytes, originalName);
    const totalPages = pdfDoc.getPageCount();
    const angle = options.angle || 90;

    let targetIndices;
    if (options.pageMode === 'specific' && options.pageNumbers) {
      targetIndices = parsePageRanges(options.pageNumbers, totalPages);
    } else {
      targetIndices = Array.from({ length: totalPages }, (_, i) => i);
    }

    for (const i of targetIndices) {
      const page = pdfDoc.getPage(i);
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + angle) % 360));
    }

    await job.updateProgress(80);
    const outFilename = outputName(originalName, `rotated_${angle}deg`, 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    fs.writeFileSync(outPath, await pdfDoc.save());

    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    return formatResult(outFilename, outPath, originalSize);
  }

  if (operation === 'delete-pages') {
    const { inputPath, originalName, options } = job.data;
    if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
    const originalSize = fs.statSync(inputPath).size;

    await job.updateProgress(10);
    const srcBytes = fs.readFileSync(inputPath);
    const pdfDoc = await loadPdf(srcBytes, originalName);
    const totalPages = pdfDoc.getPageCount();
    const indices = parsePageRanges(options.pages, totalPages);

    const sorted = [...indices].sort((a, b) => b - a);
    for (const i of sorted) pdfDoc.removePage(i);

    await job.updateProgress(80);
    const outFilename = outputName(originalName, 'edited', 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    fs.writeFileSync(outPath, await pdfDoc.save());

    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    return formatResult(outFilename, outPath, originalSize);
  }

  if (operation === 'compress') {
    const { inputPath, originalName } = job.data;
    if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
    const originalSize = fs.statSync(inputPath).size;

    await job.updateProgress(10);
    const srcBytes = fs.readFileSync(inputPath);
    const pdfDoc = await loadPdf(srcBytes, originalName);

    await job.updateProgress(60);
    const outFilename = outputName(originalName, 'compressed', 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    fs.writeFileSync(outPath, await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false }));

    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    return formatResult(outFilename, outPath, originalSize);
  }

  if (operation === 'protect') {
    const { inputPath, options } = job.data;
    if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
    const originalSize = fs.statSync(inputPath).size;
    const password = options.password || '';
    const outFilename = outputName(job.data.originalName, 'protected', 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    await job.updateProgress(10);
    try {
      await execFileAsync(QPDF_PATH, [
        '--encrypt', password, password, '256',
        '--', inputPath, outPath,
      ]);
    } catch (err) {
      throw new Error('qpdf encryption failed: ' + (err.stderr || err.message));
    }
    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    return formatResult(outFilename, outPath, originalSize);
  }

  if (operation === 'watermark') {
    const { inputPath, originalName, options } = job.data;
    if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
    const originalSize = fs.statSync(inputPath).size;

    await job.updateProgress(10);
    const srcBytes = fs.readFileSync(inputPath);
    const pdfDoc = await loadPdf(srcBytes, originalName);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const opacity = options.opacity != null ? parseFloat(options.opacity) : 0.3;
    const text = options.text || 'WATERMARK';
    const fontSize = 60;

    const pages = pdfDoc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: (height - fontSize) / 2,
        size: fontSize,
        font,
        color: rgb(0.6, 0.6, 0.6),
        opacity,
        rotate: degrees(45),
      });
    }

    await job.updateProgress(80);
    const outFilename = outputName(originalName, 'watermarked', 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    fs.writeFileSync(outPath, await pdfDoc.save());

    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    return formatResult(outFilename, outPath, originalSize);
  }

  if (operation === 'unlock') {
    const { inputPath, originalName, options } = job.data;
    if (!fs.existsSync(inputPath)) throw new Error('Input file not found');
    const originalSize = fs.statSync(inputPath).size;
    const outFilename = outputName(originalName, 'unlocked', 'pdf');
    const outPath = path.join(uploadsDir, outFilename);
    await job.updateProgress(10);
    try {
      await execFileAsync(QPDF_PATH, [
        '--decrypt', `--password=${options.password}`,
        inputPath, outPath,
      ]);
    } catch (err) {
      fs.unlink(inputPath, () => {});
      const msg = (err.stderr || err.message || '').toLowerCase();
      if (msg.includes('invalid password') || msg.includes('bad password') || msg.includes('incorrect password')) {
        throw new Error('Incorrect password. Please check and try again.');
      }
      if (msg.includes('not encrypted') || msg.includes('not password')) {
        throw new Error(`${originalName ? `"${originalName}"` : 'This PDF'} is not password-protected.`);
      }
      throw new Error('Failed to unlock PDF: ' + (err.stderr || err.message));
    }
    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    return formatResult(outFilename, outPath, originalSize);
  }

  if (operation === 'to-images') {
    const { inputPath, originalName } = job.data;
    if (!fs.existsSync(inputPath)) throw new Error('Input file not found');

    await job.updateProgress(5);
    await loadPdf(fs.readFileSync(inputPath), originalName);
    await job.updateProgress(10);
    const { pdf } = require('pdf-to-img');
    const doc = await pdf(inputPath, { scale: 2 });
    const pageCount = doc.length;
    const pages = [];
    let i = 0;

    for await (const pageImage of doc) {
      const outFilename = outputName(originalName, `page_${i + 1}`, 'png');
      const outPath = path.join(uploadsDir, outFilename);
      fs.writeFileSync(outPath, pageImage);
      pages.push({ previewUrl: `/api/preview/${outFilename}`, downloadUrl: `/api/download/${outFilename}`, filename: outFilename, page: i + 1 });
      i++;
      await job.updateProgress(10 + Math.floor((i / pageCount) * 85));
    }

    fs.unlink(inputPath, () => {});
    await job.updateProgress(100);
    // Clean up all page PNGs after 30 minutes (covers preview + download window)
    setTimeout(() => {
      pages.forEach(p => {
        const filePath = path.join(uploadsDir, p.filename);
        fs.unlink(filePath, () => {});
      });
    }, 30 * 60 * 1000);
    return { pages, pageCount };
  }

  throw new Error(`Unknown operation: ${operation}`);
}, { concurrency: 4 });

pdfWorker.on('failed', (job, err) => {
  if (job?.data?.inputPath) try { fs.unlink(job.data.inputPath, () => {}); } catch {}
  if (job?.data?.imagePaths) job.data.imagePaths.forEach(p => { try { fs.unlink(p, () => {}); } catch {} });
  if (job?.data?.pdfPaths) job.data.pdfPaths.forEach(p => { try { fs.unlink(p, () => {}); } catch {} });
  console.error(`[pdf] job ${job?.id} failed:`, err.message);
});

module.exports = pdfWorker;
