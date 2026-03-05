import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadState,
  saveState,
  filterSeenCandidates,
  recordCandidates,
  updateWatermark,
} from "../src/state";
import type { Candidate } from "../src/sources/types";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

describe("loadState", () => {
  const testDir = join(tmpdir(), "radar-state-test-" + Date.now());
  const testFile = join(testDir, "state.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      unlinkSync(testFile);
    } catch {
      // ignore
    }
  });

  it("returns empty state when file does not exist", () => {
    const state = loadState("/nonexistent/path.json");
    expect(state.seen_urls).toEqual({});
    expect(state.watermarks).toEqual({});
  });

  it("loads existing state file", () => {
    const existing = {
      seen_urls: {
        "https://github.com/test/repo": {
          status: "accepted",
          seen_at: "2026-01-01T00:00:00Z",
        },
      },
      watermarks: { "github:0": { last_run: "2026-01-01T00:00:00Z" } },
    };
    writeFileSync(testFile, JSON.stringify(existing), "utf-8");

    const state = loadState(testFile);
    expect(state.seen_urls["https://github.com/test/repo"]).toBeDefined();
    expect(state.watermarks["github:0"]).toBeDefined();
  });

  it("handles corrupt JSON gracefully", () => {
    writeFileSync(testFile, "not json", "utf-8");
    const state = loadState(testFile);
    expect(state.seen_urls).toEqual({});
  });

  it("handles invalid structure gracefully", () => {
    writeFileSync(testFile, JSON.stringify({ foo: "bar" }), "utf-8");
    const state = loadState(testFile);
    expect(state.seen_urls).toEqual({});
  });
});

describe("saveState", () => {
  it("writes state to file", () => {
    const testFile = join(tmpdir(), `radar-save-test-${Date.now()}.json`);
    const state = {
      seen_urls: {
        "https://example.com": {
          status: "accepted" as const,
          seen_at: "2026-01-01T00:00:00Z",
        },
      },
      watermarks: {},
    };

    saveState(testFile, state);

    const content = JSON.parse(readFileSync(testFile, "utf-8"));
    expect(content.seen_urls["https://example.com"]).toBeDefined();

    unlinkSync(testFile);
  });
});

describe("filterSeenCandidates", () => {
  const makeCandidates = (urls: string[]): Candidate[] =>
    urls.map((url) => ({
      url,
      title: "test",
      description: "test",
      source: "github" as const,
      metadata: {},
    }));

  it("filters out previously seen URLs", () => {
    const state = {
      seen_urls: {
        "https://github.com/seen/repo": {
          status: "accepted" as const,
          seen_at: "2026-01-01T00:00:00Z",
        },
      },
      watermarks: {},
    };

    const candidates = makeCandidates([
      "https://github.com/seen/repo",
      "https://github.com/new/repo",
    ]);

    const result = filterSeenCandidates(candidates, state);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://github.com/new/repo");
  });

  it("is case-insensitive", () => {
    const state = {
      seen_urls: {
        "https://github.com/test/repo": {
          status: "accepted" as const,
          seen_at: "2026-01-01T00:00:00Z",
        },
      },
      watermarks: {},
    };

    const candidates = makeCandidates(["https://GitHub.com/Test/Repo"]);
    const result = filterSeenCandidates(candidates, state);
    expect(result).toHaveLength(0);
  });

  it("returns all candidates when none are seen", () => {
    const state = { seen_urls: {}, watermarks: {} };
    const candidates = makeCandidates([
      "https://github.com/a",
      "https://github.com/b",
    ]);
    const result = filterSeenCandidates(candidates, state);
    expect(result).toHaveLength(2);
  });
});

describe("recordCandidates", () => {
  it("records candidates with given status", () => {
    const state = { seen_urls: {}, watermarks: {} };
    const candidates = [
      {
        url: "https://example.com",
        title: "test",
        description: "test",
        source: "github" as const,
        metadata: {},
      },
    ];

    recordCandidates(state, candidates, "accepted");

    expect(state.seen_urls["https://example.com"]).toBeDefined();
    expect(state.seen_urls["https://example.com"].status).toBe("accepted");
    expect(state.seen_urls["https://example.com"].seen_at).toBeDefined();
  });

  it("normalizes URLs to lowercase", () => {
    const state = { seen_urls: {}, watermarks: {} };
    const candidates = [
      {
        url: "https://GitHub.com/Test",
        title: "test",
        description: "test",
        source: "github" as const,
        metadata: {},
      },
    ];

    recordCandidates(state, candidates, "rejected");

    expect(state.seen_urls["https://github.com/test"]).toBeDefined();
    expect(state.seen_urls["https://github.com/test"].status).toBe("rejected");
  });
});

describe("updateWatermark", () => {
  it("updates watermark for source", () => {
    const state = { seen_urls: {}, watermarks: {} };
    updateWatermark(state, "github:0", "abc123");

    expect(state.watermarks["github:0"]).toBeDefined();
    expect(state.watermarks["github:0"].last_result_id).toBe("abc123");
    expect(state.watermarks["github:0"].last_run).toBeDefined();
  });

  it("updates watermark without result id", () => {
    const state = { seen_urls: {}, watermarks: {} };
    updateWatermark(state, "arxiv:0");

    expect(state.watermarks["arxiv:0"]).toBeDefined();
    expect(state.watermarks["arxiv:0"].last_result_id).toBeUndefined();
  });
});
