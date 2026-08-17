# Usage analytics product landscape

Research snapshot: 2026-08-16.

This review focuses on products that answer one or more of these questions:

- How much model usage occurred?
- What did it cost or approximately cost?
- Which provider/model/project/session caused it?
- How much prepaid balance or subscription quota remains?
- When will a rolling or calendar quota reset?
- Can the data be exported, alerted on, or used to enforce a budget?

## Product groups

### 1. Provider billing dashboards

Examples:

- [OpenAI API Usage Dashboard](https://help.openai.com/en/articles/10478918-api-usage-dashboard) and [monthly usage export](https://help.openai.com/en/articles/20001072-how-do-i-export-monthly-usage-details-from-the-api-usage-dashboard)
- [Anthropic Console cost and usage reporting](https://support.claude.com/zh-TW/articles/9534590-claude-%E6%8E%A7%E5%88%B6%E5%8F%B0%E4%B8%AD%E7%9A%84%E6%88%90%E6%9C%AC%E5%92%8C%E4%BD%BF%E7%94%A8%E6%83%85%E6%B3%81%E5%A0%B1%E5%91%8A) and the [Usage & Cost API](https://platform.claude.com/docs/zh-TW/manage-claude/usage-cost-api)
- [OpenRouter Activity Export](https://openrouter.ai/docs/cookbook/administration/activity-export)

Strengths:

- closest to invoice-grade source data;
- understands provider-specific discounts, service tiers, cache categories, and billing corrections;
- usually offers organization/project/API-key filters and export.

Limitations:

- one provider per dashboard;
- billing data can lag local events;
- subscription quota/reset semantics and API billing are often separate;
- local agent/session context is usually absent;
- users must send usage to that provider before it appears.

Implication for dsh-hub-oauth-gateway: account APIs remain authoritative for balance/quota, but local DSH events provide faster cross-provider usage. The UI must label local cost as estimated and expose pricing coverage rather than pretending to reproduce an invoice.

### 2. LLM observability platforms

Examples:

- [Langfuse model usage and cost tracking](https://python-sdk-v2.docs-snapshot.langfuse.com/docs/observability/features/token-and-cost-tracking/#compatibility-with-openai)
- [Helicone cost tracking and optimization](https://docs.helicone.ai/guides/cookbooks/cost-tracking)
- [Vercel AI Gateway observability and spend](https://vercel.com/docs/ai-gateway/observability-and-spend) plus [custom reporting](https://vercel.com/docs/ai-gateway/observability-and-spend/custom-reporting)

Strengths:

- deep trace/request/session/user dimensions;
- latency, errors, prompt/version/evaluation context alongside cost;
- configurable model prices and custom reporting;
- strong drill-down from aggregate chart to individual request.

Limitations:

- commonly requires an SDK, proxy, gateway, or remote telemetry pipeline;
- rich request logs can contain prompts, responses, user identifiers, and metadata;
- operating and privacy scope is much larger than a local usage widget;
- account quota and reset-window monitoring is not usually the primary model.

Implication: adopt their overview → trend → breakdown information hierarchy and explicit model-price definitions, but do not ingest prompts/responses or require traffic proxying. Session identifiers are opt-in at the presentation boundary.

### 3. Gateway spend and budget control

Examples:

- [LiteLLM Virtual Keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
- [LiteLLM tag budgets](https://docs.litellm.ai/docs/proxy/tag_budgets)
- Vercel AI Gateway usage/spend reporting above

Strengths:

- centralized multi-provider accounting;
- budgets by key, user, team, project, or tag;
- can enforce limits instead of only displaying them;
- suitable for shared organizations.

Limitations:

- all traffic must traverse the gateway;
- gateway metering can diverge from provider invoices;
- administration and credential scope are much broader;
- hard enforcement is dangerous when the data is stale or partial.

Implication: dsh-hub-oauth-gateway implements local soft alerts, not hard budget enforcement. If a user needs authoritative multi-user limits, a gateway product is the correct control plane.

### 4. Local CLI/session analyzers

Examples:

- [ccusage](https://github.com/ccusage/ccusage), which analyzes local Claude Code JSONL data
- [claude-usage](https://github.com/flukelaster/claude-usage), a local Claude Code usage/cost dashboard
- menu-bar tools such as [CodexBar's OpenAI integration](https://github.com/steipete/CodexBar/blob/main/docs/openai.md)

Strengths:

- local-first and fast;
- works from existing agent logs without a proxy;
- daily/monthly/session/block views fit individual developers;
- low setup cost.

Limitations:

- commonly focused on one agent or provider;
- historical parsers are coupled to log format changes;
- account balance and subscription windows may require separate credential-bearing calls;
- local timezone and duplicate streaming snapshots are easy sources of incorrect totals.

Implication: preserve local-first operation, but normalize facts in SQLite, isolate corrupt sessions, maintain projection cursors, and key facts by logical turn/step so re-reading a snapshot cannot double-count it.

### 5. General metrics dashboards

Grafana-style systems provide flexible panels and alerting, but high-cardinality dimensions require care; Grafana documents [cardinality management dashboards](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/analyze-costs/metrics-costs/prometheus-metrics-costs/cardinality-management/) and [alerting best practices](https://grafana.com/docs/grafana/v12.2/alerting/best-practices/index.xml#7).

Implication: provider and model are safe default groupings. Raw session ID is high-cardinality and privacy-sensitive, so it is disabled by default and anonymized when hidden. Alerts remain a small, understandable set instead of generating one rule per session/model.

## Comparative matrix

| Capability | Provider dashboard | Observability platform | Gateway/budget | Local analyzer | dsh-hub-oauth-gateway 1.0 |
| --- | --- | --- | --- | --- | --- |
| Cross-provider view | Rare | Yes | Yes | Sometimes | Yes |
| Invoice-grade cost | Best available | Estimated/reconciled | Metered estimate | Estimated | Explicit estimate + coverage |
| Local session context | No | Yes, often uploaded | Via metadata | Yes | Optional/anonymized |
| Prompt/response tracing | Provider-dependent | Core feature | Optional | Often local | Deliberately excluded |
| Account balance | Provider-specific | Rare | Gateway balance | Rare | Adapter snapshots |
| Subscription windows/reset | Provider-specific | Rare | Budget windows | Sometimes | Unified quota windows |
| Hard budget enforcement | Provider controls | Sometimes | Core feature | No | No; soft alerts only |
| Export | Common | Common | Common | CLI files | CSV + JSON |
| Local-only history | No | Self-host option | Self-host option | Yes | Yes |
| Passive setup | Account already exists | Instrumentation needed | Routing needed | Log parser | DSH plugin only |

## Presentation patterns selected for 1.0

### Layered information density

- **Quick Peek**: a low-interruption summary from the sidebar.
- **Full Dashboard**: KPIs, trend, accounts, alerts, and breakdown.
- **Settings**: operational choices and credentials stay outside the analytics surface.

Presets expose different jobs without requiring users to configure every panel:

- `minimal`: headline usage only;
- `quota`: account/quota operation view;
- `cost`: estimated spend and cost breakdown;
- `analyst`: trend and detailed dimensions.

### Cost honesty

A single currency total is visually useful but can be dangerously misleading. The implementation therefore:

- requires explicit rules;
- keeps unavailable Token categories as `null` prices;
- calculates a Token-weighted coverage ratio;
- labels all amounts estimated;
- gives user rules priority and supports effective dates;
- ships no volatile guessed price catalog.

### Calendar correctness

“Today” and “this month” use the configured IANA timezone, not browser-local midnight. Server and client share the same bucket implementation, including DST behavior. This follows the user expectation set by billing dashboards while remaining explicit about the configured reporting zone.

### Forecast restraint

Forecast is useful for directional awareness but weak with sparse local data. It is:

- computed only from multiple historical buckets;
- bounded to nonnegative values;
- visually dashed;
- kept distinct from observed points;
- never included as billed/actual spend.

### Partial failure over blank screens

A failed account provider should not hide local token history, and one bad session should not stop the full projection. API metadata carries `partial`, `stale`, and sanitized warnings. The client contains series, account, alert, and breakdown errors within their own sections.

### Privacy by default

Observability platforms show the value of session drill-down, but local coding sessions can still be sensitive. The default is therefore:

- no prompts, responses, cwd, or raw payload persistence;
- no credential values in browser, logs, DB, exports, or docs;
- anonymized session keys and labels;
- a separate export-redaction control;
- local API and outbound target policies.

## Features intentionally not included

- prompt/response tracing;
- cloud sync or team dashboards;
- automatic provider price scraping;
- currency conversion;
- hard spend blocking;
- arbitrary user JavaScript adapters;
- automatic browser OAuth with a bundled third-party client ID;
- a public network listener.

These exclusions keep the plugin's permission, privacy, and operational scope proportional to a local DSH usage viewer.
