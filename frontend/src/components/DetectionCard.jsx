import React, { memo } from 'react';
import { Camera, Clock, User } from 'lucide-react';

/**
 * DetectionCard Component
 * 
 * Displays a single face detection result in an elegant card format.
 * Shows thumbnail, person name, confidence score, timestamp, and camera info.
 * 
 * @param {Object} detection - Detection data object
 * @param {number} detection.id - Unique detection ID
 * @param {string} detection.image_url - URL to the detection thumbnail
 * @param {Object} detection.details - Detection details (name, confidence, etc.)
 * @param {string} detection.details.name - Detected person's name
 * @param {number} detection.details.confidence - Confidence score (0-1)
 * @param {string} detection.timestamp - ISO timestamp string
 * @param {number} detection.camera_id - Camera ID that detected the face
 */
const DetectionCard = memo(({ detection }) => {
    const { id, image_url, details, timestamp, camera_id } = detection;
    
    // Extract detection details
    const name = details?.name || 'Unknown';
    const confidence = details?.confidence || 0;
    const confidencePercent = Math.round(confidence * 100);
    
    // Format timestamp
    const formatTimestamp = (isoString) => {
        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            // Relative time for recent detections
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            
            // Absolute time for older detections
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return 'Unknown time';
        }
    };
    
    const relativeTime = formatTimestamp(timestamp);
    const absoluteTime = new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Determine confidence badge color
    const getConfidenceColor = (conf) => {
        if (conf >= 0.95) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
        if (conf >= 0.85) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
        if (conf >= 0.75) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    };
    
    const confidenceBadgeClass = getConfidenceColor(confidence);
    
    // Handle image loading errors
    const handleImageError = (e) => {
        // Replace with placeholder on error
        e.target.style.display = 'none';
        const placeholder = e.target.nextSibling;
        if (placeholder) placeholder.style.display = 'flex';
    };
    
    return (
        <div className="glass-panel rounded-xl p-4 hover:border-brand-green/30 transition-all duration-300 group cursor-pointer">
            {/* Header: Camera and Timestamp */}
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <Camera size={14} className="text-gray-400" />
                    <span className="text-xs font-mono text-gray-400">C{camera_id}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <Clock size={12} />
                    <span className="font-mono" title={absoluteTime}>{relativeTime}</span>
                </div>
            </div>
            
            {/* Body: Thumbnail and Details */}
            <div className="flex gap-3 mb-3">
                {/* Thumbnail */}
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-black/50 border border-white/10 shrink-0 relative">
                    {image_url ? (
                        <>
                            <img
                                src={`${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')}${image_url}`}
                                alt={name}
                                className="w-full h-full object-cover"
                                onError={handleImageError}
                            />
                            {/* Placeholder shown on image error */}
                            <div className="hidden absolute inset-0 flex items-center justify-center bg-gray-800/80">
                                <User size={24} className="text-gray-500" />
                            </div>
                        </>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-800/80">
                            <User size={24} className="text-gray-500" />
                        </div>
                    )}
                </div>
                
                {/* Details */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate mb-1 group-hover:text-brand-green transition-colors">
                        {name}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${confidenceBadgeClass}`}>
                            {confidencePercent}%
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gray-800/50 text-gray-400 text-[10px] font-bold border border-white/5">
                            FACE DETECTED
                        </span>
                    </div>
                </div>
            </div>
            
            {/* Footer: Additional Info (optional) */}
            <div className="pt-2 border-t border-white/5">
                <div className="text-[10px] text-gray-500 font-mono">
                    ID: {id} • {absoluteTime}
                </div>
            </div>
        </div>
    );
});

DetectionCard.displayName = 'DetectionCard';

export default DetectionCard;

