import { forbidden, unauthorized } from '../lib/http-error.js';
import { PARENT_COOKIE, TEACHER_COOKIE, verifyToken } from '../lib/tokens.js';

function readSession(req, cookieName, expectedType) {
  const token = req.cookies?.[cookieName];
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return payload.type === expectedType ? payload : null;
  } catch {
    return null;
  }
}

export function requireTeacher(req, _res, next) {
  const session = readSession(req, TEACHER_COOKIE, 'teacher');
  if (!session) return next(unauthorized('Inicie sesion como docente para continuar.'));
  req.teacher = session;
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.teacher?.role !== 'admin') return next(forbidden('Solo un administrador puede realizar esta accion.'));
  next();
}

export function requireParent(req, _res, next) {
  const session = readSession(req, PARENT_COOKIE, 'parent');
  if (!session) return next(unauthorized('Ingrese el codigo de acceso de su hijo(a) para continuar.'));
  req.parent = session;
  next();
}

export function optionalTeacher(req, _res, next) {
  req.teacher = readSession(req, TEACHER_COOKIE, 'teacher') ?? undefined;
  next();
}
