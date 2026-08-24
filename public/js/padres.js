import {
  $, $$, api, applySchoolBranding, clear, el, formatDate, formatDateTime,
  loadMeta, percent, scoreTone, sparkline, toast,
} from '/js/core.js';

let catalogs = null;
let filters = {};

const TONE_COLORS = { good: 'var(--green-600)', warn: 'var(--amber-600)', bad: 'var(--red-600)', neutral: 'var(--ink-300)' };

function badge(kind, value) {
  const item = catalogs?.[kind]?.[value];
  if (!item) return el('span', { class: 'badge badge--neutral', text: value });
  return el('span', { class: `badge badge--${item.tone}`, text: item.label });
}

function statCard({ label, value, hint, tone = '' }) {
  return el('div', { class: `stat ${tone ? `stat--${tone}` : ''}` }, [
    el('div', { class: 'stat__label', text: label }),
    el('div', { class: 'stat__value', text: value }),
    hint ? el('div', { class: 'stat__hint', text: hint }) : null,
  ]);
}

function renderStats(totals) {
  const host = clear($('#stats'));
  const total = totals.total;

  if (total === 0) {
    host.append(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: '📋' }),
      el('p', { text: 'Aun no hay registros capturados para su hijo(a).' }),
    ]));
    return;
  }

  const attendance = percent(totals.presentes + totals.retardos, total);
  const homework = percent(totals.tareas_ok, total);
  const classwork = percent(totals.trabajo_ok, total);
  const conduct = percent(totals.conducta_ok, total);

  host.append(
    statCard({
      label: 'Asistencia', value: `${attendance}%`,
      hint: `${totals.ausencias} ausencia(s), ${totals.retardos} retardo(s)`,
      tone: scoreTone(attendance),
    }),
    statCard({
      label: 'Tareas entregadas', value: `${homework}%`,
      hint: `${totals.tareas_no} sin entregar, ${totals.tareas_incompletas} incompleta(s)`,
      tone: scoreTone(homework),
    }),
    statCard({
      label: 'Trabajo en clase', value: `${classwork}%`,
      hint: `${totals.trabajo_no} dia(s) sin trabajar`,
      tone: scoreTone(classwork),
    }),
    statCard({
      label: 'Conducta favorable', value: `${conduct}%`,
      hint: `${totals.conducta_baja} dia(s) por mejorar`,
      tone: scoreTone(conduct),
    }),
    statCard({ label: 'Dias registrados', value: total, hint: `${totals.sin_revisar} sin revisar por usted` }),
  );
}

function renderScore(score) {
  const ring = $('#score-ring');
  const tone = scoreTone(score);
  ring.style.setProperty('--value', score ?? 0);
  ring.style.setProperty('--ring-color', TONE_COLORS[tone]);
  $('#score-value').textContent = score === null ? '--' : score;
  $('#score-hint').textContent = score === null
    ? 'El indicador aparecera cuando existan registros.'
    : {
        good: 'Excelente desempeno general. Felicidades.',
        warn: 'Desempeno aceptable, hay aspectos por reforzar en casa.',
        bad: 'Se recomienda acercarse con la maestra para apoyar a su hijo(a).',
      }[tone];
}

function renderTrend(points) {
  const host = clear($('#trend'));
  if (points.length === 0) {
    host.append(el('p', { class: 'muted small', text: 'Sin datos suficientes para mostrar la tendencia.' }));
    return;
  }
  host.append(sparkline(points));
  host.append(el('div', { class: 'small muted', style: 'display:flex;justify-content:space-between;margin-top:6px;' }, [
    el('span', { text: formatDate(points[0].date) }),
    el('span', { text: formatDate(points[points.length - 1].date) }),
  ]));
}

function dayCard(record) {
  const tone = scoreTone(record.score);
  const card = el('li', { class: `day day--${tone}`, dataset: { id: record.id } }, [
    el('div', { class: 'day__head' }, [
      el('span', { class: 'day__date', text: formatDate(record.date) }),
      el('span', { class: 'day__weekday', text: record.weekday }),
      el('span', { class: 'day__score', text: record.score === null ? '' : `${record.score} pts` }),
    ]),
    el('div', { class: 'day__badges' }, [
      badge('attendance', record.attendance),
      badge('homework', record.homework),
      badge('classwork', record.classwork),
      badge('conduct', record.conduct),
    ]),
    record.notes ? el('p', { class: 'day__note' }, [el('strong', { text: 'Observacion: ' }), record.notes]) : null,
  ]);

  const foot = el('div', { class: 'day__foot' });
  if (record.seenAt) {
    foot.append(el('span', { class: 'badge badge--neutral', text: `Leido el ${formatDateTime(record.seenAt)}` }));
  } else {
    const button = el('button', { class: 'btn btn--ghost btn--sm', text: 'Marcar como leido' });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/parent/records/${record.id}/seen`, { method: 'POST' });
        record.seenAt = new Date().toISOString();
        card.replaceWith(dayCard(record));
        refreshSummary();
      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
      }
    });
    foot.append(button);
  }
  if (record.teacherName) foot.append(el('span', { text: `Registrado por ${record.teacherName}` }));
  card.append(foot);

  return card;
}

function renderTimeline(records) {
  const host = clear($('#timeline'));
  if (records.length === 0) {
    host.append(el('li', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: '🗓️' }),
      el('p', { text: 'No hay registros en el periodo seleccionado.' }),
    ]));
    return;
  }
  for (const record of records) host.append(dayCard(record));
}

function renderAnnouncements(items) {
  const host = clear($('#announcements'));
  if (items.length === 0) {
    host.append(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: '📣' }),
      el('p', { text: 'La maestra no ha publicado avisos.' }),
    ]));
    return;
  }
  for (const item of items) {
    host.append(el('article', { class: `notice notice--${item.priority}` }, [
      el('div', { class: 'notice__title', text: item.title }),
      el('div', { class: 'notice__meta', text: `${item.author ?? 'Docente'} · ${formatDateTime(item.created_at)}` }),
      el('p', { class: 'notice__body', text: item.body }),
    ]));
  }
}

async function refreshSummary() {
  const data = await api('/parent/summary');
  $('#student-name').textContent = data.student.fullName;
  $('#student-meta').textContent = [
    `Grupo ${data.student.groupName}`,
    `Ciclo ${data.student.cycle}`,
    data.student.teacherName ? `Maestra: ${data.student.teacherName}` : null,
    `Lista N° ${data.student.listNumber}`,
  ].filter(Boolean).join(' · ');
  $('#parent-name').textContent = data.student.fullName;

  const pending = clear($('#pending-badge'));
  if (data.totals.sin_revisar > 0) {
    pending.append(el('span', { class: 'badge badge--warn', text: `${data.totals.sin_revisar} reporte(s) sin leer` }));
  }

  renderStats(data.totals);
  renderScore(data.overallScore);
  renderTrend(data.trend);
  renderAnnouncements(data.announcements);
}

async function refreshRecords() {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  const data = await api(`/parent/records${query ? `?${query}` : ''}`);
  renderTimeline(data.records);
}

function showReport() {
  $('#view-access').classList.add('hidden');
  $('#view-report').classList.remove('hidden');
  for (const id of ['#parent-name', '#btn-logout', '#btn-export', '#btn-print']) $(id).classList.remove('hidden');
}

function showAccess() {
  $('#view-report').classList.add('hidden');
  $('#view-access').classList.remove('hidden');
  for (const id of ['#parent-name', '#btn-logout', '#btn-export', '#btn-print']) $(id).classList.add('hidden');
}

async function loadPortal() {
  await Promise.all([refreshSummary(), refreshRecords()]);
  showReport();
}

function wireEvents() {
  $('#form-access').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#btn-access');
    const errorBox = $('#access-error');
    errorBox.classList.add('hidden');
    button.disabled = true;
    button.replaceChildren(el('span', { class: 'spinner' }));
    try {
      await api('/parent/session', { method: 'POST', body: { accessCode: $('#access-code').value } });
      await loadPortal();
      toast('Bienvenido(a). Este es el reporte de su hijo(a).');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.textContent = 'Consultar reporte';
    }
  });

  $('#access-code').addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  $('#btn-logout').addEventListener('click', async () => {
    await api('/parent/logout', { method: 'POST' });
    $('#access-code').value = '';
    showAccess();
  });

  $('#btn-export').addEventListener('click', () => { window.location.href = '/api/parent/export.csv'; });
  $('#btn-print').addEventListener('click', () => window.print());

  $('#btn-filter').addEventListener('click', async () => {
    filters = { from: $('#filter-from').value || undefined, to: $('#filter-to').value || undefined };
    try { await refreshRecords(); } catch (error) { toast(error.message, 'error'); }
  });

  $('#btn-clear-filter').addEventListener('click', async () => {
    filters = {};
    $('#filter-from').value = '';
    $('#filter-to').value = '';
    try { await refreshRecords(); } catch (error) { toast(error.message, 'error'); }
  });

  $('#btn-seen-all').addEventListener('click', async () => {
    try {
      const result = await api('/parent/records/seen-all', { method: 'POST' });
      toast(result.updated > 0 ? `${result.updated} reporte(s) marcados como leidos.` : 'No habia reportes pendientes.');
      await Promise.all([refreshSummary(), refreshRecords()]);
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  for (const tab of $$('.tab')) {
    tab.addEventListener('click', () => {
      for (const other of $$('.tab')) other.classList.toggle('is-active', other === tab);
      for (const panel of ['panel-diario', 'panel-avisos']) {
        $(`#${panel}`).classList.toggle('hidden', panel !== tab.dataset.panel);
      }
    });
  }
}

async function init() {
  const meta = await loadMeta().catch(() => null);
  if (meta) {
    catalogs = meta.catalogs;
    applySchoolBranding(meta);
  }
  wireEvents();

  // Si la cookie de sesion sigue vigente se entra directo al reporte.
  try {
    await loadPortal();
  } catch {
    showAccess();
  }
}

init();
