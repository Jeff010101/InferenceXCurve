# Fixed-length simulation snapshot: 20261101

The `E2E-SimOpus-Mi355x` group includes 18 new curves named
`E2E-SimOpus-Mi355x-20261101 / Cold`, `/ E512`, `/ E1K`, `/ E2K`, or `/ E4K`.
Each curve retains nine configurations and its actual total ISL, OSL and E.
The 20261101 display date replaces the earlier 20261031 label; the current-main reproduction completed
on 2026-11-01. Existing measured and historical simulation curves remain separate.

The maintained source is
[`fixed162SimOpusMi355x20261101.json`](../src/data/fixed162SimOpusMi355x20261101.json).
The byte-identical [native JSON import](../public/data/e2e-simopus-mi355x-20261101.json)
is an exported view of that source, with a public checksum manifest alongside it.
Both use UTF-8 with LF newlines so the checksum is identical on Windows, in Git
and in the deployed download.
It can be imported through the normal Import File panel.

## Scope and metrics

- All 162 points completed, with 15,840 formal requests, zero formal request
  failures, and independent closure of the owned CPU execution resources.
- Each point uses 2C independent warm-up requests and 10C formal requests.
  Prefix preparation and warm-up are excluded from the reported timing window.
- Metrics use the source coordinator's virtual clock. They predict MI355X
  behavior; CPU executor hardware is not a measured GPU result. Frontend CPU
  overhead is not modeled.
- Mean interactivity is the original reciprocal of mean TPOT. Total throughput
  includes input and output tokens, including logical cached input. Per-GPU
  throughput divides by the shared physical GPU count once. TTFT and E2E are
  original means in seconds; no percentiles are inferred.
- The 1257 qualified cost keys combine historical397 with new804 and new56.
  Charles costs retain their original TEST qualification. Residual roles remain
  FIT294, reference662 and excluded8; fallback is not measured coverage.
- Actual component revisions and per-point result hashes are retained in the
  JSON. The SGLang physical coordinator budget fix is used by 82 points; the
  other 80 completed points retain their original source. Virtual costs and
  request protocol are unchanged. All four metrics match the prior1257 result
  exactly for all 162 points. This establishes reproduction, not accuracy acceptance.

## Comparison limits

The four cold workloads (36 points) have matching reference lengths. The
14 cached workloads (126 points) use an explicit nominal `comparisonContext`:
simulation total ISL is 128K/256K and prefix is ISL minus E, while the real-run
prefix is 128K/256K and total ISL is prefix plus E. No original geometry or
metric is rescaled. Select a line to inspect the actual lengths in its note.

Simulation temperature1/top_k1 and source golden351 acceptance differ from the
temperature0 real run and its content-dependent acceptance. Logical KV capacity
is nonbinding and does not validate physical memory capacity. Real-run compile
stall flags remain in the unchanged reference dataset. Accuracy acceptance and
new independent holdout validation remain pending.

## Existing browser workspaces

The new version is added once to nonempty saved workspaces by stable curve ID,
without replacing edited lines. Empty workspaces remain empty. After migration,
deleted curves stay deleted and subsequent user edits are preserved. Fresh
workspaces and Reset All include the new version alongside the historical data.
The corrected 20261101 display date keeps the original curve IDs and measurements.
Existing default 20261031 names are renamed once; custom names, edited metrics,
deleted curves and chart settings remain intact.

## Validation

Run `npm run build` and `node scripts/check-fixed180-comparison.mjs`.
The comparison check covers all 18 workload groups, nine configurations per
version, metric-preserving JSON/draft/CSV round trips, nominal geometry, and
additive browser migration.
