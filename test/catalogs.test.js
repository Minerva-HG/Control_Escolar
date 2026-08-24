import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOGS, recordScore, weekdayFromISO } from '../src/lib/catalogs.js';
import { generateAccessCode, normalizeAccessCode } from '../src/lib/codes.js';

test('recordScore promedia solo los criterios evaluables', () => {
  const perfect = { attendance: 'presente', homework: 'entrego', classwork: 'trabajo', conduct: 'excelente' };
  assert.equal(recordScore(perfect), 100);

  const worst = { attendance: 'ausente', homework: 'no_entrego', classwork: 'no_trabajo', conduct: 'debe_mejorar' };
  assert.equal(recordScore(worst), 8);
});

test('recordScore ignora los valores neutros', () => {
  const withoutHomework = {
    attendance: 'presente', homework: 'sin_tarea', classwork: 'trabajo', conduct: 'excelente',
  };
  assert.equal(recordScore(withoutHomework), 100);

  const justified = {
    attendance: 'justificado', homework: 'sin_tarea', classwork: 'trabajo', conduct: 'buena',
  };
  assert.equal(recordScore(justified), 93);
});

test('recordScore devuelve null cuando no hay criterios evaluables', () => {
  assert.equal(recordScore({ attendance: 'x', homework: 'y', classwork: 'z', conduct: 'w' }), null);
});

test('weekdayFromISO no se desplaza por zona horaria', () => {
  assert.equal(weekdayFromISO('2026-08-24'), 'Lunes');
  assert.equal(weekdayFromISO('2026-01-01'), 'Jueves');
});

test('cada opcion de catalogo tiene etiqueta y tono', () => {
  for (const catalog of Object.values(CATALOGS)) {
    for (const option of Object.values(catalog)) {
      assert.ok(option.label.length > 0);
      assert.ok(['good', 'warn', 'bad', 'neutral'].includes(option.tone));
    }
  }
});

test('normalizeAccessCode limpia espacios, guiones y minusculas', () => {
  assert.equal(normalizeAccessCode(' ab-c 123 '), 'ABC123');
  assert.equal(normalizeAccessCode(null), '');
});

test('generateAccessCode evita caracteres ambiguos', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateAccessCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[A-HJ-KM-NP-Z2-9]+$/);
  }
});
