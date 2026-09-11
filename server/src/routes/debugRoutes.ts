import { Router, Response } from 'express';
import UploadRow from '../models/UploadRow';
import { requireAuth, AuthedRequest } from '../middleware/authMiddleware';
import mongoose from 'mongoose';

const router = Router();

// Public endpoint to inspect DB and collection sizes (no auth) — useful for admin checks.
router.get('/db-stats-public', async (_req, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(500).json({ message: 'MongoDB connection not available' });
    const dbStats = await db.stats();
    const cols = await db.listCollections().toArray();
    const collections: any[] = [];
    for (const c of cols) {
      try {
        const stats = await (db.collection(c.name) as any).stats();
        collections.push({ name: c.name, count: stats.count, size: stats.size, storageSize: stats.storageSize, totalIndexSize: stats.totalIndexSize });
      } catch (err) {
        collections.push({ name: c.name, error: String(err) });
      }
    }
    res.json({ dbStats, collections });
  } catch (error) {
    res.status(500).json({ message: 'Could not load DB stats', error: String(error) });
  }
});

router.use(requireAuth);

router.get('/upload-rows', async (req: AuthedRequest, res: Response) => {
  try {
    const { uploadId } = req.query;
    const owners = [req.user?.email, req.user?.id].filter(Boolean) as string[];
    const filter: any = owners.length ? { createdBy: { $in: owners } } : {};

    if (typeof uploadId === 'string' && uploadId.trim().length > 0) {
      filter.uploadId = uploadId;
    }

    const rows = await UploadRow.find(filter).sort({ rowNumber: 1 }).allowDiskUse(true).limit(1000).lean();
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row.data ?? {}))));
    res.json({ count: rows.length, rows, columns });
  } catch (error) {
    res.status(500).json({ message: 'Could not load upload rows', error: String(error) });
  }
});

export default router;
