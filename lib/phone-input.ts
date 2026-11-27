import { DEFAULT_REPORT_TIMES, REPORT_SLOTS, normalizeReportTimes, toggleSlot } from './reports/slots'
/**
 * Phone number normalization and Indian phone utilities
 */

/** The six report slots (see lib/reports/slots.ts). Kept for older imports. */
export const ALL_WA_REPORT_SLOTS: string[] = [...REPORT_SLOTS]

/**
 * Strips all non-digit characters and extracts standard canonical format
 */
export function canonicalPhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return digits;
}

export function extractTenDigitWaPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

export function normalizeIndianPhoneInput(input: string): string {
  return input.replace(/[^\d+]/g, '');
}

export function normalizeWaRecipientPhone(phone: string): { valid: boolean; phone: string; error?: string } {
  if (!phone) {
    return { valid: false, phone: '', error: 'Phone number is required.' };
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return { valid: true, phone: `91${digits}` };
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return { valid: true, phone: digits };
  }
  if (digits.length < 10) {
    return { valid: false, phone: digits, error: 'Phone number must have at least 10 digits.' };
  }
  return { valid: true, phone: digits };
}

export function normalizeWaReportTimings(timings: any): string[] {
  const t = normalizeReportTimes(timings)
  return t.length ? t : [...DEFAULT_REPORT_TIMES]
}

export function toggleWaReportTiming(currentTimings: string[], slot: string): string[] {
  return toggleSlot(currentTimings, slot)
}
