import React, { useState } from 'react';
import axios from 'axios';
import { FilePlus2, Download, RefreshCw, CheckCircle, X, GripVertical, Upload } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import JobStatus from '../../components/JobStatus';
import { useJobPoller } from '../../hooks/useJobPoller';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function SortableItem({ item, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 shadow-sm">
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 flex-shrink-0"
      >
        <GripVertical size={18} />
      </div>
      <span className="w-6 h-6 bg-indigo-900/40 text-indigo-300 text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate font-medium">{item.file.name}</p>
        <p className="text-xs text-slate-500">{formatBytes(item.file.size)}</p>
      </div>
      <button onClick={() => onRemove(item.id)} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}

export default function MergePdf() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draggingOver, setDraggingOver] = useState(false);
  const { startJob, reset: resetJob, status, progress, position, result, error: hookError } = useJobPoller();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const isProcessing = loading || (status && status !== 'completed' && status !== 'failed');
  const jobError = status === 'failed' ? (hookError || 'Merge failed') : '';

  const addFiles = (rawFiles) => {
    const newItems = Array.from(rawFiles)
      .filter(f => f.name.toLowerCase().endsWith('.pdf'))
      .map(file => ({ id: Date.now() + '-' + Math.random().toString(36).substr(2, 9) + file.name, file }));
    setFiles(prev => [...prev, ...newItems]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDraggingOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleRemove = (id) => setFiles(prev => prev.filter(f => f.id !== id));

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

  const handleMerge = async () => {
    if (files.length < 2) return;
    setLoading(true); setError('');
    const formData = new FormData();
    files.forEach(f => formData.append('files', f.file));
    try {
      const { data } = await axios.post('/api/pdf/merge', formData);
      startJob(data.jobId);
    } catch (err) { setError(err.response?.data?.error || 'Upload failed.'); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl; a.download = result.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleReset = () => { setFiles([]); setError(''); resetJob(); };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-red-900/40 rounded-xl flex items-center justify-center"><FilePlus2 size={20} className="text-rose-400" /></div>
        <div><h1 className="text-2xl font-bold text-white">Merge PDFs</h1><p className="text-slate-400 text-sm">Combine multiple PDFs into one document</p></div>
      </div>

      {(error || jobError) && <div className="bg-red-950/40 border border-red-900/60 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm">{error || jobError}</div>}

      {result && status === 'completed' ? (
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-900/40 rounded-full flex items-center justify-center"><CheckCircle size={20} className="text-emerald-400" /></div>
            <div><p className="font-semibold text-slate-200">PDFs merged!</p><p className="text-sm text-slate-400">{result.filename}</p></div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 mb-5 grid grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-400 mb-1">Combined size</p><p className="font-semibold text-slate-200">{formatBytes(result.originalSize)}</p></div>
            <div><p className="text-xs text-slate-400 mb-1">Merged PDF</p><p className="font-semibold text-emerald-400">{formatBytes(result.size)}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDownload} className="btn-primary flex-1 flex items-center justify-center gap-2"><Download size={16} /> Download</button>
            <button onClick={handleReset} className="btn-secondary flex-1 flex items-center justify-center gap-2"><RefreshCw size={16} /> Merge Another</button>
          </div>
        </div>
      ) : (
        <div className="card space-y-5">
          <label
            onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
            onDragLeave={() => setDraggingOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer flex flex-col items-center justify-center py-8 gap-2
              ${draggingOver ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-700 bg-slate-800/50 hover:border-indigo-500 hover:bg-indigo-950/40'}`}
          >
            <Upload size={28} className={draggingOver ? 'text-indigo-400' : 'text-slate-500'} />
            <p className="font-semibold text-slate-300">Drag & drop PDF files here</p>
            <p className="text-slate-400 text-sm">or <span className="text-indigo-400 font-medium">click to browse</span></p>
            <input type="file" multiple accept=".pdf" className="hidden" onChange={(e) => e.target.files.length && addFiles(e.target.files)} />
          </label>

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-300">{files.length} PDF{files.length !== 1 ? 's' : ''} — drag to reorder</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={files.map(f => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {files.map((item, index) => (
                      <SortableItem key={item.id} item={item} index={index} onRemove={handleRemove} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          <JobStatus status={status} progress={progress} position={position} error={jobError} />

          <button onClick={handleMerge} disabled={files.length < 2 || isProcessing} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={16} className="animate-spin" /> Uploading...</>
              : isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing...</>
              : <><FilePlus2 size={16} /> Merge PDFs</>}
          </button>
          {files.length === 1 && <p className="text-xs text-center text-slate-500">Add at least one more PDF to merge</p>}
        </div>
      )}
    </div>
  );
}
