"""
Router for serving detection images and related endpoints.
Handles static file serving for face detection thumbnails.
"""
import os
import shutil
import time
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(
    prefix="/api/detections",
    tags=["detections"],
)

# Determine the base directory (backend/ parent)
BASE_DIR = Path(__file__).parent.parent.parent

# Possible locations for detection images
# Priority: inference/* > root-level directories
DETECTION_IMAGE_PATHS = [
    BASE_DIR / "inference" / "matched_faces",
    BASE_DIR / "inference" / "unknown_faces",
    BASE_DIR / "matched_faces",
    BASE_DIR / "unknown_faces",
]

# Ensure folders exist so we can resolve files cleanly.
for path in DETECTION_IMAGE_PATHS:
    path.mkdir(parents=True, exist_ok=True)

CACHE_DIR = BASE_DIR / "thumbnail_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_TTL_SECONDS = int(os.getenv("THUMBNAIL_CACHE_TTL_SECONDS", "21600"))  # 6 hours


def _cleanup_cache() -> None:
    now = time.time()
    for cached in CACHE_DIR.glob("*.jpg"):
        try:
            if now - cached.stat().st_mtime > CACHE_TTL_SECONDS:
                cached.unlink()
        except OSError:
            pass


def resolve_detection_image_path(filename: str) -> Path | None:
    for detection_dir in DETECTION_IMAGE_PATHS:
        image_path = detection_dir / filename
        if image_path.exists() and image_path.is_file():
            return image_path
    return None


@router.get("/images/{filename}")
async def get_detection_image(filename: str):
    """
    Serve detection images from matched_faces directory.
    
    Args:
        filename: Name of the image file (e.g., "C1_Name_2025-12-15_10-30-45.jpg")
    
    Returns:
        FileResponse with the image, or 404 if not found
    """
    # Security: Prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    _cleanup_cache()

    cached_path = CACHE_DIR / filename
    if cached_path.exists():
        return FileResponse(
            cached_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    image_path = resolve_detection_image_path(filename)
    if image_path:
        try:
            shutil.copy2(image_path, cached_path)
            return FileResponse(
                cached_path,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=3600"},
            )
        except OSError:
            return FileResponse(
                image_path,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=3600"},
            )
    
    # Image not found - return 404
    raise HTTPException(status_code=404, detail="Image not found")

