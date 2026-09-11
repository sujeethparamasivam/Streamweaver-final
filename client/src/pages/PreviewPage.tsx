import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FixedSizeList as List } from 'react-window';
import api from '../services/api';
import MemoryAudit from '../components/MemoryAudit';
import { onImportProgress } from '../services/socket';

const PreviewPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const uploadId = searchParams.get('uploadId')?.trim() ?? '';
  const [rows, setRows] = useState<Array<{ transformedData?: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState('');

  useEffect(() => {
    const uploadId = searchParams.get('uploadId')?.trim() ?? '';

    const loadPreview = async () => {
      if (!uploadId) {
        setError('Please select a dataset before viewing preview.');
        setRows([]);
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/transformed/${uploadId}`);
        setRows(response.data.rows ?? []);
      } catch (err) {
        setError('Unable to load transformed preview rows for this upload.');
      } finally {
        setLoading(false);
      }
    };

    void loadPreview();
  }, [searchParams]);

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

  const columns = useMemo(() => (rows.length ? Object.keys(rows[0].transformedData ?? {}) : []), [rows]);

  const gridTemplateColumns = columns.length > 1 ? `1.4fr repeat(${columns.length - 1}, 1fr)` : '1.4fr';

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const data = rows[index].transformedData ?? {};
    const rowStyle: React.CSSProperties = { ...style, display: 'grid', gridTemplateColumns, gap: 16 };
    return (
      <div style={rowStyle} className="min-w-full border-b border-white/10 px-4 text-sm text-slate-200 items-center">
        {columns.map((column) => (
          <div key={column} className="truncate">{String(data[column] ?? '')}</div>
        ))}
      </div>
    );
  };

  const totals = useMemo(() => ({
    rows: rows.length,
    columns: columns.length
  }), [rows, columns]);

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Dataset preview</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Inspect transformed output before final import.</h1>
            <p className="mt-4 text-slate-400">Validate field transformations and confirm data shape with a clean, enterprise-quality preview experience.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-200">Rows visible: {totals.rows}</div>
            <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-200">Columns shown: {totals.columns}</div>
            <button
              type="button"
              onClick={() => navigate(`/validation?uploadId=${uploadId}`)}
              disabled={!uploadId}
              className="sm:col-span-2 rounded-full border-2 border-cyan-400 bg-gradient-to-r from-cyan-600 to-blue-600 px-8 py-3 text-sm font-semibold text-white transition hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-cyan-500/50"
            >
              ✓ Validate Dataset & View Errors
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!uploadId || importing}
              className="sm:col-span-2 rounded-full border-2 border-emerald-400 bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-3 text-sm font-semibold text-white transition hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-emerald-500/50"
            >
              {importing ? (
                <>
                  <span className="inline-flex animate-spin mr-2">⟳</span>
                  Importing... ({importProgress}%)
                </>
              ) : (
                '→ Import to Database'
              )}
            </button>
            {importMessage && (
              <div className="sm:col-span-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {importMessage}
              </div>
            )}
            {uploadId && (
              <div className="sm:col-span-2 mt-2">
                <MemoryAudit uploadId={uploadId} />
              </div>
            )}
          </div>
        </div>
      </section>

      {loading && <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 text-slate-300">Loading preview...</div>}
      {error && <div className="rounded-[32px] border border-rose-400/20 bg-rose-500/10 p-6 text-rose-200">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-[32px] border border-white/10 bg-slate-900/80 p-8 text-slate-400">No transformed rows found yet. Save a mapping and run transformation first.</div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/80 shadow-2xl">
          <div style={{ display: 'grid', gridTemplateColumns, gap: 16 }} className="min-w-full border-b border-white/10 bg-slate-950/80 px-4 py-4 text-sm uppercase tracking-[0.18em] text-slate-400">
            {columns.map((column) => (
              <div key={column}>{column}</div>
            ))}
          </div>
          <List height={560} itemCount={rows.length} itemSize={48} width="100%">
            {Row}
          </List>
        </div>
      )}
    </div>
  );
};

export default PreviewPage;
