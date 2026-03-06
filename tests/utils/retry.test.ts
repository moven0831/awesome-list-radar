import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../../src/utils/retry";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and succeeds", async () => {
    const error = Object.assign(new Error("server error"), { status: 500 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");

    vi.useRealTimers();
    const result = await withRetry(fn, { baseDelay: 10, maxRetries: 2 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries", async () => {
    vi.useRealTimers();
    const error = Object.assign(new Error("server error"), { status: 500 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 10 })
    ).rejects.toThrow("server error");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry non-retryable errors", async () => {
    const error = new Error("bad request");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow(
      "bad request"
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on network errors", async () => {
    vi.useRealTimers();
    const error = new Error("fetch failed");
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");

    const result = await withRetry(fn, { baseDelay: 10 });
    expect(result).toBe("ok");
  });

  it("detects rate limit from 429 status", async () => {
    vi.useRealTimers();
    const error = Object.assign(new Error("rate limited"), {
      status: 429,
      response: {
        status: 429,
        headers: {
          get: (name: string) => (name === "retry-after" ? "1" : null),
        },
      },
    });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");

    const result = await withRetry(fn, { baseDelay: 10, maxRetries: 2 });
    expect(result).toBe("ok");
  });
});
