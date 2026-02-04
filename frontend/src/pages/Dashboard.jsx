import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import AppSelector from '../components/AppSelector';
import CameraTile from '../components/CameraTile';
import DetectionFilters from '../components/DetectionFilters';
import DetectionList from '../components/DetectionList';
import { ChevronUp, ChevronDown, AlertCircle, ChevronLeft, ChevronRight, X, Scan, Camera, Activity, Check, Minimize2, Maximize2, User, Wifi, WifiOff, RefreshCw } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

// Mock Data Generator
const generateCameras = (apiBase) => {
    const areas = ['Entrance', 'Lobby', 'Warehouse', 'Parking', 'Cafeteria', 'Server Room', 'Loading Dock', 'Perimeter'];
    const demoStream = 'https://media.w3.org/2010/05/sintel/trailer.mp4';

    return Array.from({ length: 40 }, (_, i) => {
        const id = `C${i + 1}`;
        const isC1 = id === 'C1';
        const isC2orC3 = id === 'C2' || id === 'C3';
        
        // C1: Real MJPEG feed from backend (annotated with face detection)
        // C2, C3: Placeholders (no real stream_url, only demo_url)
        // Others: No stream_url by default
        const stream_url = isC1 ? `${apiBase}/video_feed/C1` : undefined;

        return {
            id,
            name: `${areas[i % areas.length]} ${Math.floor(i / areas.length) + 1}`,
            stream_url,
            demo_url: isC2orC3 ? demoStream : undefined, // Only C2, C3 get demo_url as placeholder
            is_active: false, // Default to false, controlled by app selection
            status: Math.random() > 0.9 ? 'warning' : 'ok'
        };
    });
};

// Mock App Camera Mapping
const MOCK_APP_MAP = {
    1: ['C1', 'C2', 'C3'], // App 1: 3 Cameras
    2: ['C4', 'C5', 'C6', 'C7', 'C8', 'C9'], // App 2: 6 Cameras
    3: ['C10', 'C11', 'C12', 'C13'], // App 3: 4 Cameras
    4: ['C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22'], // App 4: 9 Cameras
    5: ['C23', 'C24', 'C25', 'C26', 'C27', 'C28', 'C29', 'C30', 'C31', 'C32', 'C33', 'C34', 'C35', 'C36', 'C37', 'C38'], // App 5: 16 Cameras
};

const Dashboard = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [activeApp, setActiveApp] = useState(null); // Start with no app selected
    const [allCameras, setAllCameras] = useState([]);
    const [selectedCameraIds, setSelectedCameraIds] = useState([]);
    const [maximizedCameraId, setMaximizedCameraId] = useState(null); // New state for temporary maximization
    const [isPanelOpen, setIsPanelOpen] = useState(false); // Closed by default
    const [alerts, setAlerts] = useState([]);
    const [unreadAlerts, setUnreadAlerts] = useState(0);
    const [alertsDismissed, setAlertsDismissed] = useState(false);
    const [appSelectLoading, setAppSelectLoading] = useState(false);
    const [appSelectError, setAppSelectError] = useState(null);
    
    // Detections state
    const [detections, setDetections] = useState([]);
    const [detectionsLoading, setDetectionsLoading] = useState(false);
    const [detectionsError, setDetectionsError] = useState(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [detectionsPage, setDetectionsPage] = useState(1);
    const [detectionsFilters, setDetectionsFilters] = useState({
        search: '',
        minConfidence: 0,
        cameraId: null,
        hours: null
    });

    const isUnknownDetection = (detection) => {
        const name = detection?.details?.name;
        return !name || name.toLowerCase() === 'unknown';
    };

    const enhanceDetection = (detection) => ({
        ...detection,
        image_url: detection.image_url || (detection.image_path ? `/api/detections/images/${detection.image_path.split('/').pop()}` : null)
    });

    const getAlertThumbnailSrc = (alert) => {
        if (!alert?.image_url) return null;
        return `${API_BASE}${alert.image_url}`;
    };

    const markAllAlertsRead = () => {
        setUnreadAlerts(0);
    };

    // Initialize cameras on mount
    useEffect(() => {
        setAllCameras(generateCameras(API_BASE));
    }, []);

    /**
     * Handle application selection - calls backend and configures cameras
     */
    const handleSelectApp = useCallback(async (appId) => {
        setAppSelectLoading(true);
        setAppSelectError(null);
        
        try {
            // Call backend to select application
            const response = await fetch(`${API_BASE}/api/applications/${appId}/select`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            if (!response.ok) {
                throw new Error(`Failed to select application: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`Application ${appId} selected:`, data);
            
            // Update state based on backend response
            setActiveApp(appId);
            
            // Get cameras for this app
            const appCameras = data.cameras || MOCK_APP_MAP[appId] || [];
            setSelectedCameraIds(appCameras);
            
            // Update camera active states
            // Only C1 is active (has real stream), others are placeholders
            setAllCameras(prev => prev.map(cam => ({
                ...cam,
                is_active: cam.id === 'C1' && appCameras.includes('C1')
            })));
            
            // Maximize C1 when app 1 is selected
            if (appId === 1 && appCameras.includes('C1')) {
                setMaximizedCameraId('C1');
            } else {
                setMaximizedCameraId(null);
            }
            
        } catch (err) {
            console.error('Failed to select application:', err);
            setAppSelectError(err.message || 'Failed to select application');
        } finally {
            setAppSelectLoading(false);
        }
    }, []);

    // Fetch detections from API
    const fetchDetections = useCallback(async () => {
        if (activeTab !== 'detections') return;
        
        setDetectionsLoading(true);
        setDetectionsError(null);
        
        try {
            const params = new URLSearchParams();
            params.append('limit', '1000');
            params.append('offset', '0');
            
            if (detectionsFilters.cameraId !== null) {
                params.append('camera_id', detectionsFilters.cameraId.toString());
            }
            
            if (detectionsFilters.minConfidence > 0) {
                params.append('min_confidence', detectionsFilters.minConfidence.toString());
            }
            
            if (detectionsFilters.hours !== null) {
                params.append('hours', detectionsFilters.hours.toString());
            }
            
            const response = await fetch(`${API_BASE}/api/violations/?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch detections: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            const enhancedData = data.map(enhanceDetection);
            const known = enhancedData.filter(d => !isUnknownDetection(d));
            const unknown = enhancedData.filter(isUnknownDetection);

            setDetections(known);
            setAlerts(unknown);
        } catch (err) {
            console.error('Error fetching detections:', err);
            setDetectionsError(err.message);
        } finally {
            setDetectionsLoading(false);
        }
    }, [activeTab, detectionsFilters.cameraId, detectionsFilters.minConfidence, detectionsFilters.hours]);
    
    // Fetch detections when tab is active
    useEffect(() => {
        if (activeTab === 'detections') {
            fetchDetections();
        }
    }, [activeTab, fetchDetections]);
    
    // WebSocket Connection
    useEffect(() => {
        // Better WebSocket URL construction - handle both http and https
        const wsProtocol = API_BASE.startsWith('https') ? 'wss' : 'ws';
        const wsBase = API_BASE.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}://${wsBase}/ws/violations`;
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to violations WebSocket');
            setWsConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'violation') {
                    const data = message.data;
                    
                    const detection = enhanceDetection(data);
                    if (isUnknownDetection(detection)) {
                        setAlerts(prev => {
                            const exists = prev.some(d => d.id === detection.id);
                            if (exists) return prev;
                            return [detection, ...prev].slice(0, 1000);
                        });
                        if (alertsDismissed || !isPanelOpen) {
                            setUnreadAlerts((count) => count + 1);
                        }
                        if (!alertsDismissed && !isPanelOpen) {
                            setIsPanelOpen(true);
                            setUnreadAlerts(0);
                        }
                    } else {
                        setDetections(prev => {
                            const exists = prev.some(d => d.id === detection.id);
                            if (exists) return prev;
                            const updated = [detection, ...prev];
                            return updated.slice(0, 1000);
                        });
                    }
                }
            } catch (e) {
                console.error('Error parsing WS message', e);
            }
        };

        ws.onerror = (e) => {
            console.error('WebSocket error:', e);
            setWsConnected(false);
        };
        
        ws.onclose = (event) => {
            console.log('WebSocket connection closed');
            setWsConnected(false);
        };

        return () => {
            ws.close();
        };
    }, [activeTab]);

    // Note: App selection is now handled by handleSelectApp callback
    // This useEffect is removed as we handle everything in handleSelectApp

    const toggleCamera = (id) => {
        // If maximized, minimize first
        if (maximizedCameraId) {
            setMaximizedCameraId(null);
        }

        setSelectedCameraIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(c => c !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const handleExpand = (id) => {
        if (maximizedCameraId === id) {
            setMaximizedCameraId(null); // Minimize if already maximized
        } else {
            setMaximizedCameraId(id); // Maximize
        }
    };

    // Filter cameras for display based on SELECTION or MAXIMIZED state
    const displayedCameras = maximizedCameraId
        ? allCameras.filter(c => c.id === maximizedCameraId)
        : allCameras.filter(c => selectedCameraIds.includes(c.id));

    const isSingleView = displayedCameras.length === 1;

    // Dynamic Grid Layout Calculation
    const getGridLayout = (count) => {
        if (count <= 1) return { rows: 1, cols: 1 };
        if (count <= 2) return { rows: 1, cols: 2 };
        if (count <= 4) return { rows: 2, cols: 2 };
        if (count <= 6) return { rows: 2, cols: 3 };
        if (count <= 9) return { rows: 3, cols: 3 };
        if (count <= 12) return { rows: 3, cols: 4 };
        if (count <= 16) return { rows: 4, cols: 4 };
        return { rows: 5, cols: 5 }; // Fallback
    };

    const gridLayout = getGridLayout(displayedCameras.length);

    return (
        <Layout activeTab={activeTab} onTabChange={setActiveTab}>
            <div className="flex h-full overflow-hidden relative">

                {/* Vertical Camera Array (Left Sidebar) - Desktop Only */}
                {activeTab === 'dashboard' && (
                    <div className="hidden md:flex w-20 bg-black/20 border-r border-white/5 flex-col items-center py-4 gap-2 overflow-y-auto scrollbar-hide shrink-0 z-20 backdrop-blur-sm">
                        <div className="text-[10px] font-mono text-gray-500 mb-2 font-bold">CAMS</div>
                        {allCameras.map(cam => {
                            const isAppCam = MOCK_APP_MAP[activeApp]?.includes(cam.id);
                            const isSelected = selectedCameraIds.includes(cam.id);
                            return (
                                <button
                                    key={cam.id}
                                    disabled={!isAppCam}
                                    onClick={() => toggleCamera(cam.id)}
                                    className={`
                                        w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono transition-all duration-200
                                        ${!isAppCam ? 'opacity-20 cursor-not-allowed bg-gray-800 text-gray-500' : ''}
                                        ${isAppCam && !isSelected ? 'bg-gray-800/50 text-gray-400 hover:bg-gray-700 hover:text-white border border-white/5' : ''}
                                        ${isSelected ? 'bg-brand-green text-black shadow-neon scale-110 border-none' : ''}
                                    `}
                                >
                                    {cam.id.replace('C', '')}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Main Content Column */}
                <div className="flex-1 flex flex-col min-w-0 relative">

                    {/* MONITOR VIEW */}
                    {activeTab === 'dashboard' && (
                        <>
                            <div className="px-4 pt-4 shrink-0 flex flex-col gap-2">
                                <AppSelector activeApp={activeApp} onSelectApp={handleSelectApp} compact />
                                {appSelectError && (
                                    <div className="text-red-500 text-sm px-2 py-1 bg-red-500/10 border border-red-500/20 rounded">
                                        Error: {appSelectError}
                                    </div>
                                )}
                                {appSelectLoading && (
                                    <div className="text-brand-green text-sm px-2 py-1">
                                        Starting application...
                                    </div>
                                )}

                                {/* Horizontal Camera Array - Mobile Only */}
                                <div className="flex md:hidden gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {allCameras.map(cam => {
                                        const isAppCam = MOCK_APP_MAP[activeApp]?.includes(cam.id);
                                        const isSelected = selectedCameraIds.includes(cam.id);
                                        if (!isAppCam) return null; // Only show active app cams on mobile to save space
                                        return (
                                            <button
                                                key={cam.id}
                                                onClick={() => toggleCamera(cam.id)}
                                                className={`
                                                    min-w-[40px] h-10 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono transition-all duration-200 shrink-0
                                                    ${isAppCam && !isSelected ? 'bg-gray-800/50 text-gray-400 border border-white/5' : ''}
                                                    ${isSelected ? 'bg-brand-green text-black shadow-neon border-none' : ''}
                                                `}
                                            >
                                                {cam.id.replace('C', '')}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Feed Area - Padded at bottom for Alerts */}
                            <div className="flex-1 px-4 pb-20 overflow-hidden relative flex flex-col">
                                {activeApp === null ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 font-mono border border-dashed border-white/10 rounded-2xl gap-4">
                                        <div className="text-2xl font-bold text-white mb-2">SELECT AN APPLICATION TO BEGIN</div>
                                        <div className="text-sm text-gray-500">Choose an application from above to start monitoring</div>
                                    </div>
                                ) : displayedCameras.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center text-gray-500 font-mono border border-dashed border-white/10 rounded-2xl">
                                        NO CAMERAS SELECTED
                                    </div>
                                ) : (
                                    <div
                                        className={`grid gap-4 flex-1 min-h-0 transition-all duration-500 ${isSingleView ? 'p-0' : ''}`}
                                        style={{
                                            gridTemplateColumns: `repeat(${gridLayout.cols}, minmax(0, 1fr))`,
                                            gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))`
                                        }}
                                    >
                                        {displayedCameras.map((cam) => (
                                            <div key={cam.id} className="w-full h-full animate-in fade-in zoom-in duration-300">
                                                <CameraTile
                                                    camera={cam}
                                                    onExpand={handleExpand}
                                                    isMaximized={maximizedCameraId === cam.id}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Collapsible Violations Panel */}
                    <div className={`absolute bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-xl border-t border-white/10 transition-all duration-500 z-40 ${isPanelOpen ? 'h-64' : 'h-12'}`}>
                        {/* Handle */}
                        <div
                            className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900/90 border border-white/10 border-b-0 rounded-t-xl px-6 py-1 cursor-pointer hover:bg-gray-800 transition-colors flex items-center gap-2"
                            onClick={() => {
                                setIsPanelOpen((open) => {
                                    const next = !open;
                                    if (next) {
                                        setAlertsDismissed(false);
                                        setUnreadAlerts(0);
                                    } else {
                                        setAlertsDismissed(true);
                                    }
                                    return next;
                                });
                            }}
                        >
                            <span className="text-xs font-mono text-brand-green font-bold whitespace-nowrap">
                                ALERTS{unreadAlerts > 0 ? ` | ${unreadAlerts} NEW` : ''}
                            </span>
                            {isPanelOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronUp size={14} className="text-gray-400" />}
                        </div>

                                {/* Content */}
                                <div className="p-4 h-full overflow-hidden flex flex-col">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-sm font-bold text-white tracking-wider flex items-center gap-2">
                                            <AlertCircle size={16} className="text-brand-green" />
                                            RECENT VIOLATIONS
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={markAllAlertsRead}
                                                className="text-xs text-gray-400 hover:text-white transition-colors"
                                            >
                                                MARK ALL READ
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('alerts')}
                                                className="text-xs text-gray-400 hover:text-white transition-colors"
                                            >
                                                VIEW ALL HISTORY
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                                        {alerts.map((alert) => {
                                            const name = alert.details?.name || 'Unknown';
                                            const confidence = Math.round((alert.details?.confidence || 0) * 100);
                                            const timeLabel = new Date(alert.timestamp).toLocaleTimeString();
                                            const thumbnailSrc = getAlertThumbnailSrc(alert);
                                            return (
                                                <div key={alert.id} className="min-w-[280px] glass-panel p-3 rounded-xl flex gap-3 group hover:border-brand-green/30 transition-colors cursor-pointer">
                                                    <div className="w-20 h-16 bg-black rounded-lg overflow-hidden relative shrink-0">
                                                        <div className="absolute inset-0 bg-brand-green/10"></div>
                                                        {thumbnailSrc && (
                                                            <img
                                                                src={thumbnailSrc}
                                                                alt={name}
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    e.currentTarget.style.display = 'none';
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col justify-center">
                                                        <span className="text-xs font-bold text-white">
                                                            {name.toLowerCase() === 'unknown' ? 'UNKNOWN FACE' : `DETECTED: ${name}`}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-mono">{`C${alert.camera_id}`} • {timeLabel}</span>
                                                        <span className="text-[10px] text-brand-green mt-1">CONFIDENCE: {confidence}%</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ALERTS VIEW */}
                    {activeTab === 'alerts' && (
                        <div className="flex flex-col h-full p-4 md:p-8 overflow-hidden">
                            <div className="flex justify-between items-center mb-6 shrink-0">
                                <div>
                                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                                        <AlertCircle className="text-brand-green" />
                                        ALERTS HISTORY
                                    </h2>
                                    <p className="text-gray-400 text-sm mt-1">
                                        Reviewing {alerts.length} detected alerts
                                    </p>
                                </div>
                                <button
                                    onClick={markAllAlertsRead}
                                    className="text-xs text-gray-400 hover:text-white transition-colors"
                                >
                                    MARK ALL READ
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                                <div className="grid gap-3">
                                    {alerts.map((alert) => {
                                        const name = alert.details?.name || 'Unknown';
                                        const confidence = Math.round((alert.details?.confidence || 0) * 100);
                                        const timeLabel = new Date(alert.timestamp).toLocaleTimeString();
                                        const thumbnailSrc = getAlertThumbnailSrc(alert);
                                        return (
                                            <div key={alert.id} className="glass-panel p-4 rounded-xl flex items-center gap-4 group hover:border-brand-green/30 transition-colors">
                                                <div className="w-24 h-20 bg-black rounded-lg overflow-hidden relative shrink-0">
                                                    <div className="absolute inset-0 bg-brand-green/10"></div>
                                                    {thumbnailSrc && (
                                                        <img
                                                            src={thumbnailSrc}
                                                            alt={name}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => {
                                                                e.currentTarget.style.display = 'none';
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-sm font-bold text-white">
                                                            {name.toLowerCase() === 'unknown' ? 'UNKNOWN FACE' : `DETECTED: ${name}`}
                                                        </span>
                                                        <span className="text-xs font-mono text-gray-500">{timeLabel}</span>
                                                    </div>
                                                    <div className="text-xs text-gray-400 font-mono mt-1">CAMERA: {`C${alert.camera_id}`}</div>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className="px-2 py-0.5 rounded bg-brand-green/10 text-brand-green text-[10px] font-bold border border-brand-green/20">
                                                            {confidence}% CONFIDENCE
                                                        </span>
                                                        <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-[10px] font-bold border border-white/5">
                                                            UNRESOLVED
                                                        </span>
                                                    </div>
                                                </div>
                                                <button className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                                                    <ChevronRight size={20} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DETECTIONS VIEW */}
                    {activeTab === 'detections' && (
                        <div className="flex flex-col h-full p-4 md:p-8 overflow-hidden">
                            <div className="flex justify-between items-center mb-6 shrink-0">
                                <div>
                                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                                        <User className="text-brand-green" />
                                        FACE DETECTIONS
                                    </h2>
                                    <p className="text-gray-400 text-sm mt-1">
                                        {detections.length} detection{detections.length !== 1 ? 's' : ''} recorded
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                    {/* WebSocket Connection Status */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/30 border border-white/10">
                                        {wsConnected ? (
                                            <>
                                                <Wifi size={14} className="text-brand-green" />
                                                <span className="text-xs font-mono text-brand-green">LIVE</span>
                                            </>
                                        ) : (
                                            <>
                                                <WifiOff size={14} className="text-gray-500" />
                                                <span className="text-xs font-mono text-gray-500">OFFLINE</span>
                                            </>
                                        )}
                                    </div>
                                    
                                    {/* Refresh Button */}
                                    <button
                                        onClick={fetchDetections}
                                        disabled={detectionsLoading}
                                        className="px-4 py-2 bg-brand-green/10 border border-brand-green/30 rounded-lg text-sm text-brand-green hover:bg-brand-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        <RefreshCw size={16} className={detectionsLoading ? 'animate-spin' : ''} />
                                        Refresh
                                    </button>
                                </div>
                            </div>
                            
                            {/* Error Message */}
                            {detectionsError && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                                    Error: {detectionsError}
                                </div>
                            )}
                            
                            {/* Filters */}
                            <DetectionFilters 
                                filters={detectionsFilters} 
                                onFiltersChange={setDetectionsFilters} 
                            />
                            
                            {/* Detection List */}
                            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                                <DetectionList
                                    detections={detections}
                                    filters={detectionsFilters}
                                    loading={detectionsLoading}
                                    currentPage={detectionsPage}
                                    itemsPerPage={12}
                                    onPageChange={setDetectionsPage}
                                />
                            </div>
                        </div>
                    )}

                    {/* CAMERAS REGISTRY VIEW */}
                    {activeTab === 'cameras' && (
                        <div className="flex flex-col h-full p-4 md:p-8 overflow-hidden">
                            <div className="flex justify-between items-center mb-6 shrink-0">
                                <div>
                                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                                        <Camera className="text-brand-green" />
                                        CAMERA REGISTRY
                                    </h2>
                                    <p className="text-gray-400 text-sm mt-1">
                                        Managing {allCameras.length} units across all applications
                                    </p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="px-4 py-2 bg-brand-green/10 rounded-lg border border-brand-green/20 flex items-center gap-2">
                                        <Activity size={16} className="text-brand-green" />
                                        <span className="text-sm font-mono text-brand-green">ACTIVE APP: {activeApp}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-3">
                                    {allCameras.map((cam) => {
                                        const isActiveInApp = MOCK_APP_MAP[activeApp]?.includes(cam.id);
                                        return (
                                            <div
                                                key={cam.id}
                                                className={`
                                                    relative p-4 rounded-xl border transition-all duration-300 flex flex-col gap-2
                                                    ${isActiveInApp
                                                        ? 'bg-brand-green/10 border-brand-green/50 shadow-[0_0_15px_rgba(16,185,129,0.15)] scale-100 opacity-100'
                                                        : 'bg-gray-900/40 border-white/5 opacity-40 hover:opacity-60 grayscale'}
                                                `}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <span className={`text-xs font-mono font-bold ${isActiveInApp ? 'text-brand-green' : 'text-gray-500'}`}>
                                                        {cam.id}
                                                    </span>
                                                    <div className={`w-2 h-2 rounded-full ${cam.is_active ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                </div>

                                                <div className="mt-1">
                                                    <div className="text-sm font-bold text-white truncate">{cam.name}</div>
                                                    <div className="text-[10px] text-gray-400 truncate mt-0.5">
                                                        {isActiveInApp ? `LINKED TO APP ${activeApp}` : 'AVAILABLE'}
                                                    </div>
                                                </div>

                                                {isActiveInApp && (
                                                    <div className="absolute inset-0 border-2 border-brand-green/20 rounded-xl pointer-events-none animate-pulse"></div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default Dashboard;
