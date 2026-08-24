/**
 * Catalogos compartidos entre la API y la interfaz.
 * `score` alimenta el indicador de desempeno que ve el padre de familia (0 a 100).
 */

export const ATTENDANCE = {
  presente: { label: 'Presente', tone: 'good', score: 100 },
  retardo: { label: 'Retardo', tone: 'warn', score: 70 },
  justificado: { label: 'Falta justificada', tone: 'neutral', score: null },
  ausente: { label: 'Ausente', tone: 'bad', score: 0 },
};

export const HOMEWORK = {
  entrego: { label: 'Entrego', tone: 'good', score: 100 },
  incompleta: { label: 'Incompleta', tone: 'warn', score: 60 },
  no_entrego: { label: 'No entrego', tone: 'bad', score: 0 },
  sin_tarea: { label: 'Sin tarea asignada', tone: 'neutral', score: null },
};

export const CLASSWORK = {
  trabajo: { label: 'Trabajo en clase', tone: 'good', score: 100 },
  parcial: { label: 'Trabajo parcial', tone: 'warn', score: 60 },
  no_trabajo: { label: 'No trabajo', tone: 'bad', score: 0 },
};

export const CONDUCT = {
  excelente: { label: 'Excelente', tone: 'good', score: 100 },
  buena: { label: 'Buena', tone: 'good', score: 85 },
  regular: { label: 'Regular', tone: 'warn', score: 60 },
  debe_mejorar: { label: 'Debe mejorar', tone: 'bad', score: 30 },
};

export const CATALOGS = { attendance: ATTENDANCE, homework: HOMEWORK, classwork: CLASSWORK, conduct: CONDUCT };

export const PRIORITIES = {
  informativa: { label: 'Informativa', tone: 'neutral' },
  importante: { label: 'Importante', tone: 'warn' },
  urgente: { label: 'Urgente', tone: 'bad' },
};

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

export function weekdayFromISO(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** Promedio de los criterios evaluables de un registro; ignora los valores neutros. */
export function recordScore(record) {
  const values = [
    ATTENDANCE[record.attendance]?.score,
    HOMEWORK[record.homework]?.score,
    CLASSWORK[record.classwork]?.score,
    CONDUCT[record.conduct]?.score,
  ].filter((value) => typeof value === 'number');

  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
