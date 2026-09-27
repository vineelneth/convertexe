import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { Trash2, Download, RefreshCw, CheckCircle } from 'lucide-react';
import FileDropzone from '../../components/FileDropzone';
import JobStatus from '../../components/JobStatus';
import { useJobPoller } from '../../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function parsePageSet(str, total) {
  const selected = new Set();
  if (!str.trim()) return selected;
  const parts = str.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const range = trimmed.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = parseInt(range[1]), to = parseInt(range[2]);
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        if (!total || (i >= 1 && i <= total)) selected.add(i);
      }
    } else {
      const n = parseInt(trimmed);
      if (!isNaN(n) && (!total || (n >= 1 && n <= total))) selected.add(n);
    }
  }
  return selected;
}

function serializePageSet(set) {
  if (!set.size) return '';
  return Array.from(set).sort((a, b) => a - b).join(', ');
}

export default function DeletePages() {
  const [file, setFile] = useState(null);
  const [pages, setPages] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Delete pages failed') : '';

  const handleFileChange = useCallback(async (newFile) => {
    setFile(newFile);
    setSelectedPages(new Set());
    setPages('');
    setPageCount(0);
    if (!newFile) return;
    // Try to get page count from the backend
    try {
      const formData = new FormData();
      formData.append('file', newFile);
      const { data } = await axios.post('/api/pdf/page-count', formData);
      if (data.pageCount) setPageCount(data.pageCount);
    } catch {
      // page-count endpoint may not exist; fall back gracefully
    }
  }, []);

  const togglePage = (n) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      setPages(serializePageSet(next));
      return next;
    });
  };

  const handlePagesTextChange = (val) => {
    setPages(val);
    setSelectedPages(parsePageSet(val, pageCount));
  };

  const handleDelete = async () => {
    if (!file || !pages.trim()) return;
    setLoading(true); setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('pages', pages);
    try {
      const { data } = await axios.post('/api/pdf/delete-pages', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFile(null); setPages(''); setPageCount(0); setSelectedPages(new Set()); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-900/40 rounded-xl flex items-center justify-center"><Trash2 size={20} className="text-rose-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Delete Pages</h1><p className="text-slate-400 text-sm">Remove specific pages from a PDF</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-950/40 border border-red-900/60 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-900/40 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-emerald-400" /></div>
            <div><p className="font-semibold text-slate-200">Pages deleted!</p><p className="text-sm text-slate-400">{result.filename}</p></div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-400 mb-1">Original size</p><p className="font-semibold text-slate-200">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-slate-400 mb-1">New size</p><p className="font-semibold text-emerald-400">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Edit Another</button>
          </div>
        </div>
      ) : (
        <div className="card space-y-5">
          <FileDropzone
            file={file}
            onFileChange={handleFileChange}
            accept=".pdf"
            label="Drag & drop a PDF here"
            supportedLabel="PDF files only"
          />

          {file && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-xs text-slate-500">Click pages to mark for deletion</p>
                {pageCount === 0 && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs text-slate-500">Total pages:</span>
                    <input
                      type="number"
                      min="1"
                      value={pageCount || ''}
                      onChange={(e) => setPageCount(parseInt(e.target.value) || 0)}
                      placeholder="e.g. 10"
                      className="w-16 border border-slate-700 bg-slate-800 text-slate-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>
              {pageCount > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => {
                    const isSelected = selectedPages.has(n);
                    return (
                      <button
                        key={n}
                        onClick={() => togglePage(n)}
                        className={`relative bg-slate-800 border rounded-lg aspect-[3/4] flex items-center justify-center text-xs font-semibold transition-all overflow-hidden
                          ${isSelected ? 'ring-2 ring-red-500 border-red-500 text-red-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                      >
                        {isSelected && (
                          <div className="absolute inset-0 bg-red-500/20" />
                        )}
                        <span className="relative z-10">{n}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1.5">Pages to delete</label>
            <input
              type="text"
              value={pages}
              onChange={(e) => handlePagesTextChange(e.target.value)}
              placeholder="e.g. 2, 5, 8-10"
              className="w-full border border-slate-700 bg-slate-800 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 mt-1">Separate page numbers with commas. Use hyphens for ranges.</p>
          </div>

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleDelete} disabled={!file || !pages.trim() || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><Trash2 size={16} /> Delete Pages</>}
          </button>
        </div>
      )}
    </div>
  );
}
