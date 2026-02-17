# CLAUDE.md — Vision Hub Codebase Guide

This document is the primary reference for AI assistants working in this repository. Read it before making any changes.

---

## Project Overview

**Vision Hub** is a full-stack CCTV analytics MVP platform supporting multi-camera surveillance with real-time face detection, violation tracking, and live video streaming.

**Stack:**
| Layer | Technology |
|---|---|
| Backend API | Python 3.8+, FastAPI, async SQLAlchemy |
| Frontend | React 19.2, Vite (Rolldown), TailwindCSS |
| Database | SQLite (dev) / PostgreSQL (prod) |
| ML/Inference | PyTorch, FaceNet (facenet-pytorch), YOLOv8 |
| Video | FFmpeg (RTSP→HLS), OpenCV (MJPEG) |
| Real-time | WebSocket (FastAPI native) |

---

## Repository Structure

```
vision-hub/
├── backend/                  # FastAPI application
│   ├── main.py               # App entry point, CORS, routers, WebSocket, shutdown
│   ├── database.py           # Async SQLAlchemy engine and session factory
│   ├── models.py             # ORM models: Application, Camera, AppCameraMap, Violation
│   ├── schemas.py            # Pydantic v2 schemas for request/response validation
│   ├── websocket_manager.py  # WebSocket connection manager (broadcast to all clients)
│   ├── streaming.py          # FFmpeg RTSP→HLS process manager
│   └── routers/
│       ├── applications.py   # /api/applications/* CRUD + app selection logic
│       ├── cameras.py        # /api/cameras/* CRUD
│       ├── violations.py     # /api/violations/* CRUD + WebSocket broadcast on create
│       ├── streams.py        # /api/streams/* FFmpeg process management
│       ├── video_feed.py     # /video_feed/* MJPEG streaming with live detection overlays
│       └── detections.py     # /api/detections/images/* thumbnail serving
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── main.jsx          # React root entry
│   │   ├── App.jsx           # Router (single route: Dashboard)
│   │   ├── pages/
│   │   │   └── Dashboard.jsx # Main monitoring interface (705 lines)
│   │   └── components/
│   │       ├── Layout.jsx        # Shell: sidebar, top bar, mobile nav
│   │       ├── AppSelector.jsx   # Application switcher (Face, Counting, etc.)
│   │       ├── CameraTile.jsx    # Camera feed tile (HLS / MJPEG / offline)
│   │       ├── HlsPlayer.jsx     # HLS.js wrapper with native fallback
│   │       ├── DetectionCard.jsx # Single detection result card (memoized)
│   │       ├── DetectionList.jsx # Paginated detection grid
│   │       └── DetectionFilters.jsx # Search, confidence, camera, time filters
│   ├── package.json
│   ├── vite.config.js        # Dev server on 127.0.0.1:5173
│   ├── tailwind.config.js    # Custom design tokens
│   └── eslint.config.js      # Flat ESLint config (ES2020, React Hooks)
├── inference/                # Standalone face recognition process
│   ├── main.py               # Entry point: config loading, processor lifecycle
│   ├── processor.py          # FaceRecognitionProcessor (FaceNet + OpenCV)
│   └── config.json.example   # Template for inference configuration
├── scripts/
│   └── init_db.py            # Database table creation
├── requirements.txt          # Python production dependencies
├── cctv-env.yml              # Conda environment with pinned ML dependencies
└── .env.example              # Environment variable template
```

---

## Development Setup

### Prerequisites
- Python 3.8+
- Node.js 18+
- FFmpeg installed and on PATH
- (Optional) Conda for ML environment isolation

### Backend

```bash
# Create virtual environment (or use conda: conda env create -f cctv-env.yml)
python -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your RTSP URL, DB URL, etc.

# Initialize database
python scripts/init_db.py

# Run dev server (hot reload)
cd backend && uvicorn main:app --reload
# API available at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Available at http://127.0.0.1:5173
```

### Inference Service (optional, for real face detection)

```bash
cp inference/config.json.example inference/config.json
# Edit config.json with known faces and camera settings
C1_RTSP_URL=rtsp://... python inference/main.py
```

### Production Build

```bash
cd frontend && npm run build
# Static files in frontend/dist/
```

---

## Environment Variables

All configuration is via environment variables. Copy `.env.example` to `.env`.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./cctv.db` | SQLAlchemy DB URL |
| `C1_RTSP_URL` | — | RTSP stream URL for Camera 1 |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins |
| `VIDEO_FEED_EMIT_VIOLATIONS` | — | Set to `1` to emit violations from MJPEG route |
| `VIDEO_FEED_LOG_VIOLATIONS` | — | Set to `1` to log violations to stdout |
| `PROCESSOR_LOG_VIOLATIONS` | — | Set to `1` for inference service logging |
| `VIOLATION_EMIT_INTERVAL` | `2` | Seconds between repeated violation emissions |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Frontend API base URL |

---

## API Reference

**Base URL:** `http://localhost:8000`

### Applications
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/applications/` | Create application |
| `GET` | `/api/applications/` | List all applications |
| `GET` | `/api/applications/{id}` | Get application by ID |
| `POST` | `/api/applications/{id}/select` | Activate app; returns camera configuration |

### Cameras
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/cameras/` | Register camera |
| `GET` | `/api/cameras/` | List cameras |
| `GET` | `/api/cameras/{id}` | Get camera by ID |

### Violations
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/violations/` | Create violation (broadcasts via WebSocket) |
| `GET` | `/api/violations/` | List violations (`offset`, `limit`, `camera_id`, `min_confidence`, `hours`) |

### Streams
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/streams/c1/start` | Start FFmpeg RTSP→HLS for Camera 1 |
| `GET` | `/api/streams/c1/status` | Check if C1 stream is running |
| `POST` | `/api/streams/{name}/stop` | Stop a named stream |

### Video & Media
| Method | Path | Description |
|---|---|---|
| `GET` | `/video_feed/C1` | MJPEG stream with real-time face detection overlays |
| `GET` | `/api/detections/images/{filename}` | Serve detection thumbnail image |

### WebSocket
| Path | Description |
|---|---|
| `/ws/violations` | Subscribe to real-time violation events |

WebSocket messages have the shape:
```json
{ "type": "violation", "data": { ...ViolationSchema } }
```

---

## Database Schema

```
Application          Camera
├─ id (PK)           ├─ id (PK)
├─ name (unique)     ├─ name (unique)
├─ description       ├─ rtsp_url
└─ config (JSON)     └─ is_active
        │                    │
        └────┬───────────────┘
             │
        AppCameraMap (junction)
        ├─ app_id (FK)
        └─ camera_id (FK)

Violation
├─ id (PK)
├─ app_id (FK → Application)
├─ camera_id (FK → Camera)
├─ timestamp (UTC, auto)
├─ details (JSON)      ← arbitrary detection metadata
└─ image_path (string) ← relative path to saved face crop
```

---

## Key Architectural Patterns

### Backend

**Async-first database access:**
```python
# All DB operations use AsyncSession
async def get_violations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Violation).order_by(Violation.timestamp.desc()))
    return result.scalars().all()
```

**WebSocket broadcast on violation create:**
```python
# violations.py — after inserting a violation, broadcast to all WS clients
await manager.broadcast(json.dumps({"type": "violation", "data": violation_dict}))
```

**FFmpeg process management (streaming.py):**
- `StreamManager` wraps `subprocess.Popen` calls
- Thread-safe with `threading.Lock`
- Registered with `atexit` for cleanup on process exit
- Codec passthrough (`-c:v copy`) for low-latency HLS

**MJPEG streaming (video_feed.py):**
- Opens RTSP → runs inference → yields JPEG frames via `StreamingResponse`
- Throttles violation emissions: same detection not re-emitted within 5 seconds
- Thread-safe with `processor_lock`

**Router organization:**
```python
# main.py — prefix pattern
app.include_router(applications_router, prefix="/api/applications")
app.include_router(violations_router, prefix="/api/violations")
# etc.
```

### Frontend

**API base URL via env:**
```javascript
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
```

**WebSocket URL — protocol-aware:**
```javascript
const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = `${wsProtocol}://${wsBase}/ws/violations`;
```

**Component memoization:**
```javascript
// DetectionCard is memoized — avoid re-renders on unrelated state changes
const DetectionCard = React.memo(({ detection }) => { ... });
```

**Debounced search:**
```javascript
// DetectionFilters — 300ms debounce on text input
useEffect(() => {
  const t = setTimeout(() => onChange({ ...filters, search: value }), 300);
  return () => clearTimeout(t);
}, [value]);
```

**Confidence color coding in DetectionCard:**
- `>= 0.95` → emerald (high confidence)
- `>= 0.85` → blue
- `>= 0.75` → yellow
- `< 0.75` → orange

---

## Naming & Style Conventions

### Python (Backend & Inference)
- `snake_case` for variables, functions, modules
- `PascalCase` for class names
- Use `async def` for all route handlers and DB operations
- `logger = logging.getLogger(__name__)` in each module
- Pydantic v2 schemas: use `model_config = ConfigDict(from_attributes=True)` (not `orm_mode`)
- Environment variables read at module load time with `os.getenv("VAR", "default")`

### JavaScript/JSX (Frontend)
- `camelCase` for variables, functions, state
- `PascalCase` for React components and files
- Functional components only — no class components
- Hooks: `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`
- File naming: `ComponentName.jsx` for components, `pageName.jsx` for pages
- ESLint config: `no-unused-vars` warns (uppercase identifiers and `_`-prefixed are excluded)

### CSS / Tailwind
- Dark background base: `bg-brand-dark` (`#050505`)
- Primary accent: `text-brand-green` / `bg-brand-green` (`#00ff9d`)
- Glass panels: `backdrop-blur-xl bg-*/10 border border-white/10`
- Neon shadow: `shadow-neon` (`0 0 10px rgba(0,255,157,0.5)`)
- Transitions: `transition-all duration-300`
- No custom CSS files — all styling via Tailwind utility classes

---

## Important Files & Where to Find Things

| What you're looking for | File |
|---|---|
| API app setup, CORS, routes, WebSocket | `backend/main.py` |
| Database connection / session | `backend/database.py` |
| ORM models | `backend/models.py` |
| Pydantic schemas | `backend/schemas.py` |
| Real-time WebSocket manager | `backend/websocket_manager.py` |
| FFmpeg stream management | `backend/streaming.py` |
| Violation create + broadcast | `backend/routers/violations.py` |
| MJPEG live feed + detection | `backend/routers/video_feed.py` |
| Thumbnail serving + caching | `backend/routers/detections.py` |
| Face recognition processor | `inference/processor.py` |
| Main dashboard UI | `frontend/src/pages/Dashboard.jsx` |
| Camera tile (HLS/MJPEG/offline) | `frontend/src/components/CameraTile.jsx` |
| HLS.js player wrapper | `frontend/src/components/HlsPlayer.jsx` |
| Detection card component | `frontend/src/components/DetectionCard.jsx` |
| Detection filters | `frontend/src/components/DetectionFilters.jsx` |
| Tailwind design tokens | `frontend/tailwind.config.js` |
| Python dependencies | `requirements.txt` |
| ML/conda dependencies | `cctv-env.yml` |
| Environment variable template | `.env.example` |

---

## Ignored Paths (Do Not Commit)

The following are gitignored and must never be committed:

```
.env                    # Secrets
inference/config.json   # Known faces and camera config (sensitive)
inference/data/         # Model weights and face embeddings
streams/                # Generated HLS segments
matched_faces/          # Face detection outputs
unknown_faces/          # Unknown face crops
thumbnail_cache/        # Thumbnail cache
*.pt / *.pth / *.onnx  # ML model files (large binaries)
*.db / *.sqlite         # Database files
node_modules/           # Frontend deps
frontend/dist/          # Build output
```

---

## Common Tasks

### Add a new API endpoint
1. Add route handler in the appropriate `backend/routers/*.py` file
2. Add Pydantic schema in `backend/schemas.py` if a new request/response shape is needed
3. If the endpoint needs DB access, use `db: AsyncSession = Depends(get_db)`
4. Register the router in `backend/main.py` if creating a new router file

### Add a new React component
1. Create `frontend/src/components/ComponentName.jsx`
2. Use functional component with hooks only
3. Accept props, avoid internal API calls where possible (prefer lifting state to Dashboard)
4. Wrap in `React.memo()` if the component renders frequently and receives stable props

### Add a new database model
1. Define the SQLAlchemy model in `backend/models.py`
2. Add corresponding Pydantic schemas in `backend/schemas.py`
3. Run `python scripts/init_db.py` or `alembic upgrade head` to apply changes

### Add a new environment variable
1. Add it to `.env.example` with a comment
2. Read it in the relevant module with `os.getenv("VAR_NAME", "default")`
3. Document it in the table in this file

### Adjust camera configuration
Camera-to-app mapping is currently mocked in `backend/routers/applications.py` (the `select` endpoint) and the frontend `MOCK_APP_MAP` in `Dashboard.jsx`. Update both if changing camera assignments.

---

## Architecture Decisions & Caveats

- **Inference is a separate process** from the backend. The `inference/` service and the `backend/routers/video_feed.py` MJPEG route both do face detection — choose one per deployment to avoid resource contention.
- **Camera configuration is partially mocked.** The `/api/applications/{id}/select` endpoint returns hardcoded camera lists. The database `AppCameraMap` table exists for a proper implementation but is not yet wired end-to-end.
- **Only Camera 1 (C1) has a real RTSP stream.** C2 and C3 use a demo video fallback in the UI. Cameras C4–C40 are UI placeholders.
- **Confidence filtering** in `GET /api/violations/` is performed post-query in Python rather than in SQL, because the `confidence` value lives inside the JSON `details` column.
- **No authentication.** The API has no auth layer. Add it (e.g., JWT Bearer tokens) before any internet-facing deployment.
- **SQLite is not suitable for production** with concurrent writes. Switch to PostgreSQL via `DATABASE_URL`.
- **HLS segments** are stored in `streams/` (served as static files). This directory must be writable by the backend process.
