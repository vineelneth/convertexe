import React from 'react';
import { Clock, Zap, AlertCircle } from 'lucide-react';
import ProgressBar from './ProgressBar';

export default function JobStatus({ status, progress, position, error }) {
  if (!status) return null;

  if (status === 'waiting') return (
    <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
      <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <Clock size={16} className="text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-800">Queued{position ? ` — #${position} in line` : ''}</p>
        <p className="text-xs text-amber-600 mt-0.5">Your file will be processed shortly</p>
      </div>
    </div>
  );

  if (status === 'active') return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Zap size={16} className="text-indigo-600 animate-pulse" />
        </div>
        <div>
          <p className="text-sm font-semibold text-indigo-800">Processing your file…</p>
          <p className="text-xs text-indigo-500">Keep this tab open</p>
        </div>
        <span className="ml-auto text-sm font-bold text-indigo-700">{progress}%</span>
      </div>
      <ProgressBar progress={progress} />
    </div>
  );

  if (status === 'failed') return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
      <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
        <AlertCircle size={16} className="text-red-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-red-800">Processing failed</p>
        <p className="text-xs text-red-600 mt-0.5">{error || 'Please try again.'}</p>
      </div>
    </div>
  );

  return null;
}
