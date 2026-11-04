# Fixed-length conditional simulation: 20261103

The existing `E2E-SimOpus-Mi355x` group now includes
`E2E-SimOpus-Mi355x-20261103 / Cold`, `/ E512`, `/ E1K`, `/ E2K` and `/ E4K`.
The date is the user-requested curve label. Actual completion and metric-snapshot
timestamps remain in the data; they are not relabeled to November 3.

There are 18 workloads, nine ADP1 configurations per workload, and 15,840 formal
requests. Each case contributes exactly one sealed successful original from the
pinned SDK `73f32ddbe951d284f40d563e03c06f98381368d1` and SGLang
`b04c6a0bbfaf47e2741fe3fa3b8bb585c2388742`. No model was rerun for publication.
The CPU executor hardware is not a measured MI355X GPU benchmark.

Select **Fixed Sequence Length**, the corresponding **Context / OSL** and
**Extend**, **Mean Interactivity**, **Total Throughput (All GPUs)**, and **MTP**
or **All MTP**. Disable **Optimal Only** to see all nine configurations.

## Source and metric preservation

The maintained source is
[`fixed162SimOpusMi355x20261103.json`](../src/data/fixed162SimOpusMi355x20261103.json).
The [public native JSON](../public/data/e2e-simopus-mi355x-20261103.json) is a
byte-identical export, with a SHA-256 manifest. An
[editor CSV](../public/data/e2e-simopus-mi355x-20261103.editor.csv) is available for
manual import into an existing workspace. Per-point original result and manifest
digests are retained; internal machine/share paths and raw traces are excluded.

Mean interactivity, all-GPU input-plus-output total throughput, per-GPU total
throughput, mean TTFT and mean E2E are copied directly from the original source
metric fields. Mean values never populate percentile fields. The source clock
excludes preparation/warm-up and frontend CPU overhead. Cached input is included
in logical total throughput. No curve scaling, interpolation or GPU-count guess
is applied.

The actual simulation ISL, OSL, E and prefix remain unchanged. An explicit nominal
`comparisonContext` pairs cached cases with the existing REAL curves, whose total
ISL is context plus E. Cold cases have matching lengths. Historical reference,
baseline, 20261101 simulation and AgentX curves remain separate and unchanged.

## Accuracy and evidence status

Given published per-point mean AL is an **extra conditional input**, not natural
independent acceptance-length prediction. Published precision, source counters
and count totals have not been independently verified. Simulation temperature1
and topk1 differ from the original temperature0 REAL run. FIT870 anchor roles,
fallbacks and all original compile-stall reference flags are retained.

Complete162 unweighted MAPE is TTFT **33.47%**, TPOT **8.82%**, E2EL **8.48%**,
throughput **9.35%**, and interactivity **8.51%**. TTFT fails the strict20% goal;
accuracy is not accepted. Full custody, original-resource closure, archive-native
multi-anchor consumption audit and same-version AgentX9 guards were pending at
the metric snapshot. A sealed model result is not final evidence acceptance.

The [two-column Excel TSV](../public/data/fixed162-20261103-mape-excel.tsv) lists
interactivity and total-throughput MAPE in the user's screenshot order. The nine
matched configurations have identical physical GPU counts on both sides, so
total and per-GPU throughput have the same point APE and scenario MAPE.

## Saved browser workspaces

The one-time `fixed16220261103Added` migration adds only missing version IDs to
nonempty saved workspaces. Existing same-ID edits, axes, filters, intentional
empty workspaces and later deletions are preserved. Fresh workspaces and Reset
All include this version alongside earlier data. No API sync is enabled.

The 20261103 version now uses red (`#ef4444`). A separate one-time color update
changes only its old green/default colors in saved workspaces. Other versions,
custom colors, metrics, names and later intentional color edits stay intact.

Validate with `npm run build` and `node scripts/check-fixed180-comparison.mjs`.
