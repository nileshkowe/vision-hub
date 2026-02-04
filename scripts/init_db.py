import sys
import os
# Add project root to path so backend module is found
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
from backend.database import engine, AsyncSessionLocal
from backend.models import Application, Camera, AppCameraMap, Violation, Base

async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    
    # Seed data
    async with AsyncSessionLocal() as session:
        # Create App
        app = Application(
            name="Helmet Detection",
            description="Detects if workers are wearing helmets",
            config={"model": "yolov8n-helmet.pt"}
        )
        session.add(app)
        
        # Create Camera
        camera = Camera(
            name="Cam 01 - Entrance",
            rtsp_url="rtsp://mock_stream",
            is_active=True
        )
        session.add(camera)
        await session.commit()
        
        # Map App to Camera
        app_camera = AppCameraMap(app_id=app.id, camera_id=camera.id)
        session.add(app_camera)
        await session.commit()

    print("Database tables created and seeded.")

if __name__ == "__main__":
    asyncio.run(init_models())
