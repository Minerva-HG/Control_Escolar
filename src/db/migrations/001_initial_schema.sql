-- Esquema inicial de la plataforma de control y seguimiento escolar.

CREATE TABLE teachers (
  id            SERIAL PRIMARY KEY,
  full_name     TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE groups (
  id         SERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  cycle      TEXT        NOT NULL,
  teacher_id INTEGER     REFERENCES teachers (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, cycle)
);

CREATE TABLE students (
  id            SERIAL PRIMARY KEY,
  group_id      INTEGER     NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  list_number   INTEGER     NOT NULL,
  access_code   TEXT        NOT NULL UNIQUE,
  guardian_name TEXT,
  guardian_phone TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, list_number)
);

CREATE INDEX students_group_idx ON students (group_id, list_number);

CREATE TABLE daily_records (
  id          SERIAL PRIMARY KEY,
  student_id  INTEGER     NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  record_date DATE        NOT NULL,
  attendance  TEXT        NOT NULL DEFAULT 'presente'
              CHECK (attendance IN ('presente', 'retardo', 'ausente', 'justificado')),
  homework    TEXT        NOT NULL DEFAULT 'entrego'
              CHECK (homework IN ('entrego', 'incompleta', 'no_entrego', 'sin_tarea')),
  classwork   TEXT        NOT NULL DEFAULT 'trabajo'
              CHECK (classwork IN ('trabajo', 'parcial', 'no_trabajo')),
  conduct     TEXT        NOT NULL DEFAULT 'excelente'
              CHECK (conduct IN ('excelente', 'buena', 'regular', 'debe_mejorar')),
  notes       TEXT,
  created_by  INTEGER     REFERENCES teachers (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at     TIMESTAMPTZ,
  UNIQUE (student_id, record_date)
);

CREATE INDEX daily_records_student_date_idx ON daily_records (student_id, record_date DESC);
CREATE INDEX daily_records_date_idx ON daily_records (record_date DESC);

CREATE TABLE announcements (
  id         SERIAL PRIMARY KEY,
  group_id   INTEGER     NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  priority   TEXT        NOT NULL DEFAULT 'informativa'
             CHECK (priority IN ('informativa', 'importante', 'urgente')),
  created_by INTEGER     REFERENCES teachers (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX announcements_group_idx ON announcements (group_id, created_at DESC);

-- Bitacora de accesos del portal de padres, usada para auditoria y limites de intentos.
CREATE TABLE access_logs (
  id         SERIAL PRIMARY KEY,
  student_id INTEGER     REFERENCES students (id) ON DELETE SET NULL,
  ip_address TEXT,
  success    BOOLEAN     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX access_logs_created_idx ON access_logs (created_at DESC);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER students_touch_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER daily_records_touch_updated_at
  BEFORE UPDATE ON daily_records
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
