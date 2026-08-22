export class RateLimiter {
  private requests: Map<string, { count: number; timestamp: number }> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  limit(identifier: string): { success: boolean; limit: number; remaining: number; reset: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean up old entries (naive garbage collection for demo)
    if (this.requests.size > 1000) {
      for (const [key, record] of this.requests.entries()) {
        if (record.timestamp < windowStart) {
          this.requests.delete(key);
        }
      }
    }

    const currentRecord = this.requests.get(identifier);

    if (!currentRecord || currentRecord.timestamp < windowStart) {
      this.requests.set(identifier, { count: 1, timestamp: now });
      return { success: true, limit: this.maxRequests, remaining: this.maxRequests - 1, reset: now + this.windowMs };
    }

    if (currentRecord.count >= this.maxRequests) {
      return { success: false, limit: this.maxRequests, remaining: 0, reset: currentRecord.timestamp + this.windowMs };
    }

    currentRecord.count += 1;
    this.requests.set(identifier, currentRecord);

    return { 
      success: true, 
      limit: this.maxRequests, 
      remaining: this.maxRequests - currentRecord.count, 
      reset: currentRecord.timestamp + this.windowMs 
    };
  }
}
