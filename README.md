# Awesome List Radar

A GitHub Action that automatically discovers relevant content for awesome lists and files issues for maintainer triage.

Awesome lists suffer from **decay**: new projects appear that nobody submits, links rot, and maintainers burn out on manual curation. Awesome List Radar shifts the maintainer's role from "find everything yourself" to "approve or reject suggestions."

## How It Works

4-stage pipeline: **Collect → Filter → Classify → Output**

1. **Collect** — Scans GitHub repos, arXiv papers, and blog RSS feeds for new content
2. **Filter** — Matches candidates by keywords/topics and deduplicates against your existing list
3. **Classify** — Scores relevance using Claude API with structured reasoning
4. **Output** — Creates GitHub Issues with metadata, suggested entry, and LLM reasoning

## Quick Start

### 1. Add a config file

Create `radar.config.yml` in your awesome list repo:

```yaml
description: >
  GPU-accelerated zero-knowledge cryptography for consumer devices

list_file: README.md

sources:
  github:
    topics: [webgpu, gpu-crypto, msm, ntt, zero-knowledge]
    languages: [rust, cuda, metal, wgsl]
    min_stars: 5
    created_after: "30d"
  arxiv:
    categories: [cs.CR, cs.DC]
    keywords: [GPU, MSM, NTT, zero-knowledge, proving]
  blogs:
    feeds:
      - https://blog.example.com/feed.xml
    keywords: [gpu proving, client-side zk]

classification:
  model: claude-sonnet-4-6
  threshold: 70
  max_issues_per_run: 5

issue_template:
  labels: [radar, needs-review]
```

### 2. Add the workflow

Create `.github/workflows/radar.yml`:

```yaml
name: Awesome List Radar

on:
  schedule:
    - cron: '0 9 * * 1'  # Weekly on Monday at 9am UTC
  workflow_dispatch:       # Manual trigger

jobs:
  radar:
    runs-on: ubuntu-latest
    permissions:
      issues: write

    steps:
      - uses: actions/checkout@v4

      - uses: moven0831/awesome-list-radar@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 3. Add your Anthropic API key

Go to **Settings → Secrets and variables → Actions** and add `ANTHROPIC_API_KEY`.

## Config Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `description` | string | *required* | What your awesome list is about (fed to the LLM for scoring) |
| `list_file` | string | `README.md` | Path to the markdown file containing your list |
| **sources.github** | | | |
| `topics` | string[] | *required* | GitHub topics to search for |
| `languages` | string[] | — | Filter by programming language |
| `min_stars` | number | `0` | Minimum star count |
| `created_after` | string | `"30d"` | Only repos created within this window (e.g., `"30d"`, `"7d"`) |
| **sources.arxiv** | | | |
| `categories` | string[] | *required* | arXiv categories (e.g., `cs.CR`, `cs.DC`) |
| `keywords` | string[] | *required* | Search keywords |
| **sources.blogs** | | | |
| `feeds` | string[] | *required* | RSS/Atom feed URLs |
| `keywords` | string[] | — | Filter feed entries by keywords |
| **classification** | | | |
| `model` | string | `claude-sonnet-4-6` | Anthropic model to use |
| `threshold` | number | `70` | Minimum relevance score (0-100) to create an issue |
| `max_issues_per_run` | number | `5` | Max candidates to classify per run (controls API cost) |
| **issue_template** | | | |
| `labels` | string[] | `["radar", "needs-review"]` | Labels to apply to created issues |

## Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `config_path` | No | `radar.config.yml` | Path to your config file |
| `github_token` | Yes | — | GitHub token for API access and issue creation |
| `anthropic_api_key` | Yes | — | Anthropic API key for relevance scoring |
| `dry_run` | No | `false` | Log candidates without creating issues |

## Action Outputs

| Output | Description |
|--------|-------------|
| `candidates_found` | Total candidates discovered |
| `candidates_filtered` | Candidates after keyword/dedup filtering |
| `issues_created` | Number of issues created |

## Example Issue

Issues are created with a metadata table, description, LLM reasoning, and a suggested markdown entry:

```
## Candidate Resource

| Field | Value |
|-------|-------|
| **URL** | https://github.com/example/gpu-msm |
| **Source** | github |
| **Relevance Score** | 85/100 |
| **Suggested Category** | Libraries |
| **Tags** | `gpu`, `msm` |
| **Stars** | 42 |
| **Language** | Rust |

## Description
GPU-accelerated multi-scalar multiplication for ZK proofs

## LLM Reasoning
Directly relevant — implements MSM on consumer GPUs via WebGPU...

## Suggested Entry
- [example/gpu-msm](https://github.com/example/gpu-msm) - GPU-accelerated multi-scalar multiplication
```

## Development

```bash
npm install
npm test          # Run tests (84 tests)
npm run lint      # Type check
npm run build     # Compile to dist/
```

## License

MIT
