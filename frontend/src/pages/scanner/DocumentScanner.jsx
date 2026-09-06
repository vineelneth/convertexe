import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Camera, Upload, RefreshCw, Download, CheckCircle, ScanLine, X, Scan } from 'lucide-react';
import JobStatus from '../../components/JobStatus';
import { useJobPoller } from '../../hooks/useJobPoller';

// ─── Homography math ──────────────────────────────────────────────────────────

function gaussElim(A, b) {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    for (let r = col + 1; r < n; r++) {
      const f = aug[r][col] / aug[col][col];
      for (let c = col; c <= n; c++) aug[r][c] -= f * aug[col][c];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    x[i] /= aug[i][i];
  }
  return x;
}

// src/dst: arrays of 4 [x,y] pairs. Returns flat H[9] (h8=1).
function computeHomography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i], [dx, dy] = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]); b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]); b.push(dy);
  }
  const h = gaussElim(A, b);
  return [...h, 1];
}

function applyH(H, x, y) {
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H;
  const w = h6 * x + h7 * y + h8;
  return [(h0 * x + h1 * y + h2) / w, (h3 * x + h4 * y + h5) / w];
}

// ─── Perspective warp (frontend, inverse mapping + bilinear) ─────────────────

function warpCanvas(srcCanvas, corners) {
  const [tl, tr, br, bl] = corners;
  const outW = Math.round(Math.max(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(br.x - bl.x, br.y - bl.y)
  ));
  const outH = Math.round(Math.max(
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
    Math.hypot(br.x - tr.x, br.y - tr.y)
  ));

  const srcPts = [[tl.x, tl.y], [tr.x, tr.y], [br.x, br.y], [bl.x, bl.y]];
  const dstPts = [[0, 0], [outW, 0], [outW, outH], [0, outH]];
  const H = computeHomography(dstPts, srcPts); // dst→src for inverse warp

  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const outCtx = out.getContext('2d');

  const srcCtx = srcCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const outData = outCtx.createImageData(outW, outH);
  const sp = srcData.data, op = outData.data;
  const sW = srcCanvas.width, sH = srcCanvas.height;

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const [sx, sy] = applyH(H, dx, dy);
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = x0 + 1, y1 = y0 + 1;
      const oi = (dy * outW + dx) * 4;
      if (x0 < 0 || y0 < 0 || x1 >= sW || y1 >= sH) {
        op[oi] = op[oi + 1] = op[oi + 2] = 255; op[oi + 3] = 255;
        continue;
      }
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sW + x0) * 4, i10 = (y0 * sW + x1) * 4;
      const i01 = (y1 * sW + x0) * 4, i11 = (y1 * sW + x1) * 4;
      for (let c = 0; c < 3; c++) {
        op[oi + c] = Math.round(
          sp[i00 + c] * (1 - fx) * (1 - fy) + sp[i10 + c] * fx * (1 - fy) +
          sp[i01 + c] * (1 - fx) * fy + sp[i11 + c] * fx * fy
        );
      }
      op[oi + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}

// ─── Auto corner detection ────────────────────────────────────────────────────
// Grayscale → Gaussian blur → Sobel edges → find extreme-diagonal edge pixels

function detectCorners(imgCanvas) {
  const iW = imgCanvas.width, iH = imgCanvas.height;
  const PROC_MAX = 400;
  const scale = Math.min(PROC_MAX / iW, PROC_MAX / iH, 1);
  const pW = Math.round(iW * scale), pH = Math.round(iH * scale);

  const tmp = document.createElement('canvas');
  tmp.width = pW; tmp.height = pH;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(imgCanvas, 0, 0, pW, pH);
  const { data: px } = tctx.getImageData(0, 0, pW, pH);

  const gray = new Float32Array(pW * pH);
  for (let i = 0; i < pW * pH; i++) {
    gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  }

  const blur = new Float32Array(pW * pH);
  for (let y = 1; y < pH - 1; y++) {
    for (let x = 1; x < pW - 1; x++) {
      blur[y * pW + x] = (
        gray[(y - 1) * pW + (x - 1)] + 2 * gray[(y - 1) * pW + x] + gray[(y - 1) * pW + (x + 1)] +
        2 * gray[y * pW + (x - 1)] + 4 * gray[y * pW + x] + 2 * gray[y * pW + (x + 1)] +
        gray[(y + 1) * pW + (x - 1)] + 2 * gray[(y + 1) * pW + x] + gray[(y + 1) * pW + (x + 1)]
      ) / 16;
    }
  }

  const edge = new Float32Array(pW * pH);
  let maxE = 1;
  for (let y = 1; y < pH - 1; y++) {
    for (let x = 1; x < pW - 1; x++) {
      const gx = -blur[(y - 1) * pW + (x - 1)] + blur[(y - 1) * pW + (x + 1)]
        - 2 * blur[y * pW + (x - 1)] + 2 * blur[y * pW + (x + 1)]
        - blur[(y + 1) * pW + (x - 1)] + blur[(y + 1) * pW + (x + 1)];
      const gy = blur[(y - 1) * pW + (x - 1)] + 2 * blur[(y - 1) * pW + x] + blur[(y - 1) * pW + (x + 1)]
        - blur[(y + 1) * pW + (x - 1)] - 2 * blur[(y + 1) * pW + x] - blur[(y + 1) * pW + (x + 1)];
      edge[y * pW + x] = Math.sqrt(gx * gx + gy * gy);
      if (edge[y * pW + x] > maxE) maxE = edge[y * pW + x];
    }
  }

  const thresh = maxE * 0.15;
  const mx = Math.floor(pW * 0.04), my = Math.floor(pH * 0.04);

  let tlS = Infinity, trS = Infinity, brS = Infinity, blS = Infinity;
  let tl = { x: pW * 0.1, y: pH * 0.1 }, tr = { x: pW * 0.9, y: pH * 0.1 };
  let br = { x: pW * 0.9, y: pH * 0.9 }, bl = { x: pW * 0.1, y: pH * 0.9 };

  for (let y = my; y < pH - my; y++) {
    for (let x = mx; x < pW - mx; x++) {
      if (edge[y * pW + x] < thresh) continue;
      const s1 = x + y, s2 = (pW - x) + y, s3 = (pW - x) + (pH - y), s4 = x + (pH - y);
      if (s1 < tlS) { tlS = s1; tl = { x, y }; }
      if (s2 < trS) { trS = s2; tr = { x, y }; }
      if (s3 < brS) { brS = s3; br = { x, y }; }
      if (s4 < blS) { blS = s4; bl = { x, y }; }
    }
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return [
    { x: clamp(tl.x / scale, 0, iW), y: clamp(tl.y / scale, 0, iH) },
    { x: clamp(tr.x / scale, 0, iW), y: clamp(tr.y / scale, 0, iH) },
    { x: clamp(br.x / scale, 0, iW), y: clamp(br.y / scale, 0, iH) },
    { x: clamp(bl.x / scale, 0, iW), y: clamp(bl.y / scale, 0, iH) },
  ];
}

// ─── Corner editor canvas ─────────────────────────────────────────────────────

const HANDLE_R = 11;

function CornerEditor({ imageCanvas, corners, onChange }) {
  const canvasRef = useRef(null);
  const dragging = useRef(null);
  const scale = useRef(1);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageCanvas || !corners) return;
    const ctx = canvas.getContext('2d');
    const s = scale.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageCanvas, 0, 0, canvas.width, canvas.height);

    // dark overlay outside quad (even-odd fill)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.moveTo(corners[0].x * s, corners[0].y * s);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x * s, corners[i].y * s);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.restore();

    // quad border
    ctx.save();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(corners[0].x * s, corners[0].y * s);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x * s, corners[i].y * s);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // corner handles
    corners.forEach((c) => {
      ctx.beginPath();
      ctx.arc(c.x * s, c.y * s, HANDLE_R, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });
  }, [imageCanvas, corners]);

  // set canvas size once per image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageCanvas) return;
    const maxW = canvas.parentElement.offsetWidth || 600;
    const maxH = Math.min(window.innerHeight * 0.58, maxW * 1.5);
    const s = Math.min(maxW / imageCanvas.width, maxH / imageCanvas.height);
    canvas.width = Math.round(imageCanvas.width * s);
    canvas.height = Math.round(imageCanvas.height * s);
    scale.current = s;
  }, [imageCanvas]);

  useEffect(() => { draw(); }, [draw]);

  const pointerToImg = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const s = scale.current;
    return {
      x: Math.max(0, Math.min(imageCanvas.width,  (e.clientX - rect.left)  / s)),
      y: Math.max(0, Math.min(imageCanvas.height, (e.clientY - rect.top)   / s)),
    };
  };

  const onPointerDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
    const s = scale.current;
    const idx = corners.findIndex(c => {
      const dx = c.x * s - ex, dy = c.y * s - ey;
      return Math.sqrt(dx * dx + dy * dy) <= HANDLE_R + 6;
    });
    if (idx >= 0) {
      dragging.current = idx;
      canvasRef.current.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e) => {
    if (dragging.current === null) return;
    const { x, y } = pointerToImg(e);
    onChange(corners.map((c, i) => i === dragging.current ? { x, y } : c));
  };

  const onPointerUp = () => { dragging.current = null; };

  return (
    <canvas
      ref={canvasRef}
      className="touch-none cursor-crosshair rounded-lg block"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

// ─── Camera capture modal ─────────────────────────────────────────────────────

function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    }).then(stream => {
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      setReady(true);
    }).catch(e => setErr('Camera access denied: ' + e.message));
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  const capture = () => {
    const v = videoRef.current;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    onCapture(c);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 shrink-0">
        <span className="text-white font-semibold text-lg">Camera</span>
        <button onClick={onClose} className="text-white p-1 hover:text-gray-300"><X size={24} /></button>
      </div>
      {err && <div className="text-red-400 text-sm px-4 pb-2">{err}</div>}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full object-contain" />
      </div>
      <div className="p-6 flex justify-center shrink-0">
        <button
          onClick={capture}
          disabled={!ready}
          className="w-16 h-16 rounded-full bg-white border-4 border-indigo-500 flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
        >
          <div className="w-11 h-11 rounded-full bg-indigo-600" />
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const MAX_DIM = 2500;

function loadImageToCanvas(src) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const s = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight, 1);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.src = src;
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DocumentScanner() {
  const [step, setStep] = useState('idle');       // idle | adjust | done
  const [imageCanvas, setImageCanvas] = useState(null);
  const [corners, setCorners] = useState(null);
  const [mode, setMode] = useState('bw');          // bw | grayscale | color
  const [format, setFormat] = useState('pdf');     // pdf | jpg
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Processing failed') : '';

  const loadCanvas = useCallback((canvas) => {
    setImageCanvas(canvas);
    setCorners(detectCorners(canvas));
    setStep('adjust');
  }, []);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadImageToCanvas(url).then(c => { URL.revokeObjectURL(url); loadCanvas(c); });
  };

  const handleCameraCapture = (canvas) => {
    setShowCamera(false);
    // camera canvas might be large — scale it down if needed
    if (canvas.width > MAX_DIM || canvas.height > MAX_DIM) {
      const s = Math.min(MAX_DIM / canvas.width, MAX_DIM / canvas.height);
      const c = document.createElement('canvas');
      c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      loadCanvas(c);
    } else {
      loadCanvas(canvas);
    }
  };

  const handleScan = async () => {
    if (!imageCanvas || !corners) return;
    setLoading(true); setError(''); resetJob();
    try {
      const warped = warpCanvas(imageCanvas, corners);
      const blob = await new Promise(res => warped.toBlob(res, 'image/jpeg', 0.92));
      const formData = new FormData();
      formData.append('image', blob, 'scan.jpg');
      formData.append('mode', mode);
      formData.append('format', format);
      const { data } = await axios.post('/api/scanner/process', formData);
      startJob(data.jobId);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => {
    setStep('idle'); setImageCanvas(null); setCorners(null);
    setError(''); resetJob();
    if (inputRef.current) inputRef.current.value = '';
  };

  useEffect(() => {
    if (status === 'completed') setStep('done');
  }, [status]);

  return (
    <div className="max-w-3xl mx-auto">
      {showCamera && <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
          <ScanLine size={20} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Scanner</h1>
          <p className="text-gray-500 text-sm">Auto-detect edges, correct perspective, export as PDF or image</p>
        </div>
      </div>

      {(error || jobError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
          {error || jobError}
        </div>
      )}

      {/* ── Step 1: idle ── */}
      {step === 'idle' && (
        <div className="card space-y-5">
          <p className="text-sm text-gray-500">
            Upload a photo of a document or use your camera. Corners are detected automatically — drag them to adjust.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-3 p-7 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
            >
              <Upload size={28} className="text-gray-400" />
              <span className="font-semibold text-gray-700">Upload Photo</span>
              <span className="text-xs text-gray-400">JPG, PNG, WebP</span>
            </button>
            <button
              onClick={() => setShowCamera(true)}
              className="flex flex-col items-center gap-3 p-7 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
            >
              <Camera size={28} className="text-gray-400" />
              <span className="font-semibold text-gray-700">Use Camera</span>
              <span className="text-xs text-gray-400">Webcam or phone</span>
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      )}

      {/* ── Step 2: adjust corners ── */}
      {step === 'adjust' && corners && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Drag corners to align with document edges</p>
            <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <RefreshCw size={12} /> Start over
            </button>
          </div>

          <div className="flex justify-center bg-gray-100 rounded-xl overflow-hidden">
            <CornerEditor imageCanvas={imageCanvas} corners={corners} onChange={setCorners} />
          </div>

          <div className="grid grid-cols-2 gap-6 pt-1">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Enhancement</p>
              <div className="space-y-2">
                {[['bw', 'Black & White'], ['grayscale', 'Grayscale'], ['color', 'Color']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2.5 cursor-pointer group">
                    <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="accent-indigo-600" />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Output format</p>
              <div className="space-y-2">
                {[['pdf', 'PDF document'], ['jpg', 'JPEG image']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2.5 cursor-pointer group">
                    <input type="radio" name="format" value={v} checked={format === v} onChange={() => setFormat(v)} className="accent-indigo-600" />
                    <span className="text-sm text-gray-700 group-hover:text-gray-900">{l}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button
            onClick={handleScan}
            disabled={isProcessing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading
              ? <><RefreshCw size={16} className="animate-spin" /> Uploading…</>
              : isProcessing
              ? <><RefreshCw size={16} className="animate-spin" /> Processing…</>
              : <><Scan size={16} /> Scan Document</>}
          </button>
        </div>
      )}

      {/* ── Step 3: done ── */}
      {step === 'done' && result && status === 'completed' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">Scan complete!</p>
              <p className="text-sm text-gray-500">{result.filename}</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Input size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Output size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Download size={16} /> Download {format.toUpperCase()}
            </button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <RefreshCw size={16} /> Scan Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
