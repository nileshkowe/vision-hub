from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from database import get_db
from models import Camera
from schemas import Camera as CameraSchema, CameraCreate

router = APIRouter(
    prefix="/cameras",
    tags=["cameras"],
)

@router.post("/", response_model=CameraSchema)
async def create_camera(camera: CameraCreate, db: AsyncSession = Depends(get_db)):
    db_camera = Camera(**camera.dict())
    db.add(db_camera)
    await db.commit()
    await db.refresh(db_camera)
    return db_camera

@router.get("/", response_model=List[CameraSchema])
async def read_cameras(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Camera).offset(skip).limit(limit))
    cameras = result.scalars().all()
    return cameras
