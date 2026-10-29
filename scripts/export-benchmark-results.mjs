// One maintained JSON file -> the existing InferenceX and Plot Tool formats.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const columns = {
  'Line ID': (s) => s.id, 'Line Name': (s) => s.name,
  'Group': (s) => s.group, 'Model': (s) => s.model, 'Scenario': (s) => s.islOsl,
  'Precision': (s) => s.precision, 'MTP': (s) => s.mtp, 'HW Key': (s) => s.hwKey,
  'Line Note': (s) => s.note, 'Line Type': () => 'solid', 'Line Marker': () => 'circle',
  'Mean Interactivity (tok/s/user)': (_, p) => p.meanInteractivity,
  'Total Throughput (tok/s)': (_, p) => p.totalThroughput,
  'Throughput/GPU (tok/s/gpu)': (_, p) => p.throughput,
  'TTFT (s)': (_, p) => p.ttft, 'End-to-end (s)': (_, p) => p.endToEnd,
  'Prefill GPUs': (_, p) => p.num_prefill_gpu, 'Decode GPUs': (_, p) => p.num_decode_gpu,
  'Prefill TP': (_, p) => p.prefill_tp, 'Decode TP': (_, p) => p.decode_tp,
  'DPA': (_, p) => p.dp_attention, 'Disagg': () => false, 'Multi-node': () => false,
  'Concurrency': (_, p) => p.concurrency, 'Strategy': (_, p) => p.strategy,
  'Note': (_, p) => p.label, 'Speculative Decoding': (_, p) => p.spec_decoding,
};

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be nonempty`);
  return value;
}

function numeric(value, label, positive = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    throw new Error(`${label} must be a finite ${positive ? 'positive' : 'nonnegative'} number`);
  }
  return value;
}

export function buildSeries(data) {
  if (data.format_version !== 1 || !data.configs || !data.workloads || !data.reference || !Array.isArray(data.simulations)) {
    throw new Error('Expected the shared format_version=1 benchmark_results.json');
  }
  for (const key of ['model', 'hardware', 'precision']) text(data[key], key);
  const series = new Map();
  const runKeys = new Set();
  const runs = [{ ...data.reference, kind: 'reference' }, ...data.simulations.map((r) => ({ ...r, kind: 'simulation' }))];
  for (const run of runs) {
    const version = text(run.kind === 'reference' ? run.name : run.version, 'reference name / simulation version');
    const runKey = JSON.stringify([run.kind, version, run.date ?? '']);
    if (runKeys.has(runKey)) throw new Error(`Duplicate result version: ${version}`);
    runKeys.add(runKey);
    if (!Array.isArray(run.points)) throw new Error(`${version}: points must be an array`);
    const cells = new Set();
    for (const point of run.points) {
      const workload = data.workloads[point.workload_id];
      const config = data.configs[point.config_id];
      if (!workload || !config) throw new Error(`Unknown workload/config: ${point.workload_id}/${point.config_id}`);
      const cell = JSON.stringify([point.workload_id, point.config_id]);
      if (cells.has(cell)) throw new Error(`Duplicate workload/config in ${version}: ${cell}`);
      cells.add(cell);
      if (point.mean_interactivity == null || point.total_throughput == null) continue;
      const mean = numeric(point.mean_interactivity, 'mean_interactivity', true);
      const total = numeric(point.total_throughput, 'total_throughput');
      const gpus = numeric(config.gpu_count, 'gpu_count', true);
      if (!Number.isInteger(gpus)) throw new Error('gpu_count must be an integer');
      const method = point.speculative_decoding ?? config.speculative_decoding ?? run.speculative_decoding ?? '';
      const enabled = point.mtp ?? config.mtp ?? run.mtp;
      if (enabled != null && typeof enabled !== 'boolean') throw new Error('mtp must be true, false or null');
      if (typeof method !== 'string') throw new Error('speculative_decoding must be a string');
      const normalizedMethod = method.toLowerCase();
      if ((enabled === true && normalizedMethod === 'none') || (enabled === false && normalizedMethod === 'mtp')) {
        throw new Error('mtp contradicts speculative_decoding');
      }
      const mtp = enabled === true || normalizedMethod === 'mtp' ? 'MTP'
        : enabled === false || normalizedMethod === 'none' ? 'Non-MTP' : 'Unknown';
      const agentic = workload.kind === 'closedloop';
      if (!agentic && workload.kind !== 'openloop') throw new Error('Unknown workload kind');
      let scenario = 'Agentic Traces';
      if (!agentic) {
        const isl = numeric(workload.isl_tokens, 'isl_tokens', true);
        const osl = numeric(workload.osl_tokens, 'osl_tokens', true);
        const e = numeric(workload.extend_tokens, 'extend_tokens');
        if (e > isl) throw new Error('E cannot exceed ISL');
        scenario = `ISL ${isl} / OSL ${osl} / E ${e}`;
      }
      const id = [data.model, data.hardware, run.kind, version, run.date ?? '', point.workload_id, agentic ? '' : mtp]
        .map((part) => encodeURIComponent(part)).join('::');
      let line = series.get(id);
      if (!line) {
        line = {
          id, name: `${run.name ?? version} / ${point.workload_id}`,
          group: run.group ?? (run.kind === 'reference' ? 'Real reference' : 'Simulation'),
          model: data.model, hwKey: data.hardware, precision: data.precision,
          islOsl: scenario, mtp: agentic ? '' : mtp, lineStyle: 'solid', marker: 'circle',
          note: [run.note, run.date, run.source].filter(Boolean).join('; '), points: [],
        };
        series.set(id, line);
      }
      const importedPoint = {
        meanInteractivity: mean, totalThroughput: total, throughput: total / gpus,
        num_prefill_gpu: gpus, num_decode_gpu: gpus, prefill_tp: config.tp, decode_tp: config.tp,
        dp_attention: config.dpa_enabled, disagg: false, is_multinode: false,
        concurrency: config.concurrency, spec_decoding: method || (enabled == null ? undefined : enabled ? 'mtp' : 'none'),
        strategy: `${point.config_id} TP${config.tp} ADP${config.adp} C${config.concurrency}`,
        label: [point.config_id, point.workload_id, point.source, point.note].filter(Boolean).join('; '),
        config_id: point.config_id, workload_id: point.workload_id,
      };
      // Agentic unprefixed latency fields are the app's P90 compatibility view,
      // so a mean latency must not be written there.
      if (!agentic) for (const [source, target] of [['mean_ttft_s', 'ttft'], ['mean_e2e_s', 'endToEnd']]) {
        if (point[source] != null) importedPoint[target] = numeric(point[source], source);
      }
      line.points.push(importedPoint);
    }
  }
  return [...series.values()];
}

function table(headers, rows, separator = ',') {
  const quote = (value) => {
    const s = String(value ?? '');
    return /["\r\n,\t]/u.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [headers, ...rows].map((row) => row.map(quote).join(separator)).join('\n') + '\n';
}

export function encodeFormats(data) {
  const series = buildSeries(data);
  const rows = series.flatMap((s) => s.points.map((p) => Object.values(columns).map((get) => get(s, p))));
  const csv = table(Object.keys(columns), rows);
  const jsonl = series.map((s) => JSON.stringify(s)).join('\n') + (series.length ? '\n' : '');
  return {
    'inferencex.csv': csv,
    'inferencex.tsv': table(Object.keys(columns), rows, '\t'),
    'inferencex.json': JSON.stringify({ series }, null, 2) + '\n',
    'inferencex.jsonl': jsonl,
    'inferencex.ndjson': jsonl,
    // One representation only: importing this archive must not duplicate each point.
    'inferencex.zip': zipSync({ 'inferencex.csv': strToU8(csv) }),
    'plot-tool.csv': table(['Line ID', 'Line Name', 'X', 'Y', 'Color', 'Line Type', 'Line Marker', 'Layer'],
      series.flatMap((s, i) => s.points.map((p) => [s.id, s.name, p.meanInteractivity, p.totalThroughput, '', 'solid', 'circle', i + 1]))),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node scripts/export-benchmark-results.mjs benchmark_results.json output-directory');
    process.exitCode = 1;
  } else {
    const data = JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/u, ''));
    const formats = encodeFormats(data);
    mkdirSync(output, { recursive: true });
    for (const [name, content] of Object.entries(formats)) writeFileSync(join(output, name), content);
    const series = buildSeries(data);
    console.log(`Exported ${series.length} curves / ${series.reduce((n, s) => n + s.points.length, 0)} points in 7 formats to ${resolve(output)}`);
    if (!series.length) console.log('No complete points yet; generated files contain no performance results.');
  }
}
