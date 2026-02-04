import React from 'react';
import { Maximize2, MoreVertical, Minimize2 } from 'lucide-react';
import HlsPlayer from './HlsPlayer';

const CameraTile = ({ camera, onExpand, isMaximized }) => {
  const mediaSource = camera.stream_url || camera.demo_url;
  const isLiveStream = Boolean(camera.stream_url);
  const statusLabel = camera.is_active ? (isLiveStream ? 'LIVE' : 'DEMO') : 'OFFLINE';

  return (
    <div className="relative bg-gray-900/50 rounded-2xl overflow-hidden border border-white/5 group transition-all duration-300 hover:border-brand-green/30 hover:shadow-lg hover:shadow-brand-green/5 w-full h-full">
      {/* Video Placeholder / Stream */}
      <div className="absolute inset-0 bg-black flex items-center justify-center">
        {camera.is_active && mediaSource ? (
          <div className="relative w-full h-full">
            {mediaSource.endsWith('.m3u8') ? (
              <HlsPlayer
                key={mediaSource}
                src={mediaSource}
                poster={camera.poster}
                className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500 bg-black"
              />
            ) : (
              /* MJPEG Player (Simple Image Tag) */
              <img
                src={mediaSource}
                alt={camera.name}
                className="w-full h-full object-cover opacity-100 transition-opacity duration-500 bg-black"
              />
            )}
            {/* Scanline effect */}
            <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none opacity-20"></div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-600">
            <div className="w-12 h-12 rounded-full border-2 border-gray-700 border-dashed animate-spin-slow"></div>
            <span className="text-xs font-mono tracking-widest">SIGNAL LOST</span>
          </div>
        )}
      </div>

      {/* Overlay UI - Top */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="glass-panel px-3 py-1 rounded-lg flex items-center gap-2 border-brand-green/20">
          <span className="text-xs font-mono text-brand-green font-bold tracking-wider">{camera.name.toUpperCase()}</span>
        </div>

        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={(e) => { e.stopPropagation(); onExpand && onExpand(camera.id); }}
            className="p-1.5 rounded-lg bg-black/50 hover:bg-brand-green hover:text-black text-white transition-colors"
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button className="p-1.5 rounded-lg bg-black/50 hover:bg-white hover:text-black text-white transition-colors">
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      {/* Status Indicator - Bottom Right */}
      <div className="absolute bottom-4 right-4 z-10">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${camera.is_active ? 'bg-brand-green/10 border border-brand-green/20 text-brand-green' : 'bg-red-500/10 border border-red-500/20 text-red-500'} backdrop-blur-sm`}>
          <div className={`w-1.5 h-1.5 rounded-full ${camera.is_active ? 'bg-brand-green animate-pulse shadow-neon' : 'bg-red-500'}`}></div>
          <span className="text-[10px] font-mono font-bold tracking-widest">{statusLabel}</span>
        </div>
      </div>

      {/* Detection Box (Mock) - Only visible on hover or active */}
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-brand-green/30 transition-colors pointer-events-none rounded-2xl">
        {/* Corner Accents */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-brand-green/50 rounded-tl-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-brand-green/50 rounded-tr-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-brand-green/50 rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-brand-green/50 rounded-br-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
      </div>
    </div>
  );
};

export default CameraTile;
