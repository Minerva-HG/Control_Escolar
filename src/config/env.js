import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const jwtSecret = required('JWT_SECRET', isProduction ? undefined : 'desarrollo_secreto_local_no_usar_en_produccion');

if (isProduction && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres en produccion.');
}

export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  jwtSecret,
  sessionHours: Number(process.env.SESSION_HOURS ?? 12),
  db: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: required('POSTGRES_DB', 'control_seguimiento'),
    user: required('POSTGRES_USER', 'seguimiento'),
    password: required('POSTGRES_PASSWORD', 'seguimiento'),
  },
  seed: {
    teacherName: process.env.SEED_TEACHER_NAME ?? 'Maestra Titular',
    teacherEmail: (process.env.SEED_TEACHER_EMAIL ?? 'maestra@escuela.mx').toLowerCase(),
    teacherPassword: process.env.SEED_TEACHER_PASSWORD ?? 'Escuela2026!',
  },
  school: {
    name: process.env.SCHOOL_NAME ?? 'Escuela Ramon Corona',
    cycle: process.env.SCHOOL_CYCLE ?? '2026 - 2027',
  },
};
