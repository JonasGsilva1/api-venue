import React from 'react';
import { LayoutDashboard, ShoppingBag, BarChart3 } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'autosservico', label: 'Autosserviço & Zonas', icon: ShoppingBag },
    { id: 'sintese', label: 'Síntese D1-D3', icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-[#131B2E] border-r border-[#1E293B] flex flex-col justify-between p-4">
      <nav className="space-y-1">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-3 mb-2">Painel tático</p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#FFD600] text-[#0B0F19] font-bold shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="bg-[#0B0F19] p-3 rounded-lg border border-[#1E293B] text-xs text-gray-400">
        <p className="font-semibold text-gray-300">Estande S02–S10</p>
        <p className="text-[11px] mt-0.5">Porto Digital // RAIZ</p>
      </div>
    </aside>
  );
};