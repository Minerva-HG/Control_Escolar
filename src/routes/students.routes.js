import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { generateAccessCode } from '../lib/codes.js';
import { notFound } from '../lib/http-error.js';
import { requireTeacher } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireTeacher);

const mapStudent = (row) => ({
  id: row.id,
  groupId: row.group_id,
  fullName: row.full_name,
  listNumber: row.list_number,
  accessCode: row.access_code,
  guardianName: row.guardian_name,
  guardianPhone: row.guardian_phone,
  isActive: row.is_active,
});

const listQuerySchema = z.object({
  groupId: z.coerce.number().int().positive().optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});

router.get('/', validate(listQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { groupId, includeInactive } = req.validatedQuery;
    const { rows } = await query(
      `SELECT * FROM students
       WHERE ($1::int IS NULL OR group_id = $1)
         AND ($2::boolean OR is_active)
       ORDER BY list_number`,
      [groupId ?? null, includeInactive === 'true'],
    );
    res.json({ students: rows.map(mapStudent) });
  } catch (error) {
    next(error);
  }
});

const createSchema = z.object({
  groupId: z.coerce.number().int().positive(),
  fullName: z.string().trim().min(3, 'El nombre del alumno es obligatorio.').max(120),
  listNumber: z.coerce.number().int().positive().optional(),
  guardianName: z.string().trim().max(120).optional().or(z.literal('')),
  guardianPhone: z.string().trim().max(30).optional().or(z.literal('')),
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { groupId, fullName, guardianName, guardianPhone } = req.body;
    let listNumber = req.body.listNumber;

    if (!listNumber) {
      const { rows } = await query(
        'SELECT COALESCE(MAX(list_number), 0) + 1 AS next FROM students WHERE group_id = $1',
        [groupId],
      );
      listNumber = Number(rows[0].next);
    }

    const { rows } = await query(
      `INSERT INTO students (group_id, full_name, list_number, access_code, guardian_name, guardian_phone)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''))
       RETURNING *`,
      [groupId, fullName, listNumber, generateAccessCode(), guardianName ?? '', guardianPhone ?? ''],
    );
    res.status(201).json({ student: mapStudent(rows[0]) });
  } catch (error) {
    next(error);
  }
});

const updateSchema = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  listNumber: z.coerce.number().int().positive().optional(),
  guardianName: z.string().trim().max(120).nullable().optional(),
  guardianPhone: z.string().trim().max(30).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.patch('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const { fullName, listNumber, guardianName, guardianPhone, isActive } = req.body;
    const { rows } = await query(
      `UPDATE students SET
         full_name      = COALESCE($2, full_name),
         list_number    = COALESCE($3, list_number),
         guardian_name  = COALESCE(NULLIF($4, ''), guardian_name),
         guardian_phone = COALESCE(NULLIF($5, ''), guardian_phone),
         is_active      = COALESCE($6, is_active)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, fullName ?? null, listNumber ?? null, guardianName ?? '', guardianPhone ?? '', isActive ?? null],
    );
    if (rows.length === 0) throw notFound('Alumno no encontrado.');
    res.json({ student: mapStudent(rows[0]) });
  } catch (error) {
    next(error);
  }
});

/** Regenera el codigo de acceso, por ejemplo si el padre lo perdio o se filtro. */
router.post('/:id/access-code', async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE students SET access_code = $2 WHERE id = $1 RETURNING *',
      [req.params.id, generateAccessCode()],
    );
    if (rows.length === 0) throw notFound('Alumno no encontrado.');
    res.json({ student: mapStudent(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      'UPDATE students SET is_active = FALSE WHERE id = $1 RETURNING id',
      [req.params.id],
    );
    if (rows.length === 0) throw notFound('Alumno no encontrado.');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
