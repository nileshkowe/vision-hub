import atexit
import subprocess
from pathlib import Path
from threading import Lock
from typing import Dict, Optional

# Root folder where HLS playlists and segments will be written
STREAM_ROOT = Path(__file__).resolve().parent / "streams"
STREAM_ROOT.mkdir(exist_ok=True)


class StreamProcess:
    """Lightweight wrapper around an ffmpeg process for an RTSP camera."""

    def __init__(self, name: str, process: subprocess.Popen, output_dir: Path):
        self.name = name
        self.process = process
        self.output_dir = output_dir

    @property
    def playlist_path(self) -> Path:
        return self.output_dir / "index.m3u8"

    def is_running(self) -> bool:
        return self.process.poll() is None

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()


class StreamManager:
    """Starts and tracks ffmpeg RTSP->HLS pipelines."""

    def __init__(self, root: Path):
        self.root = root
        self._processes: Dict[str, StreamProcess] = {}
        self._lock = Lock()

    def _build_command(self, rtsp_url: str, output_dir: Path) -> list:
        output_dir.mkdir(parents=True, exist_ok=True)
        playlist = output_dir / "index.m3u8"
        segments = output_dir / "segment_%05d.ts"

        # Using copy keeps latency/CPU low; switch to libx264 if your RTSP codec differs.
        return [
            "ffmpeg",
            "-nostdin",
            "-rtsp_transport",
            "tcp",
            "-i",
            rtsp_url,
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-f",
            "hls",
            "-hls_time",
            "2",
            "-hls_list_size",
            "5",
            "-hls_flags",
            "delete_segments",
            "-tag:v",
            "hvc1",
            "-hls_segment_filename",
            str(segments),
            str(playlist),
        ]

    def ensure_stream(self, name: str, rtsp_url: str) -> str:
        """Start the stream if not already running and return the public playlist path."""
        if not rtsp_url:
            raise ValueError("RTSP URL is required to start a stream")

        with self._lock:
            existing: Optional[StreamProcess] = self._processes.get(name)
            if existing and existing.is_running():
                return self._public_playlist_url(name)

            output_dir = self.root / name
            cmd = self._build_command(rtsp_url, output_dir)
            # Log ffmpeg output for debugging
            log_file = output_dir / "ffmpeg_debug.log"
            with open(log_file, "w") as f:
                process = subprocess.Popen(
                    cmd,
                    stdout=f,
                    stderr=subprocess.STDOUT,
                )

            self._processes[name] = StreamProcess(name, process, output_dir)
            return self._public_playlist_url(name)

    def stop_stream(self, name: str) -> None:
        with self._lock:
            proc = self._processes.pop(name, None)
            if proc:
                proc.stop()

    def stop_all(self) -> None:
        with self._lock:
            names = list(self._processes.keys())
        for name in names:
            self.stop_stream(name)

    def is_running(self, name: str) -> bool:
        proc = self._processes.get(name)
        return bool(proc and proc.is_running())

    def playlist_path(self, name: str) -> Path:
        return (self.root / name) / "index.m3u8"

    def _public_playlist_url(self, name: str) -> str:
        return f"/streams/{name}/index.m3u8"


stream_manager = StreamManager(STREAM_ROOT)
atexit.register(stream_manager.stop_all)
