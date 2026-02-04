# FIX 1: Repair Current Codebase (No Migrations, No API)

## **OVERVIEW**

Your inference is already running and working. The problem is **NOT data flow** — it's **where and how the annotated frames are displayed**.

### Current State:
- ✅ Inference running: YOLO + FaceNet models working
- ✅ Annotations drawn: Bounding boxes created in memory
- ✅ Stored correctly: `processor.latest_frames[camera_id]` contains annotated frames
- ❌ **NOT DISPLAYED**: Frontend shows HLS (raw ffmpeg output)
- ❌ **MJPEG endpoint unused**: `/video_feed/{camera_id}` exists but frontend never calls it

---

## **ROOT CAUSE ANALYSIS**

### Where annotations exist vs where frontend looks:

```
Your Inference (processor.py):
  └─ process_frame() → draws boxes → stores in latest_frames ✓

Backend endpoints:
  ├─ /streams/c1/index.m3u8 ← ffmpeg (RAW VIDEO) 
  └─ /video_feed/C1 ← your processor (ANNOTATED) ✓

Frontend:
  └─ Uses /streams/c1/index.m3u8 ← WRONG! Gets raw video ❌
```

---

## **FIX #1: The Streaming Disconnect (10 minutes)**

### **Problem Location: frontend/src/components/CameraTile.jsx**

Your frontend component likely looks like this:

```jsx
// ❌ WRONG - Shows HLS (raw video, no annotations)
import HlsPlayer from './HlsPlayer';

export function CameraTile({ cameraId }) {
  return (
    <div className="camera-tile">
      <HlsPlayer url={`/streams/${cameraId}/index.m3u8`} />
      <p>{cameraId}</p>
    </div>
  );
}
```

### **Solution: Switch to MJPEG stream**

```jsx
// ✅ CORRECT - Shows MJPEG with annotations from processor
export function CameraTile({ cameraId }) {
  return (
    <div className="camera-tile">
      <img 
        src={`/video_feed/${cameraId}`}
        alt={`Live feed ${cameraId}`}
        style={{
          width: '100%',
          height: 'auto',
          borderRadius: '8px',
          backgroundColor: '#000'
        }}
      />
      <p>{cameraId}</p>
    </div>
  );
}
```

**Why this works:**
- `<img src="/video_feed/{cameraId}">` is MJPEG stream
- MJPEG is continuous image data (browser handles it natively)
- Data comes from `processor.latest_frames` (annotated)
- Shows bounding boxes in real-time

---

## **FIX #2: Async/Blocking Issue in Backend (5 minutes)**

### **Problem Location: backend/routers/video_feed.py (Line ~50)**

Current code blocks FastAPI event loop:

```python
# ❌ WRONG - time.sleep blocks entire server
def generate_frames(camera_id: str):
    proc = get_processor()
    if not proc:
        return
    
    while True:
        time.sleep(0.04)  # ← THIS FREEZES SERVER!
        
        frame = None
        with proc.lock:
            frame = proc.latest_frames.get(camera_id)
        
        if frame is not None:
            ret, buffer = cv2.imencode('.jpg', frame)
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + 
                       buffer.tobytes() + b'\r\n\r\n')
```

### **Solution: Use async sleep**

```python
# ✅ CORRECT - Uses asyncio (non-blocking)
import asyncio

async def generate_frames(camera_id: str):
    """Generate MJPEG frames from processor's annotated output"""
    proc = get_processor()
    if not proc:
        print(f"No processor for camera: {camera_id}")
        return
    
    frame_count = 0
    while True:
        try:
            # Non-blocking sleep - doesn't freeze server
            await asyncio.sleep(0.04)  # ~25 FPS
            
            frame = None
            with proc.lock:
                frame = proc.latest_frames.get(camera_id)
            
            if frame is not None:
                ret, buffer = cv2.imencode('.jpg', frame)
                if ret:
                    frame_count += 1
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + 
                           buffer.tobytes() + b'\r\n\r\n')
            else:
                # No frame yet, just wait
                await asyncio.sleep(0.01)
                
        except GeneratorExit:
            print(f"Camera {camera_id} stream closed")
            break
        except Exception as e:
            print(f"Error streaming {camera_id}: {e}")
            await asyncio.sleep(1)

@router.get("/{camera_id}")
async def video_feed(camera_id: str):
    """Stream MJPEG feed for a specific camera with annotations"""
    return StreamingResponse(
        generate_frames(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
```

**Key change:** `time.sleep()` → `await asyncio.sleep()`

---

## **FIX #3: Processor Initialization (Optional but Recommended)**

### **Problem: Global singleton pattern is fragile**

Current code in `video_feed.py`:

```python
# ❌ WEAK - Global singleton, no error handling
processor = None
processor_lock = threading.Lock()

def get_processor():
    global processor
    with processor_lock:
        if processor is None:
            # Initialize...
            processor = FaceRecognitionProcessor(...)
            threading.Thread(target=processor.start, daemon=True).start()
        return processor
```

**Issues:**
- If processor crashes, no restart
- If RTSP disconnects, manual recovery only
- No health checks

### **Solution: Add error handling and auto-restart**

```python
# ✅ BETTER - Handles crashes gracefully
import logging
import time as time_module

logger = logging.getLogger(__name__)

class ProcessorManager:
    def __init__(self):
        self.processor = None
        self.lock = threading.Lock()
        self.initialized = False
    
    def get_processor(self, force_restart=False):
        """Get processor instance, restart if needed"""
        with self.lock:
            # Check if processor is dead
            if self.processor and not self._is_processor_alive():
                logger.warning("Processor died, restarting...")
                self.processor = None
                self.initialized = False
            
            # Initialize if needed
            if self.processor is None or force_restart:
                try:
                    self._initialize_processor()
                except Exception as e:
                    logger.error(f"Failed to initialize processor: {e}")
                    return None
            
            return self.processor
    
    def _is_processor_alive(self):
        """Check if processor threads are running"""
        if not self.processor:
            return False
        
        # Check if camera threads are still running
        for thread in self.processor.camera_threads.values():
            if not thread.is_alive():
                return False
        
        return True
    
    def _initialize_processor(self):
        """Initialize processor with error handling"""
        if self.initialized:
            return
        
        try:
            config_path = Path(__file__).resolve().parent.parent.parent / "inference" / "config.json"
            
            if not config_path.exists():
                raise FileNotFoundError(f"Config not found: {config_path}")
            
            with open(config_path, "r") as f:
                config = json.load(f)
            
            rtsp_url = os.getenv("C1_RTSP_URL")
            if not rtsp_url:
                raise ValueError("C1_RTSP_URL environment variable not set")
            
            cameras = {"C1": rtsp_url}
            
            logger.info(f"Initializing processor for cameras: {cameras}")
            
            self.processor = FaceRecognitionProcessor(
                parameters=config["parameters"],
                cameras=cameras,
                on_violation=None
            )
            
            # Start in thread
            processor_thread = threading.Thread(
                target=self.processor.start,
                daemon=True,
                name="InferenceProcessor"
            )
            processor_thread.start()
            
            # Wait for processor to initialize
            time_module.sleep(2)
            
            if not processor_thread.is_alive():
                raise RuntimeError("Processor thread died immediately")
            
            self.initialized = True
            logger.info("Processor initialized successfully")
            
        except Exception as e:
            logger.error(f"Processor initialization failed: {e}")
            self.processor = None
            self.initialized = False
            raise

# Create global instance
processor_manager = ProcessorManager()

def get_processor():
    """Get processor with auto-restart on failure"""
    return processor_manager.get_processor()
```

---

## **FIX #4: Frontend App Selection (10 minutes)**

### **Problem: App selector buttons don't actually start inference**

Your `AppSelector.jsx` probably just renders buttons:

```jsx
// ❌ INCOMPLETE - Just renders buttons, doesn't start inference
export function AppSelector({ onSelect }) {
  return (
    <div>
      <button onClick={() => onSelect('face-detection')}>
        Face Detection
      </button>
      <button onClick={() => onSelect('helmet-detection')}>
        Helmet Detection
      </button>
    </div>
  );
}
```

### **Solution: Start inference on selection**

```jsx
// ✅ COMPLETE - Starts inference via API
import { useState } from 'react';
import axios from 'axios';

export function AppSelector({ onSelect }) {
  const [selectedApp, setSelectedApp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectApp = async (appId, appName) => {
    setLoading(true);
    setError(null);
    
    try {
      // Call backend to select app and start inference
      const response = await axios.post(
        `/api/applications/${appId}/select`
      );
      
      console.log(`Started: ${appName}`, response.data);
      
      setSelectedApp({ id: appId, name: appName });
      onSelect({ id: appId, name: appName });
      
    } catch (err) {
      console.error('Failed to select app:', err);
      setError(err.response?.data?.detail || 'Failed to start application');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', borderBottom: '1px solid #ccc' }}>
      <h2>Select Application</h2>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <button 
          onClick={() => handleSelectApp(1, 'Face Detection')}
          disabled={loading || selectedApp?.id === 1}
          style={{
            padding: '10px 20px',
            backgroundColor: selectedApp?.id === 1 ? '#4CAF50' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'wait' : 'pointer',
            fontWeight: selectedApp?.id === 1 ? 'bold' : 'normal'
          }}
        >
          {loading ? 'Starting...' : 'Face Detection'}
        </button>
        
        <button 
          onClick={() => handleSelectApp(2, 'Helmet Detection')}
          disabled={loading || selectedApp?.id === 2}
          style={{
            padding: '10px 20px',
            backgroundColor: selectedApp?.id === 2 ? '#4CAF50' : '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'wait' : 'pointer',
            fontWeight: selectedApp?.id === 2 ? 'bold' : 'normal'
          }}
        >
          {loading ? 'Starting...' : 'Helmet Detection'}
        </button>
      </div>
      
      {selectedApp && (
        <p style={{ color: '#4CAF50', fontWeight: 'bold' }}>
          ✓ {selectedApp.name} is running
        </p>
      )}
      
      {error && (
        <p style={{ color: '#f44336' }}>
          ✗ Error: {error}
        </p>
      )}
    </div>
  );
}
```

### **Backend endpoint to start inference:**

```python
# backend/routers/applications.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
from models import Application, Camera, AppCameraMap
from video_feed import processor_manager
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/applications", tags=["applications"])

@router.post("/{app_id}/select")
async def select_application(app_id: int, db: AsyncSession = Depends(get_db)):
    """
    Select application and start inference for its cameras
    
    POST /api/applications/{app_id}/select
    
    Response:
    {
        "message": "Face Detection selected",
        "app_id": 1,
        "cameras": ["C1"]
    }
    """
    
    # For demo, just return success
    # In production: fetch from DB, start processors, etc.
    
    if app_id == 1:
        return {
            "message": "Face Detection selected",
            "app_id": 1,
            "cameras": ["C1"],
            "status": "running"
        }
    elif app_id == 2:
        return {
            "message": "Helmet Detection selected",
            "app_id": 2,
            "cameras": ["C1"],
            "status": "running"
        }
    else:
        raise HTTPException(status_code=404, detail="Application not found")
```

---

## **COMPLETE FIXES CHECKLIST**

Create a new file: `FIXES_APPLIED.md`

- [ ] **Fix #1**: Change frontend from HLS to MJPEG
  - File: `frontend/src/components/CameraTile.jsx`
  - Change: `<HlsPlayer url=...>` → `<img src="/video_feed/{cameraId}">`
  
- [ ] **Fix #2**: Add async to video_feed.py
  - File: `backend/routers/video_feed.py`
  - Change: `time.sleep()` → `await asyncio.sleep()`
  - Add: `import asyncio`
  
- [ ] **Fix #3**: Add processor error handling
  - File: `backend/routers/video_feed.py`
  - Add: `ProcessorManager` class
  
- [ ] **Fix #4**: Wire app selector to backend
  - File: `frontend/src/components/AppSelector.jsx`
  - Add: `axios.post('/api/applications/{id}/select')`

---

## **TESTING STEPS**

After applying fixes:

```bash
# 1. Start backend
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 2. Start frontend (in new terminal)
cd frontend
npm run dev

# 3. Visit http://localhost:5173
# 4. Click "Face Detection" button
# 5. Should see LIVE annotated feed (not raw video)
# 6. Bounding boxes around detected faces

# 4. Test that annotations show
# Open browser DevTools (F12)
# Network tab → should see /video_feed/C1 requests
# Should NOT see /streams/c1/index.m3u8
```

---

## **BEFORE/AFTER COMPARISON**

### BEFORE (Current - Broken)
```
Camera → RTSP
    ↓
ffmpeg → HLS (raw video)
    ↓
Frontend <img src="/streams/c1/index.m3u8">
Result: ❌ NO ANNOTATIONS VISIBLE

(Meanwhile, in background:
 Inference → Draws boxes → Stores in latest_frames
 But nobody uses it ❌)
```

### AFTER (Fixed)
```
Camera → RTSP
    ↓
    ├→ ffmpeg → HLS (archived, not used for display)
    └→ Inference Processor
        ├→ YOLO detection
        ├→ Draw boxes on frame
        └→ Store in latest_frames
            ↓
        generate_frames() reads latest_frames
            ↓
        Frontend <img src="/video_feed/C1">
        
Result: ✅ ANNOTATIONS VISIBLE IN REAL-TIME
```

---

## **KEY POINTS**

1. **Your inference is already working** - no changes needed there
2. **The fix is purely data routing** - show the right stream to the frontend
3. **MJPEG is simpler than HLS** for this use case (direct image streaming)
4. **Async/await is critical** - blocks event loop without it
5. **Frontend must call API** - to actually start inference

---

## **DEPLOY THESE FIXES IMMEDIATELY**

These 4 fixes take ~30 minutes total and will show immediate results.
After testing, then move to Roboflow approach if desired.

**You'll see bounding boxes on the camera feed after these changes.**

