import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { CATALOGS, recordScore, weekdayFromISO } from '../lib/catalogs.js';
import { requireTeacher } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireTeacher);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato AAAA-MM-DD.');
const enumOf = (catalog) => z.enum(Object.keys(catalog));

const dayQuerySchema = z.object({
  groupId: z.coerce.number().int().positive(),
  date: isoDate,
});

/** Pase de lista del dia: todos los alumnos activos con su registro (si existe). */
router.get('/day', validate(dayQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { groupId, date } = req.validatedQuery;
    const { rows } = await query(
      `SELECT s.id AS student_id, s.full_name, s.list_number, s.access_code,
              r.id AS record_id, r.attendance, r.homework, r.classwork, r.conduct,
              r.notes, r.updated_at, r.seen_at
       FROM students s
       LEFT JOIN daily_records r ON r.student_id = s.id AND r.record_date = $2
       WHERE s.group_id = $1 AND s.is_active
       ORDER BY s.list_number`,
      [groupId, date],
    );

    res.json({
      date,
      weekday: weekdayFromISO(date),
      rows: rows.map((row) => ({
        studentId: row.student_id,
        fullName: row.full_name,
        listNumber: row.list_number,
        accessCode: row.access_code,
        record: row.record_id
          ? {
              id: row.record_id,
              attendance: row.attendance,
              homework: row.homework,
              classwork: row.classwork,
              conduct: row.conduct,
              notes: row.notes,
              updatedAt: row.updated_at,
              seenAt: row.seen_at,
            }
          : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

const bulkSchema = z.object({
  date: isoDate,
  entries: z
    .array(
      z.object({
        studentId: z.coerce.number().int().positive(),
        attendance: enumOf(CATALOGS.attendance),
        homework: enumOf(CATALOGS.homework),
        classwork: enumOf(CATALOGS.classwork),
        conduct: enumOf(CATALOGS.conduct),
        notes: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .min(1, 'Debe enviar al menos un registro.')
    .max(200),
});

/** Guarda el pase de lista completo en una sola transaccion (upsert por alumno y fecha). */
router.post('/bulk', validate(bulkSchema), async (req, res, next) => {
  try {
    const { date, entries } = req.body;
    const saved = await withTransaction(async (client) => {
      let count = 0;
      for (const entry of entries) {
        const result = await client.query(
          `INSERT INTO daily_records
             (student_id, record_date, attendance, homework, classwork, conduct, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8)
           ON CONFLICT (student_id, record_date) DO UPDATE SET
             attendance = EXCLUDED.attendance,
             homework   = EXCLUDED.homework,
             classwork  = EXCLUDED.classwork,
             conduct    = EXCLUDED.conduct,
             notes      = EXCLUDED.notes,
             seen_at    = NULL`,
          [
            entry.studentId, date, entry.attendance, entry.homework,
            entry.classwork, entry.conduct, entry.notes ?? '', req.teacher.sub,
          ],
        );
        count += result.rowCount;
      }
      return count;
    });

    res.status(201).json({ saved, date });
  } catch (error) {
    next(error);
  }
});

const statsQuerySchema = z.object({
  groupId: z.coerce.number().int().positive(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** Indicadores del grupo para el tablero del docente. */
router.get('/stats', validate(statsQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { groupId, from, to } = req.validatedQuery;
    const params = [groupId, from ?? null, to ?? null];

    const { rows: totals } = await query(
      `SELECT COUNT(*)::int AS registros,
              COUNT(*) FILTER (WHERE r.attendance = 'ausente')::int AS ausencias,
              COUNT(*) FILTER (WHERE r.attendance = 'retardo')::int AS retardos,
              COUNT(*) FILTER (WHERE r.homework = 'no_entrego')::int AS sin_tarea,
              COUNT(*) FILTER (WHERE r.conduct IN ('regular', 'debe_mejorar'))::int AS conducta_baja,
              COUNT(*) FILTER (WHERE r.seen_at IS NOT NULL)::int AS vistos
       FROM daily_records r
       JOIN students s ON s.id = r.student_id
       WHERE s.group_id = $1
         AND ($2::date IS NULL OR r.record_date >= $2)
         AND ($3::date IS NULL OR r.record_date <= $3)`,
      params,
    );

    const { rows: perStudent } = await query(
      `SELECT s.id, s.full_name, s.list_number,
              COUNT(r.id)::int AS registros,
              COUNT(r.id) FILTER (WHERE r.attendance = 'ausente')::int AS ausencias,
              COUNT(r.id) FILTER (WHERE r.homework = 'no_entrego')::int AS sin_tarea,
              COUNT(r.id) FILTER (WHERE r.conduct IN ('regular', 'debe_mejorar'))::int AS conducta_baja
       FROM students s
       LEFT JOIN daily_records r ON r.student_id = s.id
            AND ($2::date IS NULL OR r.record_date >= $2)
            AND ($3::date IS NULL OR r.record_date <= $3)
       WHERE s.group_id = $1 AND s.is_active
       GROUP BY s.id
       ORDER BY sin_tarea DESC, ausencias DESC, s.list_number`,
      params,
    );

    res.json({
      totals: totals[0],
      students: perStudent.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        listNumber: row.list_number,
        records: row.registros,
        absences: row.ausencias,
        missingHomework: row.sin_tarea,
        lowConduct: row.conducta_baja,
      })),
    });
  } catch (error) {
    next(error);
  }
});

const historyQuerySchema = z.object({
  studentId: z.coerce.number().int().positive(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

router.get('/history', validate(historyQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { studentId, limit } = req.validatedQuery;
    const { rows } = await query(
      `SELECT id, record_date, attendance, homework, classwork, conduct, notes, seen_at
       FROM daily_records WHERE student_id = $1
       ORDER BY record_date DESC LIMIT $2`,
      [studentId, limit],
    );
    res.json({
      records: rows.map((row) => ({
        id: row.id,
        date: row.record_date,
        weekday: weekdayFromISO(row.record_date),
        attendance: row.attendance,
        homework: row.homework,
        classwork: row.classwork,
        conduct: row.conduct,
        notes: row.notes,
        seenAt: row.seen_at,
        score: recordScore(row),
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
