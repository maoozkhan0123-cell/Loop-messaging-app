// In-memory OTP store with 10-minute expiry time
interface OTPRecord {
  code: string
  displayName: string
  password: string
  expiresAt: number
  attempts: number
}

const globalForOTP = globalThis as unknown as {
  otpStore?: Map<string, OTPRecord>
}

export const otpStore = globalForOTP.otpStore || new Map<string, OTPRecord>()
if (process.env.NODE_ENV !== 'production') globalForOTP.otpStore = otpStore

export function setOTP(email: string, record: { code: string; displayName: string; password: string }) {
  const normalizedEmail = email.toLowerCase().trim()
  otpStore.set(normalizedEmail, {
    ...record,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 mins
    attempts: 0,
  })
}

export function verifyOTP(email: string, code: string): { ok: boolean; record?: OTPRecord; reason?: string } {
  const normalizedEmail = email.toLowerCase().trim()
  const record = getOTP(normalizedEmail)
  if (!record) return { ok: false, reason: 'expired' }
  if (record.attempts >= 5) {
    otpStore.delete(normalizedEmail)
    return { ok: false, reason: 'locked' }
  }
  record.attempts += 1
  if (record.code !== code.trim()) return { ok: false, reason: 'incorrect' }
  return { ok: true, record }
}

export function getOTP(email: string): OTPRecord | undefined {
  const normalizedEmail = email.toLowerCase().trim()
  const record = otpStore.get(normalizedEmail)
  if (!record) return undefined
  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedEmail)
    return undefined
  }
  return record
}

export function deleteOTP(email: string) {
  otpStore.delete(email.toLowerCase().trim())
}
