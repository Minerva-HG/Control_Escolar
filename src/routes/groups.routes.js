import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireTeacher } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config/env.js';

const router = Router();

router.use(requireTeacher);

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT g.id, g.name, g.cycle,
              COUNT(s.id) FILTER (WHERE s.is_active) AS student_count
       FROM groups g
       LEFT JOIN students s ON s.group_id = g.id
       GROUP BY g.id
       ORDER BY g.cycle DESC, g.name`,
    );
    res.json({
      groups: rows.map((row) => ({
        id: row.id,
        name: row.name,
        cycle: row.cycle,
        studentCount: Number(row.student_count),
      })),
    });
  } catch (error) {
    next(error);
  }
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'El nombre del grupo es obligatorio.').max(60),
  cycle: z.string().trim().min(4).max(30).default(config.school.cycle),
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { rows } = await query(
      `INSERT INTO groups (name, cycle, teacher_id) VALUES ($1, $2, $3)
       RETURNING id, name, cycle`,
      [req.body.name, req.body.cycle, req.teacher.sub],
    );
    res.status(201).json({ group: rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
