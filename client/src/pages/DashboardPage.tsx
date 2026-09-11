import { useEffect, useState } from 'react';
import api from '../services/api';

const DashboardPage = () => {
  const [latestImport, setLatestImport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadLatest = async () => {
      try {
        const response = await api.get('/imports/latest');
        setLatestImport(response.data.job);
      } catch (err) {
        setError('Unable to load latest import summary.');
      } finally {
        setLoading(false);
      }
    };

    void loadLatest();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-10 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Dashboard</p>
              <h1 className="mt-2 text-4xl font-semibold text-white">Enterprise ETL command center</h1>
              <p className="mt-4 max-w-2xl text-base text-slate-400">
                Monitor imports, surface issues quickly, and keep your pipeline running smoothly with clear insights and fast actions.
              </p>
            </div>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-200">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              All systems operational
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6">
                <p className="text-sm text-slate-400">Active imports</p>
                <p className="mt-4 text-4xl font-semibold text-white">24</p>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6">
                <p className="text-sm text-slate-400">Rows processed</p>
                <p className="mt-4 text-4xl font-semibold text-white">12.4M</p>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6">
                <p className="text-sm text-slate-400">Success rate</p>
                <p className="mt-4 text-4xl font-semibold text-white">99.2%</p>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-slate-950/70 p-6">
                <p className="text-sm text-slate-400">New upload</p>
                <button onClick={() => window.location.assign('/upload')} className="mt-4 rounded-full bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
                  Start upload
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Quick insight</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Latest import summary</h2>
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="min-w-[148px] rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
                <p className="text-sm text-slate-400">Average latency</p>
                <p className="mt-3 text-3xl font-semibold text-white">1.2s</p>
              </div>
              <div className="min-w-[148px] rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
                <p className="text-sm text-slate-400">Failure alerts</p>
                <p className="mt-3 text-3xl font-semibold text-white">2</p>
              </div>
            </div>
            <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-950/70 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Latest import</p>
                  <p className="mt-2 text-xl font-semibold text-white">{latestImport?.fileName ?? 'No import available yet'}</p>
                </div>
                {loading ? (
                  <p className="text-sm text-slate-400">Loading...</p>
                ) : error ? (
                  <p className="text-sm text-rose-300">{error}</p>
                ) : (
                  <span className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300">{latestImport?.status ?? 'n/a'}</span>
                )}
              </div>

              <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-3">
                <div className="min-w-0 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-center sm:p-5">
                  <p className="text-sm text-slate-400">Rows</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{latestImport?.totalRows ?? '—'}</p>
                </div>
                <div className="min-w-0 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-center sm:p-5">
                  <p className="text-sm text-slate-400">Failed rows</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{latestImport?.failedRows ?? '—'}</p>
                </div>
                <div className="min-w-0 rounded-[24px] border border-white/10 bg-slate-950/70 p-4 text-center sm:p-5">
                  <p className="text-xs leading-4 text-slate-400 sm:text-sm">Transformed</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{latestImport?.transformedAt ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
