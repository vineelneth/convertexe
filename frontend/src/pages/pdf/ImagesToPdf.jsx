import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { ImagePlus, Download, RefreshCw, CheckCircle, X, GripVertical, Upload, ChevronDown, Check } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as exifr from 'exifr';
import JobStatus from '../../components/JobStatus';
import { useJobPoller } from '../../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function SortDropdown({ value, onChange, options, hasExif }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <span>{selected?.label}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[200px]">
          {options.map(opt => {
            const disabled = opt.needsExif && !hasExif;
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => { if (!disabled) { onChange(opt.value); setOpen(false); } }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors
                  ${disabled ? 'text-gray-300 cursor-not-allowed' : active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <span>{opt.label}{disabled ? ' (no EXIF)' : ''}</span>
                {active && <Check size={12} className="text-indigo-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortableItem({ item, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="relative bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="aspect-square overflow-hidden bg-gray-100">
        <img src={item.preview} alt={item.file.name} className="w-full h-full object-cover" />
      </div>
      <div className="absolute top-1 left-1 w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center shadow">
        {index + 1}
      </div>
      <button
        onClick={() => onRemove(item.id)}
        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow"
      >
        <X size={12} />
      </button>
      <div
        {...attributes}
        {...listeners}
        className="absolute bottom-1 right-1 w-6 h-6 bg-white/80 rounded flex items-center justify-center cursor-grab active:cursor-grabbing shadow"
      >
        <GripVertical size={14} className="text-gray-500" />
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs text-gray-600 truncate">{item.file.name}</p>
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'filename-asc',   label: 'Filename A → Z' },
  { value: 'filename-desc',  label: 'Filename Z → A' },
  { value: 'exif-asc',       label: 'Photo date: oldest first',    needsExif: true },
  { value: 'exif-desc',      label: 'Photo date: newest first',    needsExif: true },
  { value: 'modified-asc',   label: 'Date modified: oldest first' },
  { value: 'modified-desc',  label: 'Date modified: newest first' },
  { value: 'size-asc',       label: 'File size: smallest first' },
  { value: 'size-desc',      label: 'File size: largest first' },
];

function applySort(items, mode) {
  const sorted = [...items];
  switch (mode) {
    case 'filename-asc':
      return sorted.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' }));
    case 'filename-desc':
      return sorted.sort((a, b) => b.file.name.localeCompare(a.file.name, undefined, { numeric: true, sensitivity: 'base' }));
    case 'exif-asc':
      return sorted.sort((a, b) => {
        if (a.exifDate && b.exifDate) return a.exifDate - b.exifDate;
        if (a.exifDate) return -1;
        if (b.exifDate) return 1;
        return a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' });
      });
    case 'exif-desc':
      return sorted.sort((a, b) => {
        if (a.exifDate && b.exifDate) return b.exifDate - a.exifDate;
        if (a.exifDate) return -1;
        if (b.exifDate) return 1;
        return b.file.name.localeCompare(a.file.name, undefined, { numeric: true, sensitivity: 'base' });
      });
    case 'modified-asc':
      return sorted.sort((a, b) => a.file.lastModified - b.file.lastModified);
    case 'modified-desc':
      return sorted.sort((a, b) => b.file.lastModified - a.file.lastModified);
    case 'size-asc':
      return sorted.sort((a, b) => a.file.size - b.file.size);
    case 'size-desc':
      return sorted.sort((a, b) => b.file.size - a.file.size);
    default:
      return sorted;
  }
}

export default function ImagesToPdf() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasExif, setHasExif] = useState(false);
  const [sortMode, setSortMode] = useState('filename-asc');
  const [draggingOver, setDraggingOver] = useState(false);
  const inputRef = useRef(null);
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Conversion failed') : '';

  const processNewFiles = useCallback(async (rawFiles) => {
    const newItems = await Promise.all(Array.from(rawFiles).map(async (file) => {
      const id = Date.now() + '-' + Math.random().toString(36).substr(2, 9) + file.name;
      const preview = URL.createObjectURL(file);
      let exifDate = null;
      try {
        const exif = await exifr.parse(file, ['DateTimeOriginal']);
        if (exif?.DateTimeOriginal) exifDate = new Date(exif.DateTimeOriginal);
      } catch {}
      return { id, file, preview, exifDate };
    }));

    setFiles(prev => {
      const combined = [...prev, ...newItems];
      const anyExif = combined.some(f => f.exifDate);
      setHasExif(anyExif);
      setSortMode(cur => {
        const next = cur === 'filename-asc' && anyExif ? 'exif-asc' : cur;
        return next;
      });
      return combined;
    });
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files.length) processNewFiles(e.target.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDraggingOver(false);
    if (e.dataTransfer.files.length) processNewFiles(e.dataTransfer.files);
  };

  const handleRemove = (id) => {
    setFiles(prev => {
      const item = prev.find(f => f.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter(f => f.id !== id);
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setFiles(prev => {
        const oldIndex = prev.findIndex(f => f.id === active.id);
        const newIndex = prev.findIndex(f => f.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleConvert = async () => {
    if (!files.length) return;
    setLoading(true); setError('');
    const formData = new FormData();
    files.forEach(f => formData.append('files', f.file));
    try {
      const { data } = await axios.post('/api/pdf/images-to-pdf', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleSortChange = (mode) => {
    setSortMode(mode);
    setFiles(prev => applySort(prev, mode));
  };

  const handleReset = () => {
    files.forEach(f => URL.revokeObjectURL(f.preview));
    setFiles([]); setError(''); setHasExif(false); setSortMode('filename-asc'); resetJob();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><ImagePlus size={20} className="text-red-600" /></div>
        <div><h1 className="text-2xl font-bold text-gray-900">Images to PDF</h1><p className="text-gray-500 text-sm">Combine multiple images into a single PDF</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-green-600" /></div>
            <div><p className="font-semibold text-gray-800">PDF created!</p><p className="text-sm text-gray-500">{result.filename}</p></div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500 mb-1">Original size</p><p className="font-semibold text-gray-700">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-gray-500 mb-1">PDF size</p><p className="font-semibold text-green-700">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download PDF</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Convert Another</button>
          </div>
        </div>
      ) : (
        <div className="card space-y-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
            onDragLeave={() => setDraggingOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer flex flex-col items-center justify-center py-8 gap-2
              ${draggingOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50'}`}
          >
            <Upload size={28} className={draggingOver ? 'text-indigo-600' : 'text-gray-400'} />
            <p className="font-semibold text-gray-700">Drag & drop images here</p>
            <p className="text-gray-400 text-sm">or <span className="text-indigo-600 font-medium">click to browse</span></p>
            <p className="text-xs text-gray-400">JPG, PNG, WebP, AVIF, HEIC, GIF, BMP, TIFF, SVG</p>
            <input ref={inputRef} type="file" multiple accept=".jpeg,.jpg,.png,.webp,.gif,.bmp,.tiff,.tif,.avif,.heic,.heif,.svg" className="hidden" onChange={handleFileInput} />
          </div>

          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-700 shrink-0">{files.length} image{files.length !== 1 ? 's' : ''} selected</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 shrink-0">Sort by</label>
                  <SortDropdown
                    value={sortMode}
                    onChange={handleSortChange}
                    options={SORT_OPTIONS}
                    hasExif={hasExif}
                  />
                </div>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={files.map(f => f.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {files.map((item, index) => (
                      <SortableItem key={item.id} item={item} index={index} onRemove={handleRemove} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleConvert} disabled={!files.length || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><ImagePlus size={16} /> Create PDF</>}
          </button>
        </div>
      )}
    </div>
  );
}
