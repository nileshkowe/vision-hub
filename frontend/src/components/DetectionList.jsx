import React, { useMemo } from 'react';
import DetectionCard from './DetectionCard';
import { User, Loader2 } from 'lucide-react';

/**
 * DetectionList Component
 * 
 * Displays a grid of detection cards with pagination.
 * 
 * @param {Array} detections - Array of detection objects
 * @param {Object} filters - Current filter values
 * @param {boolean} loading - Loading state
 * @param {number} currentPage - Current page number (1-based)
 * @param {number} itemsPerPage - Number of items per page
 * @param {Function} onPageChange - Callback when page changes
 */
const DetectionList = ({ 
    detections = [], 
    filters = {},
    loading = false,
    currentPage = 1,
    itemsPerPage = 12,
    onPageChange 
}) => {
    /**
     * Filter detections based on current filters
     */
    const filteredDetections = useMemo(() => {
        let filtered = [...detections];
        
        // Search filter (name or camera)
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(detection => {
                const name = detection.details?.name || '';
                const cameraId = `C${detection.camera_id}`;
                return name.toLowerCase().includes(searchLower) || 
                       cameraId.toLowerCase().includes(searchLower);
            });
        }
        
        // Confidence filter (already handled by backend, but apply client-side for consistency)
        if (filters.minConfidence > 0) {
            filtered = filtered.filter(detection => {
                const confidence = detection.details?.confidence || 0;
                return confidence >= filters.minConfidence;
            });
        }
        
        // Camera filter (already handled by backend, but apply client-side for consistency)
        if (filters.cameraId !== null) {
            filtered = filtered.filter(detection => detection.camera_id === filters.cameraId);
        }
        
        return filtered;
    }, [detections, filters]);
    
    /**
     * Calculate pagination
     */
    const pagination = useMemo(() => {
        const totalPages = Math.ceil(filteredDetections.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedDetections = filteredDetections.slice(startIndex, endIndex);
        
        return {
            totalPages,
            paginatedDetections,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1,
            totalItems: filteredDetections.length
        };
    }, [filteredDetections, currentPage, itemsPerPage]);
    
    /**
     * Handle page change
     */
    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.totalPages) {
            onPageChange(newPage);
        }
    };
    
    // Loading state
    if (loading && detections.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 size={32} className="text-brand-green animate-spin mb-4" />
                <p className="text-gray-400 text-sm">Loading detections...</p>
            </div>
        );
    }
    
    // Empty state
    if (pagination.paginatedDetections.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mb-4">
                    <User size={32} className="text-gray-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">No Detections Found</h3>
                <p className="text-gray-400 text-sm text-center max-w-md">
                    {filters.search || filters.minConfidence > 0 || filters.cameraId !== null || filters.hours !== null
                        ? 'Try adjusting your filters to see more results.'
                        : 'No face detections have been recorded yet.'}
                </p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col gap-6">
            {/* Detection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pagination.paginatedDetections.map((detection) => (
                    <DetectionCard key={detection.id} detection={detection} />
                ))}
            </div>
            
            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between glass-panel rounded-lg p-4 border border-white/10">
                    <div className="text-sm text-gray-400">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, pagination.totalItems)} of {pagination.totalItems}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={!pagination.hasPrev}
                            className="px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:border-brand-green/50 transition-colors"
                        >
                            Previous
                        </button>
                        
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                let pageNum;
                                if (pagination.totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (currentPage <= 3) {
                                    pageNum = i + 1;
                                } else if (currentPage >= pagination.totalPages - 2) {
                                    pageNum = pagination.totalPages - 4 + i;
                                } else {
                                    pageNum = currentPage - 2 + i;
                                }
                                
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => handlePageChange(pageNum)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-colors ${
                                            currentPage === pageNum
                                                ? 'bg-brand-green text-black shadow-neon'
                                                : 'bg-black/30 text-white border border-white/10 hover:border-brand-green/50'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>
                        
                        <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={!pagination.hasNext}
                            className="px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed hover:border-brand-green/50 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DetectionList;

