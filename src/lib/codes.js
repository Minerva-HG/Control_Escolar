import { randomInt } from 'node:crypto';

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para que los codigos
// sean faciles de dictar y escribir en papel.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateAccessCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export function normalizeAccessCode(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
