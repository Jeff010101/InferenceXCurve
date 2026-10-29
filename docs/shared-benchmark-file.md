# One shared benchmark file, multiple import formats

Maintain only `benchmark_results.json`: configurations, workloads, one real
reference and an array of simulation versions. No separate schema or result
manifests are required. This is a result-data conversion tool, not a benchmark
runner. The current input describes single-node aggregated serving with shared
prefill/decode GPUs.

From this repository, generate all supported views with one command:

```bash
node scripts/export-benchmark-results.mjs /path/to/benchmark_results.json /path/to/exported
```

| Generated file | Import destination |
| --- | --- |
| `inferencex.csv`, `inferencex.tsv` | InferenceX → Import File; canonical editor columns |
| `inferencex.json` | InferenceX → Import File; native `{series: [...]}` |
| `inferencex.jsonl`, `inferencex.ndjson` | InferenceX → Import File; one native series per line |
| `inferencex.zip` | InferenceX → Import File; contains the CSV once |
| `plot-tool.csv` | Plot Tool → Import CSV; X=mean interactivity, Y=all-GPU total throughput |

Choose **one** representation per import; they describe the same results.
Clear the import preview's Line ID Suffix when preserving generated IDs. Use
Mean Interactivity and Total Throughput in InferenceX. Plot Tool must use these
same axis labels and maximize both axes. Its CSV preserves only X/Y and curve
style, not per-point config labels or provenance; retain the shared JSON.

Every workload and result version becomes a separate curve. Fixed scenarios
retain E. Physical GPU count comes from `configs.gpu_count`; per-GPU throughput
is derived once, and shared prefill/decode GPU counts are not added together.
Null metrics do not become zero-valued points. `point_format` is a template and
is never imported as a result. Empty input results produce empty export views.

The source format remains small:

```text
model / hardware / precision
configs:      config ID -> settings (TP, ADP, GPU count, concurrency, ...)
workloads:    workload ID -> openloop ISL/E/OSL or closedloop AgentX
reference:    name, optional date/source/note/group, points[]
simulations:  [{ version, optional name/date/source/note/group, points[] }]
point:        workload_id, config_id, mean_interactivity, total_throughput
              optional: source, note, mean_ttft_s, mean_e2e_s,
                        mtp (boolean), speculative_decoding (string)
```

Optional `mtp` and `speculative_decoding` may also be set on a configuration or
result version; point values take precedence. Unspecified MTP remains **Unknown**,
not Non-MTP. Original source definitions of mean interactivity and total throughput
stay in the shared file; conversion does not recompute or fit these coordinates.
The optional mean TTFT/E2E values are projected only for fixed workloads. Agentic
unprefixed latency fields have legacy P90 semantics, so they remain blank rather
than mislabeling a mean as a percentile.

Line IDs use model/hardware, source class, version/date, workload and fixed MTP.
Change the simulation version for revised results. Reusing an existing ID with
changed points in the InferenceX workspace appends/merges; it is not replacement.
For a corrected real reference, change its name/date or remove the old displayed
line before importing. Plot Tool has an explicit replacement choice.

The shared JSON is the maintained source. Import its **generated** JSON in the
website: the source's configs/workloads layout is not the native series layout.
Generated files need not be edited or maintained separately.
