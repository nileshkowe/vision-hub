import sys
import os
import importlib
import inspect
from pathlib import Path
import json
import cv2
import threading
import asyncio
import logging
import time
import requests
from typing import Dict, Tuple
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

# Ensure we can import from inference
# Assuming structure:
# root/
#   backend/
#   inference/
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

import inference.processor as inference_processor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/video_feed", tags=["Video Feed"])

# Global processor instance
# Note: This creates a processor instance in the backend process.
# The separate inference.main process also creates its own processor.
# Both read from the same RTSP stream, but this one is used for MJPEG streaming.
processor = None
processor_lock = threading.Lock()
processor_thread = None  # Track the processor thread for cleanup

# Emit violations from the MJPEG processor so detections show up in the UI.
# Can be disabled if the separate inference service is already posting.
EMIT_VIOLATIONS = os.getenv("VIDEO_FEED_EMIT_VIOLATIONS", "1") != "0"
LOG_VIOLATIONS = os.getenv("VIDEO_FEED_LOG_VIOLATIONS", "0") == "1"
VIOLATION_API_BASE = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
VIOLATION_EMIT_INTERVAL = float(os.getenv("VIOLATION_EMIT_INTERVAL", "5"))
_last_violation_emit: Dict[Tuple[str, str], float] = {}
_last_violation_lock = threading.Lock()


def _camera_id_to_int(camera_id) -> int:
    if isinstance(camera_id, int):
        return camera_id
    if isinstance(camera_id, str) and camera_id.startswith("C") and camera_id[1:].isdigit():
        return int(camera_id[1:])
    return 1


def _should_emit_violation(camera_id: str, name: str, now: float) -> bool:
    key = (str(camera_id), str(name))
    with _last_violation_lock:
        last = _last_violation_emit.get(key, 0.0)
        if now - last < VIOLATION_EMIT_INTERVAL:
            return False
        _last_violation_emit[key] = now
        return True


def _emit_violation(data: dict) -> None:
    if not EMIT_VIOLATIONS:
        return

    now = time.time()
    name = data.get("name", "Unknown")
    camera_id = data.get("camera_id", "C1")
    if not _should_emit_violation(camera_id, name, now):
        return

    payload = {
        "app_id": 1,
        "camera_id": _camera_id_to_int(camera_id),
        "details": data,
        "image_path": data.get("image_filename") or "",
    }

    if LOG_VIOLATIONS:
        logger.info("Emitting violation from MJPEG processor: %s", payload)

    try:
        resp = requests.post(f"{VIOLATION_API_BASE}/api/violations/", json=payload, timeout=2)
        if resp.status_code != 200:
            logger.warning("Violation emit failed: %s %s", resp.status_code, resp.text)
        elif LOG_VIOLATIONS:
            logger.info("Violation emitted successfully")
    except Exception as exc:
        logger.warning("Violation emit error: %s", exc)

def get_processor():
    """
    Get or create processor instance for MJPEG streaming.
    Note: This is a fallback - ideally we'd read from the inference.main process,
    but since they're separate processes, we maintain our own instance here.
    """
    global processor
    with processor_lock:
        if processor is not None:
            try:
                src = inspect.getsource(processor.process_frame)
                if "timestamp = datetime.now()" not in src:
                    logger.warning("Detected stale processor code. Reinitializing MJPEG processor.")
                    try:
                        processor.stop()
                    except Exception:
                        pass
                    processor = None
            except Exception:
                # If inspection fails, rebuild to be safe.
                processor = None
        if processor is None:
            config_path = Path(__file__).resolve().parent.parent.parent / "inference" / "config.json"
            if not config_path.exists():
                logger.error(f"Config not found at {config_path}")
                return None
            
            try:
                with open(config_path, "r") as f:
                    config = json.load(f)

                # Hardcode C1 for demo as requested
                rtsp_url = os.getenv("C1_RTSP_URL", "rtsp://admin:cctv@9696@192.168.1.2:554/Streaming/Channels/101")
                cameras = {"C1": rtsp_url}
                
                logger.info(f"Initializing Inference Processor for MJPEG streaming: {cameras}")
                # Reload to pick up changes in inference/ without relying on uvicorn reload.
                importlib.reload(inference_processor)
                print(f"Using inference processor from {inference_processor.__file__}")
                try:
                    src = inspect.getsource(inference_processor.FaceRecognitionProcessor.process_frame)
                    print(f"process_frame timestamp at top: {'timestamp = datetime.now()' in src}")
                except Exception as exc:
                    print(f"process_frame source check failed: {exc}")
                processor = inference_processor.FaceRecognitionProcessor(
                    parameters=config["parameters"],
                    cameras=cameras,
                    on_violation=_emit_violation
                )
                # Start in a separate thread so it doesn't block
                # Make it non-daemon so we can clean it up properly
                global processor_thread
                processor_thread = threading.Thread(target=processor.start, daemon=False, name="MJPEGProcessor")
                processor_thread.start()
                
                # Give processor time to initialize
                import time as time_module
                time_module.sleep(2)
                
                logger.info("Processor initialized for MJPEG streaming")
            except Exception as e:
                logger.error(f"Failed to initialize processor: {e}")
                processor = None
                return None
    return processor

async def generate_frames(camera_id: str):
    """
    Generate MJPEG frames from processor's annotated output.
    Uses async/await to avoid blocking the FastAPI event loop.
    """
    import time as time_module
    
    proc = get_processor()
    if not proc:
        logger.warning(f"No processor available for camera: {camera_id}")
        return
    
    frame_count = 0
    consecutive_none_count = 0
    
    # Diagnostic tracking
    last_log_time = time_module.time()
    last_frame_count = 0
    encoding_times = []
    
    while True:
        try:
            # Non-blocking sleep - doesn't freeze server
            await asyncio.sleep(0.04)  # ~25 FPS
            
            frame = None
            # Access frame safely using the processor's lock
            # Note: threading.Lock is used here, but we're in async context.
            # Since we're just reading briefly, this should be okay.
            # For production, consider using asyncio.to_thread() to wrap the lock access.
            with proc.lock:
                frame = proc.latest_frames.get(camera_id)
            
            if frame is not None:
                consecutive_none_count = 0
                
                # Log frame dimensions on first frame
                if frame_count == 0:
                    h, w = frame.shape[:2]
                    logger.info(f"🎥 {camera_id}: Streaming frame dimensions: {w}x{h}")
                
                # Measure encoding time for diagnostics
                encode_start = time_module.time()
                
                # Encode to MJPEG with high quality (95 for better clarity)
                # This is CPU-bound, but necessary for quality
                ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                
                encode_time = time_module.time() - encode_start
                encoding_times.append(encode_time)
                
                if ret:
                    frame_count += 1
                    frame_size_kb = len(buffer.tobytes()) / 1024
                    
                    # Log diagnostics every 5 seconds
                    current_time = time_module.time()
                    if current_time - last_log_time >= 5.0:
                        frames_sent = frame_count - last_frame_count
                        avg_fps = frames_sent / (current_time - last_log_time)
                        avg_encode_time = sum(encoding_times[-frames_sent:]) / max(frames_sent, 1) if frames_sent > 0 else 0
                        avg_frame_size = sum([len(encoding_times)])  # Simplified
                        
                        logger.info(
                            f"📊 {camera_id} Stream Stats - "
                            f"FPS: {avg_fps:.1f}, "
                            f"Encode: {avg_encode_time*1000:.1f}ms, "
                            f"Frame size: {frame_size_kb:.1f}KB, "
                            f"Total frames: {frame_count}"
                        )
                        
                        last_log_time = current_time
                        last_frame_count = frame_count
                        encoding_times = encoding_times[-30:]  # Keep last 30 measurements
                    
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + 
                           buffer.tobytes() + b'\r\n\r\n')
            else:
                # No frame yet, wait a bit longer
                consecutive_none_count += 1
                if consecutive_none_count > 10:
                    # Log occasionally if frames are missing
                    if consecutive_none_count % 50 == 0:
                        logger.debug(f"Camera {camera_id}: Still waiting for frames...")
                    await asyncio.sleep(0.1)
                
        except GeneratorExit:
            logger.info(f"Camera {camera_id} stream closed (client disconnected)")
            break
        except Exception as e:
            logger.error(f"Error streaming {camera_id}: {e}", exc_info=True)
            await asyncio.sleep(1)  # Wait before retrying

@router.get("/{camera_id}")
async def video_feed(camera_id: str):
    """
    Stream MJPEG feed for a specific camera with server-side annotations.
    The feed shows frames with bounding boxes drawn around detected faces.
    """
    return StreamingResponse(
        generate_frames(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
