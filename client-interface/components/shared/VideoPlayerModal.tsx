'use client';

import { useEffect } from 'react';
import { ExternalLink, X, Video } from 'lucide-react';
import { toExternalHref } from '@/lib/utils/url';

export interface VideoPlayerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
  speaker?: string | null;
}

export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const match = String(url).match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function extractVimeoId(url: string): string | null {
  if (!url) return null;
  const match = String(url).match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
  return match ? match[1] : null;
}

export function VideoPlayerModal({ open, onClose, title, url, speaker }: VideoPlayerModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ytId = extractYoutubeId(url);
  const vimeoId = extractVimeoId(url);
  const isDirectVideo = /\.(mp4|webm|ogg|m4v)($|\?)/i.test(url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="min-w-0 pr-4">
            <h3 className="text-base font-semibold text-white truncate">{title}</h3>
            {speaker && <p className="text-xs text-slate-400 truncate">{speaker}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={toExternalHref(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors"
            >
              <span>Open original</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close player"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Stage */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center">
          {ytId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : vimeoId ? (
            <iframe
              src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1`}
              title={title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : isDirectVideo ? (
            <video
              src={url}
              controls
              autoPlay
              className="w-full h-full object-contain"
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400">
                <Video className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">External Video Stream</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  This video host does not support direct in-app embedding. You can watch it directly on the host site.
                </p>
              </div>
              <a
                href={toExternalHref(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <span>Watch video on external site</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
