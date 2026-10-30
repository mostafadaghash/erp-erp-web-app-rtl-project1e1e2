export interface LoginRateLimitOptions {
  maxAttempts: number
  windowMs: number
}

interface LoginAttemptState {
  failures: number
  windowStartedAt: number
}

export class LoginRateLimiter {
  private readonly attempts = new Map<string, LoginAttemptState>()

  constructor(private readonly options: LoginRateLimitOptions) {
    if (
      !Number.isInteger(options.maxAttempts) ||
      options.maxAttempts < 1
    ) {
      throw new TypeError('Login maxAttempts must be a positive integer')
    }
    if (!Number.isInteger(options.windowMs) || options.windowMs < 1000) {
      throw new TypeError('Login windowMs must be at least 1000')
    }
  }

  private purgeExpired(nowMs: number): void {
    for (const [key, state] of this.attempts) {
      if (nowMs - state.windowStartedAt >= this.options.windowMs) {
        this.attempts.delete(key)
      }
    }
  }

  retryAfterSeconds(key: string, nowMs = Date.now()): number {
    this.purgeExpired(nowMs)
    const state = this.attempts.get(key)
    if (!state || state.failures < this.options.maxAttempts) return 0

    const remaining =
      this.options.windowMs - (nowMs - state.windowStartedAt)
    return Math.max(1, Math.ceil(remaining / 1000))
  }

  recordFailure(key: string, nowMs = Date.now()): void {
    this.purgeExpired(nowMs)
    const existing = this.attempts.get(key)

    if (!existing) {
      this.attempts.set(key, {
        failures: 1,
        windowStartedAt: nowMs,
      })
      return
    }

    existing.failures += 1
  }

  reset(key: string): void {
    this.attempts.delete(key)
  }
}
