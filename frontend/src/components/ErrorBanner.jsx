import React from 'react';
import { Lock, AlertCircle } from 'lucide-react';

export default function ErrorBanner({ message }) {
  if (!message) return null;

  const isPasswordError = /password/i.test(message);

  const Icon = isPasswordError ? Lock : AlertCircle;
  const title = isPasswordError ? 'Password-protected file' : 'Something went wrong';

  const cleanMessage = isPasswordError
    ? 'This PDF is password-protected. Remove the password from the file and try again.'
    : message;

  return (
    <div className="flex items-start gap-3 bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3.5 mb-4">
      <div className="w-8 h-8 bg-red-900/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={16} className="text-red-400" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-red-300">{title}</p>
        <p className="text-xs text-red-400/80 mt-0.5 leading-relaxed">{cleanMessage}</p>
      </div>
    </div>
  );
}
