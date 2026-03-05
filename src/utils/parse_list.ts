export interface CategoryNode {
  name: string;
  level: number;
  children: CategoryNode[];
}

export function extractCategories(markdown: string): CategoryNode[] {
  const lines = markdown.split("\n");
  const root: CategoryNode[] = [];
  const stack: { node: CategoryNode; level: number }[] = [];

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)/);
    if (!match) continue;

    const level = match[1].length; // 2 or 3
    const name = match[2].trim();
    const node: CategoryNode = { name, level, children: [] };

    // Pop stack until we find parent
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, level });
  }

  return root;
}

export function formatCategoryTree(
  nodes: CategoryNode[],
  indent: number = 0
): string {
  return nodes
    .map((node) => {
      const prefix = "  ".repeat(indent) + "- ";
      const children =
        node.children.length > 0
          ? "\n" + formatCategoryTree(node.children, indent + 1)
          : "";
      return prefix + node.name + children;
    })
    .join("\n");
}
