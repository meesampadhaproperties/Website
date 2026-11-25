/**
 * Client-safe phone rules for the website enquiry form (no libraries, a few hundred bytes).
 * Exactly 10 digits, starts with 6-9, and not an obvious fake (1234567890, 9999999999, 9876543210, 9898989898 ...).
 * The server additionally verifies the number with libphonenumber (see phone-validation.ts).
 */

/** Digits only, at most 10. */
export const cleanPhoneInput = (v: string) => v.replace(/\D/g, '').slice(0, 10)

const MSG = 'Enter a valid 10-digit mobile number'

/** Longest run of consecutive ascending or descending digits (e.g. 98765 = 5). */
function longestSequence(d: string): number {
  let best = 1, up = 1, down = 1
  for (let i = 1; i < d.length; i++) {
    const diff = Number(d[i]) - Number(d[i - 1])
    up = diff === 1 ? up + 1 : 1
    down = diff === -1 ? down + 1 : 1
    best = Math.max(best, up, down)
  }
  return best
}

/** Cheap rules that need no library: safe to run on every keystroke. Returns an error message or null. */
export function phoneShapeError(d: string): string | null {
  if (!/^\d{10}$/.test(d)) return MSG
  if (!/^[6-9]/.test(d)) return 'Mobile numbers start with 6, 7, 8 or 9'
  if (/(\d)\1{5,}/.test(d)) return MSG                 // 6+ of the same digit in a row
  if (new Set(d).size < 4) return MSG                  // 9898989898, 7000000007 ...
  if (longestSequence(d) >= 7) return MSG              // 1234567890, 9876543210 ...
  return null
}
