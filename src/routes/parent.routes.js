import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { CATALOGS, recordScore, weekdayFromISO } from '../lib/catalogs.js';
import { normalizeAccessCode } from '../lib/codes.js';
import { notFound, unauthorized } from '../lib/http-error.js';
import { PARENT_COOKIE, clearSessionCookie, setSessionCookie } from '../lib/tokens.js';
import { requireParent } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const accessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espere 15 minutos o solicite ayuda a la maestra.' },
});

const sessionSchema = z.object({
  accessCode: z.string().trim().min(4, 'El codigo de acceso es obligatorio.').max(20),
});

router.post('/session', accessLimiter, validate(sessionSchema), async (req, res, next) => {
  try {
    const accessCode = normalizeAccessCode(req.body.accessCode);
    const { rows } = await query(
      `SELECT s.id, s.full_name, s.group_id, g.name AS group_name, g.cycle
       FROM students s
       JOIN groups g ON g.id = s.group_id
       WHERE s.access_code = $1 AND s.is_active`,
      [accessCode],
    );

    const student = rows[0];
    await query(
      'INSERT INTO access_logs (student_id, ip_address, success) VALUES ($1, $2, $3)',
      [student?.id ?? null, req.ip, Boolean(student)],
    );

    if (!student) throw unauthorized('El codigo de acceso no es valido. Verifiquelo con la maestra.');

    setSessionCookie(res, PARENT_COOKIE, {
      type: 'parent',
      sub: student.id,
      name: student.full_name,
      groupId: student.group_id,
    });

    res.json({
      student: {
        id: student.id,
        fullName: student.full_name,
        groupName: student.group_name,
        cycle: student.cycle,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res, PARENT_COOKIE);
  res.json({ ok: true });
});

router.use(requireParent);

async function loadStudent(studentId) {
  const { rows } = await query(
    `SELECT s.id, s.full_name, s.list_number, s.guardian_name, g.name AS group_name, g.cycle,
            t.full_name AS teacher_name
     FROM students s
     JOIN groups g ON g.id = s.group_id
     LEFT JOIN teachers t ON t.id = g.teacher_id
     WHERE s.id = $1 AND s.is_active`,
    [studentId],
  );
  if (rows.length === 0) throw notFound('El alumno ya no esta activo. Consulte con la escuela.');
  return rows[0];
}

/** Panel principal del padre: alumno, indicadores, tendencia semanal y avisos. */
router.get('/summary', async (req, res, next) => {
  try {
    const studentId = req.parent.sub;
    const student = await loadStudent(studentId);

    const { rows: aggregate } = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE attendance = 'presente')::int AS presentes,
              COUNT(*) FILTER (WHERE attendance = 'retardo')::int AS retardos,
              COUNT(*) FILTER (WHERE attendance = 'ausente')::int AS ausencias,
              COUNT(*) FILTER (WHERE attendance = 'justificado')::int AS justificadas,
              COUNT(*) FILTER (WHERE homework = 'entrego')::int AS tareas_ok,
              COUNT(*) FILTER (WHERE homework = 'incompleta')::int AS tareas_incompletas,
              COUNT(*) FILTER (WHERE homework = 'no_entrego')::int AS tareas_no,
              COUNT(*) FILTER (WHERE classwork = 'trabajo')::int AS trabajo_ok,
              COUNT(*) FILTER (WHERE classwork = 'parcial')::int AS trabajo_parcial,
              COUNT(*) FILTER (WHERE classwork = 'no_trabajo')::int AS trabajo_no,
              COUNT(*) FILTER (WHERE conduct IN ('excelente', 'buena'))::int AS conducta_ok,
              COUNT(*) FILTER (WHERE conduct = 'regular')::int AS conducta_regular,
              COUNT(*) FILTER (WHERE conduct = 'debe_mejorar')::int AS conducta_baja,
              COUNT(*) FILTER (WHERE seen_at IS NULL)::int AS sin_revisar
       FROM daily_records WHERE student_id = $1`,
      [studentId],
    );

    const { rows: trend } = await query(
      `SELECT record_date, attendance, homework, classwork, conduct
       FROM daily_records WHERE student_id = $1
       ORDER BY record_date DESC LIMIT 15`,
      [studentId],
    );

    const { rows: announcements } = await query(
      `SELECT a.id, a.title, a.body, a.priority, a.created_at, t.full_name AS author
       FROM announcements a
       LEFT JOIN teachers t ON t.id = a.created_by
       WHERE a.group_id = $1
       ORDER BY a.created_at DESC LIMIT 10`,
      [req.parent.groupId],
    );

    const trendPoints = trend
      .map((row) => ({ date: row.record_date, score: recordScore(row) }))
      .filter((point) => point.score !== null)
      .reverse();

    const overall = trendPoints.length
      ? Math.round(trendPoints.reduce((sum, point) => sum + point.score, 0) / trendPoints.length)
      : null;

    res.json({
      student: {
        id: student.id,
        fullName: student.full_name,
        listNumber: student.list_number,
        groupName: student.group_name,
        cycle: student.cycle,
        teacherName: student.teacher_name,
      },
      totals: aggregate[0],
      trend: trendPoints,
      overallScore: overall,
      announcements,
    });
  } catch (error) {
    next(error);
  }
});

const recordsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(365).default(90),
});

router.get('/records', validate(recordsQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { from, to, limit } = req.validatedQuery;
    const { rows } = await query(
      `SELECT r.id, r.record_date, r.attendance, r.homework, r.classwork, r.conduct,
              r.notes, r.seen_at, r.updated_at, t.full_name AS teacher_name
       FROM daily_records r
       LEFT JOIN teachers t ON t.id = r.created_by
       WHERE r.student_id = $1
         AND ($2::date IS NULL OR r.record_date >= $2)
         AND ($3::date IS NULL OR r.record_date <= $3)
       ORDER BY r.record_date DESC
       LIMIT $4`,
      [req.parent.sub, from ?? null, to ?? null, limit],
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
        teacherName: row.teacher_name,
        score: recordScore(row),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/** El padre confirma que leyo el reporte del dia; la maestra lo ve en su tablero. */
router.post('/records/:id/seen', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE daily_records SET seen_at = now()
       WHERE id = $1 AND student_id = $2 AND seen_at IS NULL
       RETURNING id, seen_at`,
      [req.params.id, req.parent.sub],
    );
    res.json({ record: rows[0] ?? null });
  } catch (error) {
    next(error);
  }
});

router.post('/records/seen-all', async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'UPDATE daily_records SET seen_at = now() WHERE student_id = $1 AND seen_at IS NULL',
      [req.parent.sub],
    );
    res.json({ updated: rowCount });
  } catch (error) {
    next(error);
  }
});

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

router.get('/export.csv', async (req, res, next) => {
  try {
    const student = await loadStudent(req.parent.sub);
    const { rows } = await query(
      `SELECT record_date, attendance, homework, classwork, conduct, notes
       FROM daily_records WHERE student_id = $1 ORDER BY record_date`,
      [req.parent.sub],
    );

    const header = ['Fecha', 'Dia', 'Asistencia', 'Tarea', 'Trabajo en clase', 'Conducta', 'Observaciones'];
    const lines = [header.map(csvCell).join(',')];
    for (const row of rows) {
      lines.push([
        row.record_date,
        weekdayFromISO(row.record_date),
        CATALOGS.attendance[row.attendance]?.label,
        CATALOGS.homework[row.homework]?.label,
        CATALOGS.classwork[row.classwork]?.label,
        CATALOGS.conduct[row.conduct]?.label,
        row.notes,
      ].map(csvCell).join(','));
    }

    const fileName = `reporte-${student.full_name.toLowerCase().replace(/\s+/g, '-')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(`\uFEFF${lines.join('\r\n')}`);
  } catch (error) {
    next(error);
  }
});

export default router;
