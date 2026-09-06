import React from 'react';
import { Link } from 'react-router-dom';
import {
  Image, Minimize2, Maximize2, RotateCw, Contrast,
  Music, Volume2, Activity,
  Shield, Zap, Star, Globe, ScanLine,
  ImagePlus, FilePlus2, Scissors, Trash2, PackageOpen, Lock, Unlock, PenLine, FileImage,
} from 'lucide-react';

const featureGroups = [
  {
    label: 'Image Tools',
    id: 'image-tools',
    accent: 'blue',
    headerGrad: 'from-blue-500 to-cyan-500',
    tools: [
      { icon: Image,     title: 'Image Converter',  desc: 'Convert your images to JPG, PNG, WebP, AVIF, HEIC, SVG, GIF, BMP, TIFF, or ICO. Broad format support for any workflow.',           to: '/image/convert',   grad: 'from-blue-500 to-blue-600' },
      { icon: Minimize2, title: 'Image Compressor', desc: 'Shrink image file sizes significantly while preserving visual quality. Set a target size in KB or choose a quality level.',          to: '/image/compress',  grad: 'from-cyan-500 to-cyan-600' },
      { icon: Maximize2, title: 'Image Resizer',    desc: 'Resize images to exact pixel dimensions. Lock the aspect ratio to avoid distortion, or stretch to fill any custom size.',           to: '/image/resize',    grad: 'from-teal-500 to-teal-600' },
      { icon: RotateCw,  title: 'Rotate & Flip',    desc: 'Rotate images 90°, 180°, or 270°, or mirror them horizontally and vertically to fix orientation in seconds.',                      to: '/image/rotate',    grad: 'from-emerald-500 to-emerald-600' },
      { icon: Contrast,  title: 'Grayscale',         desc: 'Transform any color photo into a clean black-and-white image. Great for documents, prints, or artistic effects.',                  to: '/image/grayscale', grad: 'from-slate-500 to-slate-600' },
    ],
  },
  {
    label: 'Audio Tools',
    id: 'audio-tools',
    accent: 'violet',
    headerGrad: 'from-violet-500 to-purple-500',
    tools: [
      { icon: Music,    title: 'Audio Converter',   desc: 'Convert audio files between MP3, WAV, AAC, FLAC, OGG, M4A, OPUS, WMA, and 30+ other formats for any device or platform.',                          to: '/audio/convert',   grad: 'from-violet-500 to-violet-600' },
      { icon: Volume2,  title: 'Audio Compressor',  desc: 'Reduce audio file size by lowering the bitrate. Set a custom target size in KB or pick a bitrate from 32 kbps to 320 kbps.',                     to: '/audio/compress',  grad: 'from-purple-500 to-purple-600' },
      { icon: Scissors, title: 'Audio Trimmer',     desc: 'Cut your audio to a precise start and end time. Keep only the part you need and discard the rest — great for clips and intros.',                   to: '/audio/trim',      grad: 'from-fuchsia-500 to-violet-600' },
      { icon: Activity, title: 'Normalize Audio',   desc: 'Balance the loudness of your audio to a consistent level using the EBU R128 standard. Choose a preset for YouTube, Spotify, or broadcast.',       to: '/audio/normalize', grad: 'from-indigo-500 to-violet-500' },
      {
        icon: ({ size, className }) => (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M2 12h2l3-8 4 16 3-10 2 6h6" />
          </svg>
        ),
        title: 'Audio Fade',
        desc: 'Add a smooth fade-in at the start and a fade-out at the end of any audio file. Set the duration in seconds using simple sliders.',
        to: '/audio/fade',
        grad: 'from-purple-500 to-fuchsia-500',
      },
    ],
  },
  {
    label: 'PDF Tools',
    id: 'pdf-tools',
    accent: 'rose',
    headerGrad: 'from-rose-500 to-orange-500',
    tools: [
      { icon: ImagePlus,   title: 'Images to PDF',    desc: 'Combine multiple JPG, PNG, or WebP images into a single, neatly organized PDF document in one click.',                          to: '/pdf/images-to-pdf', grad: 'from-red-500 to-orange-500' },
      { icon: FilePlus2,   title: 'Merge PDFs',        desc: 'Join two or more PDF files into one document. Drag to reorder pages before merging for the exact result you need.',             to: '/pdf/merge',         grad: 'from-red-500 to-rose-600' },
      { icon: Scissors,    title: 'Split PDF',         desc: 'Extract a specific set of pages from a PDF and save them as a separate file. Enter page numbers or ranges like 1-3, 5.',       to: '/pdf/split',         grad: 'from-orange-500 to-amber-500' },
      { icon: RotateCw,    title: 'Rotate PDF Pages',  desc: 'Fix the orientation of scanned or sideways pages. Rotate all pages or only the ones you choose by 90°, 180°, or 270°.',      to: '/pdf/rotate',        grad: 'from-red-400 to-orange-400' },
      { icon: Trash2,      title: 'Delete PDF Pages',  desc: 'Remove blank, duplicate, or unwanted pages from a PDF without re-creating the whole document from scratch.',                   to: '/pdf/delete-pages',  grad: 'from-rose-500 to-red-600' },
      { icon: PackageOpen, title: 'Compress PDF',      desc: 'Reduce PDF file size by optimizing its internal structure and streams — ideal for emailing or uploading large documents.',     to: '/pdf/compress',      grad: 'from-orange-400 to-red-400' },
      { icon: Lock,        title: 'Protect PDF',       desc: 'Secure your PDF with a 256-bit AES password. Only people who know the password will be able to open the document.',            to: '/pdf/protect',       grad: 'from-red-600 to-rose-700' },
      { icon: PenLine,     title: 'Watermark PDF',     desc: 'Stamp a diagonal text watermark across every page of your PDF. Customize the text and opacity to suit your branding.',         to: '/pdf/watermark',     grad: 'from-amber-500 to-orange-600' },
      { icon: FileImage,   title: 'PDF to Images',     desc: 'Convert every page of a PDF into a high-resolution PNG image. Preview each page and download only the ones you need.',         to: '/pdf/to-images',     grad: 'from-red-400 to-rose-500' },
      { icon: Unlock,      title: 'Unlock PDF',        desc: 'Remove password protection from a PDF you own. Enter the correct password and get back an unlocked, freely accessible file.',  to: '/pdf/unlock',        grad: 'from-green-500 to-emerald-500' },
    ],
  },
  {
    label: 'Scanner',
    id: 'scanner-tools',
    accent: 'indigo',
    headerGrad: 'from-indigo-500 to-violet-500',
    tools: [
      { icon: ScanLine, title: 'Document Scanner', desc: 'Photograph a document and auto-detect its edges. Correct perspective, choose B&W or color, and export as a PDF or JPEG.', to: '/scanner', grad: 'from-indigo-500 to-violet-600' },
    ],
  },
];

const stats = [
  { icon: Star,   label: '21 Tools',      sub: 'Ready to use' },
  { icon: Globe,  label: '35+ Formats',   sub: 'Supported' },
  { icon: Shield, label: 'Private',       sub: 'Files auto-deleted' },
];

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

const accentRing = {
  blue:   'ring-blue-200 hover:ring-blue-400',
  violet: 'ring-violet-200 hover:ring-violet-400',
  rose:   'ring-rose-200 hover:ring-rose-400',
  indigo: 'ring-indigo-200 hover:ring-indigo-400',
};

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Hero ── */}
      <section className="relative text-center py-20 overflow-hidden">
        {/* background blobs */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-50 pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-violet-100 rounded-full blur-3xl opacity-50 pointer-events-none" />

        <div className="relative">
          <span className="inline-flex items-center gap-2 bg-white text-indigo-600 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 border border-indigo-200 shadow-sm tracking-wide uppercase">
            <Zap size={12} /> Free · Fast · No account needed
          </span>

          <h1 className="text-5xl lg:text-6xl font-extrabold text-gray-900 mb-5 leading-[1.1] tracking-tight">
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
              Convertexe
            </span>
          </h1>

          <p className="text-xl font-semibold text-gray-700 mb-3 tracking-wide">
            Files. Simplified.
          </p>

          <p className="text-base text-gray-500 max-w-xl mx-auto mb-10 leading-relaxed">
            All your image, audio, and PDF tools in one place — free, instant, and completely private.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            {[
              { id: 'image-tools',   icon: Image,     label: 'Image Tools', grad: 'from-blue-500 to-cyan-500' },
              { id: 'audio-tools',   icon: Music,     label: 'Audio Tools', grad: 'from-violet-500 to-purple-500' },
              { id: 'pdf-tools',     icon: FileImage, label: 'PDF Tools',   grad: 'from-rose-500 to-orange-500' },
              { id: 'scanner-tools', icon: ScanLine,  label: 'Scanner',     grad: 'from-indigo-500 to-violet-500' },
            ].map(({ id, icon: Icon, label, grad }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r ${grad} text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="grid grid-cols-3 gap-4 mb-16">
        {stats.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <s.icon size={20} className="text-indigo-600" />
            </div>
            <div>
              <p className="font-bold text-xl text-gray-900 leading-none">{s.label}</p>
              <p className="text-gray-500 text-sm mt-0.5">{s.sub}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Tool groups ── */}
      <section className="pb-16 space-y-14">
        {featureGroups.map((group) => (
          <div key={group.id} id={group.id}>

            {/* Group header */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`h-8 w-1 rounded-full bg-gradient-to-b ${group.headerGrad}`} />
              <h2 className="text-xl font-bold text-gray-800">{group.label}</h2>
              <span className="text-sm text-gray-400 font-medium">{group.tools.length} tools</span>
            </div>

            {/* Tool cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {group.tools.map((tool) => (
                <Link
                  key={tool.to}
                  to={tool.to}
                  className={`group bg-white rounded-2xl shadow-sm hover:shadow-md p-5 flex flex-col gap-3 no-underline transition-all duration-200 hover:-translate-y-1 ring-2 ${accentRing[group.accent]}`}
                >
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${tool.grad} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <tool.icon size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 group-hover:text-indigo-600 transition-colors text-sm leading-snug">{tool.title}</h3>
                    <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{tool.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

    </div>
  );
}
