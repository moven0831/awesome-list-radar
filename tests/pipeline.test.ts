import { describe, it, expect, vi } from "vitest";
import { runPipeline, type PipelineDeps } from "../src/pipeline";
import type { RadarConfig } from "../src/config";
import type { Candidate, ClassifiedCandidate } from "../src/sources/types";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
}));

const mockConfig = {
  description: "test",
  list_file: "README.md",
  sources: { github: { topics: ["test"], min_stars: 0, created_after: "30d" } },
  classification: { model: "claude-sonnet-4-6", threshold: 70, max_issues_per_run: 5 },
  issue_template: { labels: ["radar"] },
} as RadarConfig;

const mockCandidate: Candidate = {
  url: "https://github.com/test/repo",
  title: "Test Repo",
  description: "A test repository",
  source: "github",
  metadata: { stars: 100 },
};

const mockClassified: ClassifiedCandidate = {
  ...mockCandidate,
  relevanceScore: 85,
  suggestedCategory: "Tools",
  suggestedTags: ["testing"],
  reasoning: "Relevant to the list",
};

describe("runPipeline", () => {
  it("runs all 4 stages in order", async () => {
    const callOrder: string[] = [];

    const deps: PipelineDeps = {
      collect: vi.fn(async () => {
        callOrder.push("collect");
        return [mockCandidate];
      }),
      filter: vi.fn(async () => {
        callOrder.push("filter");
        return [mockCandidate];
      }),
      classify: vi.fn(async () => {
        callOrder.push("classify");
        return [mockClassified];
      }),
      output: vi.fn(async () => {
        callOrder.push("output");
        return 1;
      }),
    };

    const result = await runPipeline(mockConfig, deps, false);

    expect(callOrder).toEqual(["collect", "filter", "classify", "output"]);
    expect(result.candidatesFound).toBe(1);
    expect(result.candidatesFiltered).toBe(1);
    expect(result.issuesCreated).toBe(1);
  });

  it("passes dryRun to output stage", async () => {
    const deps: PipelineDeps = {
      collect: vi.fn(async () => []),
      filter: vi.fn(async () => []),
      classify: vi.fn(async () => []),
      output: vi.fn(async () => 0),
    };

    await runPipeline(mockConfig, deps, true);

    expect(deps.output).toHaveBeenCalledWith([], mockConfig, true);
  });

  it("handles empty candidate list", async () => {
    const deps: PipelineDeps = {
      collect: vi.fn(async () => []),
      filter: vi.fn(async () => []),
      classify: vi.fn(async () => []),
      output: vi.fn(async () => 0),
    };

    const result = await runPipeline(mockConfig, deps, false);

    expect(result.candidatesFound).toBe(0);
    expect(result.candidatesFiltered).toBe(0);
    expect(result.issuesCreated).toBe(0);
  });
});
