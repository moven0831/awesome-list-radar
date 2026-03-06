import { describe, it, expect } from "vitest";
import {
  extractCategories,
  formatCategoryTree,
} from "../../src/utils/parse_list";

describe("extractCategories", () => {
  it("extracts ## and ### headers from markdown", () => {
    const markdown = `# Title
## Libraries
### GPU Libraries
### CPU Libraries
## Tools
### CLI Tools
## Resources
`;
    const categories = extractCategories(markdown);

    expect(categories).toHaveLength(3);
    expect(categories[0].name).toBe("Libraries");
    expect(categories[0].level).toBe(2);
    expect(categories[0].children).toHaveLength(2);
    expect(categories[0].children[0].name).toBe("GPU Libraries");
    expect(categories[0].children[0].level).toBe(3);
    expect(categories[0].children[1].name).toBe("CPU Libraries");
    expect(categories[1].name).toBe("Tools");
    expect(categories[1].children).toHaveLength(1);
    expect(categories[1].children[0].name).toBe("CLI Tools");
    expect(categories[2].name).toBe("Resources");
    expect(categories[2].children).toHaveLength(0);
  });

  it("builds nested category tree correctly", () => {
    const markdown = `## A
### A1
### A2
## B
### B1
`;
    const tree = extractCategories(markdown);

    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].name).toBe("A1");
    expect(tree[0].children[1].name).toBe("A2");
    expect(tree[1].children).toHaveLength(1);
    expect(tree[1].children[0].name).toBe("B1");
  });

  it("handles empty markdown", () => {
    expect(extractCategories("")).toEqual([]);
  });

  it("handles markdown with no headers", () => {
    const markdown = `This is just a paragraph.

And another paragraph with some **bold** text.

- A list item
- Another item
`;
    expect(extractCategories(markdown)).toEqual([]);
  });

  it("ignores h1 and h4+ headers", () => {
    const markdown = `# Title
## Section
#### Deep header
##### Even deeper
`;
    const categories = extractCategories(markdown);
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe("Section");
    expect(categories[0].children).toHaveLength(0);
  });
});

describe("formatCategoryTree", () => {
  it("formats tree as indented string", () => {
    const nodes = [
      {
        name: "Libraries",
        level: 2,
        children: [
          { name: "GPU Libraries", level: 3, children: [] },
          { name: "CPU Libraries", level: 3, children: [] },
        ],
      },
      { name: "Tools", level: 2, children: [] },
    ];

    const result = formatCategoryTree(nodes);
    expect(result).toBe(
      `- Libraries\n  - GPU Libraries\n  - CPU Libraries\n- Tools`
    );
  });

  it("handles empty array", () => {
    expect(formatCategoryTree([])).toBe("");
  });

  it("handles flat list without children", () => {
    const nodes = [
      { name: "A", level: 2, children: [] },
      { name: "B", level: 2, children: [] },
    ];
    expect(formatCategoryTree(nodes)).toBe("- A\n- B");
  });
});
