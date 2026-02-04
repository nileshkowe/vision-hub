import React from 'react';
import { Shield, Users, Box, Activity } from 'lucide-react';

const apps = [
    { id: 1, name: 'Face Detection', icon: <Shield className="w-5 h-5" /> },
    { id: 2, name: 'Employee Counting', icon: <Users className="w-5 h-5" /> },
    { id: 3, name: 'Box Counting', icon: <Box className="w-5 h-5" /> },
    { id: 4, name: 'Zone Intrusion', icon: <Activity className="w-5 h-5" /> },
];

const AppSelector = ({ activeApp, onSelectApp, compact = false }) => {
    return (
        <div className={`flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide px-1 ${compact ? 'mb-2 pb-1' : 'mb-4 md:mb-8 pb-2 md:pb-4'}`}>
            {apps.map((app) => (
                <button
                    key={app.id}
                    onClick={() => onSelectApp(app.id)}
                    className={`relative group flex items-center gap-3 md:gap-4 rounded-2xl transition-all duration-300 border shrink-0 ${compact
                            ? 'px-3 py-2 md:px-4 md:py-2'
                            : 'px-4 py-3 md:px-6 md:py-4'
                        } ${activeApp === app.id
                            ? 'bg-brand-green/10 border-brand-green/50 shadow-neon'
                            : 'glass-panel hover:bg-white/5 hover:border-white/20'
                        }`}
                >
                    <div className={`rounded-lg transition-colors duration-300 ${compact ? 'p-1' : 'p-1.5 md:p-2'
                        } ${activeApp === app.id ? 'bg-brand-green text-black' : 'bg-white/10 text-gray-400 group-hover:text-white'}`}>
                        {React.cloneElement(app.icon, { className: compact ? "w-4 h-4" : "w-5 h-5" })}
                    </div>
                    <div className="flex flex-col items-start">
                        <span className={`font-bold tracking-wide transition-colors ${compact ? 'text-xs' : 'text-xs md:text-sm'
                            } ${activeApp === app.id ? 'text-white' : 'text-gray-400 group-hover:text-white'}`}>
                            {app.name.toUpperCase()}
                        </span>
                        {!compact && <span className="text-[10px] text-gray-500 font-mono">APP-0{app.id}</span>}
                    </div>

                    {activeApp === app.id && (
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1/2 h-1 bg-brand-green rounded-full shadow-neon"></div>
                    )}
                </button>
            ))}
        </div>
    );
};

export default AppSelector;
