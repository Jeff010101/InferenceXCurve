# Maintaining real, reference and simulation comparisons

The hosted app is <https://jeffxing.com/InferenceXCurve/>. The initial
deployment contains no benchmark points and no active sync configurations.

## Choose the workspace and metric contract

| Workspace | Use | Y coordinate | Data contract |
| --- | --- | --- | --- |
| InferenceX Curve | Benchmark metadata, scenario/model filters, TP/concurrency labels, source notes | Total input + output throughput **per GPU**, or tokens per dollar | [Editor CSV](import-csv.md) |
| Plot Tool | Generic Pareto comparisons, including existing all-GPU total-throughput plots | Explicit numeric Y; label its units yourself | [Plot Tool CSV](import-plot-tool-csv.md) |

For the existing fixed-length comparison, open
<https://jeffxing.com/InferenceXCurve/#/plot-tool>, set X to
`Mean interactivity (output tok/s/user)` and Y to
`Total throughput (input + output tok/s, all GPUs)`, and select **Maximize** for
both optimization goals. Use one length pair per chart, such as 128K/1K.
The input X definition is `1 / mean TPOT`; it is not the mean of individual
request reciprocals. Do not put all-GPU throughput in a Throughput/GPU field.

The benchmark workspace preserves richer source/configuration metadata. To use
it, convert all-GPU throughput to per-GPU throughput using the actual configured
GPU count, exactly once. TP multiplied by attention DP is not necessarily the
physical GPU count. For aggregated serving, prefill/decode can share the same
GPU pool. Preserve unknown metadata as unknown.

Agentic P90/P75 and fixed-length mean metrics are different definitions. Keep
them in separate scenarios/views. An AgentX dependency-graph run is not a
fixed-length serving run, and regional cost validation is not an E2E point.

## Keep sources and versions separate

Use separate curve IDs and names for each source, workload and result version:

| Source class | Suggested display name | Evidence to retain |
| --- | --- | --- |
| Our real AgentX runs | `AgentX - measured - <run>` | Original run/trace and metric definition |
| InferenceX reference | `InferenceX-AgentX - reference - <snapshot>` | Source URL, snapshot date and benchmark scope |
| Fixed-length real runs | `Fixed-length - measured - <run>` | Actions run/job, length pair and full configuration |
| Fixed-length offline simulation | `Fixed-length - simulation - <version>` | Simulator commit, cost-model/PerfDB version, coverage and fallback report |

Use the AgentX reference name only for actual AgentX data. Fixed-length results
from InferenceMINI/InferenceX should retain a fixed-length label. Never overwrite
a baseline with a calibrated version under the same curve ID. Deterministic
IDs can follow `<source>-<workload>-<lengths>-<run-or-version>`.

In the benchmark workspace, use `Group` for these source classes, `Scenario`
for length pairs or Agentic Traces, and `Note` / `Line Note` for provenance.
Preserve concurrency, TP/ADP, GPU count, speculative method and original units.
There is no dedicated numeric ADP field; record it in `Strategy` and `Note` as
well as the master dataset. Include the complete `case_id` in each point's Note
so separate configurations are not confused when their coordinates coincide.
Keep the original full result files alongside the presentation CSV. The Plot
Tool's generic CSV has no per-point configuration/provenance columns, so it is
a plotting view, not the authoritative evidence store.

## Import, review, plot, export

1. Generate a file using the appropriate documented CSV contract; the two
   workspace formats are not interchangeable.
2. In InferenceX Curve, select **Import File**. In Plot Tool, select **Import
   CSV**. Inspect staged curves before selecting **Add Selected**.
3. The benchmark workspace appends/merges same-ID imports and deduplicates
   exact point fingerprints; it is not a replace operation. Inspect the preview's
   ID suffix. Plot Tool requires an explicit replacement choice for existing
   line IDs. Prefer a new versioned ID when comparing runs rather than replacing
   or merging history.
4. Choose the correct scenario/metric. Enable **Optimal Only** for Pareto
   frontiers, or disable it to inspect all measured/simulated points. Connecting
   displayed points is visualization, not an additional measured result.
5. Use **Download CSV** for a full editable data backup and **Download PNG** for
   a rendered figure. **Download Visible CSV** is only a selected-view export,
   not a complete backup. Retain source evidence independently of either export.

Benchmark CSV/TSV, JSON/JSONL and artifact ZIP imports are supported by the
benchmark workspace. Plot Tool accepts only its generic CSV format. Raw
simulation output should be converted to canonical editor CSV; do not rely on
heuristics for unrecognized simulator fields.

## Storage and collaboration

- Chart edits are saved in this browser's localStorage, not to GitHub or a
  server database. The benchmark and Plot Tool workspaces have separate stores.
- A URL shares the application, not your browser's chart contents. To reproduce
  a view on another machine, import the exported CSV and restore chart settings.
- Plot Tool CSV preserves curves, coordinates and styles, but not chart title,
  axis labels/goals, visibility or log-scale settings. Record those beside the
  file. Empty drafts do not create exported point rows.
- **Clear Data** removes local chart data. **Reset All** also resets the
  workspace settings. This fork's resets do not restore demonstration curves.
- Future shared result snapshots should be explicit, reviewed, versioned files
  in a chosen data repository. No real/reference/simulation data has been
  published with this empty application setup.

## External data access

**InferenceX Sync:** GitHub Pages is static. The upstream public benchmark API
does not currently provide cross-origin browser access, so direct hosted sync
can fail with CORS. Local `npm run dev` uses the existing Vite proxy. Until a
controlled proxy or CI snapshot path is added, sync locally and transfer an
exported CSV, or import a downloaded reference snapshot. The empty deployment
does not require a proxy and does not perform an initial benchmark sync.

**GitHub Actions import:** Artifact download requires a token with access to the
source repository even for public artifacts. A repository-scoped, read-only
Actions token is preferable where supported. The imported artifact is staged
before use. Local file import does not need a token. Tokens are not part of CSV
exports; the optional browser token storage is separate from chart data.

## Local development and deployment

```bash
npm ci
npm run build
npm run dev
```

The repository's existing `Deploy to GitHub Pages` workflow builds and deploys
on pushes to `main`, with Vite base `/InferenceXCurve/`. GitHub Pages uses GitHub
Actions as its source. Published changes are application changes; browser edits
do not create Git commits or trigger deployments.
