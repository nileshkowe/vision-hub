from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class ApplicationBase(BaseModel):
    name: str
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None

class ApplicationCreate(ApplicationBase):
    pass

class Application(ApplicationBase):
    id: int
    
    class Config:
        orm_mode = True

class CameraBase(BaseModel):
    name: str
    rtsp_url: str
    is_active: bool = True

class CameraCreate(CameraBase):
    pass

class Camera(CameraBase):
    id: int
    
    class Config:
        orm_mode = True

class ViolationBase(BaseModel):
    app_id: int
    camera_id: int
    details: Dict[str, Any]
    image_path: Optional[str] = None

class ViolationCreate(ViolationBase):
    pass

class Violation(ViolationBase):
    id: int
    timestamp: datetime
    
    class Config:
        orm_mode = True
