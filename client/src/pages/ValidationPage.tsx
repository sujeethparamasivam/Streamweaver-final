import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { onImportProgress } from '../services/socket';

interface DatasetProfile {
  totalRows: number;
  totalColumns: number;
  totalMissingValues: number;
  totalDuplicateRows: number;
  numberNumericColumns: number;
  numberTextColumns: number;
  numberDateColumns: number;
  qualityScore: number;
  rowsWithMissingData: number;
  completeRows: number;
  missingDataPercentage: number;
}

const ValidationPage = () => {
  const [searchParams] = useSearchParams();
  const [uploadId, setUploadId] = useState('');
  const [importJobs, setImportJobs] = useState<Array<any>>([]);
  const navigate = useNavigate();
  const [records, setRecords] = useState<Array<{ field: string; message: string; severity: string; rowNumber: number }>>([]);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState('');
  const [summary, setSummary] = useState<{ totalRecords: number; totalErrors: number; totalWarnings: number }>({ totalRecords: 0, totalErrors: 0, totalWarnings: 0 });
  const [pagination, setPagination] = useState<{ page: number; limit: number; totalRecords: number; totalPages: number }>({ page: 1, limit: 500, totalRecords: 0, totalPages: 0 });
  const pageSizeOptions = [200, 500, 1000];

  const loadValidations = async (page = 1, limit = 1000, currentUploadId = uploadId) => {
    if (!currentUploadId) {
      setRecords([]);
      setSummary({ totalRecords: 0, totalErrors: 0, totalWarnings: 0 });
      setPagination({ page, limit, totalRecords: 0, totalPages: 0 });
      setError('Please upload or select a valid dataset.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.get('/validations', { params: { page, limit, uploadId: currentUploadId } });
      setRecords(response.data.records ?? []);
      setSummary(response.data.summary ?? { totalRecords: 0, totalErrors: 0, totalWarnings: 0 });
      setPagination(response.data.pagination ?? { page, limit, totalRecords: 0, totalPages: 0 });
    } catch (err) {
      setRecords([]);
      setSummary({ totalRecords: 0, totalErrors: 0, totalWarnings: 0 });
      setPagination({ page, limit, totalRecords: 0, totalPages: 0 });
      setError('Unable to load validation records.');
    } finally {
      setLoading(false);
    }
  };

  const loadDataset = async (currentUploadId: string) => {
    if (!currentUploadId) return;

    try {
      const [importResponse, profileResponse] = await Promise.all([
        api.get(`/imports/${currentUploadId}`),
        api.get('/profiling', { params: { uploadId: currentUploadId } })
      ]);

      setDatasetName(importResponse.data.job?.fileName ?? 'Dataset');
      setProfile(profileResponse.data.profile ?? null);
    } catch (err) {
      setDatasetName('');
      setProfile(null);
      if (!error) setError('Unable to load dataset statistics for this upload.');
    }
  };

  useEffect(() => {
    const loadImportJobs = async () => {
      try {
        const resp = await api.get('/imports');
        setImportJobs(resp.data.jobs ?? []);
      } catch {
        // ignore
      }
    };

    void loadImportJobs();

    const uploadIdFromQuery = searchParams.get('uploadId')?.trim() ?? '';
    setUploadId(uploadIdFromQuery);
    setError('');
    setRecords([]);
    setSummary({ totalRecords: 0, totalErrors: 0, totalWarnings: 0 });
    setPagination((p) => ({ page: 1, limit: p.limit ?? 1000, totalRecords: 0, totalPages: 0 }));
    setProfile(null);
    setDatasetName('');

    if (!uploadIdFromQuery) {
      setLoading(false);
      setError('Please upload or select a valid dataset.');
      return;
    }

    void Promise.all([loadValidations(1, pagination.limit ?? 1000, uploadIdFromQuery), loadDataset(uploadIdFromQuery)]);
  }, [searchParams]);

  const changePageSize = (newLimit: number) => {
    setPagination((p) => ({ ...p, page: 1, limit: newLimit }));
    void loadValidations(1, newLimit, uploadId);
  };

  // Subscribe to import progress updates
  useEffect(() => {
    const unsubscribe = onImportProgress((payload) => {
      if (payload.uploadId !== uploadId) return;
      if (payload.stage === 'import') {
        setImportProgress(payload.progress ?? 0);
      }
    });
    return unsubscribe;
  }, [uploadId]);

  const handleImport = async () => {
    if (!uploadId) {
      setError('Cannot import without a selected dataset.');
      return;
    }

    setImporting(true);
    setError('');
    setImportMessage('Starting import...');
    setImportProgress(0);

    try {
      const response = await api.post(`/imports/${uploadId}/import`);
      setImportMessage(`✓ Import complete! ${response.data.importedRows} rows imported.`);
      setImportProgress(100);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Import failed. Please try again.';
      setError(errorMsg);
    } finally {
      setImporting(false);
    }
  };

  const handleSelectDataset = (value: string) => {
    if (!value) return;
    navigate(`/validation?uploadId=${value}`);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Validation report</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Review row-level validation issues.</h1>
            <p className="mt-4 text-slate-400">Analyze warnings and errors from your latest import using a clean, enterprise-ready validation dashboard.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">Trusted data quality insights</div>
        </div>
      </section>

      <div className="mt-4">
        <label htmlFor="datasetSelect" className="block text-sm font-medium text-slate-300">Select dataset</label>
        <div className="mt-2 flex gap-2">
          <select
            id="datasetSelect"
            value={uploadId}
            onChange={(e) => handleSelectDataset(e.target.value)}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-400"
          >
            <option value="">Choose a dataset</option>
            {importJobs.map((job) => (
              <option key={job.uploadId} value={job.uploadId}>
                {job.fileName} {job.status !== 'completed' ? `(${job.status})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleSelectDataset(uploadId)}
            disabled={!uploadId}
            className="rounded-full border border-white/10 bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Validate
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!uploadId || importing}
            className="rounded-full border border-emerald-400 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? `Importing... (${importProgress}%)` : '→ Import'}
          </button>
        </div>
        {importMessage && (
          <div className="mt-3 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {importMessage}
          </div>
        )}
      </div>

      {loading && <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 text-slate-300">Loading validations...</div>}
      {error && <div className="rounded-[32px] border border-rose-400/20 bg-rose-500/10 p-6 text-rose-200">{error}</div>}

      {!loading && !error && profile && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
            <p className="text-sm text-slate-400">Dataset</p>
            <p className="mt-3 text-2xl font-semibold text-white truncate">{datasetName}</p>
            <p className="mt-2 text-sm text-slate-400">Upload ID: {uploadId}</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
            <p className="text-sm text-slate-400">Rows</p>
            <p className="mt-3 text-4xl font-semibold text-white">{profile.totalRows.toLocaleString()}</p>
            <p className="mt-2 text-sm text-slate-400">Complete rows: {profile.completeRows.toLocaleString()}</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
            <p className="text-sm text-slate-400">Columns</p>
            <p className="mt-3 text-4xl font-semibold text-white">{profile.totalColumns}</p>
            <p className="mt-2 text-sm text-slate-400">Missing rows: {profile.rowsWithMissingData.toLocaleString()}</p>
          </div>
        </div>
      )}

      {!loading && !error && profile && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
            <p className="text-sm text-slate-400">Missing values</p>
            <p className="mt-3 text-4xl font-semibold text-white">{profile.totalMissingValues.toLocaleString()}</p>
            <p className="mt-2 text-sm text-slate-400">Missing %: {profile.missingDataPercentage}%</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
            <p className="text-sm text-slate-400">Duplicate rows</p>
            <p className="mt-3 text-4xl font-semibold text-white">{profile.totalDuplicateRows.toLocaleString()}</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
            <p className="text-sm text-slate-400">Quality score</p>
            <p className="mt-3 text-4xl font-semibold text-white">{profile.qualityScore}%</p>
          </div>
        </div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 text-slate-400">No validation issues found. Your latest upload was clean.</div>
      )}

      {!loading && records.length > 0 && (
        <>
          <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-6 shadow-lg">
            <div className="flex flex-col gap-2 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-slate-400">Showing</p>
                <p className="mt-1 text-lg font-semibold text-white">{Math.min((pagination.page - 1) * pagination.limit + 1, pagination.totalRecords).toLocaleString()}–{Math.min(pagination.page * pagination.limit, pagination.totalRecords).toLocaleString()} of {pagination.totalRecords.toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadValidations(Math.max(1, pagination.page - 1), pagination.limit)}
                  disabled={pagination.page <= 1}
                  className="rounded-full border border-white/10 bg-slate-950/80 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-900 disabled:opacity-50"
                >
                  Previous
                </button>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">Rows per page</label>
                  <select
                    value={pagination.limit}
                    onChange={(e) => changePageSize(Number(e.target.value))}
                    className="rounded-2xl border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none"
                  >
                    {pageSizeOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => loadValidations(Math.min(pagination.page + 1, pagination.totalPages), pagination.limit)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="rounded-full border border-white/10 bg-slate-950/80 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-900 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/80 shadow-2xl">
            <div className="grid min-w-full grid-cols-[0.9fr_1.6fr_2fr_1fr] gap-4 border-b border-white/10 bg-slate-950/80 px-4 py-4 text-sm uppercase tracking-[0.18em] text-slate-400">
              <div>Row</div>
              <div>Field</div>
              <div>Message</div>
              <div>Severity</div>
            </div>
            <div className="max-h-[560px] overflow-auto px-4 py-4">
              {records.map((record, idx) => (
                <div key={idx} className="grid min-w-full grid-cols-[0.9fr_1.6fr_2fr_1fr] gap-4 border-b border-white/10 py-3 text-sm text-slate-200 last:border-b-0">
                  <div>{record.rowNumber}</div>
                  <div>{record.field}</div>
                  <div>{record.message}</div>
                  <div className={`${record.severity === 'error' ? 'text-rose-300' : 'text-amber-300'}`}>{record.severity}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ValidationPage;
