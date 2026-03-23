# Issue Dedup: GitHub Issues as Source of Truth

**Issue:** [#29 — duplicate suggestions across runs due to ephemeral state and missing issue dedup](https://github.com/moven0831/awesome-list-radar/issues/29)

**Date:** 2026-03-23

## Problem

The radar can suggest the same resource multiple times across runs because:
1. The state file is ephemeral in CI (lost between runs)
2. The issue dedup only checks **open** issues (misses rejected/closed ones)
3. The issue dedup is capped at **100** results (pagination missing)
4. URL comparison is simple `.toLowerCase()` — misses protocol/www/trailing-slash variants

## Approach

Use GitHub Issues (open + closed, with radar labels) as the primary source of truth for dedup. The local state file remains as-is for within-run tracking but is no longer relied upon across CI runs.

## Changes

### 1. `src/output/issues.ts` — `makeGitHubClient.listIssues`

**Current:** Fetches up to 100 open issues with `state: "open"`, `per_page: 100`.

**New:** Fetches **all** issues (open + closed) with pagination:
- Change `state: "open"` to `state: "all"`
- Add a pagination loop: fetch pages of 100 until an empty page is returned
- Flatten all pages into the returned array

Interface change: `listIssues(labels: string[])` signature stays the same; only the implementation changes.

### 2. `src/output/issues.ts` — `createIssues` URL normalization

**Current:** Builds `existingUrls` set using `.toLowerCase()` on extracted URLs, and checks candidates with `.toLowerCase()`.

**New:** Import `normalizeUrl` from `../filter/dedup` and use it for both:
- Normalizing URLs extracted from existing issue bodies
- Normalizing candidate URLs before comparison

This handles protocol, `www.`, trailing slash, and tracking parameter differences.

### 3. `tests/output/issues.test.ts` — new test cases

Add tests for:
- Candidate matching a **closed** issue URL is skipped
- URL normalization catches variants (`https://github.com/foo/bar` vs `github.com/foo/bar/`)
- Pagination: mock `listIssues` returning issues from multiple "pages" (simulated by returning a larger set)

## Files Affected

| File | Change |
|------|--------|
| `src/output/issues.ts` | `state: "all"`, pagination loop, `normalizeUrl` import |
| `src/filter/dedup.ts` | No changes (already exports `normalizeUrl`) |
| `tests/output/issues.test.ts` | New test cases for closed-issue dedup and normalization |

## Out of Scope

- Persisting the state file via git commit or Actions cache (not needed with issues as source of truth)
- Maintainer feedback loop beyond close/open (e.g., labels for "never suggest again")
- Handling >1000 total radar issues (GitHub API pagination limit; unlikely for awesome-list repos)
