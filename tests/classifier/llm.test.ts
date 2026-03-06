import { describe, it, expect, vi } from "vitest";
import {
  classifyCandidates,
  buildUserPrompt,
  parseClassifyResponse,
  extractFirstJson,
  sanitize,
  estimateCost,
  MODEL_PRICING,
} from "../../src/classifier/llm";
import type { RadarConfig } from "../../src/config";
import type { Candidate } from "../../src/sources/types";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  getInput: vi.fn(() => "fake-key"),
}));

const baseConfig = {
  description: "GPU-accelerated zero-knowledge cryptography",
  list_file: "README.md",
  sources: {
    github: { topics: ["webgpu"], min_stars: 0, created_after: "30d" },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_classifications_per_run: 5,
  },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

const mockCandidate: Candidate = {
  url: "https://github.com/test/gpu-msm",
  title: "test/gpu-msm",
  description: "GPU-accelerated multi-scalar multiplication",
  source: "github",
  metadata: { stars: 42, language: "Rust", topics: ["webgpu", "msm"] },
};

describe("sanitize", () => {
  it("truncates to max length", () => {
    expect(sanitize("hello world", 5)).toBe("hello");
  });

  it("strips control characters", () => {
    expect(sanitize("hello\x00world\x0B!", 100)).toBe("helloworld!");
  });
});

describe("extractFirstJson", () => {
  it("extracts first balanced JSON object", () => {
    const text = 'Some text {"key": "value"} more text {"other": true}';
    expect(extractFirstJson(text)).toBe('{"key": "value"}');
  });

  it("handles nested braces", () => {
    const text = '{"outer": {"inner": 1}}';
    expect(extractFirstJson(text)).toBe('{"outer": {"inner": 1}}');
  });

  it("throws when no JSON found", () => {
    expect(() => extractFirstJson("no json")).toThrow("No JSON found");
  });

  it("throws on unbalanced braces", () => {
    expect(() => extractFirstJson("{unclosed")).toThrow("No valid JSON found");
  });
});

describe("parseClassifyResponse", () => {
  it("parses valid JSON response", () => {
    const result = parseClassifyResponse(`{
      "relevanceScore": 85,
      "suggestedCategory": "Libraries",
      "suggestedTags": ["gpu", "msm"],
      "reasoning": "Directly relevant to GPU-accelerated ZK"
    }`);

    expect(result.relevanceScore).toBe(85);
    expect(result.suggestedCategory).toBe("Libraries");
    expect(result.suggestedTags).toEqual(["gpu", "msm"]);
    expect(result.reasoning).toContain("GPU-accelerated");
  });

  it("extracts JSON from text with surrounding prose", () => {
    const result = parseClassifyResponse(`
      Here is my assessment:
      {"relevanceScore": 60, "suggestedCategory": "Tools", "suggestedTags": [], "reasoning": "Somewhat relevant"}
      Hope that helps!
    `);

    expect(result.relevanceScore).toBe(60);
  });

  it("rounds float scores to integers", () => {
    const result = parseClassifyResponse(
      '{"relevanceScore": 85.7, "suggestedCategory": "Tools", "suggestedTags": [], "reasoning": ""}'
    );
    expect(result.relevanceScore).toBe(86);
  });

  it("throws on missing JSON", () => {
    expect(() => parseClassifyResponse("No JSON here")).toThrow(
      "No JSON found"
    );
  });

  it("throws on invalid relevanceScore", () => {
    expect(() =>
      parseClassifyResponse(
        '{"relevanceScore": 150, "suggestedCategory": "X", "suggestedTags": [], "reasoning": ""}'
      )
    ).toThrow("Invalid relevanceScore");
  });

  it("defaults missing fields gracefully", () => {
    const result = parseClassifyResponse('{"relevanceScore": 50}');
    expect(result.suggestedCategory).toBe("Uncategorized");
    expect(result.suggestedTags).toEqual([]);
    expect(result.reasoning).toBe("");
  });
});

describe("buildUserPrompt", () => {
  it("wraps candidate data in XML delimiters", () => {
    const prompt = buildUserPrompt(mockCandidate, baseConfig);

    expect(prompt).toContain("<candidate_title>test/gpu-msm</candidate_title>");
    expect(prompt).toContain("<candidate_url>");
    expect(prompt).toContain("<candidate_source>github</candidate_source>");
    expect(prompt).toContain("<candidate_description>");
    expect(prompt).toContain("<candidate_stars>42</candidate_stars>");
    expect(prompt).toContain("<candidate_language>Rust</candidate_language>");
    expect(prompt).toContain("<candidate_topics>webgpu, msm</candidate_topics>");
  });

  it("omits optional metadata when not present", () => {
    const candidate: Candidate = {
      url: "https://arxiv.org/abs/123",
      title: "Paper",
      description: "Abstract",
      source: "arxiv",
      metadata: { authors: ["Alice"] },
    };

    const prompt = buildUserPrompt(candidate, baseConfig);
    expect(prompt).not.toContain("candidate_stars");
    expect(prompt).not.toContain("candidate_language");
    expect(prompt).toContain("<candidate_authors>Alice</candidate_authors>");
    expect(prompt).not.toContain("candidate_license");
    expect(prompt).not.toContain("candidate_archived");
    expect(prompt).not.toContain("candidate_fork");
    expect(prompt).not.toContain("candidate_owner");
    expect(prompt).not.toContain("candidate_homepage");
    expect(prompt).not.toContain("candidate_last_commit");
  });

  it("includes new metadata XML tags when fields are present", () => {
    const candidate: Candidate = {
      url: "https://github.com/test/repo",
      title: "test/repo",
      description: "A library",
      source: "github",
      metadata: {
        stars: 100,
        language: "Rust",
        topics: ["gpu"],
        license: "Apache-2.0",
        archived: false,
        fork: true,
        owner: "testorg",
        homepage: "https://example.com",
        lastPushedAt: "2025-01-15T00:00:00Z",
      },
    };

    const prompt = buildUserPrompt(candidate, baseConfig);
    expect(prompt).toContain("<candidate_license>Apache-2.0</candidate_license>");
    expect(prompt).toContain("<candidate_archived>false</candidate_archived>");
    expect(prompt).toContain("<candidate_fork>true</candidate_fork>");
    expect(prompt).toContain("<candidate_owner>testorg</candidate_owner>");
    expect(prompt).toContain("<candidate_homepage>https://example.com</candidate_homepage>");
    expect(prompt).toContain("<candidate_last_pushed>2025-01-15T00:00:00Z</candidate_last_pushed>");
  });
});

describe("classifyCandidates", () => {
  const makeMockClient = (responses: string[]) => {
    let callIndex = 0;
    return {
      messages: {
        create: vi.fn().mockImplementation(async () => ({
          content: [{ type: "text", text: responses[callIndex++] }],
        })),
      },
    } as any;
  };

  it("classifies candidates above threshold", async () => {
    const client = makeMockClient([
      '{"relevanceScore": 85, "suggestedCategory": "Libraries", "suggestedTags": ["gpu"], "reasoning": "Relevant"}',
    ]);

    const result = await classifyCandidates(
      [mockCandidate],
      baseConfig,
      client
    );

    expect(result).toHaveLength(1);
    expect(result[0].relevanceScore).toBe(85);
    expect(result[0].suggestedCategory).toBe("Libraries");
    expect(result[0].url).toBe(mockCandidate.url);
  });

  it("filters out candidates below threshold", async () => {
    const client = makeMockClient([
      '{"relevanceScore": 30, "suggestedCategory": "Tools", "suggestedTags": [], "reasoning": "Not relevant enough"}',
    ]);

    const result = await classifyCandidates(
      [mockCandidate],
      baseConfig,
      client
    );

    expect(result).toHaveLength(0);
  });

  it("respects max_classifications_per_run limit on API calls", async () => {
    const config = {
      ...baseConfig,
      classification: { ...baseConfig.classification, max_classifications_per_run: 2 },
    } as RadarConfig;

    const candidates = [mockCandidate, mockCandidate, mockCandidate];
    const client = makeMockClient([
      '{"relevanceScore": 85, "suggestedCategory": "A", "suggestedTags": [], "reasoning": ""}',
      '{"relevanceScore": 90, "suggestedCategory": "B", "suggestedTags": [], "reasoning": ""}',
    ]);

    const result = await classifyCandidates(candidates, config, client);

    expect(client.messages.create).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it("handles API errors gracefully per-candidate", async () => {
    const client = {
      messages: {
        create: vi
          .fn()
          .mockRejectedValueOnce(new Error("rate limited"))
          .mockResolvedValueOnce({
            content: [
              {
                type: "text",
                text: '{"relevanceScore": 80, "suggestedCategory": "Tools", "suggestedTags": [], "reasoning": "ok"}',
              },
            ],
          }),
      },
    } as any;

    const result = await classifyCandidates(
      [mockCandidate, mockCandidate],
      baseConfig,
      client
    );

    expect(result).toHaveLength(1);
    expect(result[0].relevanceScore).toBe(80);
  });

  it("returns empty array for empty candidates", async () => {
    const result = await classifyCandidates([], baseConfig);
    expect(result).toEqual([]);
  });

  it("tracks token usage across calls", async () => {
    const client = {
      messages: {
        create: vi.fn().mockImplementation(async () => ({
          content: [{ type: "text", text: '{"relevanceScore": 85, "suggestedCategory": "A", "suggestedTags": [], "reasoning": ""}' }],
          usage: { input_tokens: 500, output_tokens: 100 },
        })),
      },
    } as any;

    const { info } = await import("@actions/core");
    await classifyCandidates([mockCandidate, mockCandidate], baseConfig, client);

    // Should log per-candidate cost and summary
    expect(info).toHaveBeenCalledWith(expect.stringContaining("500 in / 100 out tokens"));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("Classification summary: 1000 input tokens, 200 output tokens"));
  });

  it("stops classification when budget is exceeded", async () => {
    const config = {
      ...baseConfig,
      classification: {
        ...baseConfig.classification,
        max_classifications_per_run: 10,
        max_budget_usd: 0.001,
      },
    } as RadarConfig;

    const client = {
      messages: {
        create: vi.fn().mockImplementation(async () => ({
          content: [{ type: "text", text: '{"relevanceScore": 85, "suggestedCategory": "A", "suggestedTags": [], "reasoning": ""}' }],
          usage: { input_tokens: 500, output_tokens: 100 },
        })),
      },
    } as any;

    const candidates = Array(5).fill(mockCandidate);
    const result = await classifyCandidates(candidates, config, client);

    // With sonnet pricing: (500*3 + 100*15)/1M = 0.003 per call
    // Budget is 0.001 so after 1st call (cost 0.003 >= 0.001) it should stop
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });
});

describe("estimateCost", () => {
  it("calculates cost correctly for claude-sonnet-4-6", () => {
    const cost = estimateCost(1000, 500, "claude-sonnet-4-6");
    // (1000 * 3.0 + 500 * 15.0) / 1_000_000 = (3000 + 7500) / 1_000_000 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it("calculates cost correctly for claude-haiku-4-5-20251001", () => {
    const cost = estimateCost(1000, 500, "claude-haiku-4-5-20251001");
    // (1000 * 0.8 + 500 * 4.0) / 1_000_000 = (800 + 2000) / 1_000_000 = 0.0028
    expect(cost).toBeCloseTo(0.0028, 6);
  });

  it("calculates cost correctly for claude-opus-4-6", () => {
    const cost = estimateCost(1000, 500, "claude-opus-4-6");
    // (1000 * 15.0 + 500 * 75.0) / 1_000_000 = (15000 + 37500) / 1_000_000 = 0.0525
    expect(cost).toBeCloseTo(0.0525, 6);
  });

  it("falls back to sonnet pricing for unknown models", () => {
    const cost = estimateCost(1000, 500, "unknown-model");
    expect(cost).toBeCloseTo(0.0105, 6);
  });
});

describe("MODEL_PRICING", () => {
  it("has pricing for expected models", () => {
    expect(MODEL_PRICING["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_PRICING["claude-haiku-4-5-20251001"]).toBeDefined();
    expect(MODEL_PRICING["claude-opus-4-6"]).toBeDefined();
  });
});
