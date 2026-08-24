import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { pool } from './db/pool.js';
import { CATALOGS, PRIORITIES } from './lib/catalogs.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import announcementsRoutes from './routes/announcements.routes.js';
import authRoutes from './routes/auth.routes.js';
import groupsRoutes from './routes/groups.routes.js';
import parentRoutes from './routes/parent.routes.js';
import recordsRoutes from './routes/records.routes.js';
import studentsRoutes from './routes/students.routes.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  if (!config.isProduction) app.use(morgan('dev'));
  else app.use(morgan('combined'));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up', uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.get('/api/meta', (_req, res) => {
    res.json({ school: config.school, catalogs: CATALOGS, priorities: PRIORITIES });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/groups', groupsRoutes);
  app.use('/api/students', studentsRoutes);
  app.use('/api/records', recordsRoutes);
  app.use('/api/announcements', announcementsRoutes);
  app.use('/api/parent', parentRoutes);

  app.use(express.static(publicDir, { extensions: ['html'], maxAge: config.isProduction ? '1h' : 0 }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
