import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

const HlsPlayer = ({ src, poster, className, muted = true, autoPlay = true }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    let hls;
    video.muted = muted;
    video.autoplay = autoPlay;
    video.playsInline = true;

    const isHls = src.endsWith('.m3u8');

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          hls.destroy();
        }
      });
    } else {
      video.src = src;
      video.play().catch(() => {
        // Autoplay can fail silently on some browsers; keep muted=true to avoid most prompts.
      });
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [src, autoPlay, muted]);

  return (
    <video
      ref={videoRef}
      poster={poster}
      className={className}
      muted={muted}
      playsInline
      controls={false}
    />
  );
};

export default HlsPlayer;
