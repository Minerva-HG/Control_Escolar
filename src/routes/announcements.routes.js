import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { PRIORITIES } from '../lib/catalogs.js';
import { notFound } from '../lib/http-error.js';
import { requireTeacher } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(requireTeacher);

const listSchema = z.object({ groupId: z.coerce.number().int().positive() });

router.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.title, a.body, a.priority, a.created_at, t.full_name AS author
       FROM announcements a
       LEFT JOIN teachers t ON t.id = a.created_by
       WHERE a.group_id = $1
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [req.validatedQuery.groupId],
    );
    res.json({ announcements: rows });
  } catch (error) {
    next(error);
  }
});

const createSchema = z.object({
  groupId: z.coerce.number().int().positive(),
  title: z.string().trim().min(3, 'El titulo es obligatorio.').max(120),
  body: z.string().trim().min(5, 'El mensaje es obligatorio.').max(2000),
  priority: z.enum(Object.keys(PRIORITIES)).default('informativa'),
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { groupId, title, body, priority } = req.body;
    const { rows } = await query(
      `INSERT INTO announcements (group_id, title, body, priority, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, body, priority, created_at`,
      [groupId, title, body, priority, req.teacher.sub],
    );
    res.status(201).json({ announcement: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM announcements WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) throw notFound('Aviso no encontrado.');
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
