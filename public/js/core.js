/* Utilidades compartidas por el portal de padres y el panel docente. */

export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (raw) return response;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error ?? `Error ${response.status}`);
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }
  return payload;
}

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function toast(message, variant = 'success', ms = 3800) {
  let host = $('.toasts');
  if (!host) {
    host = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const node = el('div', { class: `toast toast--${variant}`, text: message });
  host.append(node);
  setTimeout(() => node.remove(), ms);
}

export function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function scoreTone(score) {
  if (score === null || score === undefined) return 'neutral';
  if (score >= 85) return 'good';
  if (score >= 65) return 'warn';
  return 'bad';
}

export function withBusy(button, handler) {
  return async (event) => {
    if (button.disabled) return;
    const original = button.textContent;
    button.disabled = true;
    button.replaceChildren(el('span', { class: 'spinner' }));
    try {
      await handler(event);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  };
}

/** Grafica de tendencia ligera en SVG, sin dependencias externas. */
export function sparkline(points, { width = 520, height = 110 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Tendencia de desempeno de los ultimos dias');

  const make = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };

  for (const level of [0, 0.5, 1]) {
    svg.append(make('line', {
      class: 'sparkline__grid', x1: 0, x2: width,
      y1: 8 + level * (height - 20), y2: 8 + level * (height - 20),
    }));
  }

  if (points.length === 0) return svg;

  const padding = 8;
  const usable = height - padding * 2;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((point, index) => [
    points.length > 1 ? index * stepX : width / 2,
    padding + usable - (Math.max(0, Math.min(100, point.score)) / 100) * usable,
  ]);

  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  svg.append(make('path', { class: 'sparkline__area', d: `${line} L${width},${height} L0,${height} Z` }));
  svg.append(make('path', { class: 'sparkline__line', d: line }));
  for (const [x, y] of coords) svg.append(make('circle', { class: 'sparkline__dot', cx: x, cy: y, r: 3.2 }));

  return svg;
}

let metaCache = null;

export async function loadMeta() {
  metaCache ??= await api('/meta');
  return metaCache;
}

export function applySchoolBranding(meta) {
  for (const node of $$('[data-school-name]')) node.textContent = meta.school.name;
  for (const node of $$('[data-school-cycle]')) node.textContent = `Ciclo escolar ${meta.school.cycle}`;
  document.title = `${document.title} | ${meta.school.name}`;
}
