import { isDateOnly } from '@/lib/subscription';

export function cleanString(value: unknown, maxLength = 255) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeEmail(value: unknown) {
  return cleanString(value, 320).toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeMobile(value: unknown) {
  return cleanString(value, 20).replace(/[^\d+]/g, '');
}

export function isValidMobile(value: string) {
  return /^\+?\d{10,15}$/.test(value);
}

export function isStrongEnoughPassword(value: string) {
  return typeof value === 'string' && value.length >= 8;
}

export function parseDateOnly(value: unknown) {
  const date = cleanString(value, 10);
  return isDateOnly(date) ? date : '';
}

export function parseDateList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => parseDateOnly(item)).filter(Boolean))).sort();
}

export function isValidScreenshotReference(value: string) {
  if (!value) return true;
  if (value.length > 2_000_000) return false;
  return /^https?:\/\//.test(value) || /^data:image\/(png|jpe?g|webp);base64,/.test(value);
}
