# Issue Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate issue suggestions by using GitHub Issues (open + closed) as the source of truth for dedup.

**Architecture:** Expand `listIssues` in `makeGitHubClient` to fetch all issues (open + closed) with pagination, and use `normalizeUrl` from `dedup.ts` for URL comparison in `createIssues`. No new files or abstractions needed.

**Tech Stack:** TypeScript, Vitest, @actions/github (Octokit), @actions/core

**Spec:** `docs/superpowers/specs/2026-03-23-issue-dedup-design.md`

---

### Task 1: Add tests for closed-issue dedup and URL normalization

**Files:**
- Modify: `tests/output/issues.test.ts`

- [ ] **Step 1: Write failing test — closed issue URL is skipped**

Add to the `createIssues` describe block:

```typescript
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
```

- [ ] **Step 2: Run test to verify it passes (existing dedup already covers this shape)**

Run: `npx vitest run tests/output/issues.test.ts -t "skips candidates matching closed"`
Expected: PASS (the existing code already matches this since `listIssues` mock returns the same shape regardless of open/closed — the real fix is in `makeGitHubClient`, not tested here)

- [ ] **Step 3: Write failing test — URL normalization catches variants**

```typescript
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/output/issues.test.ts -t "dedup normalizes URLs"`
Expected: FAIL — current code uses `.toLowerCase()` which won't match `www.github.com/test/repo/` against `github.com/test/repo`

- [ ] **Step 5: Commit failing test**

```bash
git add tests/output/issues.test.ts
git commit -m "test: add failing test for URL normalization in issue dedup (#29)"
```

---

### Task 2: Implement URL normalization in `createIssues`

**Files:**
- Modify: `src/output/issues.ts:1-5` (imports)
- Modify: `src/output/issues.ts:186-202` (URL extraction and comparison)

- [ ] **Step 1: Add `normalizeUrl` import**

At the top of `src/output/issues.ts`, add import:

```typescript
import { normalizeUrl } from "../filter/dedup";
```

- [ ] **Step 2: Replace `.toLowerCase()` with `normalizeUrl` in URL extraction**

Replace lines 188-197 (the `existingUrls` construction):

```typescript
  const existingUrls = new Set(
    existingIssues
      .map((issue) => {
        const match = issue.body?.match(
          /\| \*\*URL\*\* \| (https?:\/\/[^\s|]+)/
        );
        return match?.[1] ? normalizeUrl(match[1]) : undefined;
      })
      .filter((url): url is string => url !== undefined)
  );
```

- [ ] **Step 3: Replace `.toLowerCase()` with `normalizeUrl` in candidate check**

Replace line 202:

```typescript
    if (existingUrls.has(normalizeUrl(candidate.url))) {
```

- [ ] **Step 4: Run all tests to verify normalization test passes**

Run: `npx vitest run tests/output/issues.test.ts`
Expected: ALL PASS including the new normalization test

- [ ] **Step 5: Commit**

```bash
git add src/output/issues.ts tests/output/issues.test.ts
git commit -m "feat: use normalizeUrl for issue dedup comparison (#29)"
```

---

### Task 3: Implement pagination in `makeGitHubClient.listIssues`

**Files:**
- Modify: `src/output/issues.ts:136-151` (`listIssues` implementation)

- [ ] **Step 1: Replace `listIssues` with paginated implementation**

Replace the current `listIssues` method (lines 136-151):

```typescript
    async listIssues(labels: string[]) {
      const allIssues: { title: string; body?: string }[] = [];
      let page = 1;
      const perPage = 100;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data } = await octokit.rest.issues.listForRepo({
          owner,
          repo,
          state: "all",
          labels: labels.join(","),
          per_page: perPage,
          page,
        });

        for (const i of data) {
          allIssues.push({ title: i.title, body: i.body ?? undefined });
        }

        if (data.length < perPage) break;
        page++;
      }

      core.info(
        `Fetched ${allIssues.length} existing issues (open+closed) for dedup`
      );
      return allIssues;
    },
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run tests/output/issues.test.ts`
Expected: ALL PASS — `listIssues` is mocked in tests, so the real pagination logic isn't exercised by unit tests, but no existing tests should break

- [ ] **Step 3: Commit**

```bash
git add src/output/issues.ts
git commit -m "feat: fetch all open+closed issues with pagination for dedup (#29)"
```

---

### Task 4: Update existing test for case-insensitive normalization

**Files:**
- Modify: `tests/output/issues.test.ts`

- [ ] **Step 1: Update the existing case-insensitive test to use normalized URLs**

The existing test at "idempotency check is case-insensitive" (line 241) tests `.toLowerCase()`. Update it to also verify normalization works with protocol/www differences:

```typescript
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
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run tests/output/issues.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/output/issues.test.ts
git commit -m "test: update case-insensitive test to reflect normalizeUrl (#29)"
```

---

### Task 5: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Verify the stale comment about the 100-issue limitation was already removed**

The comment at the old lines 137-139 was already removed as part of Task 3's full method replacement. Confirm it is no longer present in `src/output/issues.ts`.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Build to verify no compilation errors**

Run: `npm run build`
Expected: Clean build with no errors
