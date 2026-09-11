import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import api from '../services/api';
import uploadFile from '../services/uploadService';
import { joinRoom, onImportProgress } from '../services/socket';

const UploadPage = () => {
  const navigate = useNavigate();
  const [fileName, setFileName] = useState('');
  const [uploadId, setUploadId] = useState('');
  const [totalRows, setTotalRows] = useState<number | null>(null);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingColumns, setSavingColumns] = useState(false);

  const [progress, setProgress] = useState(0);
  const [rowsProcessed, setRowsProcessed] = useState(0);
  const [rowsFailed, setRowsFailed] = useState(0);
  const [rowsPerSecond, setRowsPerSecond] = useState(0);

  const clientUploadIdRef = useRef('');

  useEffect(() => {
    const unsubscribe = onImportProgress((payload) => {
      if (payload.uploadId !== clientUploadIdRef.current) return;
      setProgress(payload.progress ?? 0);
      setRowsProcessed(payload.rowsProcessed ?? 0);
      setRowsFailed(payload.rowsFailed ?? 0);
      setRowsPerSecond(payload.rowsPerSecond ?? 0);
    });
    return unsubscribe;
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const file = acceptedFiles[0];
    setError('');

    if (!['text/csv', 'application/json', 'application/octet-stream'].includes(file.type) && !/\.(csv|json)$/i.test(file.name)) {
      setError('Only CSV and JSON files are supported.');
      return;
    }

    const clientUploadId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    clientUploadIdRef.current = clientUploadId;

    setFileName('');
    setUploadId('');
    setTotalRows(null);
    setAvailableColumns([]);
    setSelectedColumns([]);
    setProfile(null);
    setProgress(0);
    setRowsProcessed(0);
    setRowsFailed(0);
    setRowsPerSecond(0);
    setError('');
    setLoading(true);

    joinRoom(clientUploadId);

    try {
      const response = await uploadFile(file, clientUploadId);
      const uploadPreview = response.preview ?? [];
      const id = response.uploadId ?? clientUploadId;
      const columns = response.columns ?? Array.from(new Set(uploadPreview.flatMap(Object.keys)));

      setFileName(response.fileName);
      setUploadId(id);
      setTotalRows(response.total ?? response.totalRows ?? null);
      setAvailableColumns(columns);
      setSelectedColumns(columns);
      setProgress(100);
      setLoading(false);

      try {
        const profileResponse = await api.get('/profiling', { params: { uploadId: id } });
        setProfile(profileResponse.data.profile);
      } catch (profileError) {
        console.warn('Upload profiling unavailable:', profileError);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Upload failed. Please try again.';
      console.error('Upload page error:', err);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  const continueToMapping = async () => {
    if (!selectedColumns.length) {
      setError('Select at least one column before continuing.');
      return;
    }

    if (uploadId) {
      setSavingColumns(true);
      try {
        await api.patch(`/imports/${uploadId}/columns`, { selectedColumns });
        navigate(`/mapping?uploadId=${uploadId}`);
      } catch {
        setError('Unable to save selected columns.');
      } finally {
        setSavingColumns(false);
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ onDrop, multiple: false, accept: { 'text/csv': ['.csv'], 'application/json': ['.json'] } });

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Upload dataset</p>
              <h1 className="mt-3 text-4xl font-semibold text-white">Enterprise-grade data ingestion with end-to-end visibility.</h1>
              <p className="mt-4 text-slate-400">
                Upload large CSV or JSON files using a secure, streamed ingestion channel designed for modern data teams.
              </p>
            </div>
            <button onClick={() => navigate('/dashboard')} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-slate-800/90 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700">
              Back to dashboard
            </button>
          </div>
        </section>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl">
            <div {...getRootProps()} className="min-h-[280px] rounded-[28px] border-2 border-dashed border-cyan-500/30 bg-slate-950/80 p-10 text-center transition hover:border-cyan-400 hover:bg-slate-900">
              <input {...getInputProps()} />
              <p className="text-xl font-semibold text-white">{isDragActive ? 'Drop your dataset here' : 'Drag & drop a CSV or JSON file'}</p>
              <p className="mt-3 text-sm text-slate-400">Accepted formats: CSV, JSON. Streaming mode protects RAM and scales effortlessly.</p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  open();
                }}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Choose file
              </button>
            </div>

            {error && <div className="mt-6 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_0.8fr]">
              <div className="rounded-[28px] border border-white/10 bg-slate-950/80 p-5">
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Upload status</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900/80 text-lg font-semibold text-cyan-300">{progress}%</div>
                  <div>
                    <p className="text-sm text-slate-300">Live ingestion</p>
                    <p className="mt-2 text-xl font-semibold text-white">{loading ? 'Processing' : fileName ? 'Ready' : 'Waiting'}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-slate-950/80 p-5">
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Performance</p>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between"><span>Rows processed</span><span>{rowsProcessed.toLocaleString()}</span></div>
                  <div className="flex items-center justify-between"><span>Rows/sec</span><span>{rowsPerSecond.toLocaleString()}</span></div>
                  <div className="flex items-center justify-between"><span>Validation flags</span><span className="text-rose-300">{rowsFailed.toLocaleString()}</span></div>
                </div>
              </div>
            </div>

            {fileName && !loading && (
              <>
                <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/80 p-6">
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Dataset summary</p>
                  <p className="mt-2 text-sm text-slate-300">Key metrics from your uploaded file.</p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Total rows</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{profile?.totalRows?.toLocaleString() ?? totalRows?.toLocaleString() ?? '—'}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Total columns</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{profile?.totalColumns ?? '—'}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Missing values</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{profile?.totalMissingValues?.toLocaleString() ?? '—'}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Duplicate rows</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{profile?.totalDuplicateRows?.toLocaleString() ?? '—'}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Numeric columns</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{profile?.numberNumericColumns ?? '—'}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Text columns</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{profile?.numberTextColumns ?? '—'}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Date columns</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{profile?.numberDateColumns ?? '—'}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Quality score</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{profile?.qualityScore != null ? `${profile.qualityScore}%` : '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/80 p-6">
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Upload status</p>
                  <p className="mt-2 text-sm text-slate-300">Current file, processing state and progress are tracked in real time.</p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">File name</p>
                      <p className="mt-3 text-lg font-semibold text-white truncate">{fileName}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Status</p>
                      <p className="mt-3 text-lg font-semibold text-white">{loading ? 'Processing' : uploadId ? 'Ready' : 'Waiting'}</p>
                    </div>
                    <div className="rounded-[24px] bg-slate-900/80 p-4">
                      <p className="text-sm text-slate-400">Progress</p>
                      <p className="mt-3 text-lg font-semibold text-white">{progress}%</p>
                    </div>
                  </div>

                  <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-900">
                    <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </>
            )}

            {uploadId && !loading && (
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => navigate(`/cleaning?uploadId=${uploadId}`)}
                  className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  Review missing data
                </button>
                <button
                  onClick={continueToMapping}
                  disabled={savingColumns}
                  className="rounded-full border border-white/10 bg-slate-950/90 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingColumns ? 'Saving…' : 'Continue to mapping →'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
