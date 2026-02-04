# CCTV Analytics Platform - MVP

## Prerequisites
- Python 3.8+
- Node.js 16+
- PostgreSQL (running locally)
- ffmpeg available on PATH (required for RTSP -> HLS)

## Setup

1.  **Backend Setup**
    ```bash
    cd backend
    pip install -r ../requirements.txt
    ```
    Set your camera RTSP URL (C1) before running:
    ```bash
    set C1_RTSP_URL=rtsp://username:password@192.168.x.x:554/Streaming/Channels/101   # Windows
    export C1_RTSP_URL=rtsp://username:password@192.168.x.x:554/Streaming/Channels/101 # Mac/Linux
    ```
    Optional: override CORS origins (comma-separated) with `CORS_ORIGINS`.

2.  **Frontend Setup**
    ```bash
    cd frontend
    npm install
    ```
    If your backend is not on `http://localhost:8000`, set:
    ```bash
    # e.g. if backend runs on another host/port
    set VITE_API_BASE_URL=http://your-backend:8000   # Windows
    export VITE_API_BASE_URL=http://your-backend:8000 # Mac/Linux
    ```

3.  **Database Setup**
    - Ensure PostgreSQL is running.
    - Create a database named `cctv_db` (or update `backend/database.py`).
    - Initialize and seed the database:
    ```bash
    python scripts/init_db.py
    ```

## Running the App

1.  **Start Backend**
    ```bash
    cd backend
    uvicorn main:app --reload
    ```
    API will be at `http://localhost:8000`.

2.  **Start Frontend**
    ```bash
    cd frontend
    npm run dev
    ```
    UI will be at `http://127.0.0.1:5173` (default Vite dev port).

3.  **Start Inference Service**
    ```bash
    python inference/main.py
    ```
    This will simulate detection and send violations to the backend.

### Live CCTV feed (C1)
- The backend exposes `/api/streams/c1/start`, which launches an ffmpeg pipeline to transcode the configured `C1_RTSP_URL` into HLS at `/streams/c1/index.m3u8`.
- The frontend requests that endpoint on load and plays the HLS feed for camera **C1**. Other cameras remain mocked/demo.
- Deploy the backend on a host that can reach the RTSP camera (e.g., inside the same LAN/VPN) and expose the HTTP API over HTTPS for remote viewing.

## Features (MVP)
- **Dashboard**: View camera feeds (mocked) and active application.
- **App Selection**: Switch between applications (UI only for now).
- **Violations**: Mock inference service reports violations to backend.
