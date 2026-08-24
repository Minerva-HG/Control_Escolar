import {
  $, $$, api, applySchoolBranding, clear, el, formatDate, formatDateTime,
  loadMeta, percent, scoreTone, toast, todayISO,
} from '/js/core.js';

const state = {
  catalogs: null,
  groups: [],
  groupId: null,
  dayRows: [],
};

const DEFAULTS = { attendance: 'presente', homework: 'entrego', classwork: 'trabajo', conduct: 'excelente' };

const PRESETS = {
  'todos-bien': { attendance: 'presente', homework: 'entrego', classwork: 'trabajo', conduct: 'excelente' },
  'sin-tarea': { homework: 'sin_tarea' },
  limpiar: DEFAULTS,
};

function catalogSelect(kind, studentId, value) {
  const options = Object.entries(state.catalogs[kind]).map(([key, item]) =>
    el('option', { value: key, selected: key === value, text: item.label }));
  return el('select', { dataset: { kind, studentId }, 'aria-label': kind }, options);
}

function renderDay(data) {
  state.dayRows = data.rows;
  $('#registro-meta').textContent = `${data.weekday}, ${formatDate(data.date)}`;

  const body = clear($('#records-body'));
  if (data.rows.length === 0) {
    body.append(el('tr', {}, [el('td', { colspan: 8, class: 'empty', text: 'El grupo no tiene alumnos activos.' })]));
    return;
  }

  for (const row of data.rows) {
    const record = row.record ?? {};
    let status;
    if (!row.record) status = el('span', { class: 'badge badge--neutral', text: 'Sin capturar' });
    else if (record.seenAt) status = el('span', { class: 'badge badge--good', text: 'Leido por el padre' });
    else status = el('span', { class: 'badge badge--info', text: 'Guardado' });

    body.append(el('tr', {}, [
      el('td', { class: 'num', text: row.listNumber }),
      el('td', {}, [el('strong', { text: row.fullName })]),
      el('td', {}, [catalogSelect('attendance', row.studentId, record.attendance ?? DEFAULTS.attendance)]),
      el('td', {}, [catalogSelect('homework', row.studentId, record.homework ?? DEFAULTS.homework)]),
      el('td', {}, [catalogSelect('classwork', row.studentId, record.classwork ?? DEFAULTS.classwork)]),
      el('td', {}, [catalogSelect('conduct', row.studentId, record.conduct ?? DEFAULTS.conduct)]),
      el('td', {}, [el('input', {
        dataset: { kind: 'notes', studentId: row.studentId },
        value: record.notes ?? '', maxlength: 500, placeholder: 'Opcional',
        style: 'min-width:170px;font-size:.85rem;padding:6px 8px;',
      })]),
      el('td', {}, [status]),
    ]));
  }
}

async function loadDay() {
  const date = $('#record-date').value || todayISO();
  const data = await api(`/records/day?groupId=${state.groupId}&date=${date}`);
  renderDay(data);
}

function collectEntries() {
  const byStudent = new Map();
  for (const control of $$('#records-body [data-student-id]')) {
    const id = Number(control.dataset.studentId);
    const entry = byStudent.get(id) ?? { studentId: id };
    entry[control.dataset.kind] = control.value;
    byStudent.set(id, entry);
  }
  return [...byStudent.values()].map((entry) => ({ ...entry, notes: entry.notes?.trim() || null }));
}

async function saveDay() {
  const date = $('#record-date').value || todayISO();
  const entries = collectEntries();
  if (entries.length === 0) return toast('No hay alumnos para guardar.', 'error');
  const result = await api('/records/bulk', { method: 'POST', body: { date, entries } });
  toast(`${result.saved} registro(s) guardados para el ${formatDate(date)}.`);
  await loadDay();
}

function applyPreset() {
  const preset = PRESETS[$('#bulk-preset').value];
  if (!preset) return toast('Seleccione una accion rapida.', 'error');
  for (const [kind, value] of Object.entries(preset)) {
    for (const select of $$(`#records-body select[data-kind="${kind}"]`)) select.value = value;
  }
  toast('Accion aplicada. Revise y guarde los registros.');
}

function statCard(label, value, hint, tone) {
  return el('div', { class: `stat ${tone ? `stat--${tone}` : ''}` }, [
    el('div', { class: 'stat__label', text: label }),
    el('div', { class: 'stat__value', text: value }),
    hint ? el('div', { class: 'stat__hint', text: hint }) : null,
  ]);
}

async function loadStats() {
  const params = new URLSearchParams({ groupId: state.groupId });
  if ($('#stats-from').value) params.set('from', $('#stats-from').value);
  if ($('#stats-to').value) params.set('to', $('#stats-to').value);
  const data = await api(`/records/stats?${params}`);
  const totals = data.totals;

  const host = clear($('#stats-totals'));
  host.append(
    statCard('Registros', totals.registros, 'Total del periodo'),
    statCard('Ausencias', totals.ausencias, `${percent(totals.ausencias, totals.registros)}% de los registros`,
      totals.ausencias > 0 ? 'warn' : 'good'),
    statCard('Retardos', totals.retardos, null, totals.retardos > 0 ? 'warn' : 'good'),
    statCard('Tareas sin entregar', totals.sin_tarea, null, totals.sin_tarea > 0 ? 'bad' : 'good'),
    statCard('Conducta por mejorar', totals.conducta_baja, null, totals.conducta_baja > 0 ? 'warn' : 'good'),
    statCard('Revisados por padres', `${percent(totals.vistos, totals.registros)}%`,
      `${totals.vistos} de ${totals.registros}`, scoreTone(percent(totals.vistos, totals.registros))),
  );

  const body = clear($('#stats-body'));
  const flagged = data.students.filter((s) => s.absences > 0 || s.missingHomework > 0 || s.lowConduct > 0);
  if (flagged.length === 0) {
    body.append(el('tr', {}, [el('td', { colspan: 6, class: 'empty', text: 'Sin incidencias en el periodo. Excelente grupo.' })]));
    return;
  }
  for (const student of flagged) {
    body.append(el('tr', {}, [
      el('td', { class: 'num', text: student.listNumber }),
      el('td', {}, [el('strong', { text: student.fullName })]),
      el('td', { text: student.records }),
      el('td', {}, [el('span', { class: `badge badge--${student.absences > 2 ? 'bad' : 'warn'}`, text: student.absences })]),
      el('td', {}, [el('span', { class: `badge badge--${student.missingHomework > 2 ? 'bad' : 'warn'}`, text: student.missingHomework })]),
      el('td', {}, [el('span', { class: `badge badge--${student.lowConduct > 2 ? 'bad' : 'warn'}`, text: student.lowConduct })]),
    ]));
  }
}

async function loadStudents() {
  const data = await api(`/students?groupId=${state.groupId}`);
  const body = clear($('#students-body'));

  if (data.students.length === 0) {
    body.append(el('tr', {}, [el('td', { colspan: 6, class: 'empty', text: 'Todavia no hay alumnos registrados.' })]));
    return;
  }

  for (const student of data.students) {
    const regenerate = el('button', { class: 'btn btn--ghost btn--sm', text: 'Regenerar' });
    regenerate.addEventListener('click', async () => {
      if (!confirm(`Se invalidara el codigo actual de ${student.fullName}. ¿Continuar?`)) return;
      try {
        await api(`/students/${student.id}/access-code`, { method: 'POST' });
        toast('Codigo regenerado. Entreguelo al padre o tutor.');
        await loadStudents();
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    const remove = el('button', { class: 'btn btn--ghost btn--sm', text: 'Dar de baja' });
    remove.addEventListener('click', async () => {
      if (!confirm(`¿Dar de baja a ${student.fullName}? Su historial se conserva.`)) return;
      try {
        await api(`/students/${student.id}`, { method: 'DELETE' });
        toast('Alumno dado de baja.');
        await Promise.all([loadStudents(), loadDay()]);
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    body.append(el('tr', {}, [
      el('td', { class: 'num', text: student.listNumber }),
      el('td', {}, [el('strong', { text: student.fullName })]),
      el('td', {}, [el('span', { class: 'badge badge--info mono', text: student.accessCode })]),
      el('td', { text: student.guardianName ?? '—' }),
      el('td', { text: student.guardianPhone ?? '—' }),
      el('td', {}, [el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' }, [regenerate, remove])]),
    ]));
  }
}

async function loadAnnouncements() {
  const data = await api(`/announcements?groupId=${state.groupId}`);
  const host = clear($('#announcements-list'));

  if (data.announcements.length === 0) {
    host.append(el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon', text: '📣' }),
      el('p', { text: 'Aun no ha publicado avisos.' }),
    ]));
    return;
  }

  for (const item of data.announcements) {
    const remove = el('button', { class: 'btn btn--ghost btn--sm', text: 'Eliminar' });
    remove.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este aviso?')) return;
      try {
        await api(`/announcements/${item.id}`, { method: 'DELETE' });
        await loadAnnouncements();
      } catch (error) {
        toast(error.message, 'error');
      }
    });

    host.append(el('article', { class: `notice notice--${item.priority}` }, [
      el('div', { style: 'display:flex;align-items:flex-start;gap:10px;' }, [
        el('div', { style: 'flex:1;' }, [
          el('div', { class: 'notice__title', text: item.title }),
          el('div', { class: 'notice__meta', text: `${item.author ?? 'Docente'} · ${formatDateTime(item.created_at)}` }),
          el('p', { class: 'notice__body', text: item.body }),
        ]),
        remove,
      ]),
    ]));
  }
}

function printCodes() {
  const rows = $$('#students-body tr').map((tr) => {
    const cells = tr.querySelectorAll('td');
    return cells.length >= 3 ? `<tr><td>${cells[0].textContent}</td><td>${cells[1].textContent}</td><td><b>${cells[2].textContent}</b></td></tr>` : '';
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Codigos de acceso</title>
    <style>body{font-family:Segoe UI,sans-serif;padding:24px}h1{font-size:18px}
    table{width:100%;border-collapse:collapse;font-size:14px}
    td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#eee}</style></head>
    <body><h1>Codigos de acceso para padres de familia</h1>
    <table><thead><tr><th>N°</th><th>Alumno</th><th>Codigo</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`);
  win.document.close();
  win.print();
}

async function loadGroups() {
  const data = await api('/groups');
  state.groups = data.groups;
  const select = clear($('#group-select'));
  for (const group of data.groups) {
    select.append(el('option', { value: group.id, text: `${group.name} · ${group.studentCount} alumnos` }));
  }
  state.groupId = data.groups[0]?.id ?? null;
  select.classList.toggle('hidden', data.groups.length === 0);
}

async function refreshAll() {
  if (!state.groupId) return;
  await Promise.all([loadDay(), loadStudents(), loadAnnouncements(), loadStats()]);
}

function showPanel() {
  $('#view-login').classList.add('hidden');
  $('#view-panel').classList.remove('hidden');
  $('#btn-logout').classList.remove('hidden');
  $('#teacher-name').classList.remove('hidden');
}

function showLogin() {
  $('#view-panel').classList.add('hidden');
  $('#view-login').classList.remove('hidden');
  $('#btn-logout').classList.add('hidden');
  $('#teacher-name').classList.add('hidden');
  $('#group-select').classList.add('hidden');
}

async function enterPanel() {
  const me = await api('/auth/me');
  $('#teacher-name').textContent = me.teacher.fullName;
  await loadGroups();
  await refreshAll();
  showPanel();
}

function guard(handler) {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      if (error.status === 401) return showLogin();
      toast(error.message, 'error');
    }
  };
}

function wireEvents() {
  $('#form-login').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#btn-login');
    const errorBox = $('#login-error');
    errorBox.classList.add('hidden');
    button.disabled = true;
    try {
      await api('/auth/login', {
        method: 'POST',
        body: { email: $('#login-email').value, password: $('#login-password').value },
      });
      await enterPanel();
      toast('Sesion iniciada.');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
    } finally {
      button.disabled = false;
    }
  });

  $('#btn-logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    showLogin();
  });

  $('#group-select').addEventListener('change', guard(async (event) => {
    state.groupId = Number(event.target.value);
    await refreshAll();
  }));

  $('#btn-load-day').addEventListener('click', guard(loadDay));
  $('#record-date').addEventListener('change', guard(loadDay));
  $('#btn-save-day').addEventListener('click', guard(saveDay));
  $('#btn-apply-preset').addEventListener('click', applyPreset);
  $('#btn-load-stats').addEventListener('click', guard(loadStats));
  $('#btn-print-codes').addEventListener('click', printCodes);

  $('#form-student').addEventListener('submit', guard(async (event) => {
    event.preventDefault();
    await api('/students', {
      method: 'POST',
      body: {
        groupId: state.groupId,
        fullName: $('#student-name').value,
        guardianName: $('#guardian-name').value,
        guardianPhone: $('#guardian-phone').value,
      },
    });
    event.target.reset();
    toast('Alumno agregado con su codigo de acceso.');
    await Promise.all([loadStudents(), loadDay(), loadGroups()]);
  }));

  $('#form-announcement').addEventListener('submit', guard(async (event) => {
    event.preventDefault();
    await api('/announcements', {
      method: 'POST',
      body: {
        groupId: state.groupId,
        title: $('#announcement-title').value,
        body: $('#announcement-body').value,
        priority: $('#announcement-priority').value,
      },
    });
    event.target.reset();
    toast('Aviso publicado para los padres del grupo.');
    await loadAnnouncements();
  }));

  for (const tab of $$('.tab')) {
    tab.addEventListener('click', () => {
      for (const other of $$('.tab')) other.classList.toggle('is-active', other === tab);
      for (const id of ['panel-registro', 'panel-indicadores', 'panel-alumnos', 'panel-avisos']) {
        $(`#${id}`).classList.toggle('hidden', id !== tab.dataset.panel);
      }
    });
  }
}

async function init() {
  const meta = await loadMeta().catch(() => null);
  if (meta) {
    state.catalogs = meta.catalogs;
    applySchoolBranding(meta);
  }
  $('#record-date').value = todayISO();
  wireEvents();

  try {
    await enterPanel();
  } catch {
    showLogin();
  }
}

init();
