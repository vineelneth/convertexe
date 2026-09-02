const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { imageQueue } = require('../queues/queues');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /^(jpeg|jpg|png|webp|gif|bmp|tiff|tif|avif|ico|heic|heif|svg|svgz)$/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    allowed.test(ext) ? cb(null, true) : cb(new Error(`Unsupported image type: .${ext}`));
  }
});

const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);

function handleUpload(mw) {
  return (req, res, next) => mw(req, res, err => err ? next(err) : next());
}

async function enqueue(operation, file, options, res) {
  const job = await imageQueue.add(operation, {
    operation,
    inputPath: file.path,
    originalName: file.originalname,
    options
  });
  res.json({ jobId: `img_${job.id}` });
}

const ALLOWED_IMAGE_OUTPUT = new Set(['jpeg','jpg','png','webp','avif','heic','heif','gif','bmp','tiff','ico','svg']);

router.post('/convert', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { format } = req.body;
  if (!format) return res.status(400).json({ error: 'Format is required' });
  if (!ALLOWED_IMAGE_OUTPUT.has(format.toLowerCase())) return res.status(400).json({ error: `Unsupported output format: ${format}` });
  await enqueue('convert', req.file, { format }, res);
}));

router.post('/compress', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const options = req.body.targetSizeKB
    ? { targetSizeKB: req.body.targetSizeKB }
    : { quality: parseInt(req.body.quality) || 80 };
  await enqueue('compress', req.file, options, res);
}));

router.post('/resize', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  await enqueue('resize', req.file, {
    width: req.body.width ? parseInt(req.body.width) : null,
    height: req.body.height ? parseInt(req.body.height) : null,
    maintainAspectRatio: req.body.maintainAspectRatio !== 'false'
  }, res);
}));

router.post('/rotate', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ALLOWED_FLIP = new Set(['horizontal', 'vertical']);
  const flip = ALLOWED_FLIP.has(req.body.flip) ? req.body.flip : undefined;
  await enqueue('rotate', req.file, { angle: req.body.angle, flip }, res);
}));

router.post('/grayscale', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  await enqueue('grayscale', req.file, {}, res);
}));

module.exports = router;
