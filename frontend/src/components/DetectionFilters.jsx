import React, { useState, useEffect, useCallback } from 'react';
import { Search, SlidersHorizontal, X, Clock } from 'lucide-react';

/**
 * DetectionFilters Component
 * 
 * Provides filtering UI for detections:
 * - Search by person name/camera
 * - Confidence threshold slider
 * - Camera dropdown filter
 * - Time range filter (last 15min, 1hr, 4hr, 24hr)
 * - Reset filters button
 * 
 * @param {Object} filters - Current filter values
 * @param {Function} onFiltersChange - Callback when filters change
 */
const DetectionFilters = ({ filters, onFiltersChange }) => {
    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [debouncedSearch, setDebouncedSearch] = useState(filters.search || '');
    
    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 300);
        
        return () => clearTimeout(timer);
    }, [searchQuery]);
    
    // Notify parent when debounced search changes
    useEffect(() => {
        onFiltersChange({
            ...filters,
            search: debouncedSearch
        });
    }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps
    
    /**
     * Handle filter change
     */
    const handleFilterChange = useCallback((key, value) => {
        onFiltersChange({
            ...filters,
            [key]: value
        });
    }, [filters, onFiltersChange]);
    
    /**
     * Reset all filters
     */
    const handleReset = useCallback(() => {
        setSearchQuery('');
        onFiltersChange({
            search: '',
            minConfidence: 0,
            cameraId: null,
            hours: null
        });
    }, [onFiltersChange]);
    
    /**
     * Check if any filters are active
     */
    const hasActiveFilters = filters.search || 
                             filters.minConfidence > 0 || 
                             filters.cameraId !== null || 
                             filters.hours !== null;
    
    return (
        <div className="glass-panel rounded-xl p-4 mb-6 border border-white/10">
            <div className="flex items-center gap-2 mb-4">
                <SlidersHorizontal size={18} className="text-brand-green" />
                <h3 className="text-sm font-bold text-white">FILTERS</h3>
                {hasActiveFilters && (
                    <button
                        onClick={handleReset}
                        className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={14} />
                        Reset
                    </button>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search Input */}
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search name or camera..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-green/50 transition-colors"
                    />
                </div>
                
                {/* Confidence Slider */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1">
                        Min Confidence: {Math.round(filters.minConfidence * 100)}%
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={filters.minConfidence * 100}
                        onChange={(e) => handleFilterChange('minConfidence', parseFloat(e.target.value) / 100)}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-green"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                        <span>0%</span>
                        <span>100%</span>
                    </div>
                </div>
                
                {/* Camera Filter */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Camera</label>
                    <select
                        value={filters.cameraId || ''}
                        onChange={(e) => handleFilterChange('cameraId', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand-green/50 transition-colors"
                    >
                        <option value="">All Cameras</option>
                        <option value="1">C1</option>
                        <option value="2">C2</option>
                        <option value="3">C3</option>
                        {/* Add more cameras as needed */}
                    </select>
                </div>
                
                {/* Time Range Filter */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                        <Clock size={12} />
                        Time Range
                    </label>
                    <select
                        value={filters.hours || ''}
                        onChange={(e) => handleFilterChange('hours', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-brand-green/50 transition-colors"
                    >
                        <option value="">All Time</option>
                        <option value="1">Last Hour</option>
                        <option value="4">Last 4 Hours</option>
                        <option value="24">Last 24 Hours</option>
                        <option value="168">Last Week</option>
                    </select>
                </div>
            </div>
        </div>
    );
};

export default DetectionFilters;

