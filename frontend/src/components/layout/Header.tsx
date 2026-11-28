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
    <header className="h-16 bg-raiz-section border-b border-raiz-border-dark px-6 flex items-center justify-between text-raiz-text-light">
      <div className="flex items-center gap-4">
        <h1 className="font-bold text-lg tracking-wider text-raiz-accent">
          RAIZ <span className="text-raiz-text-light/75 font-normal">// Venue Intelligence</span>
        </h1>
        <span className={`px-2 py-0.5 text-xs rounded font-mono flex items-center gap-1 ${isOnline ? 'bg-raiz-accent/15 text-raiz-accent border border-raiz-accent/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
          {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="font-mono text-sm text-raiz-text-light/75 bg-raiz-dark px-3 py-1 rounded border border-raiz-border-dark">
          {time}
        </div>

        <button
          onClick={() => setCrisisMode(!crisisMode)}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${crisisMode ? 'bg-rose-600 text-raiz-text-light animate-pulse' : 'bg-raiz-border-dark text-raiz-text-light/75 hover:bg-raiz-border-dark'}`}
        >
          <ShieldAlert size={14} />
          {crisisMode ? 'MODO CRISE ATIVO' : 'MODO CRISE'}
        </button>

        <div className="flex items-center gap-3 border-l border-raiz-border-dark pl-4">
          <div className="text-right">
            <p className="text-xs font-medium">{user?.name || 'Operador'}</p>
            <p className="text-[10px] text-raiz-text-light/75 capitalize">{user?.role || 'Tech Lead'}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 hover:bg-raiz-border-dark rounded-lg text-raiz-text-light/75 hover:text-raiz-text-light transition-colors"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};