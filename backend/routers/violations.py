import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime, timedelta

from database import get_db
from models import Violation
from schemas import Violation as ViolationSchema, ViolationCreate

router = APIRouter(
    prefix="/api/violations",
    tags=["violations"],
)


@router.post("/", response_model=ViolationSchema)
async def create_violation(violation: ViolationCreate, db: AsyncSession = Depends(get_db)):
    """
    Create a new violation/detection record.
    """
    db_violation = Violation(**violation.dict())
    db.add(db_violation)
    await db.commit()
    await db.refresh(db_violation)
    
    # Construct image URL for WebSocket broadcast
    image_url = None
    if db_violation.image_path:
        filename = os.path.basename(db_violation.image_path)
        image_url = f"/api/detections/images/{filename}"
    
    # Broadcast to WebSocket clients
    import json
    from websocket_manager import manager
    await manager.broadcast(json.dumps({
        "type": "violation",
        "data": {
            "id": db_violation.id,
            "app_id": db_violation.app_id,
            "camera_id": db_violation.camera_id,
            "details": db_violation.details,
            "timestamp": db_violation.timestamp.isoformat(),
            "image_path": db_violation.image_path,
            "image_url": image_url
        }
    }))
    
    # Return violation with image_url
    violation_dict = {
        "id": db_violation.id,
        "app_id": db_violation.app_id,
        "camera_id": db_violation.camera_id,
        "timestamp": db_violation.timestamp,
        "details": db_violation.details,
        "image_path": db_violation.image_path,
        "image_url": image_url
    }
    
    return violation_dict

@router.get("/", response_model=List[ViolationSchema])
async def read_violations(
    skip: int = Query(0, ge=0, alias="offset"),
    limit: int = Query(100, ge=1, le=1000),
    camera_id: Optional[int] = Query(None, description="Filter by camera ID"),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum confidence threshold"),
    hours: Optional[int] = Query(None, ge=1, description="Filter violations from last N hours"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get violations with optional filtering and pagination.
    
    Query Parameters:
    - offset: Number of records to skip (default: 0)
    - limit: Maximum number of records to return (default: 100, max: 1000)
    - camera_id: Filter by specific camera ID
    - min_confidence: Minimum confidence threshold (0.0-1.0)
    - hours: Filter violations from last N hours
    """
    # Build query with filters
    query = select(Violation)
    conditions = []
    
    # Filter by camera_id
    if camera_id is not None:
        conditions.append(Violation.camera_id == camera_id)
    
    # Filter by time range (last N hours)
    if hours is not None:
        time_threshold = datetime.utcnow() - timedelta(hours=hours)
        conditions.append(Violation.timestamp >= time_threshold)
    
    # Apply conditions
    if conditions:
        query = query.where(and_(*conditions))
    
    # Filter by confidence (requires parsing details JSON)
    # Note: This is a simplified approach. For better performance with large datasets,
    # consider storing confidence as a separate column or using a JSONB query.
    if min_confidence is not None:
        # We'll filter in Python after fetching, as SQLAlchemy JSON filtering can be complex
        # For production, consider adding a confidence column to the Violation model
        pass
    
    # Order by timestamp (newest first) and apply pagination
    query = query.order_by(Violation.timestamp.desc()).offset(skip).limit(limit)
    
    result = await db.execute(query)
    violations = result.scalars().all()
    
    # Filter by confidence if specified (post-query filtering)
    if min_confidence is not None:
        filtered_violations = []
        for violation in violations:
            if violation.details and isinstance(violation.details, dict):
                conf = violation.details.get("confidence", 0.0)
                if isinstance(conf, (int, float)) and conf >= min_confidence:
                    filtered_violations.append(violation)
        violations = filtered_violations
    
    # Enhance violations with full image URLs
    enhanced_violations = []
    for violation in violations:
        # Convert violation to dict for modification
        violation_dict = {
            "id": violation.id,
            "app_id": violation.app_id,
            "camera_id": violation.camera_id,
            "timestamp": violation.timestamp,
            "details": violation.details,
            "image_path": violation.image_path
        }
        
        # Construct full image URL if image_path exists
        if violation.image_path:
            # Extract just the filename if it's a full path
            filename = os.path.basename(violation.image_path)
            # Construct the API URL
            violation_dict["image_url"] = f"/api/detections/images/{filename}"
        else:
            violation_dict["image_url"] = None
        
        enhanced_violations.append(violation_dict)
    
    return enhanced_violations
