import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useLocation } from 'react-router-dom';
import { Zap, ChevronLeft, X, Send, CheckCircle } from 'lucide-react';

let viewsPosted = false;

function ContactModal({ onClose }) {
  const [fields, setFields] = useState({ email: '', message: '' });
  const [state, setState] = useState('idle'); // idle | sending | done | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    setState('sending');
    try {
      await axios.post('https://formspree.io/f/mnpnpzdb', fields, {
        headers: { Accept: 'application/json' },
      });
      setState('done');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">Report a bug or issue</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {state === 'done' ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-12 h-12 bg-emerald-900/40 rounded-full flex items-center justify-center">
              <CheckCircle size={24} className="text-emerald-400" />
            </div>
            <p className="font-semibold text-white">Message sent!</p>
            <p className="text-sm text-slate-400">Thanks for the report — we'll look into it.</p>
            <button onClick={onClose} className="mt-2 btn-primary px-6">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Your email <span className="text-slate-600 font-normal">(optional)</span></label>
              <input
                type="email"
                value={fields.email}
                onChange={e => setFields(f => ({ ...f, email: e.target.value }))}
                placeholder="so we can follow up"
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">What happened?</label>
              <textarea
                required
                rows={4}
                value={fields.message}
                onChange={e => setFields(f => ({ ...f, message: e.target.value }))}
                placeholder="Describe the bug or issue..."
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
            </div>
            {state === 'error' && (
              <p className="text-xs text-red-400">Something went wrong — please try again.</p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button
                type="submit"
                disabled={state === 'sending'}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Send size={14} />
                {state === 'sending' ? 'Sending…' : 'Send Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [views, setViews] = useState(null);
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    if (!isHome || viewsPosted) return;
    viewsPosted = true;
    axios.post('/api/views').then(({ data }) => setViews(data.count)).catch(() => {});
  }, [isHome]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <header className="bg-slate-950/90 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-900/50">
              <Zap size={15} className="text-white" />
            </div>
            <span className="font-extrabold text-lg bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent tracking-tight">
              Convertexe
            </span>
          </Link>

          {!isHome && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-indigo-400 transition-colors no-underline bg-slate-800/50 hover:bg-indigo-950/40 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-indigo-700"
            >
              <ChevronLeft size={14} /> All Tools
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:py-10 w-full">
        {children}
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 py-4 text-center text-xs text-slate-500 space-y-1">
        <p>Convertexe — Files are automatically deleted after processing</p>
        <p className="flex items-center justify-center gap-3">
          {views !== null && <span>{views.toLocaleString()} visits</span>}
          {views !== null && <span className="text-slate-700">|</span>}
          <span>
            Found a bug or issue?{' '}
            <button
              onClick={() => setShowContact(true)}
              className="text-indigo-400 hover:text-indigo-300 transition-colors underline underline-offset-2"
            >
              Report it
            </button>
          </span>
        </p>
      </footer>

      {showContact && <ContactModal onClose={() => setShowContact(false)} />}
    </div>
  );
}
