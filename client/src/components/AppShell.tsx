import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Upload, Database, Layers, Settings, FileSearch, UserCircle2, Sparkles, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, type Theme } from '../contexts/ThemeContext';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: Home },
  { label: 'Upload Dataset', path: '/upload', icon: Upload },
  { label: 'Clean Data', path: '/cleaning', icon: FileSearch },
  { label: 'Preview Data', path: '/preview', icon: Database },
  { label: 'Mapping Studio', path: '/mapping', icon: Layers },
  { label: 'Validations', path: '/validations', icon: FileSearch },
  { label: 'Import History', path: '/history', icon: Database },
  { label: 'Settings', path: '/settings', icon: Settings }
];

const AppShell = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleSignOut = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.28),_transparent_36%)] opacity-70" />
      <div className="absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,_rgba(168,85,247,0.18),_transparent_45%)] blur-3xl" />
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="relative border-r border-white/10 bg-slate-950/95 p-6 backdrop-blur-xl">
          <div className="mb-8 rounded-[32px] border border-white/10 bg-slate-900/70 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">StreamWeaver</p>
                <h2 className="mt-4 text-3xl font-semibold text-white">ETL Workspace</h2>
              </div>
              <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-cyan-200">Pro</span>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-400">
              Manage ingestion, mapping, validation, and history from a polished, modern data workspace.
            </p>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 rounded-3xl px-4 py-3 text-sm transition ${active ? 'bg-cyan-500/20 text-white shadow-inner shadow-cyan-500/10' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-10 rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-300">
                <UserCircle2 size={20} />
              </div>
              <div>
                <p className="text-sm text-slate-400">Signed in as</p>
                <p className="font-medium text-white">{user?.name ?? 'Demo User'}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-3xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
                <Sparkles size={16} />
                <span>Premium workspace experience</span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex w-full items-center justify-center gap-2 rounded-3xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-900/80 p-5 shadow-xl">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Quick actions</p>
            <div className="mt-4 space-y-3">
              <Link to="/upload" className="block rounded-2xl bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200 transition hover:bg-cyan-500/15">
                Upload dataset
              </Link>
              <Link to="/preview" className="block rounded-2xl bg-slate-900/70 px-4 py-3 text-sm text-slate-100 transition hover:bg-slate-800">
                View preview
              </Link>
            </div>
          </div>
        </aside>

        <main className="px-6 py-6 lg:px-10 lg:py-8">
          <div className="mb-8 rounded-[32px] border border-white/10 bg-slate-900/75 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Workspace hub</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Your ETL command center</h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="sr-only" htmlFor="theme-select">Color theme</label>
                <select
                  id="theme-select"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as Theme)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-400"
                >
                  <option value="dark">Dark</option>
                  <option value="white">White</option>
                  <option value="blue">Light blue</option>
                </select>
                <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10">
                  Notifications
                </button>
                <Link to="/upload" className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                  New import
                </Link>
              </div>
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
