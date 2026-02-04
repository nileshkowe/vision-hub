import os
import cv2
import csv
import torch
import json
import time
import threading
import numpy as np
from PIL import Image
from ultralytics import YOLO
from datetime import datetime
import torch.nn.functional as F
from torchvision import transforms
from facenet_pytorch import InceptionResnetV1
from sklearn.metrics.pairwise import cosine_distances

# Configure FFmpeg for better RTSP handling (must be set before importing cv2 in some cases)
# Use TCP transport for more reliable delivery (UDP can drop packets)
if 'OPENCV_FFMPEG_CAPTURE_OPTIONS' not in os.environ:
    os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = 'rtsp_transport;tcp'

class FaceRecognitionProcessor:
    """Main processing class for face recognition system (Headless/Standalone)"""
    
    def __init__(self, parameters, cameras, on_violation=None, on_attendance=None):
        self.parameters = parameters
        self.cameras = cameras
        self.on_violation = on_violation  # Callback(violation_dict)
        self.on_attendance = on_attendance # Callback(attendance_dict)
        self.running = True
        self.log_violations = os.getenv("PROCESSOR_LOG_VIOLATIONS", "0") == "1"
        
        # Device configuration
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")
        
        # Models
        self.face_detector = None
        self.face_encoder = None
        self.db_embeddings = None
        self.db_labels = None
        
        # Image preprocessing
        self.transform = transforms.Compose([
            transforms.Resize((160, 160)),
            transforms.ToTensor(),
            transforms.Normalize([0.5] * 3, [0.5] * 3),
        ])
        
        # Tracking
        self.attendance_log = {}
        self.confirmation_counts = {}
        self.last_unknown_saved_time = {}
        self.camera_threads = {}
        self.lock = threading.Lock()
        
        # CSV tracking
        self.current_csv_path = None
        self.current_hour = None
        
        # Statistics
        self.stats = {
            'total_detections': 0,
            'known_faces': 0,
            'unknown_faces': 0,
            'attendance_today': 0
        }
        self.latest_frames = {}
        
        # Resolution tracking for downsampling
        self.capture_resolution = None
        self.stream_resolution = (1280, 720)  # Default streaming resolution
        
    def _resolve_path(self, path):
        """Resolve path relative to this file's directory if valid, else return as is"""
        if os.path.isabs(path):
            return path
        # Assuming paths are relative to the inference package (where this file is) -> data/ is sibling?
        # No, in config we had "data/face_db.json".
        # If this file is in inference/processor.py, joining with "data/face_db.json" -> inference/data/face_db.json.
        # This matches my file structure.
        return os.path.join(os.path.dirname(__file__), path)
    
    def _enhance_rtsp_url(self, url):
        """
        Enhance RTSP URL to request higher quality stream.
        Many cameras support URL parameters for resolution, fps, and bitrate.
        Also attempts to use main stream instead of substream.
        """
        if not url.startswith('rtsp://'):
            return url
        
        # Check if this looks like a Hikvision camera (common format)
        # Main stream is typically channel 01, substream is 02
        # Example: rtsp://user:pass@ip:port/Streaming/Channels/101 (main) vs 102 (sub)
        if '/Streaming/Channels/' in url:
            # Try to ensure we're using main stream (01) not substream (02)
            if '/102' in url or '/Channels/2' in url:
                print(f"⚠️ Detected possible substream URL, attempting to use main stream...")
                # Replace substream with main stream
                enhanced = url.replace('/102', '/101').replace('/Channels/2', '/Channels/1')
                if enhanced != url:
                    print(f"📹 Changed URL from substream to main stream")
                    url = enhanced
        
        # Add quality parameters if URL doesn't already have query parameters
        # Many cameras support these parameters (Axis, some Hikvision, etc.)
        if '?' not in url:
            # Try adding resolution and fps parameters
            # Note: These may not work with all cameras, but won't break if unsupported
            url += '?resolution=1920x1080&fps=30'
            print(f"📹 Added quality parameters to RTSP URL")
        elif 'resolution' not in url.lower():
            # URL has params but no resolution - try to add it
            url += '&resolution=1920x1080&fps=30'
            print(f"📹 Added quality parameters to existing RTSP URL")
        
        return url

    def start(self):
        """Start processing (non-blocking if threads used, but here we likely run main loop)"""
        try:
            # Load models
            self.load_models()
            
            # Create directories
            self.create_directories()
            
            # Start camera threads
            for camera_id, feed_path in self.cameras.items():
                thread = threading.Thread(
                    target=self.process_camera,
                    args=(camera_id, feed_path),
                    daemon=True
                )
                self.camera_threads[camera_id] = thread
                thread.start()
                
            # Keep main thread alive if needed, or return to let caller manage
            print("Inference started.")
                
        except Exception as e:
            print(f"Error starting processor: {e}")
            raise e

    def load_models(self):
        """Load all required models and database"""
        try:
            print("Loading face detection model...")
            # YOLO usually handles downloads itself or expects file. Let's resolve it.
            # If "yolov8n.pt" is just filename, YOLO lib checks current dir. 
            # We can resolve it to be explicit if it exists there, else leave it for YOLO to download/find.
            yolo_path = self._resolve_path(self.parameters['yolo_model_path'])
            # If not exists at resolved path, pass original (might be 'yolov8n.pt' for auto-download)
            if not os.path.exists(yolo_path):
                yolo_path = self.parameters['yolo_model_path']
                
            self.face_detector = YOLO(yolo_path)
            print("✓ YOLO model loaded")
            
            print("Loading face recognition model...")
            self.face_encoder = InceptionResnetV1(
                pretrained="casia-webface", 
                classify=False
            ).to(self.device)
            
            facenet_path = self._resolve_path(self.parameters['facenet_model_path'])
            if os.path.exists(facenet_path):
                try:
                    self.face_encoder.load_state_dict(
                        torch.load(
                            facenet_path, 
                            map_location=self.device
                        )
                    )
                    print("✓ Custom FaceNet weights loaded")
                except Exception as e:
                    print(f"⚠️ Could not load custom FaceNet weights, using default: {e}")
            else:
                print("ℹ️ Custom FaceNet weights not found, using default casia-webface")
                
            self.face_encoder.eval()
            print("✓ FaceNet model ready")
            
            print("Loading face database...")
            db_path = self._resolve_path(self.parameters['db_json_path'])
            with open(db_path, "r") as f:
                db_data = json.load(f)
            
            self.db_embeddings = np.array([item["embedding"] for item in db_data])
            self.db_labels = [item["name"] for item in db_data]
            print(f"✓ Loaded {len(self.db_labels)} face embeddings")
            
        except Exception as e:
            print(f"Error loading models: {e}")
            raise e

    def create_directories(self):
        """Create necessary directories if they don't exist"""
        dirs = [
            self.parameters['save_matched_dir'],
            self.parameters['save_unknown_dir'],
            self.parameters['attendance_dir']
        ]
        for directory in dirs:
            os.makedirs(self._resolve_path(directory), exist_ok=True)
            
    def process_camera(self, camera_id, feed_path):
        """Process individual camera feed"""
        # Enhance RTSP URL for better quality
        enhanced_url = self._enhance_rtsp_url(feed_path)
        
        # Try different backends for better RTSP support
        # FFMPEG backend often handles RTSP streams better
        cap = None
        try:
            # Try FFMPEG backend first for RTSP streams
            if feed_path.startswith('rtsp://'):
                print(f"📹 {camera_id}: Attempting RTSP connection with enhanced URL...")
                cap = cv2.VideoCapture(enhanced_url, cv2.CAP_FFMPEG)
                if not cap.isOpened():
                    print(f"⚠️ {camera_id}: FFMPEG backend failed, trying default backend...")
                    cap = cv2.VideoCapture(enhanced_url)
                if not cap.isOpened():
                    # Last resort: try original URL
                    print(f"⚠️ {camera_id}: Enhanced URL failed, trying original URL...")
                    cap = cv2.VideoCapture(feed_path, cv2.CAP_FFMPEG)
            else:
                cap = cv2.VideoCapture(feed_path)
        except Exception as e:
            print(f"⚠️ {camera_id}: Error opening video source: {e}")
            cap = cv2.VideoCapture(feed_path)
        
        # Set buffer size to 1 to minimize latency and prevent frame accumulation
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        # Additional RTSP/stream quality settings
        if feed_path.startswith('rtsp://'):
            # Try various quality-related properties
            # Note: These may not work with all cameras/backends, but won't break if unsupported
            try:
                # Try to set codec preference (may not work, but safe to try)
                cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'H264'))
            except:
                pass  # Not critical if it fails
            
            # Try to get actual stream properties for diagnostics
            try:
                backend = cap.getBackendName()
                print(f"📹 {camera_id}: Using backend: {backend}")
            except:
                pass
        
        # Try to set high resolution for capture (we'll downsample for streaming if needed)
        # Request 1920x1080 first, fallback to 1280x720 if not supported
        requested_width = 1920
        requested_height = 1080
        
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, requested_width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, requested_height)
        
        # Verify actual resolution after setting
        actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Log resolution info
        print(f"📹 {camera_id}: Resolution - Requested: {requested_width}x{requested_height}, Actual: {actual_width}x{actual_height}")
        
        # If resolution doesn't match, try fallback
        if actual_width != requested_width or actual_height != requested_height:
            # Try 1280x720 as fallback
            fallback_width = 1280
            fallback_height = 720
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, fallback_width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, fallback_height)
            actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            print(f"📹 {camera_id}: Fallback resolution - Requested: {fallback_width}x{fallback_height}, Actual: {actual_width}x{actual_height}")
        
        # Store actual resolution for downsampling decisions
        self.capture_resolution = (actual_width, actual_height)
        
        # Target streaming resolution (can be lower than capture for bandwidth)
        self.stream_resolution = (1280, 720)  # Will downsample if capture is higher
        
        # Get frame rate info
        fps = cap.get(cv2.CAP_PROP_FPS)
        print(f"📹 {camera_id}: Frame rate: {fps:.2f} FPS")

        fail_count = 0
        frame_counter = 0
        last_fps_log_time = time.time()
        fps_frame_count = 0
        
        while self.running:
            try:
                if cap is None or not cap.isOpened():
                    if not self.running:
                        break
                    print(f"⚠️ {camera_id}: Stream not opened. Reconnecting...")
                    # Sleep in smaller increments to check running flag
                    for _ in range(int(self.parameters['reconnect_delay'])):
                        if not self.running:
                            break
                        time.sleep(1)
                    if not self.running:
                        break
                    cap = cv2.VideoCapture(feed_path)
                    continue
                    
                ret, frame = cap.read()
                if not ret:
                    fail_count += 1
                    if fail_count >= self.parameters['max_failures']:
                        print(f"❌ {camera_id}: Max failures reached. Reconnecting...")
                        cap.release()
                        cap = None
                        fail_count = 0
                    time.sleep(0.5)
                    continue
                    
                fail_count = 0
                frame_counter += 1
                fps_frame_count += 1
                
                # Log frame dimensions periodically for diagnostics
                if frame_counter == 1:
                    h, w = frame.shape[:2]
                    print(f"📹 {camera_id}: First frame captured - Dimensions: {w}x{h}")
                
                # Calculate and log actual FPS periodically
                current_time = time.time()
                if current_time - last_fps_log_time >= 5.0:  # Log every 5 seconds
                    actual_fps = fps_frame_count / (current_time - last_fps_log_time)
                    print(f"📹 {camera_id}: Actual processing FPS: {actual_fps:.2f} (target: ~{1/(0.03 * self.parameters['frame_skip']):.1f})")
                    fps_frame_count = 0
                    last_fps_log_time = current_time

                # Check if we should stop before throttling
                if not self.running:
                    break
                
                # Throttle inference loop to avoid consuming frames too fast (approx 30fps cap)
                time.sleep(0.03)
                
                # Downsample frame if capture resolution is higher than stream resolution
                # This preserves detail during capture while managing bandwidth for streaming
                if hasattr(self, 'capture_resolution') and hasattr(self, 'stream_resolution'):
                    cap_w, cap_h = self.capture_resolution
                    stream_w, stream_h = self.stream_resolution
                    if cap_w > stream_w or cap_h > stream_h:
                        # Downsample using INTER_LINEAR for good quality
                        frame = cv2.resize(frame, (stream_w, stream_h), interpolation=cv2.INTER_LINEAR)

                if frame_counter % self.parameters['frame_skip'] != 0:
                    # Provide raw frame if skipping inference? Or just hold last annotated?
                    # Let's hold last annotated to avoid flicker, or just update logic.
                    continue
                    
                processed = self.process_frame(camera_id, frame.copy())
                
                # Store processed frame for streaming
                with self.lock:
                    self.latest_frames[camera_id] = processed

                
            except Exception as e:
                print(f"Error processing camera {camera_id}: {e}")
                if not self.running:
                    break  # Exit immediately if stopped
                time.sleep(1)
                
        # Cleanup: release VideoCapture
        if cap and cap.isOpened():
            print(f"Releasing VideoCapture for {camera_id}...")
            cap.release()
            print(f"VideoCapture released for {camera_id}")
            
    def process_frame(self, camera_id, frame):
        """Process single frame for face detection and recognition"""
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            results = self.face_detector(frame)[0]
            boxes = results.boxes.xyxy.cpu().numpy() if results.boxes else []
            
            # Draw boxes on frame
            for box in boxes:
                x1, y1, x2, y2 = map(int, box)
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            for box in boxes:
                cropped = self.crop_face_with_buffer(frame, box)

                min_face_size = int(self.parameters.get("min_face_size", 80))
                if cropped.shape[0] < min_face_size or cropped.shape[1] < min_face_size:
                    if self.on_violation:
                        small_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        payload = {
                            "camera_id": camera_id,
                            "type": "face_detection",
                            "name": "Unknown",
                            "confidence": 0.0,
                            "timestamp": small_timestamp,
                            "bbox": box.tolist(),
                            "image_filename": None,
                            "small_face": True,
                        }
                        if self.log_violations:
                            print(f"on_violation payload (small_face): {payload}")
                        try:
                            self.on_violation(payload)
                        except Exception as exc:
                            print(f"on_violation error: {exc}")
                    continue
                    
                embedding = self.get_embedding(cropped)
                name, dist = self.match_face(embedding)
                with self.lock:
                    self.stats['total_detections'] += 1
                
                confidence = 1.0 - dist if name != "Unknown" else 0.0
                if self.log_violations:
                    print(
                        f"emit check: name={name} conf={confidence:.2f} "
                        f"min_face={self.parameters.get('min_face_size', 80)} "
                        f"on_violation={self.on_violation is not None}"
                    )
                
                # Logic dispatch
                image_filename = None
                if name != "Unknown":
                    # For known faces, image is saved only after confirmations
                    saved_filename = self.handle_known_face(name, timestamp, camera_id, cropped)
                    if saved_filename:
                        image_filename = saved_filename
                    with self.lock:
                        self.stats['known_faces'] += 1
                else:
                    # For unknown faces, save immediately (with interval check)
                    saved_filename = self.handle_unknown_face(timestamp, camera_id, cropped)
                    if saved_filename:
                        image_filename = saved_filename
                    with self.lock:
                        self.stats['unknown_faces'] += 1
                
                # Call violation/detection callback
                # For now, treat every detection as an event we might want to see
                if self.on_violation:
                     payload = {
                        "camera_id": camera_id,
                        "type": "face_detection",
                        "name": name,
                        "confidence": float(confidence),
                        "timestamp": timestamp,
                        "bbox": box.tolist(),
                        "image_filename": image_filename  # May be None if image not saved yet
                     }
                     if self.log_violations:
                         print(f"on_violation payload: {payload}")
                     try:
                         self.on_violation(payload)
                     except Exception as exc:
                         print(f"on_violation error: {exc}")

        except Exception as e:
            print(f"Error in process_frame: {e}")
        return frame
        
    def crop_face_with_buffer(self, img, box):
        x1, y1, x2, y2 = map(int, box)
        img_h, img_w = img.shape[:2]
        w, h = x2 - x1, y2 - y1
        area = w * h
        
        if area < 8000:
            expand_x, expand_up, expand_down = 0.2, 0.2, 0.3
        elif area < 25000:
            expand_x, expand_up, expand_down = 0.15, 0.15, 0.3
        else:
            expand_x, expand_up, expand_down = 0.1, 0.1, 0.1
            
        x1 = int(max(0, x1 - w * expand_x))
        x2 = int(min(img_w, x2 + w * expand_x))
        y1 = int(max(0, y1 - h * expand_up))
        y2 = int(min(img_h, y2 + h * expand_down))
        
        return img[y1:y2, x1:x2]
        
    def get_embedding(self, crop):
        try:
            face_pil = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
            tensor = self.transform(face_pil).unsqueeze(0).to(self.device)
            with torch.no_grad():
                emb = self.face_encoder(tensor)
                emb = F.normalize(emb, p=2, dim=1)
            return emb.cpu().numpy().flatten()
        except:
            return None
            
    def match_face(self, embedding):
        if embedding is None:
            return "Unknown", 1.0
        try:
            dists = cosine_distances(embedding.reshape(1, -1), self.db_embeddings).flatten()
            idx = np.argmin(dists)
            dist = dists[idx]
            if dist < self.parameters['threshold']:
                return self.db_labels[idx], dist
            else:
                return "Unknown", dist
        except:
            return "Unknown", 1.0
            
    def handle_known_face(self, name, timestamp, camera_id, cropped):
        """
        Handle known face detection.
        Returns the saved image filename if image was saved, None otherwise.
        """
        with self.lock:
            if name not in self.attendance_log:
                self.confirmation_counts[name] = self.confirmation_counts.get(name, 0) + 1
                if self.confirmation_counts[name] >= self.parameters['required_confirmations']:
                    self.attendance_log[name] = timestamp
                    self.log_attendance(name, timestamp, camera_id)
                    image_filename = self.save_face_crop(cropped, name, timestamp, self.parameters['save_matched_dir'], camera_id)
                    self.stats['attendance_today'] += 1
                    print(f"✓ Attendance logged: {name} at {timestamp}")
                    
                    if self.on_attendance:
                        self.on_attendance({
                            "name": name, 
                            "time": timestamp, 
                            "camera_id": camera_id
                        })
                    return image_filename
        return None

    def handle_unknown_face(self, timestamp, camera_id, cropped):
        """
        Handle unknown face detection.
        Returns the saved image filename if image was saved, None otherwise.
        """
        current_time = time.time()
        with self.lock:
            if camera_id not in self.last_unknown_saved_time or \
               current_time - self.last_unknown_saved_time[camera_id] > self.parameters['unknown_interval']:
                image_filename = self.save_face_crop(cropped, "Unknown", timestamp, self.parameters['save_unknown_dir'], camera_id)
                self.last_unknown_saved_time[camera_id] = current_time
                return image_filename
        return None

    def save_face_crop(self, img, name, timestamp, folder, camera_id):
        """
        Save face crop image and return the filename.
        
        Returns:
            str: Filename of saved image, or None if save failed
        """
        try:
            resolved_folder = self._resolve_path(folder)
            os.makedirs(resolved_folder, exist_ok=True)
            fname = f"{camera_id}_{name}_{timestamp.replace(':', '-').replace(' ', '_')}.jpg"
            path = os.path.join(resolved_folder, fname)
            cv2.imwrite(path, img)
            return fname  # Return just the filename
        except Exception as e:
            print(f"Error saving crop: {e}")
            return None

    def log_attendance(self, name, timestamp, camera_id):
        try:
            csv_path = self.get_current_csv_path()
            date, time_val = timestamp.split(" ")
            # Ensure path directory exists if get_current_csv_path didn't ensure it
            # But get_current_csv_path seems to try to open it.
            with open(csv_path, "a", newline="") as f:
                writer = csv.writer(f)
                writer.writerow([name, date, time_val, camera_id])
        except Exception as e:
            print(f"Error logging attendance: {e}")

    def get_current_csv_path(self):
        now = datetime.now()
        hour_str = now.strftime("%Y-%m-%d_%H")
        if self.current_hour != hour_str or self.current_csv_path is None:
            self.current_hour = hour_str
            filename = f"attendance_{hour_str}-00.csv"
            attendance_dir = self._resolve_path(self.parameters['attendance_dir'])
            # ensure dir exists
            os.makedirs(attendance_dir, exist_ok=True)
            self.current_csv_path = os.path.join(attendance_dir, filename)
            
            if not os.path.exists(self.current_csv_path):
                with open(self.current_csv_path, "w", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow(["Name", "Date", "Time", "CameraID"])
        return self.current_csv_path

    def stop(self):
        """Stop the processor and all camera threads"""
        print("Stopping processor...")
        self.running = False
        
        # Wait for camera threads to finish
        for camera_id, thread in self.camera_threads.items():
            if thread.is_alive():
                print(f"Waiting for camera {camera_id} thread to stop...")
                thread.join(timeout=2.0)
                if thread.is_alive():
                    print(f"⚠️ Camera {camera_id} thread did not stop gracefully")
        
        # Release any remaining VideoCapture resources
        # Note: This is a safety measure, threads should have released them
        print("Processor stopped")
