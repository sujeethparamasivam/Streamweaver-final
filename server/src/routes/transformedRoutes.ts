import { Router, Response } from 'express';
import TransformedRow from '../models/TransformedRow';
import ImportJob from '../models/ImportJob';
import { requireAuth, AuthedRequest } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/latest', async (req: AuthedRequest, res: Response) => {
  try {
    const owners = [req.user?.email, req.user?.id].filter(Boolean) as string[];
    const job = await ImportJob.findOne(owners.length ? { createdBy: { $in: owners } } : {}).sort({ createdAt: -1 }).lean();
    if (!job) return res.status(404).json({ message: 'No imports found' });

    const rows = await TransformedRow.find({ uploadId: job.uploadId }).sort({ rowNumber: 1 }).allowDiskUse(true).limit(1000).lean();
    res.json({ uploadId: job.uploadId, rows });
  } catch (error) {
    res.status(500).json({ message: 'Could not load latest transformed rows', error: String(error) });
  }
});

router.get('/:uploadId', async (req: AuthedRequest, res: Response) => {
  try {
    const { uploadId } = req.params;
    const owners = [req.user?.email, req.user?.id].filter(Boolean) as string[];
    const job = await ImportJob.findOne(owners.length ? { uploadId, createdBy: { $in: owners } } : { uploadId }).lean();
    if (!job) return res.status(404).json({ message: 'Import not found' });

    const rows = await TransformedRow.find({ uploadId }).sort({ rowNumber: 1 }).allowDiskUse(true).limit(1000).lean();
    res.json({ rows });
  } catch (error) {
    res.status(500).json({ message: 'Could not load transformed rows', error: String(error) });
  }
});

export default router;
