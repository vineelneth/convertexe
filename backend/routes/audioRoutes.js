const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { audioQueue } = require('../queues/queues');

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
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /^(mp3|wav|aac|flac|ogg|oga|m4a|m4b|wma|webm|opus|mp1|mp2|mpc|amr|awb|3gp|aiff|alac|au|gsm|tta|voc|vox|wv|ape|ra|rm|raw|rf64|sln|8svx|mp4|mkv|mov|avi|flv|mpeg|mpg|ts)$/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    allowed.test(ext) ? cb(null, true) : cb(new Error(`Unsupported audio type: .${ext}`));
  }
});

const ALLOWED_AUDIO_OUTPUT = new Set(['mp3','aac','ogg','oga','opus','wma','mp2','webm','m4a','m4b','3gp','amr','awb','gsm','wav','flac','alac','aiff','tta','wv','au','voc']);

const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);

function handleUpload(mw) {
  return (req, res, next) => mw(req, res, err => err ? next(err) : next());
}

router.post('/convert', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { format } = req.body;
  if (!format) return res.status(400).json({ error: 'Format is required' });
  if (!ALLOWED_AUDIO_OUTPUT.has(format.toLowerCase())) return res.status(400).json({ error: `Unsupported output format: ${format}` });
  const job = await audioQueue.add('convert', { operation: 'convert', inputPath: req.file.path, originalName: req.file.originalname, options: { format } });
  res.json({ jobId: `aud_${job.id}` });
}));

router.post('/compress', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const options = req.body.targetSizeKB
    ? { targetSizeKB: req.body.targetSizeKB }
    : { bitrate: req.body.bitrate || '128k' };
  const job = await audioQueue.add('compress', { operation: 'compress', inputPath: req.file.path, originalName: req.file.originalname, options });
  res.json({ jobId: `aud_${job.id}` });
}));

router.post('/trim', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const start = parseFloat(req.body.start) || 0;
  const end = req.body.end !== undefined && req.body.end !== '' ? parseFloat(req.body.end) : null;
  if (end !== null && end <= start) return res.status(400).json({ error: 'End time must be after start time' });
  const job = await audioQueue.add('trim', { operation: 'trim', inputPath: req.file.path, originalName: req.file.originalname, options: { start, end } });
  res.json({ jobId: `aud_${job.id}` });
}));

router.post('/fade', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fadeIn = parseFloat(req.body.fadeIn) || 0;
  const fadeOut = parseFloat(req.body.fadeOut) || 0;
  if (!fadeIn && !fadeOut) return res.status(400).json({ error: 'Set at least one fade duration' });
  const job = await audioQueue.add('fade', { operation: 'fade', inputPath: req.file.path, originalName: req.file.originalname, options: { fadeIn, fadeOut } });
  res.json({ jobId: `aud_${job.id}` });
}));

router.post('/normalize', handleUpload(upload.single('file')), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const targetLUFS = parseFloat(req.body.targetLUFS) || -14;
  const job = await audioQueue.add('normalize', { operation: 'normalize', inputPath: req.file.path, originalName: req.file.originalname, options: { targetLUFS } });
  res.json({ jobId: `aud_${job.id}` });
}));

module.exports = router;
