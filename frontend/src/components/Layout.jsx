import React from 'react';
import { LayoutDashboard, Video, AlertTriangle, Settings, Bell, Menu, User } from 'lucide-react';

const Layout = ({ children, activeTab = 'dashboard', onTabChange }) => {
  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Monitor' },
    { id: 'cameras', icon: <Video size={20} />, label: 'Cameras' },
    { id: 'detections', icon: <User size={20} />, label: 'Detections' },
    { id: 'alerts', icon: <AlertTriangle size={20} />, label: 'Alerts' },
    { id: 'settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  return (
    <div className="flex h-screen bg-brand-dark text-white overflow-hidden font-sans selection:bg-brand-green/30 flex-col md:flex-row">
      {/* Sidebar (Desktop) */}
      <div className="hidden md:flex w-20 flex-col items-center py-6 glass-panel border-r-0 border-r-white/5 z-20 relative">
        <div className="mb-10 group cursor-pointer">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-green to-emerald-600 rounded-lg flex items-center justify-center font-bold text-xl text-black shadow-neon transition-transform group-hover:scale-110 duration-300">
            M
          </div>
        </div>

        <nav className="flex flex-col gap-6 w-full px-4">
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onClick={() => onTabChange && onTabChange(item.id)}
            />
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative w-full">
        {/* Background Glows */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-brand-green/5 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]"></div>
        </div>

        {/* Top Bar */}
        <header className="h-16 md:h-20 flex items-center justify-between px-4 md:px-8 z-10 shrink-0 border-b border-white/5 bg-brand-dark/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="md:hidden">
              <Menu size={24} className="text-gray-400" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white/90">
              MULTI-CAM <span className="text-brand-green font-light">SYSTEM</span>
            </h1>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            <div className="glass-panel px-3 py-1.5 md:px-4 md:py-2 rounded-full flex items-center gap-2 md:gap-3 border-brand-green/20">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-brand-green rounded-full animate-pulse shadow-neon"></div>
              <span className="text-[10px] md:text-xs font-mono text-brand-green tracking-wider hidden sm:inline">SYSTEM ONLINE</span>
            </div>

            <button className="p-2 text-gray-400 hover:text-white transition-colors relative group">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-black animate-bounce"></span>
            </button>

            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-700 border border-white/10 overflow-hidden cursor-pointer hover:border-brand-green/50 transition-colors">
              <img src="https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff" alt="User" />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-hidden relative z-10">
          {children}
        </main>

        {/* Bottom Nav (Mobile) */}
        <div className="md:hidden fixed bottom-0 left-0 w-full h-16 glass-panel border-t border-white/10 z-50 flex items-center justify-around px-2 bg-brand-dark/95 backdrop-blur-xl">
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onClick={() => onTabChange && onTabChange(item.id)}
              mobile
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const NavItem = ({ item, active, mobile, onClick }) => (
  <button
    onClick={onClick}
    className={`group relative flex items-center justify-center ${mobile ? 'w-10 h-10' : 'w-12 h-12'} transition-all duration-300`}
    title={item.label}
  >
    <div className={`absolute inset-0 icon-diamond transition-all duration-300 ${active ? 'bg-brand-green shadow-neon scale-100' : 'bg-gray-800/50 group-hover:bg-gray-700 scale-75 group-hover:scale-90'}`}></div>
    <div className={`relative z-10 icon-diamond-inner ${active ? 'text-black' : 'text-gray-400 group-hover:text-white'}`}>
      {item.icon}
    </div>

    {/* Tooltip (Desktop only) */}
    {!mobile && (
      <div className="absolute left-14 px-2 py-1 bg-gray-900 border border-white/10 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        {item.label}
      </div>
    )}
  </button>
);

export default Layout;
