import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Camera, Upload, RefreshCw, Download, CheckCircle, ScanLine, X, Scan, Crosshair, Plus, FileText, Image, Zap } from 'lucide-react';
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

// ─── Auto corner + edge detection ────────────────────────────────────────────
// Pipeline: Gaussian blur → Canny → connected components → convex hull →
//           Douglas-Peucker → largest quadrilateral = document boundary.

function detectCorners(imgCanvas) {
  const iW = imgCanvas.width, iH = imgCanvas.height;
  const PROC_MAX = 900;
  const scale = Math.min(PROC_MAX / iW, PROC_MAX / iH, 1);
  const pW = Math.round(iW * scale), pH = Math.round(iH * scale);

  const tmp = document.createElement('canvas');
  tmp.width = pW; tmp.height = pH;
  tmp.getContext('2d').drawImage(imgCanvas, 0, 0, pW, pH);
  const { data: px } = tmp.getContext('2d').getImageData(0, 0, pW, pH);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fallback = () => { const m = 0.05; return [{x:iW*m,y:iH*m},{x:iW*(1-m),y:iH*m},{x:iW*(1-m),y:iH*(1-m)},{x:iW*m,y:iH*(1-m)}]; };

  // ── Grayscale ──
  const gray = new Float32Array(pW * pH);
  for (let i = 0; i < pW * pH; i++)
    gray[i] = 0.299*px[i*4] + 0.587*px[i*4+1] + 0.114*px[i*4+2];

  // ── 5×5 Gaussian blur (removes text/wrinkles before edge detection) ──
  const kG = [2,4,5,4,2,4,9,12,9,4,5,12,15,12,5,4,9,12,9,4,2,4,5,4,2];
  const gb = new Float32Array(pW * pH);
  for (let y = 2; y < pH-2; y++)
    for (let x = 2; x < pW-2; x++) {
      let s = 0;
      for (let ky=-2; ky<=2; ky++) for (let kx=-2; kx<=2; kx++)
        s += gray[(y+ky)*pW+(x+kx)] * kG[(ky+2)*5+(kx+2)];
      gb[y*pW+x] = s / 159;
    }

  // ── Sobel gradient ──
  const mag = new Float32Array(pW * pH);
  const angQ = new Uint8Array(pW * pH);
  for (let y = 1; y < pH-1; y++)
    for (let x = 1; x < pW-1; x++) {
      const gx = -gb[(y-1)*pW+(x-1)]+gb[(y-1)*pW+(x+1)]-2*gb[y*pW+(x-1)]+2*gb[y*pW+(x+1)]-gb[(y+1)*pW+(x-1)]+gb[(y+1)*pW+(x+1)];
      const gy =  gb[(y-1)*pW+(x-1)]+2*gb[(y-1)*pW+x]+gb[(y-1)*pW+(x+1)]-gb[(y+1)*pW+(x-1)]-2*gb[(y+1)*pW+x]-gb[(y+1)*pW+(x+1)];
      mag[y*pW+x] = Math.sqrt(gx*gx + gy*gy);
      const a = (Math.atan2(gy, gx) * 180 / Math.PI + 180) % 180;
      angQ[y*pW+x] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }

  // ── Non-maximum suppression ──
  const nms = new Float32Array(pW * pH);
  for (let y = 1; y < pH-1; y++)
    for (let x = 1; x < pW-1; x++) {
      const m = mag[y*pW+x]; let q, r;
      switch (angQ[y*pW+x]) {
        case 0: q=mag[y*pW+x+1];       r=mag[y*pW+x-1];        break;
        case 1: q=mag[(y+1)*pW+(x-1)]; r=mag[(y-1)*pW+(x+1)];  break;
        case 2: q=mag[(y+1)*pW+x];     r=mag[(y-1)*pW+x];       break;
        default:q=mag[(y-1)*pW+(x-1)]; r=mag[(y+1)*pW+(x+1)];
      }
      nms[y*pW+x] = m >= q && m >= r ? m : 0;
    }

  // ── Adaptive Canny thresholds — 88th percentile of non-zero NMS magnitudes ──
  // Percentile is robust to one dominant edge blowing up the fixed-fraction approach.
  const nzMags = [];
  for (let i = 0; i < pW*pH; i++) if (nms[i] > 0) nzMags.push(nms[i]);
  nzMags.sort((a, b) => a - b);
  const highT = nzMags.length ? nzMags[Math.floor(nzMags.length * 0.88)] : 30;
  const lowT = highT * 0.35;

  // ── Hysteresis thresholding (Canny) ──
  const edges = new Uint8Array(pW * pH);
  for (let i = 0; i < pW*pH; i++) edges[i] = nms[i] >= highT ? 2 : nms[i] >= lowT ? 1 : 0;
  for (let y = 1; y < pH-1; y++)
    for (let x = 1; x < pW-1; x++)
      if (edges[y*pW+x] === 1) {
        const nb = edges[(y-1)*pW+(x-1)]|edges[(y-1)*pW+x]|edges[(y-1)*pW+(x+1)]
                  |edges[y*pW+(x-1)]|edges[y*pW+(x+1)]
                  |edges[(y+1)*pW+(x-1)]|edges[(y+1)*pW+x]|edges[(y+1)*pW+(x+1)];
        edges[y*pW+x] = (nb & 2) ? 2 : 0;
      }

  // ── Morphological dilation (radius 3) — bridges gaps in broken document borders ──
  const dilated = new Uint8Array(pW * pH);
  const DR = 3;
  for (let y = 0; y < pH; y++)
    for (let x = 0; x < pW; x++) {
      if (edges[y*pW+x] !== 2) continue;
      for (let dy = -DR; dy <= DR; dy++) for (let dx = -DR; dx <= DR; dx++) {
        const ny = y+dy, nx = x+dx;
        if (ny >= 0 && ny < pH && nx >= 0 && nx < pW) dilated[ny*pW+nx] = 1;
      }
    }

  // ── Connected components on dilated edge map ──
  const visited = new Uint8Array(pW * pH);
  const components = [];
  for (let sy = 0; sy < pH; sy++) {
    for (let sx = 0; sx < pW; sx++) {
      if (!dilated[sy*pW+sx] || visited[sy*pW+sx]) continue;
      const comp = [], q = [sy*pW+sx];
      visited[sy*pW+sx] = 1;
      let qi = 0;
      while (qi < q.length) {
        const idx = q[qi++], cy = (idx / pW) | 0, cx = idx % pW;
        comp.push([cx, cy]);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const ny = cy+dy, nx = cx+dx;
          if (ny >= 0 && ny < pH && nx >= 0 && nx < pW) {
            const ni = ny*pW+nx;
            if (dilated[ni] && !visited[ni]) { visited[ni] = 1; q.push(ni); }
          }
        }
      }
      if (comp.length >= 100) components.push(comp);
    }
  }
  components.sort((a, b) => b.length - a.length);

  // ── Convex hull (Graham scan) ──
  function convexHull(pts) {
    const p = [...pts].sort((a, b) => a[0]-b[0] || a[1]-b[1]);
    const cross = (O, A, B) => (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0]);
    const lo = [], hi = [];
    for (const v of p) { while (lo.length >= 2 && cross(lo[lo.length-2], lo[lo.length-1], v) <= 0) lo.pop(); lo.push(v); }
    for (let i = p.length-1; i >= 0; i--) { const v=p[i]; while (hi.length >= 2 && cross(hi[hi.length-2], hi[hi.length-1], v) <= 0) hi.pop(); hi.push(v); }
    hi.pop(); lo.pop();
    return lo.concat(hi);
  }

  // ── Shoelace polygon area ──
  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i+1) % pts.length;
      a += pts[i][0]*pts[j][1] - pts[j][0]*pts[i][1];
    }
    return Math.abs(a) / 2;
  }

  // ── Sort 4 points into TL / TR / BR / BL order ──
  function sort4(pts) {
    let tl=pts[0], tr=pts[0], br=pts[0], bl=pts[0];
    let minS=1e9, maxDiff=-1e9, maxS=-1e9, minDiff=1e9;
    for (const [x, y] of pts) {
      if (x+y < minS)    { minS=x+y;    tl=[x,y]; }
      if (x-y > maxDiff) { maxDiff=x-y; tr=[x,y]; }
      if (x+y > maxS)    { maxS=x+y;    br=[x,y]; }
      if (x-y < minDiff) { minDiff=x-y; bl=[x,y]; }
    }
    return [tl, tr, br, bl];
  }

  // ── Extract quad from hull: pick 4 diagonal extremes directly ──
  // More robust than DP — always gives exactly 4 meaningful corners.
  function hullToQuad(hull) {
    if (hull.length < 4) return null;
    return sort4(hull);
  }

  // ── Validate quad dimensions and area ──
  function quadScore(quad) {
    const area = polyArea(quad);
    if (area < pW * pH * 0.06) return -1;
    const [tl, tr, br, bl] = quad;
    const w = Math.max(Math.hypot(tr[0]-tl[0], tr[1]-tl[1]), Math.hypot(br[0]-bl[0], br[1]-bl[1]));
    const h = Math.max(Math.hypot(bl[0]-tl[0], bl[1]-tl[1]), Math.hypot(br[0]-tr[0], br[1]-tr[1]));
    if (w < pW * 0.20 || h < pH * 0.20) return -1;
    return area;
  }

  // ── Try each of the top-10 largest components ──
  let bestScore = 0, bestQuad = null;
  for (const comp of components.slice(0, 10)) {
    // Subsample large components for hull performance
    const pts = comp.length > 3000
      ? comp.filter((_, i) => i % Math.ceil(comp.length / 3000) === 0)
      : comp;
    const hull = convexHull(pts);
    const quad = hullToQuad(hull);
    if (!quad) continue;
    const score = quadScore(quad);
    if (score > bestScore) { bestScore = score; bestQuad = quad; }
  }

  if (bestQuad) {
    return bestQuad.map(([x, y]) => ({ x: clamp(x/scale, 0, iW), y: clamp(y/scale, 0, iH) }));
  }

  // ── Fallback: convex hull of ALL dilated edge pixels ──
  const allPts = [];
  for (let y = 0; y < pH; y++) for (let x = 0; x < pW; x++) if (dilated[y*pW+x]) allPts.push([x,y]);
  if (allPts.length >= 10) {
    const hull = convexHull(allPts);
    const quad = hullToQuad(hull);
    if (quad && quadScore(quad) >= 0)
      return quad.map(([x, y]) => ({ x: clamp(x/scale, 0, iW), y: clamp(y/scale, 0, iH) }));
  }
  return fallback();
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
  const [facing, setFacing] = useState('environment');
  const [zoom, setZoom] = useState(1);
  const [hwZoom, setHwZoom] = useState(false);
  const [hwZoomMax, setHwZoomMax] = useState(4);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const zoomRef = useRef(1);
  const activePointers = useRef(new Map());
  const pinchStart = useRef(null); // { dist, zoom }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      setReady(false); setErr('');
      setZoom(1); zoomRef.current = 1;
      setTorchOn(false); setTorchSupported(false); setHwZoom(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities?.() ?? {};
        if (caps.zoom && caps.zoom.max > 1) {
          setHwZoom(true);
          setHwZoomMax(Math.min(caps.zoom.max, 8));
        }
        if (caps.torch) setTorchSupported(true);
        setReady(true);
      } catch (e) {
        if (!cancelled) setErr('Camera access denied: ' + e.message);
      }
    }
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [facing]);

  const applyZoom = async (newZoom) => {
    const max = hwZoom ? hwZoomMax : 5;
    const clamped = Math.max(1, Math.min(max, newZoom));
    zoomRef.current = clamped;
    setZoom(clamped);
    if (hwZoom) {
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ zoom: clamped }] }).catch(() => {});
    }
  };

  const toggleTorch = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    track.applyConstraints({ advanced: [{ torch: next }] }).catch(() => {});
    setTorchOn(next);
  };

  // Pinch-to-zoom
  const onPointerDown = (e) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...activePointers.current.values()];
    if (pts.length === 2) {
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (!pinchStart.current) {
        pinchStart.current = { dist, zoom: zoomRef.current };
      } else {
        const newZoom = pinchStart.current.zoom * (dist / pinchStart.current.dist);
        applyZoom(newZoom);
      }
    }
  };
  const onPointerUp = (e) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchStart.current = null;
  };

  const capture = () => {
    const v = videoRef.current;
    const c = document.createElement('canvas');
    const currentZoom = zoomRef.current;
    if (!hwZoom && currentZoom > 1) {
      // CSS zoom: crop the center region that matches what the user sees
      const w = Math.round(v.videoWidth / currentZoom);
      const h = Math.round(v.videoHeight / currentZoom);
      const sx = Math.round((v.videoWidth - w) / 2);
      const sy = Math.round((v.videoHeight - h) / 2);
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(v, sx, sy, w, h, 0, 0, w, h);
    } else {
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    onCapture(c);
  };

  // For CSS zoom: scale the video element; hardware zoom shows already-zoomed feed
  const cssScale = hwZoom ? 1 : zoom;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 bg-gradient-to-b from-black/70 to-transparent absolute top-0 left-0 right-0 z-10">
        <button onClick={onClose} className="text-white p-2 -ml-2 active:opacity-60">
          <X size={24} />
        </button>
        <div className="flex items-center gap-1">
          {torchSupported && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-full active:opacity-60 ${torchOn ? 'text-yellow-400' : 'text-white/80'}`}
            >
              <Zap size={22} fill={torchOn ? 'currentColor' : 'none'} />
            </button>
          )}
          <button
            onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
            className="text-white/80 p-2 active:opacity-60"
          >
            <RefreshCw size={22} />
          </button>
        </div>
      </div>

      {err && (
        <div className="absolute top-16 left-4 right-4 z-10 bg-red-900/80 text-red-200 text-sm px-4 py-2 rounded-lg">
          {err}
        </div>
      )}

      {/* Viewfinder — fills full screen, touch area for pinch zoom */}
      <div
        className="flex-1 relative overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            transform: `scale(${cssScale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.05s ease-out',
          }}
        />

        {/* Document guide: corner brackets */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative" style={{ width: '82%', height: '72%' }}>
            {[
              'top-0 left-0 border-t-2 border-l-2',
              'top-0 right-0 border-t-2 border-r-2',
              'bottom-0 right-0 border-b-2 border-r-2',
              'bottom-0 left-0 border-b-2 border-l-2',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-7 h-7 border-white/70 rounded-sm ${cls}`} />
            ))}
          </div>
        </div>

        {/* Zoom level badge */}
        {zoom > 1.05 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm font-medium px-3 py-1 rounded-full pointer-events-none">
            {zoom.toFixed(1)}×
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 bg-gradient-to-t from-black/80 to-transparent px-6 pb-10 pt-6 space-y-5">
        {/* Zoom presets */}
        <div className="flex justify-center gap-5">
          {[1, 2, 3].map(z => (
            <button
              key={z}
              onClick={() => applyZoom(z)}
              className={`w-11 h-11 rounded-full text-sm font-semibold border transition-all active:scale-90 ${
                Math.abs(zoom - z) < 0.3
                  ? 'bg-white text-black border-white scale-110'
                  : 'bg-black/40 text-white border-white/40'
              }`}
            >
              {z}×
            </button>
          ))}
        </div>

        {/* Shutter button */}
        <div className="flex justify-center">
          <button
            onClick={capture}
            disabled={!ready}
            className="w-20 h-20 rounded-full bg-white border-4 border-indigo-500 flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
          >
            <div className="w-14 h-14 rounded-full bg-indigo-600" />
          </button>
        </div>
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
  const [step, setStep] = useState('idle');       // idle | adjust | review | done
  const [imageCanvas, setImageCanvas] = useState(null);
  const [corners, setCorners] = useState(null);
  const [mode, setMode] = useState('bw');          // bw | grayscale | color (applies to all pages)
  const [pages, setPages] = useState([]);          // [{ id, filename, previewUrl }]
  const [jobType, setJobType] = useState('page'); // 'page' | 'combine'
  const jobTypeRef = useRef('page');
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

  // Scan a single page — always produces a JPEG; format is chosen at export time
  const handleScan = async () => {
    if (!imageCanvas || !corners) return;
    setLoading(true); setError(''); resetJob();
    jobTypeRef.current = 'page';
    setJobType('page');
    try {
      const warped = warpCanvas(imageCanvas, corners);
      const blob = await new Promise(res => warped.toBlob(res, 'image/jpeg', 0.95));
      const formData = new FormData();
      formData.append('image', blob, 'scan.jpg');
      formData.append('mode', mode);
      formData.append('format', 'jpg');
      const { data } = await axios.post('/api/scanner/process', formData);
      startJob(data.jobId);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  // Combine all scanned pages into a single PDF
  const handleExportPDF = async () => {
    if (pages.length === 0) return;
    setLoading(true); setError(''); resetJob();
    jobTypeRef.current = 'combine';
    setJobType('combine');
    try {
      const { data } = await axios.post('/api/scanner/combine', {
        filenames: pages.map(p => p.filename),
      });
      startJob(data.jobId);
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  // Download each scanned page as an individual JPEG
  const handleDownloadImages = async () => {
    if (pages.length === 0) return;
    setLoading(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        const a = document.createElement('a');
        a.href = `/api/download/${pages[i].filename}`;
        a.download = `scan_page_${i + 1}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (i < pages.length - 1) await new Promise(r => setTimeout(r, 400));
      }
    } finally {
      setLoading(false);
      handleReset();
    }
  };

  // Go back to idle to add another page (keeps current pages list)
  const handleAddPage = () => {
    setStep('idle');
    setImageCanvas(null);
    setCorners(null);
    setError('');
    resetJob();
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleRemovePage = (id) => {
    setPages(prev => prev.filter(p => p.id !== id));
  };

  const handleMovePage = (id, direction) => {
    setPages(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => {
    setStep('idle'); setImageCanvas(null); setCorners(null);
    setPages([]); setError(''); resetJob();
    jobTypeRef.current = 'page'; setJobType('page');
    if (inputRef.current) inputRef.current.value = '';
  };

  // When a page finishes processing: add to list and go to review.
  // When combine finishes: go to done.
  useEffect(() => {
    if (status === 'completed' && result) {
      if (jobTypeRef.current === 'page') {
        setPages(prev => [...prev, {
          id: Date.now(),
          filename: result.filename,
          previewUrl: `/api/preview/${result.filename}`,
        }]);
        setStep('review');
        setImageCanvas(null);
        setCorners(null);
        resetJob();
      } else {
        setStep('done');
      }
    }
  }, [status, result]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-return to idle if the last page is removed from review
  useEffect(() => {
    if (step === 'review' && pages.length === 0) setStep('idle');
  }, [pages.length, step]);

  return (
    <div className="max-w-3xl mx-auto">
      {showCamera && <CameraCapture onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
          <ScanLine size={20} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Scanner</h1>
          <p className="text-gray-500 text-sm">Auto-detect edges, correct perspective, export as PDF or images</p>
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
          {pages.length > 0 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 font-medium">
                Session active — {pages.length} page{pages.length !== 1 ? 's' : ''} scanned
              </p>
              <button
                onClick={() => setStep('review')}
                className="text-xs text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 transition-colors"
              >
                Back to pages
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Upload a photo of a document or use your camera. Corners are detected automatically — drag them to adjust.
            </p>
          )}
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-700">
              {pages.length > 0
                ? `Page ${pages.length + 1} — drag corners to align`
                : 'Drag corners to align with document edges'}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setCorners(detectCorners(imageCanvas))}
                className="flex items-center gap-1 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 transition-colors"
              >
                <Crosshair size={12} /> Re-detect
              </button>
              <button
                onClick={pages.length > 0 ? handleAddPage : handleReset}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X size={12} /> {pages.length > 0 ? 'Cancel' : 'Start over'}
              </button>
            </div>
          </div>

          <div className="flex justify-center bg-gray-100 rounded-xl overflow-hidden">
            <CornerEditor imageCanvas={imageCanvas} corners={corners} onChange={setCorners} />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Enhancement</p>
            <div className="flex gap-4">
              {[['bw', 'Black & White'], ['grayscale', 'Grayscale'], ['color', 'Color']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer group">
                  <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="accent-indigo-600" />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">{l}</span>
                </label>
              ))}
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
              : <><Scan size={16} /> Scan Page</>}
          </button>
        </div>
      )}

      {/* ── Step 3: review pages ── */}
      {step === 'review' && pages.length > 0 && (
        <div className="card space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-800">
              {pages.length} page{pages.length !== 1 ? 's' : ''} scanned
            </h2>
            <button
              onClick={handleAddPage}
              className="flex items-center gap-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors shrink-0"
            >
              <Plus size={14} /> Add Page
            </button>
          </div>

          {/* Page thumbnails */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {pages.map((page, idx) => (
              <div key={page.id} className="relative group">
                <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={page.previewUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-center text-xs text-gray-400 mt-1">{idx + 1}</p>
                {/* hover/focus overlay: reorder + delete */}
                <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {idx > 0 && (
                    <button
                      onClick={() => handleMovePage(page.id, -1)}
                      title="Move up"
                      className="w-6 h-6 bg-white rounded shadow text-gray-600 hover:text-indigo-600 flex items-center justify-center text-xs font-bold leading-none"
                    >
                      ↑
                    </button>
                  )}
                  {idx < pages.length - 1 && (
                    <button
                      onClick={() => handleMovePage(page.id, 1)}
                      title="Move down"
                      className="w-6 h-6 bg-white rounded shadow text-gray-600 hover:text-indigo-600 flex items-center justify-center text-xs font-bold leading-none"
                    >
                      ↓
                    </button>
                  )}
                  <button
                    onClick={() => handleRemovePage(page.id)}
                    title="Remove page"
                    className="w-6 h-6 bg-red-500 hover:bg-red-600 rounded shadow text-white flex items-center justify-center"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Export */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Export</p>
            <JobStatus status={status} progress={progress} position={position} error={jobError} />
            <div className="flex gap-3">
              <button
                onClick={handleExportPDF}
                disabled={isProcessing}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {isProcessing && jobType === 'combine'
                  ? <><RefreshCw size={16} className="animate-spin" /> Building PDF…</>
                  : <><FileText size={16} /> Export PDF</>}
              </button>
              <button
                onClick={handleDownloadImages}
                disabled={isProcessing}
                className="btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                {loading && jobType === 'page'
                  ? <><RefreshCw size={16} className="animate-spin" /> Downloading…</>
                  : <><Image size={16} /> Save Images</>}
              </button>
            </div>
            <button
              onClick={handleReset}
              className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-1"
            >
              <RefreshCw size={11} /> Start new scan
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: done (PDF export complete) ── */}
      {step === 'done' && result && status === 'completed' && (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">Export complete!</p>
              <p className="text-sm text-gray-500">{result.filename}</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Input size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Output size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Download size={16} /> Download PDF
            </button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <RefreshCw size={16} /> New Scan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
