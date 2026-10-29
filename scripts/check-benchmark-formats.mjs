// Test-only synthetic coordinates; these are not benchmark results.
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { buildSeries, encodeFormats } from './export-benchmark-results.mjs';

const config = { tp: 2, adp: 1, gpu_count: 2, concurrency: 1, dpa_enabled: false };
const point = { workload_id: 'warm', config_id: 'C01', mean_interactivity: 2, total_throughput: 30, mtp: true, note: 'fixture, with "quotes"\nand newline' };
const data = {
  format_version: 1, model: 'DeepSeek-V4.1-Flash', hardware: 'MI355X', precision: 'FP4',
  configs: { C01: config, C02: { ...config, concurrency: 4 } },
  workloads: {
    warm: { kind: 'openloop', isl_tokens: 131072, extend_tokens: 2048, osl_tokens: 1024 },
    cold: { kind: 'openloop', isl_tokens: 131072, extend_tokens: 131072, osl_tokens: 1024 },
    agentx: { kind: 'closedloop', agentx_version: '1.0.12' },
  },
  reference: { name: 'Real reference', points: [point, { ...point, workload_id: 'cold' }] },
  simulations: [
    { version: 'baseline', points: [point, { ...point, config_id: 'C02', mean_interactivity: null }] },
    { version: 'v2', points: [{ ...point, workload_id: 'agentx', speculative_decoding: 'mtp', mean_ttft_s: 5, mean_e2e_s: 7 }] },
  ],
};
const series = buildSeries(data);
assert.equal(series.length, 4);
assert.equal(new Set(series.map((s) => s.id)).size, 4);
assert.ok(series.some((s) => s.islOsl.endsWith('/ E 2048')));
assert.ok(series.some((s) => s.islOsl.endsWith('/ E 131072')));
assert.equal(series[0].points[0].meanInteractivity, 2);
assert.equal(series[0].points[0].totalThroughput, 30);
assert.equal(series[0].points[0].throughput, 15);
assert.equal(series[0].points[0].num_prefill_gpu, 2);
assert.equal(series[0].points[0].num_decode_gpu, 2);
assert.equal(series[0].mtp, 'MTP');
assert.equal(series.at(-1).mtp, '');
assert.equal(series.at(-1).points[0].spec_decoding, 'mtp');
assert.equal(series.at(-1).points[0].ttft, undefined, 'Do not label AgentX mean latency as P90');
assert.equal(series.at(-1).points[0].endToEnd, undefined);

const formats = encodeFormats(data);
assert.equal(Object.keys(formats).length, 7);
const native = JSON.parse(formats['inferencex.json']).series;
const lines = formats['inferencex.jsonl'].trim().split('\n').map((line) => JSON.parse(line));
assert.deepEqual(lines, native);
assert.equal(formats['inferencex.ndjson'], formats['inferencex.jsonl']);
const zip = unzipSync(formats['inferencex.zip']);
assert.deepEqual(Object.keys(zip), ['inferencex.csv']);
assert.equal(strFromU8(zip['inferencex.csv']), formats['inferencex.csv']);
assert.ok(formats['inferencex.csv'].includes('fixture, with ""quotes""\nand newline'));
assert.ok(formats['inferencex.tsv'].split('\n')[0].includes('\tMean Interactivity (tok/s/user)\t'));
assert.equal(formats['plot-tool.csv'].split('\n')[0], 'Line ID,Line Name,X,Y,Color,Line Type,Line Marker,Layer');
assert.ok(formats['plot-tool.csv'].includes(',2,30,,solid,circle,'));
assert.equal(encodeFormats(data)['inferencex.csv'], formats['inferencex.csv']);

const unknown = structuredClone(data);
delete unknown.reference.points[0].mtp;
assert.equal(buildSeries(unknown)[0].mtp, 'Unknown');
const duplicate = structuredClone(data);
duplicate.reference.points.push({ ...point });
assert.throws(() => buildSeries(duplicate), /Duplicate workload\/config/u);
const duplicateVersion = structuredClone(data);
duplicateVersion.simulations.push(structuredClone(duplicateVersion.simulations[0]));
assert.throws(() => buildSeries(duplicateVersion), /Duplicate result version/u);
for (const invalid of [NaN, Infinity, '2']) {
  const bad = structuredClone(data);
  bad.reference.points[0].mean_interactivity = invalid;
  assert.throws(() => buildSeries(bad), /finite/u);
}
const empty = structuredClone(data);
empty.reference.points = [];
empty.simulations = [];
assert.deepEqual(JSON.parse(encodeFormats(empty)['inferencex.json']), { series: [] });
console.log('Benchmark formats passed: E/version separation, units, missing values, JSON/JSONL/NDJSON, tables, ZIP and Plot Tool.');
