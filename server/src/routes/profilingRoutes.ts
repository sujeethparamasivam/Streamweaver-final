import { Router, Response } from 'express';
import UploadRow from '../models/UploadRow';
import ImportJob from '../models/ImportJob';
import { requireAuth, AuthedRequest } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

type ColumnProfile = {
  name: string;
  type: 'number' | 'date' | 'string' | 'boolean' | 'unknown';
  totalValues: number;
  missingValues: number;
  missingPercentage: number;
  uniqueValues: number;
  duplicateValues: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  mode?: unknown;
  q1?: number;
  q3?: number;
  iqr?: number;
  outlierCount?: number;
  outlierPercentage?: number;
};

type DatasetProfile = {
  totalRows: number;
  totalColumns: number;
  totalMissingValues: number;
  totalDuplicateRows: number;
  numberNumericColumns: number;
  numberTextColumns: number;
  numberDateColumns: number;
  datasetSize: number;
  qualityScore: number;
  rowsWithMissingData: number;
  completeRows: number;
  missingDataPercentage: number;
  qualityBreakdown: {
    completeness: number;
    validity: number;
    uniqueness: number;
    consistency: number;
  };
  columns: ColumnProfile[];
};

import { isMissingValue, parseValue, getValueType } from '../utils/dataUtils';


const calculateStats = (values: (number | Date | string | boolean | null)[]) => {
  const nonMissing = values.filter((v) => v !== null) as (number | Date | string | boolean)[];
  const numeric = nonMissing.filter((v): v is number => typeof v === 'number');
  const dates = nonMissing.filter((v): v is Date => v instanceof Date);
  const counts = new Map<string, number>();
  nonMissing.forEach((value) => {
    const key = typeof value === 'object' ? String((value as Date).toISOString()) : String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const sortedNumeric = [...numeric].sort((a, b) => a - b);
  const modeEntry = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  const inferredType: ColumnProfile['type'] = numeric.length ? 'number' : dates.length ? 'date' : nonMissing.length ? 'string' : 'string';
  return {
    uniqueValues: counts.size,
    duplicateValues: nonMissing.length - counts.size,
    min: sortedNumeric.length ? sortedNumeric[0] : undefined,
    max: sortedNumeric.length ? sortedNumeric[sortedNumeric.length - 1] : undefined,
    mean: sortedNumeric.length ? sortedNumeric.reduce((sum, value) => sum + value, 0) / sortedNumeric.length : undefined,
    median: sortedNumeric.length
      ? sortedNumeric.length % 2 === 1
        ? sortedNumeric[(sortedNumeric.length - 1) / 2]
        : (sortedNumeric[sortedNumeric.length / 2 - 1] + sortedNumeric[sortedNumeric.length / 2]) / 2
      : undefined,
    mode: modeEntry ? modeEntry[0] : undefined,
    type: inferredType
  };
};

const createQualityScore = (profile: DatasetProfile) => {
  const completeness = profile.totalRows > 0 ? 100 - Math.round((profile.totalMissingValues / (profile.totalRows * profile.totalColumns)) * 100) : 100;
  const uniqueness = profile.totalRows > 0 ? Math.round(((profile.totalRows - profile.totalDuplicateRows) / profile.totalRows) * 100) : 100;
  const validity = profile.numberNumericColumns + profile.numberDateColumns > 0 ? 95 : 100;
  const consistency = 100 - Math.round(profile.totalDuplicateRows > 0 ? Math.min(20, (profile.totalDuplicateRows / profile.totalRows) * 100) : 0);
  const score = Math.round((completeness + validity + uniqueness + consistency) / 4);
  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { completeness, validity, uniqueness, consistency }
  };
};

router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const { uploadId } = req.query;
    if (typeof uploadId !== 'string' || !uploadId.trim()) {
      return res.status(400).json({ message: 'uploadId query parameter is required' });
    }

    const owners = [req.user?.email, req.user?.id].filter(Boolean) as string[];
    const rowFilter: any = { uploadId, createdBy: { $in: owners } };

    // total rows
    const totalRows = await UploadRow.countDocuments(rowFilter);
    console.log(`[profiling] uploadId=${uploadId}, owners=${JSON.stringify(owners)}, totalRows=${totalRows}`);
    if (!totalRows) return res.status(404).json({ message: 'No uploaded rows found for this import' });

    // column names via aggregation without loading all docs
    const colsAgg = await UploadRow.aggregate([
      { $match: rowFilter },
      { $project: { kv: { $objectToArray: '$data' } } },
      { $unwind: '$kv' },
      { $group: { _id: null, keys: { $addToSet: '$kv.k' } } },
      { $project: { _id: 0, keys: 1 } }
    ]).allowDiskUse(true);
    const columnNames: string[] = (colsAgg[0]?.keys ?? []) as string[];

    // dataset size in bytes using $bsonSize where available
    let datasetSize = 0;
    try {
      const sizeAgg = await UploadRow.aggregate([{ $match: rowFilter }, { $group: { _id: null, size: { $sum: { $bsonSize: '$data' } } } }]).allowDiskUse(true);
      datasetSize = sizeAgg[0]?.size ?? 0;
    } catch (e) {
      // $bsonSize may not be available; fallback to 0
      datasetSize = 0;
    }

    const columns: ColumnProfile[] = [];
    for (const column of columnNames) {
      // missing values: count docs where field is missing or null or empty string
      const missingValues = await UploadRow.countDocuments({
        ...rowFilter,
        $or: [ { [`data.${column}`]: { $exists: false } }, { [`data.${column}`]: null }, { [`data.${column}`]: '' } ]
      });

      // unique values: count distinct values using aggregation grouping
      const uniqueAgg = await UploadRow.aggregate([
        { $match: rowFilter },
        { $group: { _id: `$data.${column}` } },
        { $group: { _id: null, uniqueCount: { $sum: 1 } } }
      ]).option({ allowDiskUse: true });
      const uniqueValues = uniqueAgg[0]?.uniqueCount ?? 0;

      // numeric stats (min/max/avg) for numeric values only
      const numAgg = await UploadRow.aggregate([
        { $match: { ...rowFilter, [`data.${column}`]: { $type: 'number' } } },
        { $group: { _id: null, min: { $min: `$data.${column}` }, max: { $max: `$data.${column}` }, avg: { $avg: `$data.${column}` } } }
      ]).option({ allowDiskUse: true });
      const numStats = numAgg[0] ?? {};

      // approximate median and IQR by sampling up to 1000 numeric values
      let median: number | undefined = undefined;
      let q1: number | undefined = undefined;
      let q3: number | undefined = undefined;
      let iqr: number | undefined = undefined;
      let outlierCount: number | undefined = undefined;
      let outlierPercentage: number | undefined = undefined;
      try {
        const sampleAgg = await UploadRow.aggregate([
          { $match: { ...rowFilter, [`data.${column}`]: { $type: 'number' } } },
          { $sample: { size: 1000 } },
          { $project: { v: `$data.${column}` } }
        ]).allowDiskUse(true);
        const vals = (sampleAgg.map((s: any) => Number(s.v)).filter((v: number) => Number.isFinite(v)) as number[]).sort((a, b) => a - b);
        if (vals.length) {
          const getPercentile = (arr: number[], p: number) => {
            const idx = (arr.length - 1) * p;
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            if (lo === hi) return arr[lo];
            return arr[lo] * (hi - idx) + arr[hi] * (idx - lo);
          };
          median = getPercentile(vals, 0.5);
          q1 = getPercentile(vals, 0.25);
          q3 = getPercentile(vals, 0.75);
          iqr = q3 - q1;
          if (iqr && Number.isFinite(iqr)) {
            const lower = q1 - 1.5 * iqr;
            const upper = q3 + 1.5 * iqr;
            outlierCount = await UploadRow.countDocuments({ ...rowFilter, $or: [{ [`data.${column}`]: { $lt: lower } }, { [`data.${column}`]: { $gt: upper } }] });
            outlierPercentage = totalRows ? Math.round((outlierCount / totalRows) * 10000) / 100 : 0;
          }
        }
      } catch (e) {
        // ignore sampling errors
      }

      const totalValues = totalRows;
      const duplicateValues = totalValues - uniqueValues;

      const inferredType: ColumnProfile['type'] = numStats && Object.keys(numStats).length ? 'number' : 'string';

      columns.push({
        name: column,
        type: inferredType,
        totalValues,
        missingValues,
        missingPercentage: totalValues ? Math.round((missingValues / totalValues) * 10000) / 100 : 0,
        uniqueValues,
        duplicateValues,
        min: typeof numStats.min === 'number' ? numStats.min : undefined,
        max: typeof numStats.max === 'number' ? numStats.max : undefined,
        mean: typeof numStats.avg === 'number' ? numStats.avg : undefined,
        median,
        mode: undefined,
        q1,
        q3,
        iqr,
        outlierCount,
        outlierPercentage
      });
    }

    // total missing values across columns
    const totalMissingValues = columns.reduce((sum, col) => sum + col.missingValues, 0);

    // duplicate rows: count distinct document shapes
    const uniqueRowsAgg = await UploadRow.aggregate([
      { $match: rowFilter },
      { $group: { _id: '$data' } },
      { $count: 'unique' }
    ]).allowDiskUse(true);
    const uniqueRows = uniqueRowsAgg[0]?.unique ?? 0;
    const duplicateRows = totalRows - uniqueRows;

    const numberNumericColumns = columns.filter((col) => col.type === 'number').length;
    const numberDateColumns = columns.filter((col) => col.type === 'date').length;
    const numberTextColumns = columns.filter((col) => col.type === 'string').length;

    // compute rows with any missing column value using a $or across columns
    const orConditions = columnNames.map((c) => ({ [`data.${c}`]: { $in: [null, ''] } }));
    const rowsWithMissingData = await UploadRow.countDocuments({ ...rowFilter, $or: orConditions });

    const completeRows = totalRows - rowsWithMissingData;
    const missingDataPercentage = totalRows && columnNames.length
      ? Math.round((totalMissingValues / (totalRows * columnNames.length)) * 100)
      : 0;

    const profile: DatasetProfile = {
      totalRows,
      totalColumns: columns.length,
      totalMissingValues,
      totalDuplicateRows: duplicateRows,
      numberNumericColumns,
      numberTextColumns,
      numberDateColumns,
      datasetSize,
      qualityScore: 0,
      rowsWithMissingData,
      completeRows,
      missingDataPercentage,
      qualityBreakdown: { completeness: 0, validity: 0, uniqueness: 0, consistency: 0 },
      columns
    };

    const quality = createQualityScore(profile);
    profile.qualityScore = quality.score;
    profile.qualityBreakdown = quality.breakdown;

    res.json({ profile });
  } catch (error) {
    console.error('Profiling error for uploadId:', req.query.uploadId, error);
    res.status(500).json({ message: 'Unable to compute dataset profile', error: String(error) });
  }
});

export default router;
