const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pdfQueue } = require('../queues/queues');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const uploadPdf = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ext === '.pdf' ? cb(null, true) : cb(new Error(`Only PDF files are accepted`));
  }
});

const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);

function handleUpload(mw) {
  return (req, res, next) => mw(req, res, err => err ? next(err) : next());
}

const uploadImages = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /^(jpeg|jpg|png|webp|gif|bmp|tiff|tif|avif|heic|heif|svg)$/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    allowed.test(ext) ? cb(null, true) : cb(new Error(`Unsupported image type: .${ext}`));
  }
});

router.post('/images-to-pdf', handleUpload(uploadImages.array('files', 50)), asyncRoute(async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
  const job = await pdfQueue.add('images-to-pdf', { operation: 'images-to-pdf', imagePaths: req.files.map(f => f.path) });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/merge', handleUpload(uploadPdf.array('files', 10)), asyncRoute(async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
  const pdfPaths = req.files.map(f => ({ path: f.path, originalName: f.originalname }));
  const job = await pdfQueue.add('merge', { operation: 'merge', pdfPaths });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/split', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!req.body.pages) return res.status(400).json({ error: 'Pages parameter is required' });
  const pages = String(req.body.pages).replace(/[^0-9,\- ]/g, '').slice(0, 200);
  const job = await pdfQueue.add('split', { operation: 'split', inputPath: req.file.path, originalName: req.file.originalname, options: { pages } });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/rotate', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const angle = parseInt(req.body.angle);
  if (![90, 180, 270].includes(angle)) return res.status(400).json({ error: 'Angle must be 90, 180, or 270' });
  const pageNumbers = req.body.pageNumbers ? String(req.body.pageNumbers).replace(/[^0-9,\- ]/g, '').slice(0, 200) : undefined;
  const job = await pdfQueue.add('rotate', {
    operation: 'rotate',
    inputPath: req.file.path,
    originalName: req.file.originalname,
    options: { angle, pageMode: req.body.pageMode, pageNumbers }
  });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/delete-pages', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!req.body.pages) return res.status(400).json({ error: 'Pages parameter is required' });
  const pages = String(req.body.pages).replace(/[^0-9,\- ]/g, '').slice(0, 200);
  const job = await pdfQueue.add('delete-pages', { operation: 'delete-pages', inputPath: req.file.path, originalName: req.file.originalname, options: { pages } });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/compress', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const job = await pdfQueue.add('compress', { operation: 'compress', inputPath: req.file.path, originalName: req.file.originalname, options: {} });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/protect', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const password = String(req.body.password || '');
  if (!password) return res.status(400).json({ error: 'Password is required' });
  if (password.startsWith('--')) return res.status(400).json({ error: 'Invalid password' });
  if (password.length > 256) return res.status(400).json({ error: 'Password must be 256 characters or fewer' });
  const job = await pdfQueue.add('protect', { operation: 'protect', inputPath: req.file.path, options: { password } });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/watermark', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const text = String(req.body.text || '').slice(0, 200);
  if (!text.trim()) return res.status(400).json({ error: 'Watermark text is required' });
  const job = await pdfQueue.add('watermark', { operation: 'watermark', inputPath: req.file.path, originalName: req.file.originalname, options: { text, opacity: req.body.opacity } });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/unlock', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const password = String(req.body.password || '');
  if (!password) return res.status(400).json({ error: 'Password is required' });
  if (password.startsWith('--')) return res.status(400).json({ error: 'Invalid password' });
  if (password.length > 256) return res.status(400).json({ error: 'Password must be 256 characters or fewer' });
  const job = await pdfQueue.add('unlock', { operation: 'unlock', inputPath: req.file.path, originalName: req.file.originalname, options: { password } });
  res.json({ jobId: 'pdf_' + job.id });
}));

router.post('/to-images', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const job = await pdfQueue.add('to-images', { operation: 'to-images', inputPath: req.file.path, originalName: req.file.originalname, options: {} });
  res.json({ jobId: 'pdf_' + job.id });
}));

// Reliable server-side PDF encryption check (replaces unreliable browser-side heuristic)
router.post('/check-encrypted', handleUpload(uploadPdf.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { PDFDocument } = require('pdf-lib');
  const fs = require('fs');
  const path = require('path');
  let encrypted = false;
  try {
    const bytes = fs.readFileSync(req.file.path);
    await PDFDocument.load(bytes);
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('encrypt')) encrypted = true;
    else { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'Invalid or corrupted PDF file' }); }
  }
  fs.unlink(req.file.path, () => {});
  res.json({ encrypted });
}));

module.exports = router;
