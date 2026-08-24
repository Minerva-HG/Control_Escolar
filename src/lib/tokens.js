import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export const TEACHER_COOKIE = 'cs_docente';
export const PARENT_COOKIE = 'cs_familia';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  path: '/',
  maxAge: config.sessionHours * 60 * 60 * 1000,
};

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function setSessionCookie(res, name, payload) {
  res.cookie(name, signToken(payload), cookieOptions);
}

export function clearSessionCookie(res, name) {
  res.clearCookie(name, { ...cookieOptions, maxAge: undefined });
}
