import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Scissors, Download, RefreshCw, CheckCircle } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import JobStatus from '../components/JobStatus';
import { useJobPoller } from '../hooks/useJobPoller';

const ALL_INPUT_EXTS = '.mp3,.wav,.aac,.flac,.ogg,.oga,.m4a,.m4b,.wma,.webm,.opus,.mp1,.mp2,.mpc,.amr,.awb,.3gp,.aiff,.alac,.au,.gsm,.tta,.voc,.vox,.wv,.ape,.ra,.rm,.raw,.rf64,.sln,.8svx';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(secs) {
  if (secs == null || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTime(str) {
  if (!str || !str.trim()) return null;
  const s = str.trim();
  if (s.includes(':')) {
    const parts = s.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Waveform + dual-handle range slider ─────────────────────────────────────

function WaveformSlider({ duration, waveform, startSec, endSec, onChange }) {
  const outerRef = useRef(null);
  const dragRef  = useRef(null); // 'start' | 'end' | null

  const sp = (startSec / duration) * 100;
  const ep = (endSec   / duration) * 100;

  const getSecs = (clientX) => {
    const rect = outerRef.current.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * duration;
  };

  const onHandlePointerDown = (e, which) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = which;
    // Capture on outer so fast mouse moves don't drop the drag
    outerRef.current.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const s = getSecs(e.clientX);
    if (dragRef.current === 'start') onChange(Math.max(0, Math.min(s, endSec - 0.5)), endSec);
    else                             onChange(startSec, Math.min(duration, Math.max(s, startSec + 0.5)));
  };

  const onPointerUp = () => { dragRef.current = null; };

  const bars = waveform || Array(120).fill(0.3);

  return (
    <div
      ref={outerRef}
      className="relative select-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* ── Waveform visual (clips bars to rounded box) ── */}
      <div className="h-24 rounded-2xl bg-gray-100 overflow-hidden relative cursor-col-resize">

        {/* Bars */}
        <div className="absolute inset-0 flex items-center gap-px px-1">
          {bars.map((amp, i) => {
            const barPct = (i / bars.length) * 100;
            const inRange = barPct >= sp && barPct <= ep;
            return (
              <div
                key={i}
                className={`flex-1 rounded-full ${
                  !waveform    ? 'bg-gray-200 animate-pulse'
                  : inRange    ? 'bg-indigo-400'
                               : 'bg-gray-300'
                }`}
                style={{ height: `${Math.max(4, amp * 88)}%` }}
              />
            );
          })}
        </div>

        {/* Dark overlay — left of start */}
        {sp > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-black/20 pointer-events-none"
            style={{ width: `${sp}%` }}
          />
        )}
        {/* Dark overlay — right of end */}
        {ep < 100 && (
          <div
            className="absolute inset-y-0 right-0 bg-black/20 pointer-events-none"
            style={{ left: `${ep}%` }}
          />
        )}
      </div>

      {/* ── Start handle ── */}
      <Handle
        pct={sp}
        label={formatTime(startSec)}
        onPointerDown={(e) => onHandlePointerDown(e, 'start')}
        labelSide="left"
      />

      {/* ── End handle ── */}
      <Handle
        pct={ep}
        label={formatTime(endSec)}
        onPointerDown={(e) => onHandlePointerDown(e, 'end')}
        labelSide="right"
      />

      {/* ── Duration ruler ── */}
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
        <span>0:00</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function Handle({ pct, label, onPointerDown, labelSide }) {
  return (
    <div
      className="absolute top-0 h-24 z-20 flex items-center justify-center"
      style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
    >
      {/* Extended invisible hit area for easier grabbing */}
      <div
        className="absolute inset-y-0 w-8 cursor-ew-resize"
        onPointerDown={onPointerDown}
      />
      {/* Visible line */}
      <div className="w-0.5 h-full bg-indigo-600 pointer-events-none" />
      {/* Circle knob */}
      <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-indigo-600 rounded-full border-2 border-white shadow-lg pointer-events-none" />
      {/* Time tooltip */}
      <div
        className={`absolute -top-0.5 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none ${
          labelSide === 'right' ? 'right-3' : 'left-3'
        }`}
      >
        {label}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AudioTrimmer() {
  const [file, setFile]         = useState(null);
  const [duration, setDuration] = useState(null);
  const [waveform, setWaveform] = useState(null);
  const [startSec, setStartSec] = useState(0);
  const [endSec,   setEndSec]   = useState(0);
  const [startStr, setStartStr] = useState('0:00');
  const [endStr,   setEndStr]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError     = status === 'failed' ? (hookError || 'Trim failed') : '';

  // ── Load duration + waveform when file is chosen ──────────────────────────
  useEffect(() => {
    if (!file) {
      setDuration(null); setWaveform(null);
      setStartSec(0); setEndSec(0);
      setStartStr('0:00'); setEndStr('');
      return;
    }

    // Duration via HTML Audio element
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      const d = isFinite(audio.duration) ? audio.duration : 0;
      setDuration(d);
      setEndSec(d);
      setEndStr(formatTime(d));
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => URL.revokeObjectURL(url);
    audio.src = url;

    // Waveform via Web Audio API
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const ctx    = new (window.AudioContext || window.webkitAudioContext)();
        const buffer = await ctx.decodeAudioData(e.target.result);
        const data   = buffer.getChannelData(0);
        const BARS   = 120;
        const block  = Math.floor(data.length / BARS);
        const peaks  = Array.from({ length: BARS }, (_, i) => {
          let max = 0;
          for (let j = 0; j < block; j++) {
            const v = Math.abs(data[i * block + j] || 0);
            if (v > max) max = v;
          }
          return max;
        });
        setWaveform(peaks);
        await ctx.close();
      } catch {
        // Format not decodable by browser (e.g. some FLAC/WMA) — show flat line
        setWaveform(Array(120).fill(0.5));
      }
    };
    reader.readAsArrayBuffer(file);
  }, [file]);

  // ── Slider callback — update both sec state and text inputs ───────────────
  const handleSliderChange = (newStart, newEnd) => {
    setStartSec(newStart); setEndSec(newEnd);
    setStartStr(formatTime(newStart)); setEndStr(formatTime(newEnd));
  };

  // ── Text input callbacks — parse and update sec + slider if valid ─────────
  const handleStartStrChange = (val) => {
    setStartStr(val);
    const s = parseTime(val);
    if (s !== null && duration && s >= 0 && s < endSec) setStartSec(s);
  };

  const handleEndStrChange = (val) => {
    setEndStr(val);
    const s = parseTime(val);
    if (s !== null && duration && s > startSec && s <= duration) setEndSec(s);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleTrim = async () => {
    if (!file) return;
    // Treat endSec == duration as "trim to end" (send no end param)
    const end = duration && endSec >= duration ? null : endSec;
    if (end !== null && end <= startSec) { setError('End time must be after start time'); return; }
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('start', String(startSec));
    if (end !== null) formData.append('end', String(end));
    try {
      const { data } = await axios.post('/api/audio/trim', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => {
    setFile(null); setError(''); resetJob();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
          <Scissors size={20} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audio Trimmer</h1>
          <p className="text-gray-500 text-sm">Cut audio to a specific start and end time</p>
        </div>
      </div>

      {(error || jobError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
          {error || jobError}
        </div>
      )}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">Trim complete!</p>
              <p className="text-sm text-gray-500">{result.filename}</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">Trimmed size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Download size={16} /> Download
            </button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <RefreshCw size={16} /> Trim Another
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-5">
          <FileDropzone
            file={file}
            onFileChange={setFile}
            accept={ALL_INPUT_EXTS}
            supportedLabel="35+ audio formats (MP3, WAV, FLAC, AAC, OGG …)"
            label="Drag & drop an audio file here"
          />

          {file && duration != null && (
            <>
              {/* Stats row */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-gray-500 px-0.5 gap-0.5 sm:gap-0">
                <span>
                  Total duration: <span className="font-semibold text-gray-700">{formatTime(duration)}</span>
                </span>
                <span>
                  Selected: <span className="font-semibold text-indigo-600">{formatTime(endSec - startSec)}</span>
                  <span className="text-gray-400"> ({formatTime(startSec)} → {formatTime(endSec)})</span>
                </span>
              </div>

              {/* Waveform slider */}
              <WaveformSlider
                duration={duration}
                waveform={waveform}
                startSec={startSec}
                endSec={endSec}
                onChange={handleSliderChange}
              />

              {/* Manual time inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start time</label>
                  <input
                    type="text"
                    value={startStr}
                    onChange={(e) => handleStartStrChange(e.target.value)}
                    placeholder="0:00"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">End time</label>
                  <input
                    type="text"
                    value={endStr}
                    onChange={(e) => handleEndStrChange(e.target.value)}
                    placeholder={formatTime(duration)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>
            </>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button
            onClick={handleTrim}
            disabled={!file || !duration || isProcessing}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading      ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
            : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
                           : <><Scissors size={16} /> Trim Audio</>}
          </button>
        </div>
      )}
    </div>
  );
}
