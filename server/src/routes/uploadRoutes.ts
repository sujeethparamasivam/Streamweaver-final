import { Router, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs, { createReadStream, unlink } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { parse } from 'csv-parse';
import * as XLSX from 'xlsx';
// stream-json does not ship TypeScript declarations for the streamer paths.
// Silence the compiler here and treat as any at runtime.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { streamArray } from 'stream-json/streamers/StreamArray';
import UploadRow from '../models/UploadRow';
import MemorySample from '../models/MemorySample';
import ImportJob from '../models/ImportJob';
import ValidationRecord from '../models/ValidationRecord';
import { requireAuth, AuthedRequest } from '../middleware/authMiddleware';
import { BatchTransformStream, RowNumberingStream, ByteCounterStream } from '../streams/batchTransformStream';
import { NDJSONParserStream, readAndParseJsonSafely, detectJsonFormat } from '../utils/streamingJsonParser';

const router = Router();
const upload = multer({ dest: 'uploads/' });

const BATCH_SIZE = Number(process.env.UPLOAD_BATCH_SIZE ?? '5000');
const PREVIEW_LIMIT = 1000;
const PROGRESS_THROTTLE_MS = Number(process.env.PROGRESS_THROTTLE_MS ?? '300');
const MAX_JSON_OBJECT_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_PERSISTED_VALIDATIONS = Number(process.env.MAX_PERSISTED_VALIDATIONS ?? '10000');

type NumberedRecord = { rowNumber: number; data: Record<string, unknown> };

// Helper functions for JSON format detection
const isValidJson = (str: string): boolean => {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
};

const readFileLines = async (filePath: string, lineCount: number): Promise<string[]> => {
  const lines: string[] = [];
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  let buffer = '';

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: string | Buffer) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';

      for (const line of parts) {
        if (lines.length < lineCount) {
          lines.push(line);
        } else {
          (stream as any).destroy?.();
          resolve(lines);
          return;
        }
      }
    });

    stream.on('end', () => {
      if (buffer && lines.length < lineCount) {
        lines.push(buffer);
      }
      resolve(lines);
    });

    stream.on('error', reject);
  });
};

const isFileNdjsonFormat = async (filePath: string): Promise<boolean> => {
  try {
    // Read first few lines and check if each is valid JSON (NDJSON) or empty/comment
    const lines = await readFileLines(filePath, 10);
    if (lines.length === 0) return false;

    // Check if most non-empty lines are valid JSON objects
    const validJsonLines = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed === '' || trimmed.startsWith('//') || isValidJson(trimmed);
    });

    // If at least 80% of non-empty lines are valid JSON, likely NDJSON
    const nonEmptyLines = lines.filter((line) => line.trim() !== '' && !line.trim().startsWith('//'));
    return nonEmptyLines.length > 0 && (validJsonLines.length / nonEmptyLines.length) >= 0.8;
  } catch {
    return false;
  }
};

const SUPPORTED_UPLOAD_EXTENSIONS = new Set(['.csv', '.json', '.xls', '.xlsx', '.xlsm']);
const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/json',
  'application/ld+json',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12'
]);

const isSupportedUploadFile = (fileName: string, mimeType?: string) => {
  const extension = path.extname(fileName).toLowerCase();
  if (SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) return true;
  return !!mimeType && SUPPORTED_UPLOAD_MIME_TYPES.has(mimeType.toLowerCase());
};

// pending emit maps for coalescing progress events per uploadId
const pendingEmitTimers = new Map<string, NodeJS.Timeout>();
const pendingEmitPayloads = new Map<string, any>();

// Row write queue controls to bound concurrent bulkWrite activity
const rowWriteBuffers = new Map<string, any[]>();
const rowWriteTimers = new Map<string, NodeJS.Timeout>();
const ROW_WRITE_CONCURRENCY = Number(process.env.ROW_WRITE_CONCURRENCY ?? '3');
const MAX_PENDING_BATCHES = 3; // Maximum pending batches before applying backpressure
let globalActiveRowWrites = 0;

async function processRowBuffer(uploadId: string) {
  const buf = rowWriteBuffers.get(uploadId) ?? [];
  if (!buf.length) return;
  if (globalActiveRowWrites >= ROW_WRITE_CONCURRENCY) return;

  // take up to BATCH_SIZE ops
  const ops = buf.splice(0, BATCH_SIZE);
  rowWriteBuffers.set(uploadId, buf);
  globalActiveRowWrites += 1;
  try {
    await UploadRow.bulkWrite(ops, { ordered: false });
  } catch (e) {
    // swallow - best-effort
  } finally {
    globalActiveRowWrites -= 1;
  }

  // schedule next batch for this upload
  if ((rowWriteBuffers.get(uploadId) ?? []).length > 0) {
    // let other active writes proceed then continue
    setImmediate(() => void processRowBuffer(uploadId));
  }
}

function scheduleRowWrites(uploadId: string, ops: any[]) {
  const buf = rowWriteBuffers.get(uploadId) ?? [];
  buf.push(...ops);
  rowWriteBuffers.set(uploadId, buf);
  if (buf.length >= BATCH_SIZE) {
    void processRowBuffer(uploadId);
    return;
  }
  if (!rowWriteTimers.has(uploadId)) {
    const t = setTimeout(() => { void processRowBuffer(uploadId); rowWriteTimers.delete(uploadId); }, 500);
    rowWriteTimers.set(uploadId, t);
  }
}

async function flushRowWrites(uploadId: string) {
  // flush all buffered ops and wait until active writes finish
  while ((rowWriteBuffers.get(uploadId) ?? []).length > 0) {
    await processRowBuffer(uploadId);
    // small delay to allow writes to start
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 100));
  }
  // wait for any active global writes to finish
  let attempts = 0;
  while (globalActiveRowWrites > 0 && attempts < 100) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 100));
    attempts += 1;
  }
}

const validateRow = (row: Record<string, unknown>, uploadId: string, rowNumber: number) => {
  const records: any[] = [];
  const keys = row && typeof row === 'object' ? Object.keys(row) : [];

  if (!keys.length) {
    records.push({ uploadId, rowNumber, field: 'row', message: 'Row contains no fields', severity: 'error', data: row });
    return records;
  }

  for (const key of keys) {
    const value = row[key];
    if (value === '' || value === null || value === undefined) {
      records.push({ uploadId, rowNumber, field: key, message: `Field ${key} is empty`, severity: 'warning', data: row });
    }
  }

  if (typeof row.email === 'string' && !row.email.includes('@')) {
    records.push({ uploadId, rowNumber, field: 'email', message: 'Email value does not appear valid', severity: 'warning', data: row });
  }

  if ((row.created_at || row.createdAt) && Number.isNaN(Date.parse(String(row.created_at ?? row.createdAt)))) {
    records.push({ uploadId, rowNumber, field: 'created_at', message: 'Date field is invalid', severity: 'warning', data: row });
  }

  if (!row.name && !row.fullName && !row.firstName) {
    records.push({ uploadId, rowNumber, field: 'name', message: 'Name field is missing', severity: 'warning', data: row });
  }

  return records;
};

// Validation write buffering to reduce blocking I/O during uploads
const validationBuffers = new Map<string, any[]>();
const validationTimers = new Map<string, NodeJS.Timeout>();
const validationCounts = new Map<string, number>();

async function flushValidationBuffer(uploadId: string) {
  const buf = validationBuffers.get(uploadId) ?? [];
  if (!buf.length) {
    const t = validationTimers.get(uploadId);
    if (t) clearTimeout(t);
    validationTimers.delete(uploadId);
    return;
  }
  validationBuffers.set(uploadId, []);
  const t = validationTimers.get(uploadId);
  if (t) {
    clearTimeout(t);
    validationTimers.delete(uploadId);
  }
  try {
    await ValidationRecord.insertMany(buf, { ordered: false });
  } catch (e) {
    // best-effort
  }
}

function scheduleValidationDocs(uploadId: string, docs: any[]) {
  if (!docs || !docs.length) return;
  const persistedCount = validationCounts.get(uploadId) ?? 0;
  const remaining = Math.max(0, MAX_PERSISTED_VALIDATIONS - persistedCount);
  const docsToPersist = docs.slice(0, remaining);
  validationCounts.set(uploadId, persistedCount + docsToPersist.length);
  const buf = validationBuffers.get(uploadId) ?? [];
  buf.push(...docsToPersist);
  validationBuffers.set(uploadId, buf);
  if (buf.length >= 500) {
    void flushValidationBuffer(uploadId);
    return;
  }
  if (!validationTimers.has(uploadId)) {
    const timer = setTimeout(() => flushValidationBuffer(uploadId), 2000);
    validationTimers.set(uploadId, timer);
  }
}

/** Bulk-write a batch of parsed rows; validation records are buffered and written asynchronously. */
const writeBatch = async (batch: NumberedRecord[], fileName: string, uploadId: string, owner?: string) => {
  const rowOps = batch.map(({ rowNumber, data }) => ({
    insertOne: { document: { uploadId, fileName, rowNumber, data, createdBy: owner } }
  }));

  const validationDocs = batch.flatMap(({ rowNumber, data }) =>
    validateRow(data, uploadId, rowNumber).map((doc) => ({ ...doc, createdBy: owner }))
  );

  // Apply real backpressure: wait if pending batch buffer exceeds limit
  // This ensures MongoDB slowness slows down file reading, preventing unbounded memory growth
  const maxBufferOps = MAX_PENDING_BATCHES * BATCH_SIZE;
  let waitIterations = 0;
  while ((rowWriteBuffers.get(uploadId) ?? []).length > maxBufferOps && waitIterations < 300) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
    waitIterations += 1;
  }

  // schedule row writes to background worker queue to bound concurrency and reduce latency
  scheduleRowWrites(uploadId, rowOps);
  if (validationDocs.length) scheduleValidationDocs(uploadId, validationDocs);

  // lightweight backpressure: pause briefly if heapUsed exceeds configured limit
  try {
    const limitMB = Number(process.env.MEMORY_AUDIT_LIMIT_MB ?? '150');
    const maxHeap = limitMB * 1024 * 1024;
    let attempts = 0;
    while (process.memoryUsage().heapUsed > maxHeap && attempts < 5) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 200));
      attempts += 1;
    }
  } catch (e) {
    // ignore
  }

  return { failedRows: validationDocs.filter((d) => d.severity === 'error').length };
};

router.post('/', requireAuth, upload.single('file'), async (req: AuthedRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const io = req.app.get('io');
  const filePath = path.resolve(req.file.path);
  const extension = path.extname(req.file.originalname).toLowerCase();
  const fileName = req.file.originalname;
  const fileSize = req.file.size;

  if (!isSupportedUploadFile(fileName, req.file.mimetype)) {
    await unlink(filePath, () => undefined);
    return res.status(400).json({ message: 'Unsupported file type. Supported types: CSV, JSON, XLS, XLSX, XLSM.' });
  }

  // The client generates this id and joins the matching Socket.IO room
  // *before* the upload starts, so progress can be streamed back live.
  const uploadId = (typeof req.body.clientUploadId === 'string' && req.body.clientUploadId.trim())
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = req.user?.email || req.user?.id;
  const startedAt = new Date();

  const job = await ImportJob.create({
    uploadId,
    fileName,
    status: 'processing',
    totalRows: 0,
    failedRows: 0,
    fileSize,
    columns: [],
    selectedColumns: [],
    createdBy: owner,
    startedAt,
    importedRows: 0
  });

  let totalRows = 0;
  let failedRows = 0;
  const firstRecords: Record<string, unknown>[] = [];
  const detectedColumns = new Set<string>();
  let lastEmit = 0;

  const emitProgress = (bytesRead: number, force = false) => {
      if (!io) return;
      const now = Date.now();

      const elapsedSeconds = Math.max((now - startedAt.getTime()) / 1000, 0.001);
      const progress = fileSize > 0 ? Math.min(100, Math.round((bytesRead / fileSize) * 100)) : 0;
      const mu = process.memoryUsage();
      const memoryUsage = { rss: mu.rss, heapTotal: mu.heapTotal, heapUsed: mu.heapUsed };

      // coalesce/ debounce emits per uploadId: store latest payload and schedule a trailing emit
      const payload = {
        uploadId,
        stage: 'upload',
        progress,
        fileSize,
        totalRows,
        rowsProcessed: totalRows,
        rowsFailed: failedRows,
        rowsPerSecond: Math.round(totalRows / elapsedSeconds),
        durationMs: Math.round(elapsedSeconds * 1000),
        memoryUsage,
        batchSize: BATCH_SIZE
      };

      // store latest payload
      pendingEmitPayloads.set(uploadId, payload);

      if (force) {
        // flush immediately
        const p = pendingEmitPayloads.get(uploadId);
        if (p) io.to(uploadId).emit('import-progress', p);
        pendingEmitPayloads.delete(uploadId);
        const t = pendingEmitTimers.get(uploadId);
        if (t) { clearTimeout(t); pendingEmitTimers.delete(uploadId); }
        lastEmit = Date.now();
        return;
      }

      // schedule trailing emit if not already scheduled
      if (!pendingEmitTimers.has(uploadId)) {
        const timer = setTimeout(() => {
          const p = pendingEmitPayloads.get(uploadId);
          if (p) io.to(uploadId).emit('import-progress', p);
          pendingEmitPayloads.delete(uploadId);
          pendingEmitTimers.delete(uploadId);
          lastEmit = Date.now();
        }, PROGRESS_THROTTLE_MS);
        pendingEmitTimers.set(uploadId, timer);
      }
    try {
      const mu = process.memoryUsage();
      // schedule a buffered memory sample write to avoid many small DB writes
      scheduleMemorySample(uploadId, {
        uploadId,
        ts: new Date(),
        rss: mu.rss,
        heapTotal: mu.heapTotal,
        heapUsed: mu.heapUsed,
        external: mu.external ?? 0,
        arrayBuffers: (mu as any).arrayBuffers ?? 0
      });
    } catch (err) {
      // ignore sampling errors
    }
  };

// In-memory buffering for memory samples per upload to reduce DB write churn
const memorySampleBuffers = new Map<string, any[]>();
const memorySampleTimers = new Map<string, NodeJS.Timeout>();

async function flushMemorySamples(uploadId: string) {
  const buf = memorySampleBuffers.get(uploadId) ?? [];
  if (!buf.length) {
    const t = memorySampleTimers.get(uploadId);
    if (t) clearTimeout(t);
    memorySampleTimers.delete(uploadId);
    return;
  }
  memorySampleBuffers.set(uploadId, []);
  const t = memorySampleTimers.get(uploadId);
  if (t) {
    clearTimeout(t);
    memorySampleTimers.delete(uploadId);
  }
  try {
    await MemorySample.insertMany(buf, { ordered: false });
  } catch (e) {
    // swallow errors; sampling is best-effort
  }
}

function scheduleMemorySample(uploadId: string, sample: any) {
  const buf = memorySampleBuffers.get(uploadId) ?? [];
  buf.push(sample);
  memorySampleBuffers.set(uploadId, buf);
  if (buf.length >= 10) {
    void flushMemorySamples(uploadId);
    return;
  }
  if (!memorySampleTimers.has(uploadId)) {
    const timer = setTimeout(() => flushMemorySamples(uploadId), 1000);
    memorySampleTimers.set(uploadId, timer);
  }
}

  try {
    let source: NodeJS.ReadableStream;

    if (extension === '.csv') {
      const byteCounter = new ByteCounterStream((bytesRead) => emitProgress(bytesRead));
      source = createReadStream(filePath)
        .pipe(byteCounter)
        .pipe(parse({ columns: true, skip_empty_lines: true }));
    } else if (extension === '.json') {
      // Detect JSON format (array, object, or NDJSON)
      // Use streaming for arrays and NDJSON, safe parsing for single objects under size limit
      const firstChar = await detectJsonFormat(filePath);

      const byteCounter = new ByteCounterStream((bytesRead) => emitProgress(bytesRead));

      if (firstChar === '[') {
        // Streaming JSON array using stream-json
        const jsonParser = streamArray();
        const valueTransform = new Transform({
          objectMode: true,
          transform(chunk, _encoding, callback) {
            callback(null, (chunk as any).value);
          }
        });

        source = createReadStream(filePath)
          .pipe(byteCounter)
          .pipe(jsonParser)
          .pipe(valueTransform);
      } else if (firstChar === '{') {
        // Single JSON object or NDJSON format - detect if it's NDJSON by scanning
        // If it looks like NDJSON (multiple lines with objects), use streaming parser
        // Otherwise, load as single object with size safety check

        const MAX_SAFE_OBJECT_SIZE = 100 * 1024 * 1024; // 100 MB for single objects

        // Peek at file to detect NDJSON
        const isLikelyNdjson = await isFileNdjsonFormat(filePath);

        if (isLikelyNdjson) {
          // Use streaming NDJSON parser
          source = createReadStream(filePath)
            .pipe(byteCounter)
            .pipe(new NDJSONParserStream());
        } else {
          // Single top-level object - check size first
          if (fileSize > MAX_SAFE_OBJECT_SIZE) {
            await unlink(filePath, () => undefined);
            return res.status(413).json({
              message: `Large JSON objects are not supported for memory-safe streaming. ` +
                       `File size ${Math.round(fileSize / 1024 / 1024)}MB exceeds maximum ${Math.round(MAX_SAFE_OBJECT_SIZE / 1024 / 1024)}MB. ` +
                       `Please upload a JSON array or convert to NDJSON format.`
            });
          }
          // Load single object with size check
          emitProgress(fileSize, true);
          const parsed = await readAndParseJsonSafely(createReadStream(filePath), MAX_SAFE_OBJECT_SIZE);
          source = Readable.from([parsed]);
        }
      } else {
        // Unknown format - attempt NDJSON parsing; if that fails, try full JSON parse
        const MAX_SAFE_SIZE = 100 * 1024 * 1024; // 100 MB

        // Try NDJSON first
        let isNdjson = false;
        try {
          const lines = await readFileLines(filePath, 5); // Read first 5 lines
          isNdjson = lines.every((line) => {
            const trimmed = line.trim();
            return trimmed === '' || trimmed.startsWith('//') || isValidJson(trimmed);
          });
        } catch {
          isNdjson = false;
        }

        if (isNdjson) {
          source = createReadStream(filePath)
            .pipe(byteCounter)
            .pipe(new NDJSONParserStream());
        } else {
          // Try single JSON parse with size limit
          emitProgress(fileSize, true);
          const parsed = await readAndParseJsonSafely(createReadStream(filePath), MAX_SAFE_SIZE);
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          source = Readable.from(rows);
        }
      }

    } else if (['.xls', '.xlsx', '.xlsm'].includes(extension)) {
      // Excel files cannot be streamed; they must be loaded entirely into memory
      // Enforce a size limit to prevent memory exhaustion
      const MAX_EXCEL_SIZE_MB = 100;
      const MAX_EXCEL_BYTES = MAX_EXCEL_SIZE_MB * 1024 * 1024;
      
      if (fileSize > MAX_EXCEL_BYTES) {
        await unlink(filePath, () => undefined);
        return res.status(413).json({
          message: `Large Excel files are not supported for memory-safe streaming. ` +
                   `File size ${Math.round(fileSize / 1024 / 1024)}MB exceeds maximum ${MAX_EXCEL_SIZE_MB}MB. ` +
                   `Please convert the file to CSV or NDJSON format for large datasets.`
        });
      }

      const workbook = XLSX.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      if (!sheet) {
        throw new Error('Excel file has no readable sheets');
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
        blankrows: false
      });

      emitProgress(fileSize, true);
      source = Readable.from(rows);
    } else {
      await ImportJob.findByIdAndUpdate(job._id, { status: 'failed', finishedAt: new Date() });
      return res.status(400).json({ message: 'Unsupported file type. Supported types: CSV, JSON, XLS, XLSX, XLSM.' });
    }

    const numbered = source.pipe(new RowNumberingStream());
    const batched = numbered.pipe(new BatchTransformStream(BATCH_SIZE));

    for await (const batch of batched as AsyncIterable<NumberedRecord[]>) {
      const result = await writeBatch(batch, fileName, uploadId, owner);
      totalRows += batch.length;
      failedRows += result.failedRows;
      if (firstRecords.length < 1000) firstRecords.push(...batch.slice(0, 1000 - firstRecords.length).map((r) => r.data));
      batch.forEach(({ data }) => Object.keys(data).forEach((key) => detectedColumns.add(key)));
      // Progress updated by ByteCounterStream; avoid forcing 100% inside loop
    }

    // ensure final progress is emitted
    emitProgress(fileSize, true);

    const columns = Array.from(detectedColumns);

    // Mark the upload complete as soon as parsing finishes. Database buffers
    // continue draining without keeping the browser request open.
    try {
      await ImportJob.findByIdAndUpdate(job._id, {
        status: 'completed',
        totalRows,
        failedRows,
        fileSize,
        columns,
        selectedColumns: columns,
        finishedAt: new Date()
      });
    } catch (updateError) {
      console.error('Unable to finalize upload job:', updateError);
    }

    void Promise.all([
      flushRowWrites(uploadId),
      flushValidationBuffer(uploadId)
    ]).catch((flushError) => console.error('Unable to flush upload buffers:', flushError));

    // flush any buffered samples and compute memory audit summary
    try {
      await flushMemorySamples(uploadId);
      const samples = await MemorySample.find({ uploadId }).sort({ ts: 1 }).lean();
      if (samples && samples.length) {
        const peakRss = Math.max(...samples.map((s: any) => s.rss));
        const peakHeap = Math.max(...samples.map((s: any) => s.heapUsed));
        const avgRss = Math.round(samples.reduce((a: number, b: any) => a + b.rss, 0) / samples.length);
        const avgHeap = Math.round(samples.reduce((a: number, b: any) => a + b.heapUsed, 0) / samples.length);

        await ImportJob.findByIdAndUpdate(job._id, {
          memoryAudit: { peakRss, peakHeap, avgRss, avgHeap, samples: samples.length, savedAt: new Date() }
        });
      }
    } catch (err) {
      // non-blocking
    }

    res.json({ message: 'File processed', fileName, total: totalRows, totalRows, failedRows, preview: firstRecords, columns, uploadId });
  } catch (error) {
    try {
      await ImportJob.findByIdAndUpdate(job._id, { status: 'failed', totalRows, failedRows, finishedAt: new Date() });
    } catch (updateError) {
      console.error('Unable to mark failed upload job:', updateError);
    }
    if (io) io.to(uploadId).emit('import-progress', { uploadId, progress: 100, rowsProcessed: totalRows, rowsFailed: failedRows, error: String(error) });
    res.status(500).json({ message: 'Upload processing failed', error: String(error) });
  } finally {
    unlink(filePath, () => undefined);
  }
});

export default router;
