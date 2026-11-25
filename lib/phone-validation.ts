import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile'
import { phoneShapeError } from './phone-shape'

export { cleanPhoneInput, phoneShapeError } from './phone-shape'

/** Server-side full check: shape rules plus libphonenumber's mobile-number validation. Returns an error or null. */
export function phoneError(d: string): string | null {
  const shape = phoneShapeError(d)
  if (shape) return shape
  const parsed = parsePhoneNumberFromString(d, 'IN')
  return parsed && parsed.isValid() ? null : 'Enter a valid 10-digit mobile number'
}
