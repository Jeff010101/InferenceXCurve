# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + TypeScript single-page app for recreating the InferenceX throughput/interactivity chart at `https://inferencex.semianalysis.com/inference`.

- `src/main.ts`: application state, filters, editable data panels, CSV/GitHub Actions import, InferenceX sync state, and UI event wiring.
- `src/inferenceXSync.ts`: public InferenceX API client, availability parsing, benchmark filtering, fingerprints, and sync line generation.
- `src/inferenceCurveChart.ts`: reusable D3 chart rendering, roofline calculation, labels, colors, tooltips, and export logic.
- `src/exampleData.ts`: repository-maintained default AgentX reference curve for the ordinary workspace.
- `src/plotTool.ts`: generic X/Y plotting workspace; starts with no example curves.
- `src/styles.css`: global theme, chart layout, legend, and data editor styling.
- `vite.config.ts`: Vite base path and `/inferencex-api` dev proxy.
- `docs/import-csv.md`: public CSV/TSV import contract for external integrations and agent-generated files.
- `scripts/export-benchmark-results.mjs`: thin converter from one shared benchmark file to existing import formats; `docs/shared-benchmark-file.md` documents usage. Keep the shared file as the maintained source; generated views are not separate datasets.
- `index.html`: Vite entry HTML.
- `dist/`: generated production output; do not edit by hand.

There is currently no dedicated `tests/` directory or asset folder.

## Build, Test, and Development Commands

Run these from the repository root:

```bash
npm install
```

Installs dependencies from `package-lock.json`.

```bash
npm run dev
```

Starts the Vite development server on `0.0.0.0`; open the printed localhost URL. In dev, `vite.config.ts` proxies `/inferencex-api` to `https://inferencex.semianalysis.com/api` so public InferenceX API requests avoid browser CORS failures.

```bash
npm run build
```

Runs `tsc` type checking and builds the production bundle with Vite. Use this as the main validation step before submitting changes.

```bash
npm run preview
```

Serves the built `dist/` output locally for production checks.

## Coding Style & Naming Conventions

Use TypeScript with ES modules. Follow the existing style: two-space indentation, single quotes, semicolons, explicit interfaces for shared data shapes, and descriptive camelCase names for functions and variables. UI constants use upper snake case when globally shared, for example `DEFAULT_LINE_STYLE`.

Keep chart-specific logic in `src/inferenceCurveChart.ts` and app/editor behavior in `src/main.ts`. Avoid unrelated refactors when changing data import, filters, or rendering behavior.

## Testing Guidelines

No automated test framework is configured yet. Validate changes with:

```bash
npm run build
```

For UI changes, also run `npm run dev` and manually verify the default filters, chart labels, legend controls, data editor collapse/expand behavior, CSV export, and GitHub Actions import if touched.

## Commit & Pull Request Guidelines

This workspace does not expose project Git history, so use concise imperative commit messages, for example `Add GitHub Actions artifact import` or `Fix split GPU point labels`.

Pull requests should include a short summary, verification steps, screenshots for visible UI changes, and notes about data compatibility or migration behavior. Link related issues when available. Do not commit generated `dist/` output unless the project explicitly requires release artifacts.

## Security & Configuration Tips

GitHub tokens entered in the import panel are used only for browser requests. By default they are not stored; if the user ticks "Remember token in this browser", the token is saved to `localStorage` under the `inferencex-curve:github-token:v1` key (separate from the app data key, so it is never included in exported data and does not sync across machines). InferenceX sync configs, fingerprints, and timestamps are saved with the normal browser data under `inferencex-curve:user-data:v1`; they must not include GitHub tokens. Do not hard-code tokens, benchmark credentials, or private artifact URLs in source files. Keep large benchmark snapshots in `src/exampleData.ts` only when they are useful as offline fallback data.

### Importing GitHub Actions artifacts: token scope

Downloading run artifacts (the `archive_download_url` / `.../artifacts/{id}/zip` endpoint) always requires a token, even for public repos. Choose the token type by who owns the repo:

- **Repo you own, or an org you can configure:** a **fine-grained PAT** with only the **Actions: Read-only** repository permission (Settings → Developer settings → Personal access tokens → Fine-grained tokens), granted to that specific repository.
- **Private repo owned by another personal account (you are only a collaborator/admin):** a fine-grained PAT cannot reach it — fine-grained tokens are scoped to a single resource owner. Use a **classic PAT with the `repo` scope** (classic tokens have no standalone actions-read scope; `repo` covers artifact download).
- **Org-owned private repo:** the org must enable fine-grained token access; otherwise fall back to a classic PAT with `repo` scope.

Suggest a long expiry stored in a password manager so the token is available when viewing from a different machine, since the "Remember token" option only covers the same browser.

## Agent Notes: Generating Importable CSV

Use `docs/import-csv.md` as the source of truth when generating CSV/TSV for `Import File` or when helping another project integrate with this app. Prefer the editor CSV format from that document, not raw benchmark CSV, unless the user explicitly asks for benchmark-style rows.

Agent-specific rules:

- Always include deterministic non-empty `Line ID`, `Line Name`, `Model`, `Scenario` (or legacy `ISL/OSL`), and `Precision` values in generated editor CSV. Do not rely on app fallback defaults.
- Include the explicit metric columns available in the source. For the shared benchmark file, use `Mean Interactivity (tok/s/user)`, `Total Throughput (tok/s)`, and physical-GPU-normalized `Throughput/GPU (tok/s/gpu)`. Never fill the legacy `Interactivity (tok/s/user)` percentile field with a mean.
- Include `TTFT (s)` and `End-to-end (s)` columns when generating editor CSV; leave them empty when the source data does not provide those metrics.
- For fixed-length data, use explicit `MTP`, `Non-MTP`, or `Unknown`; do not infer disabled speculation from missing metadata. For Agentic data, leave the line-level `MTP` field empty and preserve each point's method in `Speculative Decoding` (`mtp`, `none`, or another upstream method).
- Optional style/metadata/parallelism columns may be empty as documented in `docs/import-csv.md`.
- Keep generated CSV canonical: use the documented headers even though the importer accepts aliases.
- For E-specific fixed workloads, use editor CSV with an explicit `Line ID` and numeric `Scenario`, for example `ISL 131072 / OSL 1024 / E 2048`. E participates in labels, sorting, and Merge Lines grouping; different E values must not merge. Keep legacy two-field ISL/OSL support and preserve unknown suffixes. The raw benchmark heuristic importer does not guarantee E preservation, so do not use it for these workloads.

## Agent Notes: InferenceX Data Sync

This fork starts with the explicitly requested repository AgentX reference curve. Sync implementation lives in `src/inferenceXSync.ts`; UI state and local persistence live in `src/main.ts`.

- App startup with no saved browser data loads only the explicitly requested repository curves and no configured sync targets. Do not fetch/apply live benchmark data automatically. The Add Config form may use a template without creating an enabled config.
- Empty saved config arrays must remain empty. Saved browser curves and user-created configs remain unchanged on reload. InferenceX `Reset All` restores repository curves/settings; `Clear Data` empties the working dataset and `Clear Sync Configs` removes configs without erasing chart data. The generic Plot Tool starts and resets empty.
- App startup with saved enabled configs checks for updates only once and does not overwrite chart data until the user clicks `Update`. With no enabled configs, it performs no benchmark update check.
- Agentic configs omit `specMethod` and use `isl: 0`, `osl: 0`. Never alias B200 to GB200.
- `Check Updates` fetches enabled configs and stages changed series; `Update` applies staged series.
- `benchmarks?model=...` returns historical rows. `disagg` and KV offload are point-level metadata rather than sync-config or line-id dimensions. Split records by `disagg` and effective `offload_mode`, select each branch's newest `curve_date` (falling back to `date`), and then merge the selected branches into the combined model / sequence or scenario / precision / hardware / framework curve. Fixed-length curves additionally split by MTP. Agentic curves select snapshots across all speculative methods and preserve each point's method as `spec_decoding`. For Agentic rows on the selected curve date, keep only the newest `curve_run_started_at` / `curve_workflow_run_id` snapshot; this snapshot may intentionally carry forward rows whose original `date` is older. Never discard those carried-forward rows merely because their benchmark `date` is not the newest.
- The bulk `derived-agentic-metrics` endpoint can return a server error when a batch includes older points without persisted trace metrics. Split failed 5xx batches recursively and omit only irretrievable individual derived-metric responses; keep the benchmark points and their ordinary latency/throughput metrics.
- `Add Config` only creates sync configs, then automatically runs a staged update check. It must not apply chart data directly.
- The Add Config UI defaults `ISL/OSL`, `Precision`, `Framework`, and `MTP` to `All`. These are UI-only selections: never persist `__all__` in an `InferenceXSyncConfig`. Expand All selections from availability rows into concrete `isl`, `osl`, `precision`, `hardware`, and `framework` configs, plus `specMethod` for fixed-length configs. Agentic configs omit `specMethod`; hide MTP selectors for Agentic chart views and explicit Agentic Add Config selections. When adding all scenarios, an MTP selection applies only to fixed-length rows. Never persist `disagg` on an `InferenceXSyncConfig`.
- Sync-generated line ids are stable and derived from model, ISL/OSL or scenario, precision, hardware, and framework, plus MTP for fixed-length curves. They never include disagg, so mixed aggregated/disaggregated points stay on one curve. Legacy Agentic configs merge enabled flags with OR; legacy MTP curves are replaced only when the staged Update is applied. Updating a sync line should replace data/source fields while preserving user style fields such as `color`, `lineStyle`, `marker`, `renderOrder`, and `collapsed`. When multiple legacy curves merge, prefer the existing canonical curve's style, then the legacy aggregated curve, then the MTP curve.
- Match hardware strictly. Do not alias `b200` to `gb200` or vice versa.

### CORS: dev works, deployed GitHub Pages does not

The InferenceX API does **not** send an `Access-Control-Allow-Origin` header (the official site is a same-origin Next.js app on Vercel, so it never needs one). Consequences for this app:

- **`npm run dev` works** only because `vite.config.ts` proxies `/inferencex-api` → the API, keeping browser requests same-origin. `INFERENCEX_API_BASE` in `src/inferenceXSync.ts` selects this dev proxy on `localhost`/`127.0.0.1` and the Vite ports.
- **The deployed site (`jeffxing.com`) is cross-origin and will be blocked by the browser.** This is not a fixable client bug: the missing header is a *response* header owned by the API server; the frontend cannot add/fake it, and `Origin` is a forbidden request header. A pure static site directly hitting that API is architecturally impossible to make work in the browser.
- The fix requires a server-side hop the app controls: a proxy (e.g. a free Cloudflare Worker that forwards to the API and adds CORS headers — set as the production `INFERENCEX_API_BASE`), or a CI/build snapshot (fetch the API in GitHub Actions, ship JSON same-origin). Server-to-server requests are not subject to CORS. None of these are deployed yet.
- **Current handling:** when a cross-origin request fails, `fetchInferenceXJson` raises `InferenceXCorsError` (only when `INFERENCEX_API_IS_CROSS_ORIGIN` and the failure is a `TypeError`, i.e. a blocked fetch) carrying an explicit CORS message plus the browser-extension/proxy workarounds, instead of surfacing a bare "Failed to fetch". A blocked CORS request and a real network failure are indistinguishable from JS, so the message hedges with "blocked by CORS". Do not "fix" the deployed Sync by widening this to a generic error — keep the CORS guidance until a real proxy/snapshot is in place.

## Agent Notes: Adding Benchmark Data

The user requested ordinary editable repository data, not a dedicated snapshot view. `src/exampleData.ts` maps the ten-point AgentX reference and first ten-configuration simulation baseline into the normal InferenceX workspace; existing browser edits take precedence. Keep `E2E-SimOpus-Mi355x-baseline` in group `E2E-SimOpus-Mi355x`, preserving its limited ADP2/C64 evidence and per-point provenance. Never replace it with later 1200s results under the same ID. Do not restore unrelated upstream examples. Keep all DeepSeek V4.1 Flash curves under model `DeepSeek-V4.1-Flash`, with distinct curve IDs/names/groups and correct workload scenarios. Imported Agentic data must retain source percentiles, speculative method and provenance.

The selected comparison uses `meanInteractivity` from `metrics.mean_intvty` and `totalThroughput` from `metrics.total_tput_tps` (input plus output across all physical GPUs). Keep `throughput` as input plus output per GPU for existing/TCO compatibility, and keep P90 separate. Never populate missing mean/total values from P90 or per-GPU guesses. The retired reference query redirects to the normal workspace; Plot Tool has no reference-specific behavior.

The same simulation group includes `E2E-SimOpus-Mi355x-20261027-1200s`, currently four configurations. Preserve its separate ID, 1200s horizon, source hashes, incomplete configuration coverage and accuracy status. Never fill its six missing configurations from the 3600s baseline or by interpolation.

`E2E-SimOpus-Mi355x-20261029-1200s` is a separate nine-configuration curve from the `new_compat` results of batch `agentx-compat1200-20261030`. The name date is user-specified; preserve the actual batch and hashes. Select C05 successful r2, exclude failed r1, and leave ADP2/C64 outside this run's scope. Preserve the established mean/total/P90 values and pending accuracy status; do not overwrite previous curves or synthesize unavailable latency metrics.

Group `Fixed-RealRun-Mi355x` holds the measured fixed-length run `Fixed-RealRun-Mi355x-20261030` from `src/data/fixedRealrunMi355x20261030.json`, one curve per `ISL / OSL / E` workload. Its cached workloads use ISL = context + E; cold ones record E = ISL. Keep exact ISL in each scenario. Do not relabel them to the simulator's fixed-ISL grid. The `Context / OSL` and `Extend` filters group E workloads by `getSequenceContextKey` and `getSequenceExtendKey` in `src/sequenceScenario.ts`. Its points carry P50/P90/P99 interactivity (1 / TPOT percentile), TTFT and End-to-end percentiles, with unprefixed TTFT/End-to-end as means; fixed-length views show the `Latency Percentile` selector only when the lines in view carry such percentiles. Keep the `compile_stall` flags and the per-point source run/commit.
