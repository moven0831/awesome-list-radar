import { describe, it, expect, vi } from "vitest";
import {
  classifyCandidates,
  buildUserPrompt,
  parseClassifyResponse,
} from "../../src/classifier/llm.js";
import type { RadarConfig } from "../../src/config.js";
import type { Candidate } from "../../src/sources/types.js";

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
    max_issues_per_run: 5,
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
  it("includes list description and candidate details", () => {
    const prompt = buildUserPrompt(mockCandidate, baseConfig);

    expect(prompt).toContain("GPU-accelerated zero-knowledge");
    expect(prompt).toContain("test/gpu-msm");
    expect(prompt).toContain("github.com/test/gpu-msm");
    expect(prompt).toContain("42");
    expect(prompt).toContain("Rust");
    expect(prompt).toContain("webgpu");
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
    expect(prompt).not.toContain("Stars");
    expect(prompt).not.toContain("Language");
    expect(prompt).toContain("Alice");
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

  it("respects max_issues_per_run limit", async () => {
    const config = {
      ...baseConfig,
      classification: { ...baseConfig.classification, max_issues_per_run: 2 },
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

    // First fails, second succeeds
    expect(result).toHaveLength(1);
    expect(result[0].relevanceScore).toBe(80);
  });

  it("returns empty array for empty candidates", async () => {
    const result = await classifyCandidates([], baseConfig);
    expect(result).toEqual([]);
  });
});
