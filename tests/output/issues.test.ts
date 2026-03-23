import { describe, it, expect, vi } from "vitest";
import {
  createIssues,
  buildIssueTitle,
  buildIssueBody,
  escapeTableCell,
  renderTemplate,
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
    max_classifications_per_run: 5,
  },
  issue_template: { labels: ["radar", "needs-review"], title_prefix: "[Radar]" },
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
    expect(buildIssueTitle(mockClassified, baseConfig)).toBe("[Radar] test/repo");
  });

  it("escapes pipe characters in title", () => {
    const candidate = { ...mockClassified, title: "repo | with pipes" };
    expect(buildIssueTitle(candidate, baseConfig)).toBe("[Radar] repo \\| with pipes");
  });

  it("uses custom title_prefix", () => {
    const config = {
      ...baseConfig,
      issue_template: { ...baseConfig.issue_template, title_prefix: "[New]" },
    } as RadarConfig;
    expect(buildIssueTitle(mockClassified, config)).toBe("[New] test/repo");
  });
});

describe("buildIssueBody", () => {
  it("includes all candidate details", () => {
    const body = buildIssueBody(mockClassified, baseConfig);

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
    const body = buildIssueBody(mockClassified, baseConfig);

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

    const body = buildIssueBody(candidate, baseConfig);
    expect(body).not.toContain("Stars");
    expect(body).not.toContain("Language");
    expect(body).not.toContain("Tags");
  });

  it("includes new metadata table rows when fields are present", () => {
    const candidate: ClassifiedCandidate = {
      ...mockClassified,
      metadata: {
        stars: 42,
        language: "Rust",
        topics: ["gpu"],
        license: "MIT",
        archived: false,
        fork: true,
        owner: "testorg",
        homepage: "https://example.com",
        lastPushedAt: "2025-01-15T00:00:00Z",
      },
    };

    const body = buildIssueBody(candidate, baseConfig);
    expect(body).toContain("| **License** | MIT |");
    expect(body).toContain("| **Archived** | No |");
    expect(body).toContain("| **Fork** | Yes |");
    expect(body).toContain("| **Owner** | testorg |");
    expect(body).toContain("| **Homepage** | https://example.com |");
    expect(body).toContain("| **Last Pushed** | 2025-01-15T00:00:00Z |");
  });

  it("escapes pipe characters in table cells", () => {
    const candidate: ClassifiedCandidate = {
      ...mockClassified,
      suggestedCategory: "Tools | Libraries",
      metadata: { language: "C|C++" },
    };

    const body = buildIssueBody(candidate, baseConfig);
    expect(body).toContain("Tools \\| Libraries");
    expect(body).toContain("C\\|C++");
  });

  it("include_fields limits which metadata rows appear", () => {
    const config = {
      ...baseConfig,
      issue_template: { ...baseConfig.issue_template, include_fields: ["url", "stars"] },
    } as RadarConfig;
    const body = buildIssueBody(mockClassified, config);

    expect(body).toContain("**URL**");
    expect(body).toContain("**Stars**");
    expect(body).not.toContain("**Source**");
    expect(body).not.toContain("**Relevance Score**");
    expect(body).not.toContain("**Suggested Category**");
    expect(body).not.toContain("**Tags**");
    expect(body).not.toContain("**Language**");
  });

  it("suggested_entry_format renders with candidate data", () => {
    const config = {
      ...baseConfig,
      issue_template: {
        ...baseConfig.issue_template,
        suggested_entry_format: "- [{{name}}]({{url}}) {{stars}} stars, {{language}}",
      },
    } as RadarConfig;
    const body = buildIssueBody(mockClassified, config);

    expect(body).toContain("- [test/repo](https://github.com/test/repo) 42 stars, Rust");
  });

  it("default behavior unchanged without new config fields", () => {
    const body = buildIssueBody(mockClassified, baseConfig);
    expect(body).toContain("- [test/repo](https://github.com/test/repo) - A great GPU library");
  });
});

describe("renderTemplate", () => {
  it("replaces all supported placeholders", () => {
    const template = "{{name}} at {{url}} ({{source}}) - {{description}} [{{language}}, {{stars}} stars, {{category}}]";
    const result = renderTemplate(template, mockClassified);
    expect(result).toBe("test/repo at https://github.com/test/repo (github) - A great GPU library [Rust, 42 stars, Libraries]");
  });

  it("handles missing optional fields gracefully", () => {
    const candidate: ClassifiedCandidate = {
      ...mockClassified,
      metadata: {},
    };
    const template = "{{name}} - {{language}} {{stars}} {{license}}";
    const result = renderTemplate(template, candidate);
    expect(result).toBe("test/repo -   ");
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

  it("idempotency check is case-insensitive and normalized", async () => {
    const client = mockClient();
    client.listIssues.mockResolvedValue([
      {
        title: "[Radar] test/repo",
        body: "| **URL** | http://www.GitHub.com/Test/Repo/ |",
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

  it("skips candidates matching closed issue URLs", async () => {
    const client = mockClient();
    client.listIssues.mockResolvedValue([
      {
        title: "[Radar] previously-rejected/repo",
        body: "| **URL** | https://github.com/test/repo |",
      },
    ]);

    const count = await createIssues([mockClassified], baseConfig, false, client);

    expect(count).toBe(0);
    expect(client.createIssue).not.toHaveBeenCalled();
  });

  it("dedup normalizes URLs (protocol, www, trailing slash)", async () => {
    const client = mockClient();
    client.listIssues.mockResolvedValue([
      {
        title: "[Radar] some repo",
        body: "| **URL** | https://www.github.com/test/repo/ |",
      },
    ]);

    const candidate = {
      ...mockClassified,
      url: "https://github.com/test/repo",
    };
    const count = await createIssues([candidate], baseConfig, false, client);

    expect(count).toBe(0);
    expect(client.createIssue).not.toHaveBeenCalled();
  });
});
