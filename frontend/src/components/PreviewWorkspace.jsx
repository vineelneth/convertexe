import React from 'react';

/**
 * Two-panel layout: controls on the left, preview on the right (sticky).
 * On mobile: controls stack above, preview below.
 *
 * Props:
 *   children  – left panel content (file upload, thumbnails, settings, action button)
 *   preview   – right panel content (a <PreviewPane />)
 */
export default function PreviewWorkspace({ children, preview }) {
  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:items-stretch">
      {/* Left: controls — flex-col so the card child can flex-1 to fill height */}
      <div className="flex-1 min-w-0 flex flex-col [&>*]:flex-1">
        {children}
      </div>
      {/* Right: preview — sticky on desktop so it stays visible while scrolling controls */}
      {preview && (
        <div className="w-full lg:w-[400px] xl:w-[440px] lg:shrink-0 lg:sticky lg:top-20 lg:self-start">
          {preview}
        </div>
      )}
    </div>
  );
}
