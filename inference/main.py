import os
import json
import requests
import time
from .processor import FaceRecognitionProcessor

# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

def on_violation(data):
    """Callback when a face is detected/violation occurred"""
    # data: {camera_id, type, name, confidence, timestamp, bbox, image_filename}
    print(f"[{data['timestamp']}] Violation/Detection: {data['name']} ({data['confidence']:.2f})")
    
    # Use image_filename from processor if available, otherwise construct it
    image_filename = data.get('image_filename')
    if not image_filename and 'name' in data and 'timestamp' in data and 'camera_id' in data:
        # Fallback: construct expected filename
        formatted_timestamp = data['timestamp'].replace(':', '-').replace(' ', '_')
        image_filename = f"{data['camera_id']}_{data['name']}_{formatted_timestamp}.jpg"
    
    # Payload for backend
    payload = {
        "app_id": 1,  # Assuming App ID 1 for Face Recognition
        "camera_id": 1, # specific to C1 for now
        "details": data,
        "image_path": image_filename if image_filename else ""  # Just the filename, backend will construct full path
    }
    
    try:
        resp = requests.post(f"{BACKEND_URL}/api/violations/", json=payload)
        if resp.status_code != 200:
            print(f"Failed to push violation: {resp.text}")
    except Exception as e:
        print(f"Error communicating with backend: {e}")

def main():
    # 1. Load Config
    if not os.path.exists(CONFIG_PATH):
        print(f"Config not found at {CONFIG_PATH}")
        return
        
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)
        
    # 2. Setup Camera (Env Override > Config)
    # We want to run for C1 specifically for the demo
    # Default to a placeholder if not set, or handle empty string
    rtsp_url = os.getenv("C1_RTSP_URL", "")
    if not rtsp_url:
        print("ERROR: C1_RTSP_URL environment variable not set")
        return
    cameras = {"C1": rtsp_url}
    
    print(f"Starting Inference Worker for: {cameras}")
    
    # 3. Initialize Processor
    processor = FaceRecognitionProcessor(
        parameters=config["parameters"],
        cameras=cameras,
        on_violation=on_violation
    )
    
    # 4. Run
    try:
        processor.start()
        # Since start() in my implementation spawns threads and returns, keep main alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping...")
        processor.stop()

if __name__ == "__main__":
    main()
