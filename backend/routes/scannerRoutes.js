const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { pdfQueue } = require('../queues/queues');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.random().toString(36).substr(2, 9) + '.jpg');
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? cb(null, true) : cb(new Error('Unsupported image type'));
  }
});

const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);

router.post('/process', upload.single('image'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const mode = ['color', 'grayscale', 'bw'].includes(req.body.mode) ? req.body.mode : 'bw';
  const format = ['pdf', 'jpg'].includes(req.body.format) ? req.body.format : 'pdf';
  const job = await pdfQueue.add('scan', {
    operation: 'scan',
    imagePath: req.file.path,
    options: { mode, format }
  });
  res.json({ jobId: 'pdf_' + job.id });
}));

module.exports = router;
