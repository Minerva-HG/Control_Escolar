import { config } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }

  if (error?.code === '23505') {
    return res.status(409).json({ error: 'El registro ya existe.' });
  }
  if (error?.code === '23503') {
    return res.status(409).json({ error: 'El registro esta referenciado por otros datos.' });
  }

  console.error('[error]', error);
  res.status(500).json({
    error: 'Ocurrio un error inesperado en el servidor.',
    details: config.isProduction ? undefined : error?.message,
  });
}
