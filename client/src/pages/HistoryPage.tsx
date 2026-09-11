import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

interface ImportJob {
  uploadId: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRows: number;
  failedRows: number;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

const HistoryPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currentUploadId = searchParams.get('uploadId') ?? '';

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await api.get('/imports');
        setJobs(response.data.jobs ?? []);
      } catch (err) {
        setError('Unable to load import history.');
      } finally {
        setLoading(false);
      }
    };

    void loadHistory();
  }, []);

  const totalRows = useMemo(() => jobs.reduce((sum, job) => sum + job.totalRows, 0), [jobs]);
  const latestJob = jobs[0];

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Import history</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Track every dataset import.</h1>
            <p className="mt-4 text-slate-400">Review the timeline of ingestion jobs, status, and row counts with enterprise-level audit visibility.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">Clean, high-end history analytics</div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
          <p className="text-sm text-slate-400">Import jobs</p>
          <p className="mt-3 text-4xl font-semibold text-white">{jobs.length}</p>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
          <p className="text-sm text-slate-400">Rows ingested</p>
          <p className="mt-3 text-4xl font-semibold text-white">{totalRows.toLocaleString()}</p>
        </div>
        <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
          <p className="text-sm text-slate-400">Last updated</p>
          <p className="mt-3 text-4xl font-semibold text-white">{latestJob ? new Date(latestJob.createdAt).toLocaleDateString() : '—'}</p>
        </div>
      </div>

      {loading && <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 text-slate-300">Loading history...</div>}
      {error && <div className="rounded-[32px] border border-rose-400/20 bg-rose-500/10 p-6 text-rose-200">{error}</div>}

      {!loading && !error && jobs.length === 0 && (
        <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 text-slate-400">No import history available yet. Upload a dataset to begin tracking jobs.</div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/80 shadow-2xl">
          <div className="grid min-w-full grid-cols-[1.5fr_1fr_1fr_1fr_1fr_0.9fr] gap-4 border-b border-white/10 bg-slate-950/80 px-4 py-4 text-sm uppercase tracking-[0.18em] text-slate-400">
            <div>Dataset</div>
            <div>Status</div>
            <div>Rows</div>
            <div>Failed</div>
            <div>Started</div>
            <div>Action</div>
          </div>
          <div className="max-h-[560px] overflow-auto px-4 py-4">
            {jobs.map((job) => (
              <div
                key={job.uploadId}
                className={`grid min-w-full grid-cols-[1.5fr_1fr_1fr_1fr_1fr_0.9fr] gap-4 border-b border-white/10 py-3 text-sm text-slate-200 last:border-b-0 ${job.uploadId === currentUploadId ? 'bg-slate-800/60' : ''}`}
              >
                <div className="truncate">{job.fileName}</div>
                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${job.status === 'completed' ? 'bg-emerald-500/15 text-emerald-200' : job.status === 'failed' ? 'bg-rose-500/15 text-rose-200' : 'bg-amber-500/15 text-amber-200'}`}>
                    {job.status}
                  </span>
                </div>
                <div>{job.totalRows.toLocaleString()}</div>
                <div>{job.failedRows.toLocaleString()}</div>
                <div>{job.startedAt ? new Date(job.startedAt).toLocaleDateString() : '—'}</div>
                <div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/validations?uploadId=${job.uploadId}`)}
                      className="rounded-full border border-white/10 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/preview?uploadId=${job.uploadId}`)}
                      className="rounded-full border border-white/10 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/audit?uploadId=${job.uploadId}`)}
                      className="rounded-full border border-white/10 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20"
                    >
                      Audit
                    </button>
                      <button
                        type="button"
                        onClick={async () => {
                          // confirm and delete
                          // eslint-disable-next-line no-restricted-globals
                          if (!confirm(`Delete dataset ${job.fileName}? This will remove all related data.`)) return;
                          try {
                            await api.delete(`/imports/${job.uploadId}`);
                            // refresh list
                            const resp = await api.get('/imports');
                            setJobs(resp.data.jobs ?? []);
                          } catch (err: any) {
                            // eslint-disable-next-line no-console
                            console.error('Delete failed', err);
                            const msg = err?.response?.data?.message || err?.message || 'Failed to delete dataset';
                            const details = err?.response?.data?.details ? `: ${JSON.stringify(err.response.data.details)}` : '';
                            // If import not found, allow admin force-delete retry
                            if (msg === 'Import not found' && /* eslint-disable-next-line no-restricted-globals */ confirm('Import not found for your account. Try force-delete as admin?')) {
                              try {
                                await api.delete(`/imports/${job.uploadId}?force=true`);
                                const resp = await api.get('/imports');
                                setJobs(resp.data.jobs ?? []);
                                return;
                              } catch (err2: any) {
                                // eslint-disable-next-line no-console
                                console.error('Force delete failed', err2);
                                const m2 = err2?.response?.data?.message || err2?.message || 'Force delete failed';
                                alert(`${m2}${err2?.response?.data?.details ? `: ${JSON.stringify(err2.response.data.details)}` : ''}`);
                                return;
                              }
                            }

                            alert(`${msg}${details}`);
                          }
                        }}
                        className="rounded-full border border-white/10 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
                      >
                        Remove
                      </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
