import { describe, it, expect, vi } from "vitest";
import {
  createIssues,
  buildIssueTitle,
  buildIssueBody,
  escapeTableCell,
  type IssueClient,
} from "../../src/output/issues";
import type { RadarConfig } from "../../src/config";
import type { ClassifiedCandidate } from "../../src/sources/types";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  getInput: vi.fn(() => "fake-token"),
}));

const baseConfig = {
  description: "test",
  list_file: "README.md",
  sources: {
    github: { topics: ["test"], min_stars: 0, created_after: "30d" },
  },
  classification: {
    model: "claude-sonnet-4-6",
    threshold: 70,
    max_issues_per_run: 5,
  },
  issue_template: { labels: ["radar", "needs-review"] },
} as RadarConfig;

const mockClassified: ClassifiedCandidate = {
  url: "https://github.com/test/repo",
  title: "test/repo",
  description: "A great GPU library",
  source: "github",
  metadata: { stars: 42, language: "Rust", topics: ["gpu"] },
  relevanceScore: 85,
  suggestedCategory: "Libraries",
  suggestedTags: ["gpu", "msm"],
  reasoning: "Directly relevant to GPU-accelerated ZK",
};

const mockClient = (): IssueClient & {
  listIssues: ReturnType<typeof vi.fn>;
  createIssue: ReturnType<typeof vi.fn>;
} => ({
  listIssues: vi.fn().mockResolvedValue([]),
  createIssue: vi
    .fn()
    .mockResolvedValue({ number: 1, html_url: "https://github.com/test/1" }),
});

describe("escapeTableCell", () => {
  it("escapes pipe characters", () => {
    expect(escapeTableCell("a|b|c")).toBe("a\\|b\\|c");
  });

  it("replaces newlines with spaces", () => {
    expect(escapeTableCell("line1\nline2")).toBe("line1 line2");
  });
});

describe("buildIssueTitle", () => {
  it("prefixes with [Radar]", () => {
    expect(buildIssueTitle(mockClassified)).toBe("[Radar] test/repo");
  });

  it("escapes pipe characters in title", () => {
    const candidate = { ...mockClassified, title: "repo | with pipes" };
    expect(buildIssueTitle(candidate)).toBe("[Radar] repo \\| with pipes");
  });
});

describe("buildIssueBody", () => {
  it("includes all candidate details", () => {
    const body = buildIssueBody(mockClassified);

    expect(body).toContain("https://github.com/test/repo");
    expect(body).toContain("github");
    expect(body).toContain("85/100");
    expect(body).toContain("Libraries");
    expect(body).toContain("`gpu`");
    expect(body).toContain("`msm`");
    expect(body).toContain("42");
    expect(body).toContain("Rust");
    expect(body).toContain("Directly relevant");
    expect(body).toContain("Suggested Entry");
  });

  it("wraps description and reasoning in code blocks", () => {
    const body = buildIssueBody(mockClassified);

    // Check description is in code block
    expect(body).toMatch(/```\nA great GPU library\n```/);
    // Check reasoning is in code block
    expect(body).toMatch(/```\nDirectly relevant to GPU-accelerated ZK\n```/);
  });

  it("handles missing optional metadata", () => {
    const candidate: ClassifiedCandidate = {
      ...mockClassified,
      metadata: {},
      suggestedTags: [],
    };

    const body = buildIssueBody(candidate);
    expect(body).not.toContain("Stars");
    expect(body).not.toContain("Language");
    expect(body).not.toContain("Tags");
  });

  it("escapes pipe characters in table cells", () => {
    const candidate: ClassifiedCandidate = {
      ...mockClassified,
      suggestedCategory: "Tools | Libraries",
      metadata: { language: "C|C++" },
    };

    const body = buildIssueBody(candidate);
    expect(body).toContain("Tools \\| Libraries");
    expect(body).toContain("C\\|C++");
  });
});

describe("createIssues", () => {
  it("creates issues for classified candidates", async () => {
    const client = mockClient();
    const count = await createIssues([mockClassified], baseConfig, false, client);

    expect(count).toBe(1);
    expect(client.createIssue).toHaveBeenCalledTimes(1);
    expect(client.createIssue).toHaveBeenCalledWith(
      "[Radar] test/repo",
      expect.stringContaining("https://github.com/test/repo"),
      ["radar", "needs-review"]
    );
  });

  it("skips candidates with existing issues (idempotency)", async () => {
    const client = mockClient();
    client.listIssues.mockResolvedValue([
      {
        title: "[Radar] test/repo",
        body: "| **URL** | https://github.com/test/repo |",
      },
    ]);

    const count = await createIssues([mockClassified], baseConfig, false, client);

    expect(count).toBe(0);
    expect(client.createIssue).not.toHaveBeenCalled();
  });

  it("idempotency check is case-insensitive", async () => {
    const client = mockClient();
    client.listIssues.mockResolvedValue([
      {
        title: "[Radar] test/repo",
        body: "| **URL** | https://GitHub.com/Test/Repo |",
      },
    ]);

    const count = await createIssues([mockClassified], baseConfig, false, client);
    expect(count).toBe(0);
  });

  it("logs but does not create in dry run mode", async () => {
    const client = mockClient();
    const count = await createIssues([mockClassified], baseConfig, true, client);

    expect(count).toBe(1);
    expect(client.createIssue).not.toHaveBeenCalled();
  });

  it("handles issue creation errors gracefully", async () => {
    const client = mockClient();
    client.createIssue.mockRejectedValue(new Error("403 Forbidden"));

    const count = await createIssues([mockClassified], baseConfig, false, client);
    expect(count).toBe(0);
  });

  it("continues creating issues after a single failure", async () => {
    const client = mockClient();
    client.createIssue
      .mockRejectedValueOnce(new Error("403"))
      .mockResolvedValueOnce({ number: 2, html_url: "https://github.com/test/2" });

    const second = { ...mockClassified, url: "https://github.com/test/other" };
    const count = await createIssues(
      [mockClassified, second],
      baseConfig,
      false,
      client
    );

    expect(count).toBe(1);
    expect(client.createIssue).toHaveBeenCalledTimes(2);
  });

  it("returns 0 for empty candidates", async () => {
    const count = await createIssues([], baseConfig, false);
    expect(count).toBe(0);
  });

  it("handles failure to list existing issues", async () => {
    const client = mockClient();
    client.listIssues.mockRejectedValue(new Error("network error"));

    const count = await createIssues([mockClassified], baseConfig, false, client);

    expect(count).toBe(1);
    expect(client.createIssue).toHaveBeenCalledTimes(1);
  });
});
