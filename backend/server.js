const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// Rate limiting: max 30 upload jobs per IP per 10 minutes
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests — please wait a few minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/image',   uploadLimiter);
app.use('/api/audio',   uploadLimiter);
app.use('/api/pdf',     uploadLimiter);
app.use('/api/scanner', uploadLimiter);

// Generous limit on download/preview/jobs to prevent hammering
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/download', downloadLimiter);
app.use('/api/preview',  downloadLimiter);
app.use('/api/jobs',     downloadLimiter);

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// View counter — loaded from disk on startup, persisted asynchronously on each hit
const viewsFile = path.join(__dirname, 'data', 'views.json');
if (!fs.existsSync(path.dirname(viewsFile))) fs.mkdirSync(path.dirname(viewsFile), { recursive: true });
let viewCount = 0;
try { viewCount = JSON.parse(fs.readFileSync(viewsFile, 'utf8')).count || 0; } catch {}

app.post('/api/views', (req, res) => {
  viewCount++;
  res.json({ count: viewCount });
  fs.writeFile(viewsFile, JSON.stringify({ count: viewCount }), () => {});
});

app.get('/api/views', (req, res) => res.json({ count: viewCount }));

// Clean up files older than 2 hours left from previous sessions
try {
  const now = Date.now();
  fs.readdirSync(uploadsDir).forEach(file => {
    const fp = path.join(uploadsDir, file);
    try { if (now - fs.statSync(fp).mtimeMs > 7200000) fs.unlink(fp, () => {}); } catch {}
  });
} catch {}

// Routes
app.use('/api/image',   require('./routes/imageRoutes'));
app.use('/api/audio',   require('./routes/audioRoutes'));
app.use('/api/pdf',     require('./routes/pdfRoutes'));
app.use('/api/scanner', require('./routes/scannerRoutes'));
app.use('/api/jobs',    require('./routes/jobRoutes'));

// Preview endpoint — serves file inline for <img> tags, no deletion
app.get('/api/preview/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  // SVG can execute scripts when opened directly — sandbox it
  if (/\.svgz?$/i.test(filename)) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  }
  res.sendFile(filePath);
});

// Download endpoint — triggers browser save-as, deletes after delivery
app.get('/api/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath, (err) => {
      if (!err) setTimeout(() => fs.unlink(filePath, () => {}), 5000);
    });
  } else {
    res.status(404).json({ error: 'File not found or already deleted' });
  }
});

// Start workers
require('./workers/imageWorker');
require('./workers/audioWorker');
require('./workers/pdfWorker');

// Cleanup orphaned upload files older than 2 hours
setInterval(() => {
  try {
    const now = Date.now();
    fs.readdirSync(uploadsDir).forEach(file => {
      const fp = path.join(uploadsDir, file);
      try {
        if (now - fs.statSync(fp).mtimeMs > 7200000) fs.unlink(fp, () => {});
      } catch {}
    });
  } catch {}
}, 3600000);

// In production, serve the Vite-built frontend and handle React Router paths
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 handler for unknown API routes
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler — catches multer errors and unhandled async throws
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large.' });
  const status = err.status || (err.message ? 400 : 500);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Workers started: image (×8), audio (×4)`);
});
