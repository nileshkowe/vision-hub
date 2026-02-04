import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../components/Layout';
import DetectionFilters from '../components/DetectionFilters';
import DetectionList from '../components/DetectionList';
import { User, Wifi, WifiOff, RefreshCw } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

/**
 * Detections Page Component
 * 
 * Main page for displaying face detection results.
 * Features:
 * - Fetches initial detections from API
 * - Real-time updates via WebSocket
 * - Filtering and pagination
 * - Elegant card-based UI
 */
const Detections = () => {
    const [activeTab, setActiveTab] = useState('detections');
    const [detections, setDetections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    
    // Filter state
    const [filters, setFilters] = useState({
        search: '',
        minConfidence: 0,
        cameraId: null,
        hours: null
    });
    
    /**
     * Fetch detections from API
     */
    const fetchDetections = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        try {
            // Build query parameters
            const params = new URLSearchParams();
            params.append('limit', '1000'); // Fetch more to allow client-side filtering
            params.append('offset', '0');
            
            if (filters.cameraId !== null) {
                params.append('camera_id', filters.cameraId.toString());
            }
            
            if (filters.minConfidence > 0) {
                params.append('min_confidence', filters.minConfidence.toString());
            }
            
            if (filters.hours !== null) {
                params.append('hours', filters.hours.toString());
            }
            
            const response = await fetch(`${API_BASE}/api/violations/?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch detections: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Ensure each detection has image_url
            const enhancedData = data.map(detection => ({
                ...detection,
                image_url: detection.image_url || (detection.image_path ? `/api/detections/images/${detection.image_path.split('/').pop()}` : null)
            }));
            
            setDetections(enhancedData);
        } catch (err) {
            console.error('Error fetching detections:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [filters.cameraId, filters.minConfidence, filters.hours]);
    
    /**
     * Initial fetch on mount
     */
    useEffect(() => {
        fetchDetections();
    }, [fetchDetections]);
    
    /**
     * WebSocket connection for real-time updates
     */
    useEffect(() => {
        const wsUrl = API_BASE.replace('http', 'ws') + '/ws/violations';
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('Connected to detections WebSocket');
            setWsConnected(true);
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'violation') {
                    const detection = message.data;
                    
                    // Enhance detection with image_url if not present
                    if (!detection.image_url && detection.image_path) {
                        const filename = detection.image_path.split('/').pop();
                        detection.image_url = `/api/detections/images/${filename}`;
                    }
                    
                    // Add new detection to the beginning of the list (newest first)
                    setDetections(prev => {
                        // Check if detection already exists (avoid duplicates)
                        const exists = prev.some(d => d.id === detection.id);
                        if (exists) return prev;
                        
                        // Limit to last 1000 detections to prevent memory issues
                        const updated = [detection, ...prev];
                        return updated.slice(0, 1000);
                    });
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };
        
        ws.onerror = (e) => {
            console.error('WebSocket error:', e);
            setWsConnected(false);
        };
        
        ws.onclose = () => {
            console.log('WebSocket connection closed');
            setWsConnected(false);
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (ws.readyState === WebSocket.CLOSED) {
                    // Reconnect logic would go here if needed
                    // For now, user can manually refresh
                }
            }, 3000);
        };
        
        return () => {
            ws.close();
        };
    }, []);
    
    /**
     * Handle filter changes
     */
    const handleFiltersChange = useCallback((newFilters) => {
        setFilters(newFilters);
        setCurrentPage(1); // Reset to first page when filters change
    }, []);
    
    /**
     * Handle page change
     */
    const handlePageChange = useCallback((page) => {
        setCurrentPage(page);
        // Scroll to top of list
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);
    
    /**
     * Handle manual refresh
     */
    const handleRefresh = useCallback(() => {
        fetchDetections();
    }, [fetchDetections]);
    
    return (
        <Layout activeTab={activeTab} onTabChange={setActiveTab}>
            <div className="flex flex-col h-full p-4 md:p-8 overflow-hidden">
                {/* Header */}
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
                            onClick={handleRefresh}
                            disabled={loading}
                            className="px-4 py-2 bg-brand-green/10 border border-brand-green/30 rounded-lg text-sm text-brand-green hover:bg-brand-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>
                </div>
                
                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                        Error: {error}
                    </div>
                )}
                
                {/* Filters */}
                <DetectionFilters 
                    filters={filters} 
                    onFiltersChange={handleFiltersChange} 
                />
                
                {/* Detection List */}
                <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                    <DetectionList
                        detections={detections}
                        filters={filters}
                        loading={loading}
                        currentPage={currentPage}
                        itemsPerPage={12}
                        onPageChange={handlePageChange}
                    />
                </div>
            </div>
        </Layout>
    );
};

export default Detections;

