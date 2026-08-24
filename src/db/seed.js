import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { generateAccessCode } from '../lib/codes.js';
import { pool, waitForDatabase, withTransaction } from './pool.js';
import { runMigrations } from './migrate.js';

const STUDENT_NAMES = [
  'Diego Ahumada', 'Gael Alexander', 'Diego Sebastian', 'Cristofer Tadeo',
  'Abraham Mateo', 'Zarayry Noemi', 'Magaly Hernandez', 'Ana Victoria',
  'Barbara Eunice', 'Sheyla Itzel', 'Dayana Maite', 'Alexis Damian',
  'Eva Romina', 'Daniel Lopez', 'Luis Alonso', 'Ambar Isabelle',
  'Marco Antonio', 'Lydia Vanessa', 'Keylor Damian', 'Ximena Danae',
  'Tania Esmeralda', 'Salvador Roman', 'Esmeralda Ruiz', 'Sebastian Valdez',
  'Ashley Ximena', 'Jade Monserrat',
];

const GROUP_NAME = '4to A';

async function seedTeacher(client) {
  const passwordHash = await bcrypt.hash(config.seed.teacherPassword, 12);
  const { rows } = await client.query(
    `INSERT INTO teachers (full_name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id, email`,
    [config.seed.teacherName, config.seed.teacherEmail, passwordHash],
  );
  return rows[0];
}

async function seedGroup(client, teacherId) {
  const { rows } = await client.query(
    `INSERT INTO groups (name, cycle, teacher_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (name, cycle) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
     RETURNING id, name, cycle`,
    [GROUP_NAME, config.school.cycle, teacherId],
  );
  return rows[0];
}

async function seedStudents(client, groupId) {
  const created = [];
  for (const [index, fullName] of STUDENT_NAMES.entries()) {
    const { rows } = await client.query(
      `INSERT INTO students (group_id, full_name, list_number, access_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (group_id, list_number) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id, full_name, list_number, access_code`,
      [groupId, fullName, index + 1, generateAccessCode()],
    );
    created.push(rows[0]);
  }
  return created;
}

/** Genera historial de los ultimos dias habiles para poder demostrar el portal de padres. */
async function seedDemoRecords(client, students, teacherId, weekdays = 12) {
  const attendance = ['presente', 'presente', 'presente', 'presente', 'retardo', 'ausente'];
  const homework = ['entrego', 'entrego', 'entrego', 'incompleta', 'no_entrego', 'sin_tarea'];
  const classwork = ['trabajo', 'trabajo', 'trabajo', 'parcial', 'no_trabajo'];
  const conduct = ['excelente', 'excelente', 'buena', 'buena', 'regular', 'debe_mejorar'];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  const dates = [];
  const cursor = new Date();
  while (dates.length < weekdays) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let inserted = 0;
  for (const date of dates) {
    for (const student of students) {
      const result = await client.query(
        `INSERT INTO daily_records
           (student_id, record_date, attendance, homework, classwork, conduct, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (student_id, record_date) DO NOTHING`,
        [
          student.id, date, pick(attendance), pick(homework), pick(classwork), pick(conduct),
          Math.random() < 0.12 ? 'Participo muy bien en la clase de lectura.' : null,
          teacherId,
        ],
      );
      inserted += result.rowCount;
    }
  }
  return inserted;
}

async function seedAnnouncement(client, groupId, teacherId) {
  const { rowCount } = await client.query('SELECT 1 FROM announcements WHERE group_id = $1 LIMIT 1', [groupId]);
  if (rowCount > 0) return;
  await client.query(
    `INSERT INTO announcements (group_id, title, body, priority, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      groupId,
      'Bienvenidos al portal de seguimiento',
      'Estimados padres de familia: en este portal podran consultar diariamente las tareas, '
        + 'el trabajo en clase y la conducta de su hijo(a) usando el codigo de acceso entregado en la junta.',
      'importante',
      teacherId,
    ],
  );
}

export async function seed({ demo = false } = {}) {
  await waitForDatabase();
  await runMigrations();

  const summary = await withTransaction(async (client) => {
    const teacher = await seedTeacher(client);
    const group = await seedGroup(client, teacher.id);
    const students = await seedStudents(client, group.id);
    await seedAnnouncement(client, group.id, teacher.id);
    const records = demo ? await seedDemoRecords(client, students, teacher.id) : 0;
    return { teacher, group, students, records };
  });

  console.log(`[seed] docente: ${summary.teacher.email}`);
  console.log(`[seed] grupo: ${summary.group.name} (${summary.group.cycle})`);
  console.log(`[seed] alumnos: ${summary.students.length}`);
  if (demo) console.log(`[seed] registros de demostracion: ${summary.records}`);
  console.log('[seed] codigos de acceso para padres:');
  for (const student of summary.students) {
    console.log(`  ${String(student.list_number).padStart(2, '0')}. ${student.full_name.padEnd(20)} ${student.access_code}`);
  }
  return summary;
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  try {
    await seed({ demo: process.argv.includes('--demo') });
  } catch (error) {
    console.error('[seed] error:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
