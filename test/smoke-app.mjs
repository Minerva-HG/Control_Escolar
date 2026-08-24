/**
 * Comprobacion sin base de datos: valida que la aplicacion se construye,
 * que las rutas publicas responden y que las privadas exigen sesion.
 * Uso: node test/smoke-app.mjs
 */
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const app = createApp();
const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const checks = [];
const check = async (label, fn) => {
  try {
    await fn();
    checks.push(`ok   ${label}`);
  } catch (error) {
    checks.push(`FALLA ${label}: ${error.message}`);
    process.exitCode = 1;
  }
};

await check('GET / entrega la portada', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Padres de familia/);
});

await check('GET /padres.html entrega el portal de padres', async () => {
  assert.equal((await fetch(`${base}/padres.html`)).status, 200);
});

await check('GET /docente.html entrega el panel docente', async () => {
  assert.equal((await fetch(`${base}/docente.html`)).status, 200);
});

await check('GET /css/styles.css y /js/core.js existen', async () => {
  assert.equal((await fetch(`${base}/css/styles.css`)).status, 200);
  assert.equal((await fetch(`${base}/js/core.js`)).status, 200);
});

await check('GET /api/meta expone escuela y catalogos', async () => {
  const payload = await (await fetch(`${base}/api/meta`)).json();
  assert.ok(payload.school.name);
  assert.ok(payload.catalogs.attendance.presente.label);
  assert.ok(payload.catalogs.conduct.debe_mejorar.label);
});

await check('GET /api/parent/summary sin sesion responde 401', async () => {
  assert.equal((await fetch(`${base}/api/parent/summary`)).status, 401);
});

await check('GET /api/groups sin sesion responde 401', async () => {
  assert.equal((await fetch(`${base}/api/groups`)).status, 401);
});

await check('POST /api/auth/login con datos invalidos responde 400', async () => {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'no-es-correo', password: '1' }),
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.details) && payload.details.length === 2);
});

await check('POST /api/parent/session con codigo vacio responde 400', async () => {
  const response = await fetch(`${base}/api/parent/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: '' }),
  });
  assert.equal(response.status, 400);
});

await check('ruta inexistente responde 404 en JSON', async () => {
  const response = await fetch(`${base}/api/no-existe`);
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /Ruta no encontrada/);
});

await check('cabeceras de seguridad presentes', async () => {
  const response = await fetch(`${base}/`);
  assert.ok(response.headers.get('content-security-policy'));
  assert.equal(response.headers.get('x-powered-by'), null);
});

console.log(checks.join('\n'));
server.close();
