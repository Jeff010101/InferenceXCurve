# InferenceX Curve

## Jeff's comparison workspace

- **Benchmark workspace:** <https://jeffxing.com/InferenceXCurve/>
- **Generic Pareto workspace:** <https://jeffxing.com/InferenceXCurve/#/plot-tool>
- **InferenceX-AgentX reference (10 configurations):** <https://jeffxing.com/InferenceXCurve/#/inferencex>

GitHub Pages inherits this account's existing `jeffxing.com` domain. The
`jeff010101.github.io/InferenceXCurve/` address redirects to this HTTPS site.

The InferenceX workspace starts with the repository-maintained AgentX reference
and first simulation baseline as ordinary editable curves. It uses **Mean Interactivity** and **Total
Throughput (all GPUs)** by default. All reference, measured and simulation curves
for this model belong under `DeepSeek-V4.1-Flash`, with separate curve IDs/names.
The `E2E-SimOpus-Mi355x` group contains `E2E-SimOpus-Mi355x-baseline`:
the first ten 3600s simulation configurations (nine full results and one limited
ADP2/C64 result), separate from later 1200s runs. The generic Plot Tool starts empty;
no API sync configurations are enabled automatically. The old `?reference=...`
link redirects to the ordinary InferenceX workspace.

See [Data maintenance guide](docs/data-maintenance.md) for choosing a workspace,
keeping real/reference/simulation curves distinct, metric units, and backups.
The site is a static browser app. The repository holds the baseline data and
provenance; browser edits use normal persistent workspace storage and take
precedence on reload. Browser edits do not automatically commit to GitHub. Use
CSV export for backups or to submit updated data to the repository. **Reset All**
restores repository data/settings; **Clear Data** empties the workspace. Browser
isolation or storage restrictions can still discard local edits.

This Vite + TypeScript app recreates the InferenceX `Token Throughput per GPU vs.
Interactivity` chart with editable custom data. It focuses on matching the
reference chart behavior while letting users paste table data, import benchmark
artifacts, and tune line/point styling.

## Run Locally

```bash
npm install
npm run dev
```

Open the printed localhost URL. For a production build:

```bash
npm run build
npm run preview
```

Run the focused model compatibility and TCO regression checks with
`npm run check:model-tco`.

## Data Model

Each curve is edited as a **Line Project**. Line-level fields are shared by all
points in that curve:

- `Line ID`: unique curve id.
- `Name`: legend label.
- `Model`: model filter value, for example `DeepSeek-R1-0528`.
- `ISL/OSL`: sequence length filter value, for example `ISL 8192 / OSL 1024`.
- `Precision`: precision filter value, for example `fp4` or `fp8`.
- `MTP`: `MTP` or `Non-MTP`; also drives filtering and vendor color grouping.
- `Title`: longer tooltip/title metadata.
- `Marker`: default point marker for the line. `Precision` follows the
  precision-based default shape.
- `Line Type`: solid, dashed, dotted, dash-dot, long dash, or custom dasharray.
- `Color`: automatic vendor color, color picker, or a vibrant standard-color
  preset swatch.

Point rows are edited in each line's table and support Excel/Google Sheets
paste. Required point columns:

- `Interactivity`: X axis, tokens per second per user.
- `Throughput/GPU`: Y axis, tokens per second per GPU.

Optional point columns:

- `Marker`: per-point marker override. `Default` inherits the line marker.
- `Concurrency`: shown in tooltip and used for point identity.
- `Prefill GPUs`, `Decode GPUs`: used for split GPU labels.
- `Prefill TP`, `Prefill EP`, `Prefill DCP`, `Prefill DPA`
- `Decode TP`, `Decode EP`, `Decode DCP`, `Decode DPA`
- `Note`: tooltip/source metadata.

Example TSV:

```tsv
Concurrency	Marker	Interactivity	Throughput/GPU	Prefill GPUs	Decode GPUs	Prefill TP	Prefill EP	Prefill DCP	Prefill DPA	Decode TP	Decode EP	Decode DCP	Decode DPA	Note
4096	Default	11.75	7397.06	4	8	4	4	1	true	8	8	1	true	date 2026-05-07
2048	Star	15.51	4893.40	4	8	4	4	1	true	8	8	1	true	highlighted point
```

Line and point edits are auto-rendered after a short debounce, so the chart
updates without pressing `Render Chart`. The button remains available for an
immediate redraw.

## Filters and View Controls

`DeepSeek-V4-Pro-0813`, `DeepSeek V4 Pro`, `DeepSeek-V4-Pro`, and their
`deepseek-ai/` model paths share the `DeepSeek-V4-Pro` model filter. Sync keeps
the existing curve IDs and uses the upstream `DeepSeek-V4-Pro` API parameter.

The **Y axis** selector offers **Total Tokens per Dollar** alongside throughput.
Its TCO calculation is `Throughput/GPU × 3600 / GPU hourly cost`. Throughput must
include input and output tokens; it is already normalized per GPU, so neither
the ISL/OSL ratio nor GPU count is multiplied again. Fixed-length and Agentic
charts use the same formula.

Cost presets cover owning at large hyperscaler volume and rental. On page load,
the app refreshes the public InferenceX price sources if the last successful
check was at least 24 hours ago. **Refresh Prices** checks immediately. The UI
shows the check time and links to the upstream source. GitHub permits
these browser requests from GitHub Pages without an InferenceX API proxy.
Source files are pinned to one commit when GitHub's anonymous API quota is
available; otherwise the app reads the raw default-branch files directly.

Successful checks are cached under `inferencex-curve:tco-prices:v1`. Network
failures or unsupported upstream formats keep the last good cache, falling
back to the bundled September 20, 2026 prices when no cache exists. The app
parses price literals and the owning-cost adjustment without executing upstream
code. The published prices reference SemiAnalysis pricing surveys and its AI
Cloud TCO Model; this updates when InferenceX publishes new prices.

**Custom** starts from the selected
preset and lets you set positive USD/GPU-hour prices, saved in this browser.
Automatic and manual price refreshes leave custom prices unchanged.
Hardware is matched using `HW Key`, then an unambiguous hardware token in line
metadata. B200 and GB200 have separate prices. Lines without a price are omitted
from the TCO plot until a custom price is supplied.

CSV exports retain the benchmark data and hardware fields. TCO is calculated
from raw throughput using the current browser's cost settings; pricing and
tokens per dollar are not CSV columns. PNG exports include the selected metric
and cost basis.

The top controls filter by `Model`, `ISL/OSL`, `Precision`, and `MTP`. Defaults
select the first available value rather than showing all values.

The legend panel includes:

- line visibility search and toggles
- per-filter active-line memory for each `Model` / `ISL/OSL` / `Precision` /
  `MTP` view
- hover-only `Only` actions for quickly isolating one line
- hover-only locate actions for jumping from a legend line to its Line Project
- `Show all lines` below the line list to reactivate every line in the current
  filtered view
- `Log Scale`
- `Optimal Only`
- `Hide Labels`
- `High Contrast`
- `Parallelism Labels`
- `Gradient Labels`
- `Line Labels`
- `Better Direction`, which follows the active X-axis metric and points toward
  the preferred throughput/metric corner

By default, `Optimal Only` is enabled and `Gradient Labels` / `Line Labels` are
disabled.

Newly added, copied, or imported lines are activated automatically in the
current view.

## GitHub Actions Import

The data panel can import benchmark output from a GitHub Actions run URL. Paste a
run URL such as:

```text
https://github.com/owner/repo/actions/runs/123456789
```

For the upstream `SemiAnalysisAI/InferenceX` repository, you can also enter just
the numeric run ID, such as `35166686551`. Clicking `Import Action Data` expands
it to `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/35166686551`
in the input field and imports that run. Use a full URL for other repositories.

Downloading run artifacts always requires a GitHub token, even for public repos.
Pick the token type by who owns the repo:

- Repo you own, or an org you can configure: a fine-grained PAT with only the
  `Actions: Read-only` permission, granted to that repository.
- Private repo owned by another account (you are a collaborator/admin): a classic
  PAT with the `repo` scope. Fine-grained tokens are scoped to a single resource
  owner and cannot reach it.

Tick `Remember token in this browser` to save the token to `localStorage` under
the `inferencex-curve:github-token:v1` key (this browser only, stored in plain
text, and never included in exported data). A progress bar shows artifact
download status while importing.

Imported artifacts are staged in a review panel before they are added. You can
edit line fields, change `MTP` or `Marker`, select/deselect lines, discard the
preview, or append selected lines to the current data.

The importer normalizes common InferenceX artifact fields:

- model prefixes and paths such as `dsr1` or `deepseek-ai/DeepSeek-R1-0528` map
  to `DeepSeek-R1-0528`
- `spec_method` / `spec_decoding` map to `MTP` or `Non-MTP`
- `hw` values such as `mi355x-amds` normalize to the chart hardware key

## InferenceX Public API Sync

The `InferenceX Sync` panel can keep chart data aligned with the public
InferenceX API without editing `src/exampleData.ts`.

First open loads the repository AgentX reference with no enabled sync
configurations and no automatic benchmark fetch. Add an explicit
configuration in **Manage Configs**, then use **Check Updates → Update** to apply
the staged curves. Ordinary reloads preserve saved data/configurations and may
stage updates for enabled saved configurations; they never silently replace the
chart. Resetting configs empties the config list without erasing chart data.
**Reset All** restores repository data/settings and clears sync configurations.

For each enabled sync config, the API may return historical rows across many
dates. Sync mirrors the upstream chart behavior by keeping only the newest
source rows. Curves group by model / sequence or scenario / precision /
hardware / framework / MTP. `disagg` is point-level metadata, so aggregated and
disaggregated rows for the same config are combined into one curve after each
disagg branch is reduced to its newest available `date`.

The panel actions are:

- `Check Updates`: fetch enabled sync configs and stage any new or changed lines.
- `Update`: apply staged API data to the chart. User-created, CSV-imported, and
  GitHub-imported lines are kept unless they share the stable InferenceX sync
  line id.
- `Manage Configs`: enable, disable, remove, reset, or add sync configs.

Config management uses live `availability` data from the API. The Add Config
form defaults `ISL/OSL`, `Precision`, `Framework`, and `MTP` to `All`; clicking
`Add Config` expands those selections into only the real combinations returned
by availability, then automatically runs `Check Updates`. The user still needs
to click `Update` before the new data is applied to the chart.

`Disagg` is not a config selector. Availability rows that differ only by
`disagg=true` or `disagg=false` create one sync config and one stable line id;
the original value remains available on every imported point.

Sync configs, fingerprints, timestamps, and staged status metadata are saved in
the normal browser data payload under `localStorage` key
`inferencex-curve:user-data:v1`. The GitHub token remains separate under
`inferencex-curve:github-token:v1`.

### CORS and the deployed site

The InferenceX API serves the official site from the same origin
(`inferencex.semianalysis.com`), so it never needs CORS headers and does not send
an `Access-Control-Allow-Origin` header. This app is different:

- **Local `npm run dev`** works because the Vite dev server proxies
  `/inferencex-api` to the API (see `vite.config.ts`), so the browser only makes
  same-origin requests.
- **The deployed GitHub Pages site** (`jeffxing.com`) is a static site on a
  different origin. Its browser requests to the API are cross-origin, and because
  the API sends no `Access-Control-Allow-Origin` header, the browser blocks the
  response. This is a browser security mechanism: the missing header is a
  *response* header controlled by the API server, so the frontend cannot add or
  fake it, and the `Origin` request header cannot be overridden from JavaScript.

When this happens, the Sync panel reports an explicit **CORS** error (rather than a
generic "Failed to fetch") with these workarounds:

- **Without a deployed proxy:** use local dev sync with the existing Vite proxy,
  export CSV, and import that file into the hosted page. Downloaded benchmark
  files can also be imported directly without public-API access.
- **Permanent:** route requests through a proxy you control. Server-to-server
  requests are not subject to CORS, so a proxy (e.g. a free Cloudflare Worker that
  forwards to the API and adds CORS headers) makes Sync work for everyone. A build
  /CI snapshot approach (fetch the API in GitHub Actions and ship the JSON
  same-origin with the site) is an alternative when live, on-click freshness is
  not required.

## Import Data File

`Import File` (next to `Import Action Data`) loads a local `.csv`, `.tsv`,
`.json`, `.jsonl`, `.ndjson`, or `.zip` file through the same review panel. Zip
files are unpacked in the browser, so a downloaded GitHub Actions artifact zip
can be imported directly. This round-trips a file produced by `Download CSV`:
line fields, point `Interactivity` / `Throughput/GPU`, markers, custom colors
(from the `Color Mode` / `Resolved Color` columns), concurrency, parallelism,
KV cache hit rates, and notes are restored. Derived columns (`Total GPUs`, `Included in Chart`,
`Active Line`, `Point Index`, `Roofline Point`) are ignored on import. The same
parser also accepts raw benchmark JSON/CSV exports.

For external integrations or agent-generated files, use
[`docs/import-csv.md`](docs/import-csv.md) as the CSV/TSV import contract. It
lists the recommended headers, required fields, optional empty fields, aliases,
and raw benchmark fallback format.

## Plot Tool CSV

The independent `Plot Tool` workspace imports a smaller generic Pareto CSV
format with required `Line ID`, `Line Name`, `X`, and `Y` columns plus optional
color, line type, marker, and layer metadata. Its import preview requires an
explicit Replace choice for any `Line ID` already in the workspace.

See [`docs/import-plot-tool-csv.md`](docs/import-plot-tool-csv.md) for the full
column contract, defaults, quoting rules, validation errors, conflict workflow,
examples, and CSV round-trip behavior. This format is not interchangeable with
the InferenceX benchmark CSV/TSV contract above.

## Chart Logic

Reusable chart logic lives in `src/inferenceCurveChart.ts`.

- Points are filtered to finite `interactivity` and `throughput` values.
- Pareto filtering uses the selected metric's optimization direction. For
  interactivity and throughput, higher is better on both axes.
- Rooflines use `d3.curveMonotoneX`.
- Line colors are automatically grouped by vendor: NVIDIA green family, AMD red
  family, with MTP variants treated separately.
- Point labels use split prefill/decode GPU counts when available.
- Marker rendering supports circle, square, triangle, diamond, star, plus, and
  cross.
- Zoom, pan, reset zoom, PNG export, and CSV export are available.

The InferenceX Bus/Race Car and Donkey/Elytra overlays are intentionally not
included.

## Project Structure

- `src/main.ts`: UI, data editor, CSV handling, GitHub Actions import, and
  InferenceX sync state wiring.
- `src/inferenceXSync.ts`: public InferenceX API client, availability parsing,
  benchmark filtering, fingerprints, and sync line generation.
- `src/inferenceCurveChart.ts`: D3 chart rendering and curve logic.
- `src/exampleData.ts`: repository-maintained ordinary reference curve.
- `src/styles.css`: application and chart styling.
- `vite.config.ts`: Vite base path and dev proxy for `/inferencex-api`.
- `docs/import-csv.md`: CSV/TSV import contract for external integrations.
- `docs/import-plot-tool-csv.md`: generic Plot Tool CSV import/export contract.
- `AGENTS.md`: contributor guidance for coding agents.
