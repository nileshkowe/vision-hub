import os

from fastapi import APIRouter, HTTPException

from streaming import stream_manager

router = APIRouter(
    prefix="/api/streams",
    tags=["streams"],
)


def _get_c1_rtsp_url() -> str:
    url = os.getenv("C1_RTSP_URL")
    if not url:
        raise HTTPException(
            status_code=500,
            detail="C1_RTSP_URL is not configured on the server.",
        )
    return url


@router.post("/c1/start")
async def start_c1_stream():
    """Ensure the C1 RTSP feed is being transcoded to HLS and return the playlist URL."""
    try:
        playlist = stream_manager.ensure_stream("c1", _get_c1_rtsp_url())
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail="ffmpeg is not installed or not in PATH on the server.",
        ) from exc
    except Exception as exc:  # pragma: no cover - defensive guard
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start stream: {exc}",
        ) from exc

    return {"hls": playlist}


@router.get("/c1/status")
async def c1_status():
    running = stream_manager.is_running("c1")
    return {"running": running, "hls": "/streams/c1/index.m3u8" if running else None}


@router.post("/{name}/stop")
async def stop_stream(name: str):
    stream_manager.stop_stream(name)
    return {"stopped": name}
