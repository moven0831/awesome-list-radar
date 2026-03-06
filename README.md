# Awesome List Radar

A GitHub Action that automatically discovers relevant content for awesome lists and files issues for maintainer triage.

Awesome lists suffer from **decay**: new projects appear that nobody submits, links rot, and maintainers burn out on manual curation. Awesome List Radar shifts the maintainer's role from "find everything yourself" to "approve or reject suggestions."

## How It Works

4-stage pipeline: **Collect → Filter → Classify → Output**

1. **Collect** — Scans GitHub repos, arXiv papers, blog RSS feeds, web pages, and package registries (npm, PyPI, crates.io) for new content
2. **Filter** — Matches candidates by keywords/topics, metadata filters, and deduplicates against your existing list
3. **Classify** — Scores relevance using any OpenAI-compatible LLM (Anthropic, OpenAI, Google, or custom endpoint) with structured reasoning and budget control
4. **Output** — Creates GitHub Issues with metadata, suggested entry, and LLM reasoning

## Quick Start

### 1. Add a config file

Create `radar.config.yml` in your awesome list repo:

```yaml
description: >
  A curated list of machine learning tools and frameworks.
  Describe what belongs in the list so the LLM can score
  relevance accurately.

list_file: README.md
state_file: .radar-state.json  # Incremental state (watermark)

sources:
  github:
    topics: [machine-learning, deep-learning, neural-network]
    languages: [python, typescript]
    min_stars: 10
    created_after: "30d"
    max_results: 100          # Up to 1000
    sort: stars               # stars | updated | best-match
    exclude_forks: true
    exclude_archived: true
  arxiv:
    categories: [cs.LG, cs.AI]
    keywords: [machine learning, deep learning, transformer]
    max_results: 50
  blogs:
    feeds:
      - https://blog.example.com/feed.xml
    keywords: [machine learning, deep learning]
  web_pages:
    urls:
      - https://example.com/ml-tools
    keywords: [machine learning]
    model: claude-haiku-4-5-20251001
    request_timeout: 30000
  registries:
    - type: npm
      keywords: [machine-learning]
      min_downloads: 100
      max_results: 50
    - type: pypi
      keywords: [deep-learning]

filter:
  include: [machine learning, deep learning]
  exclude: [deprecated, archived]
  require_all: [python]          # All keywords must match
  exclude_forks: true
  exclude_archived: true
  require_license: true
  max_age_days: 90

classification:
  provider: anthropic           # anthropic | openai | google
  model: claude-sonnet-4-6      # Optional: defaults based on provider
  threshold: 70
  max_classifications_per_run: 5   # Replaces deprecated max_issues_per_run
  max_budget_usd: 1.00

issue_template:
  labels: [radar, needs-review]
  title_prefix: "[Radar]"
  include_fields: [url, source, relevanceScore, suggestedCategory, tags, stars, language]
  suggested_entry_format: "- [{{name}}]({{url}}) - {{description}}"
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
          llm_api_key: ${{ secrets.LLM_API_KEY }}
          # llm_provider: anthropic  # or openai, google (default: anthropic)
```

### 3. Add your LLM API key

Go to **Settings → Secrets and variables → Actions** and add `LLM_API_KEY` with your provider's API key.

Supported providers:
| Provider | Default Model | API Key Source |
|----------|--------------|----------------|
| `anthropic` (default) | `claude-sonnet-4-6` | [Anthropic Console](https://console.anthropic.com/) |
| `openai` | `gpt-4o-mini` | [OpenAI Platform](https://platform.openai.com/) |
| `google` | `gemini-2.0-flash` | [Google AI Studio](https://aistudio.google.com/) |

You can also use any OpenAI-compatible endpoint (Ollama, vLLM, Together AI, etc.) by setting `base_url` in your classification config:

```yaml
classification:
  base_url: http://localhost:11434/v1/  # Ollama
  model: llama3
```

## Config Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `description` | string | *required* | What your awesome list is about (fed to the LLM for scoring) |
| `list_file` | string | `README.md` | Path to the markdown file containing your list |
| `state_file` | string | `.radar-state.json` | Path to the incremental state / watermark file |
| **sources.github** | | | |
| `topics` | string[] | *required* | GitHub topics to search for |
| `languages` | string[] | — | Filter by programming language |
| `min_stars` | number | `0` | Minimum star count |
| `created_after` | string | `"30d"` | Only repos created within this window (e.g., `"30d"`, `"7d"`) |
| `max_results` | number | `100` | Maximum results per search (1–1000) |
| `sort` | string | `"stars"` | Sort order: `stars`, `updated`, or `best-match` |
| `exclude_forks` | boolean | `false` | Exclude forked repositories |
| `exclude_archived` | boolean | `false` | Exclude archived repositories |
| **sources.arxiv** | | | |
| `categories` | string[] | *required* | arXiv categories (e.g., `cs.CR`, `cs.DC`) |
| `keywords` | string[] | *required* | Search keywords |
| `max_results` | number | `50` | Maximum results (1–500) |
| `date_range` | object | — | `{ start, end }` in `YYYYMMDD` format |
| **sources.blogs** | | | |
| `feeds` | string[] | *required* | RSS/Atom feed URLs |
| `keywords` | string[] | — | Filter feed entries by keywords |
| **sources.web_pages** | | | |
| `urls` | string[] | *required* | Web page URLs to scan |
| `provider` | string | — | LLM provider override for extraction (falls back to classification provider) |
| `keywords` | string[] | — | Filter extracted content by keywords |
| `model` | string | — | Model for content extraction (falls back to classification model) |
| `request_timeout` | number | `30000` | HTTP request timeout in ms (1000–120000) |
| `extraction_prompt` | string | — | Custom prompt for content extraction |
| `user_agent` | string | — | Custom User-Agent header |
| **sources.registries[]** | | | |
| `type` | string | *required* | Registry type: `npm`, `pypi`, or `crates` |
| `keywords` | string[] | *required* | Search keywords |
| `min_downloads` | number | `0` | Minimum download count |
| `max_results` | number | `50` | Maximum results (1–250) |
| **filter** | | | |
| `include` | string[] | — | Keywords to match (any must match) |
| `require_all` | string[] | — | Keywords that must all match |
| `exclude` | string[] | — | Keywords to reject |
| `exclude_forks` | boolean | `false` | Exclude forked repositories |
| `exclude_archived` | boolean | `false` | Exclude archived repositories |
| `require_license` | boolean | `false` | Only include candidates with a license |
| `max_age_days` | number | — | Maximum age of candidate in days |
| **classification** | | | |
| `provider` | string | `"anthropic"` | LLM provider: `anthropic`, `openai`, or `google` |
| `base_url` | string | — | Custom OpenAI-compatible API base URL (overrides provider default) |
| `model` | string | *per-provider* | Model name (defaults: anthropic→`claude-sonnet-4-6`, openai→`gpt-4o-mini`, google→`gemini-2.0-flash`) |
| `threshold` | number | `70` | Minimum relevance score (0-100) to create an issue |
| `max_classifications_per_run` | number | `5` | Max candidates to classify per run (controls API cost) |
| `max_budget_usd` | number | — | Maximum estimated LLM cost per run in USD |
| `system_prompt` | string | — | Custom system prompt for classification |
| `context` | string | — | Additional context for the classifier |
| `categories` | string[] | — | Custom category names for classification |
| **issue_template** | | | |
| `labels` | string[] | `["radar", "needs-review"]` | Labels to apply to created issues |
| `title_prefix` | string | `"[Radar]"` | Prefix for issue titles |
| `include_fields` | string[] | — | Fields to include in the issue body |
| `suggested_entry_format` | string | — | Template for the suggested markdown entry |

## Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `config_path` | No | `radar.config.yml` | Path to your config file |
| `github_token` | Yes | — | GitHub token for API access and issue creation |
| `llm_api_key` | Yes* | — | API key for the LLM provider |
| `anthropic_api_key` | No | — | *Deprecated*: use `llm_api_key` instead |
| `llm_provider` | No | `anthropic` | LLM provider: `anthropic`, `openai`, or `google` |
| `dry_run` | No | `false` | Log candidates without creating issues |

\* Either `llm_api_key` or `anthropic_api_key` must be provided.

## Action Outputs

| Output | Description |
|--------|-------------|
| `candidates_found` | Total candidates discovered |
| `candidates_filtered` | Candidates after keyword/dedup filtering |
| `issues_created` | Number of issues created |

## Example Issue

Issues are created with a metadata table, description, LLM reasoning, and a suggested markdown entry:

````
## Candidate Resource

| Field | Value |
|-------|-------|
| **URL** | https://github.com/example/cool-ml-lib |
| **Source** | github |
| **Relevance Score** | 85/100 |
| **Suggested Category** | Libraries |
| **Tags** | `deep-learning`, `transformer` |
| **Stars** | 120 |
| **Language** | Python |

## Description

```
A lightweight library for building and training transformer models...
```

## LLM Reasoning

```
Directly relevant — provides a clean API for the core topic of the list...
```

## Suggested Entry

```markdown
- [example/cool-ml-lib](https://github.com/example/cool-ml-lib) - A lightweight library for building transformers
```
````

## Development

```bash
bun install
bun test          # Run tests (232 tests)
bun run lint      # Type check
bun run build     # Compile to dist/
```

## License

MIT
