from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Dict, Any

from database import get_db
from models import Application
from schemas import Application as ApplicationSchema, ApplicationCreate

router = APIRouter(
    prefix="/api/applications",
    tags=["applications"],
)

@router.post("/", response_model=ApplicationSchema)
async def create_application(app: ApplicationCreate, db: AsyncSession = Depends(get_db)):
    db_app = Application(**app.dict())
    db.add(db_app)
    await db.commit()
    await db.refresh(db_app)
    return db_app

@router.get("/", response_model=List[ApplicationSchema])
async def read_applications(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Application).offset(skip).limit(limit))
    apps = result.scalars().all()
    return apps

@router.get("/{app_id}", response_model=ApplicationSchema)
async def read_application(app_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Application).filter(Application.id == app_id))
    app = result.scalars().first()
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return app

@router.post("/{app_id}/select")
async def select_application(app_id: int) -> Dict[str, Any]:
    """
    Select application and return its camera configuration.
    
    This endpoint is called by the frontend when a user selects an application.
    It returns which cameras are active for that app and the current status.
    
    POST /api/applications/{app_id}/select
    
    Response:
    {
        "message": "Face Detection selected",
        "app_id": 1,
        "cameras": ["C1", "C2", "C3"],
        "status": "running"
    }
    """
    # Application 1: Face Detection (renamed from Helmet Detection)
    if app_id == 1:
        return {
            "message": "Face Detection selected",
            "app_id": 1,
            "cameras": ["C1", "C2", "C3"],
            "status": "running"
        }
    # Application 2: Employee Counting (placeholder)
    elif app_id == 2:
        return {
            "message": "Employee Counting selected",
            "app_id": 2,
            "cameras": ["C4", "C5", "C6", "C7", "C8", "C9"],
            "status": "running"
        }
    # Application 3: Box Counting (placeholder)
    elif app_id == 3:
        return {
            "message": "Box Counting selected",
            "app_id": 3,
            "cameras": ["C10", "C11", "C12", "C13"],
            "status": "running"
        }
    # Application 4: Zone Intrusion (placeholder)
    elif app_id == 4:
        return {
            "message": "Zone Intrusion selected",
            "app_id": 4,
            "cameras": ["C14", "C15", "C16", "C17", "C18", "C19", "C20", "C21", "C22"],
            "status": "running"
        }
    else:
        raise HTTPException(status_code=404, detail="Application not found")
