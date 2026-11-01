import React, { useState, useEffect } from 'react';
import { ShieldAlert, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [crisisMode, setCrisisMode] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="h-16 bg-[#131B2E] border-b border-[#1E293B] px-6 flex items-center justify-between text-white">
      <div className="flex items-center gap-4">
        <h1 className="font-bold text-lg tracking-wider text-[#FFD600]">
          RAIZ <span className="text-gray-400 font-normal">// Venue Intelligence</span>
        </h1>
        <span className={`px-2 py-0.5 text-xs rounded font-mono flex items-center gap-1 ${isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
          {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="font-mono text-sm text-gray-300 bg-[#0B0F19] px-3 py-1 rounded border border-[#1E293B]">
          {time}
        </div>

        <button
          onClick={() => setCrisisMode(!crisisMode)}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${crisisMode ? 'bg-rose-600 text-white animate-pulse' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
        >
          <ShieldAlert size={14} />
          {crisisMode ? 'MODO CRISE ATIVO' : 'MODO CRISE'}
        </button>

        <div className="flex items-center gap-3 border-l border-[#1E293B] pl-4">
          <div className="text-right">
            <p className="text-xs font-medium">{user?.name || 'Operador'}</p>
            <p className="text-[10px] text-gray-400 capitalize">{user?.role || 'Tech Lead'}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};