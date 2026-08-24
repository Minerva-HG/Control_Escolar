import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { unauthorized } from '../lib/http-error.js';
import { TEACHER_COOKIE, clearSessionCookie, setSessionCookie } from '../lib/tokens.js';
import { requireTeacher } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesion. Espere unos minutos.' },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo electronico no valido.'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres.'),
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { rows } = await query(
      `SELECT t.id, t.full_name, t.email, t.password_hash, t.role, t.is_active,
              (SELECT g.id FROM groups g WHERE g.teacher_id = t.id ORDER BY g.id LIMIT 1) AS group_id
       FROM teachers t WHERE t.email = $1`,
      [email],
    );

    const teacher = rows[0];
    const passwordMatches = teacher ? await bcrypt.compare(password, teacher.password_hash) : false;

    if (!teacher || !teacher.is_active || !passwordMatches) {
      throw unauthorized('Correo o contrasena incorrectos.');
    }

    setSessionCookie(res, TEACHER_COOKIE, {
      type: 'teacher',
      sub: teacher.id,
      name: teacher.full_name,
      role: teacher.role,
      groupId: teacher.group_id,
    });

    res.json({
      teacher: { id: teacher.id, fullName: teacher.full_name, email: teacher.email, role: teacher.role },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res, TEACHER_COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireTeacher, (req, res) => {
  res.json({
    teacher: { id: req.teacher.sub, fullName: req.teacher.name, role: req.teacher.role },
  });
});

export default router;
