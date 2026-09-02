import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Briefcase, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { APP_PAGES } from '../lib/pages';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, canAccess } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleNav = APP_PAGES.filter((page) => canAccess(page.key));

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 shrink-0 h-screen lg:h-auto lg:min-h-screen lg:self-stretch bg-brand-900 text-white flex flex-col transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex-shrink-0 p-6 border-b border-brand-800">
          <div className="flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-accent-500" />
            <div>
              <h1 className="font-bold text-lg leading-tight">Ceylon Automobile</h1>
              <p className="text-brand-300 text-xs">West Panel, Paint & Tyres</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-1">
          {visibleNav.map(({ path, icon: Icon, label, key }) => (
            <NavLink
              key={key}
              to={path}
              end={path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  isActive ? 'bg-brand-700 text-white' : 'text-brand-200 hover:bg-brand-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex-shrink-0 p-4 border-t border-brand-800 bg-brand-900">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-9 h-9 rounded-full bg-brand-700 flex items-center justify-center text-sm font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-brand-400 truncate">{user?.role?.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 w-full px-4 py-2 text-brand-300 hover:text-white hover:bg-brand-800 rounded-lg transition-colors text-sm">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h2 className="font-semibold">Ceylon CRM</h2>
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
