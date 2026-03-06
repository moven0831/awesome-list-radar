import * as core from "@actions/core";

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableStatuses?: number[];
}

interface RetryableError extends Error {
  status?: number;
  response?: {
    status: number;
    headers: {
      get(name: string): string | null;
    };
  };
}

function getRetryDelay(
  attempt: number,
  options: Required<RetryOptions>
): number {
  const exponential = options.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * options.baseDelay;
  return Math.min(exponential + jitter, options.maxDelay);
}

function getRateLimitDelay(error: RetryableError): number | null {
  const headers = error.response?.headers;
  if (!headers) return null;

  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds * 1000;
    const date = new Date(retryAfter).getTime();
    if (!isNaN(date)) return Math.max(0, date - Date.now());
  }

  const rateLimitReset = headers.get("x-ratelimit-reset");
  if (rateLimitReset) {
    const resetTime = parseInt(rateLimitReset, 10) * 1000;
    return Math.max(0, resetTime - Date.now());
  }

  return null;
}

function isRetryable(error: unknown, retryableStatuses: number[]): boolean {
  if (error instanceof Error) {
    const retryable = error as RetryableError;
    const status = retryable.status ?? retryable.response?.status;
    if (status && retryableStatuses.includes(status)) return true;

    if (
      retryable.message.includes("ECONNRESET") ||
      retryable.message.includes("ETIMEDOUT") ||
      retryable.message.includes("ENOTFOUND") ||
      retryable.message.includes("fetch failed")
    ) {
      return true;
    }
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts: Required<RetryOptions> = {
    maxRetries: options?.maxRetries ?? 3,
    baseDelay: options?.baseDelay ?? 1000,
    maxDelay: options?.maxDelay ?? 30000,
    retryableStatuses: options?.retryableStatuses ?? [
      408, 429, 500, 502, 503, 504,
    ],
  };

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (
        attempt === opts.maxRetries ||
        !isRetryable(error, opts.retryableStatuses)
      ) {
        throw error;
      }

      const rateLimitDelay = getRateLimitDelay(error as RetryableError);
      const delay = Math.min(
        rateLimitDelay ?? getRetryDelay(attempt, opts),
        opts.maxDelay
      );

      core.info(
        `Retry ${attempt + 1}/${opts.maxRetries} after ${Math.round(delay)}ms: ${error instanceof Error ? error.message : String(error)}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable: retry loop exited without return or throw");
}
