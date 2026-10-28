# Maintaining real, reference and simulation comparisons

The hosted app is <https://jeffxing.com/InferenceXCurve/>. The InferenceX workspace
includes one repository-maintained AgentX reference curve. API sync starts disabled.

## Repository-maintained AgentX reference

Open the [normal InferenceX workspace](https://jeffxing.com/InferenceXCurve/#/inferencex)
to edit the ten configurations used in the AgentX simulation comparison.
There is no separate snapshot view. Existing browser edits take precedence on
reload; Reset All restores repository data/settings, while Clear Data removes
the working curves. Export edits for backup; saving in the browser does not
write a Git commit. An existing empty workspace can use Reset All to load this
repository dataset.

- Source: [InferenceX run 39596624542, attempt 1](https://github.com/SemiAnalysisAI/InferenceX/actions/runs/39596624542/attempts/1), dated 2026-10-22.
- Model/runtime: DeepSeek-V4.1-Flash FP4, MI355X, SGLang, MTP, Agentic Traces.
- X: the original `metrics.mean_intvty`, using the frozen dashboard's reciprocal
  of rounded mean full-response ITL. Do not replace it with P90, mean TPOT, or
  `mean_full_response_intvty`; those have different values/definitions.
- Y: the original `metrics.total_tput_tps`, input plus output tok/s across all
  allocated GPUs, without scaling or fitting.
- All ten points are retained and shown, including four dominated points;
  the six nondominated points form the Pareto frontier.
- Configurations: TP2/ADP1 C1, C4, C8, C16, C32; TP4/ADP1 C1, C2, C8, C16;
  TP2/ADP2 C64. The last configuration uses two physical GPUs.

The [data and provenance](../src/data/inferencexAgentx39596624542.json)
retain reference IDs, TP/ADP/concurrency, GPU counts and the original decoded
source SHA-256. The [editor CSV](../public/data/inferencex-agentx-run39596624542.editor.csv)
round-trips through the ordinary workspace with configuration metadata and
separate mean/P90 and all-GPU/per-GPU values. The [Plot Tool CSV](../public/data/inferencex-agentx-run39596624542.plot.csv)
remains available for generic X/Y use. Neither file contains simulator points
or fixed-length measurements.

The older gray-dot plot used X=`metrics.p90_intvty` (the reciprocal of rounded
`p90_full_response_itl`) and Y=`metrics.output_tput_per_gpu`. Those are different
coordinates from the chosen mean/all-GPU-total view. Do not change data values
to make the two views overlap. For example TP2/ADP2/C64 is `(75.18797, 1343.33774)`
in the gray-dot view and `(99.00990, 368116.297)` in the chosen view.

Use the same `Model=DeepSeek-V4.1-Flash` for every curve of this model. Distinguish
reference, measured and simulation results with curve IDs/names/groups, and
keep Agentic Traces versus fixed-length workloads as separate scenarios.

## First AgentX simulation baseline

The ordinary workspace also includes group **E2E-SimOpus-Mi355x**, curve
**E2E-SimOpus-Mi355x-baseline**, with stable ID `e2e-simopus-mi355x-baseline`.
It contains the first ten 3600s configuration results collected on 2026-10-26,
not the later 1200s results. All points remain simulations under model
`DeepSeek-V4.1-Flash` and scenario `Agentic Traces`.

[Baseline data and provenance](../src/data/agentxSimOpusMi355xBaseline.json)
retain the original point IDs, reference IDs, request counts, token counts,
physical GPU counts, raw/rounded ITL, actual throughput duration, source hashes,
simulator/SDK versions and available query summaries. Mean X follows the same
reciprocal-of-rounded-mean-ITL convention as the reference. Total Y is successful
input plus output tokens divided by the actual request envelope, not a fixed
3600s denominator. Per-GPU throughput is derived once using physical GPU count.

All ten request exports and completion receipts were hash-checked, and the mean
and total coordinates were independently reproduced. Nine are full configuration
results. **ADP2/C64 is limited:** its original evidence records a grace timeout,
`full_AgentX_point=false`, unavailable query coverage and source-only uncalibrated
joint cost. No point has passed accuracy acceptance. These historical results
also retain different per-point code/cost versions; the baseline is not presented
as one common implementation revision.

Existing browser data is preserved on deployment. To add only this curve, import
the [baseline editor CSV](../public/data/e2e-simopus-mi355x-baseline.editor.csv),
clear the preview's Line ID Suffix, and choose Add Selected. Reset All restores
both repository curves but also resets browser edits and settings.

## Choose the workspace and metric contract

| Workspace | Use | Y coordinate | Data contract |
| --- | --- | --- | --- |
| InferenceX Curve | Benchmark metadata, scenario/model filters, TP/concurrency labels, source notes | Total input + output throughput across **all GPUs**, per GPU, or tokens per dollar (explicit selector) | [Editor CSV](import-csv.md) |
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
- The ordinary URL loads repository defaults on a new browser. It does not share
  browser edits; transfer those with exported CSV and restore chart settings.
- Plot Tool CSV preserves curves, coordinates and styles, but not chart title,
  axis labels/goals, visibility or log-scale settings. Record those beside the
  file. Empty drafts do not create exported point rows.
- **Clear Data** removes local chart data. InferenceX **Reset All** restores
  repository curves and settings. Plot Tool Reset All returns to an empty plot.
- Published result data is versioned in the repository. The ten-point
  InferenceX-AgentX reference and the first ten-configuration simulation baseline
  above are included; later 1200s simulations and fixed-length results are not.

## External data access

**InferenceX Sync:** GitHub Pages is static. The upstream public benchmark API
does not currently provide cross-origin browser access, so direct hosted sync
can fail with CORS. Local `npm run dev` uses the existing Vite proxy. Until a
controlled proxy or CI snapshot path is added, sync locally and transfer an
exported CSV, or import downloaded reference data. The repository data does not
require a proxy and does not perform an initial benchmark sync.

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
