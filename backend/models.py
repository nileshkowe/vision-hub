from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String)
    config = Column(JSON)  # Stores app-specific config like model_name, rules

    cameras = relationship("AppCameraMap", back_populates="application")

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    rtsp_url = Column(String)
    is_active = Column(Boolean, default=True)

    applications = relationship("AppCameraMap", back_populates="camera")

class AppCameraMap(Base):
    __tablename__ = "app_camera_map"

    app_id = Column(Integer, ForeignKey("applications.id"), primary_key=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"), primary_key=True)

    application = relationship("Application", back_populates="cameras")
    camera = relationship("Camera", back_populates="applications")

class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True, index=True)
    app_id = Column(Integer, ForeignKey("applications.id"))
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(JSON)  # Stores detection details (bbox, confidence, etc.)
    image_path = Column(String) # Path to the saved frame

    application = relationship("Application")
    camera = relationship("Camera")
