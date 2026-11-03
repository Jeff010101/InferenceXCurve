import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const raw = readFileSync(new URL('../src/data/inferencexAgentx20261015.json', import.meta.url));
assert.deepEqual(raw, readFileSync(new URL('../public/data/inferencex-agentx-20261015.json', import.meta.url)));
const data = JSON.parse(raw);
const [history] = data.series;
const configs = ['C01', 'C02', 'C03', 'C04', 'C05', 'C07', 'C08', 'C09', 'C10'];
assert.deepEqual(data.selectedConfigurations, configs);
assert.deepEqual(history.points.map((p) => p.configId), configs);
assert.equal(history.name, 'InferenceX-AgentX-20261015');
assert.equal(history.group, 'InferenceX reference');
assert.equal(history.model, 'DeepSeek-V4.1-Flash');
assert.equal(history.islOsl, 'Agentic Traces');
assert.equal(history.mtp, undefined);
assert.match(history.note, /v0\.5\.21-rocm720-mi35x-20261013/);
assert.match(history.note, /UNKNOWN/);
assert.match(data.sourceResponseSha256, /^[a-f0-9]{64}$/);
const source = new Map(data.sourceRows.map((p) => [String(p.id), p]));
assert.equal(source.size, 9);
for (const point of history.points) {
  const row = source.get(point.referenceId);
  assert.ok(row);
  assert.equal(row.hardware, 'mi355x');
  assert.equal(row.framework, 'sglang');
  assert.equal(row.date, '2026-10-15');
  assert.equal(row.image, 'lmsysorg/sglang-rocm:v0.5.21-rocm720-mi35x-20261013');
  assert.equal(point.dp_attention, false);
  assert.equal(row.prefill_dp_attention, false);
  assert.equal(row.decode_dp_attention, false);
  assert.equal(point.tp, row.decode_tp);
  assert.equal(point.concurrency, row.conc);
  assert.equal(point.num_decode_gpu, row.num_decode_gpu);
  assert.equal(point.spec_decoding, row.spec_method);
  assert.equal(point.meanInteractivity, row.metrics.mean_intvty);
  assert.equal(point.totalThroughput, row.metrics.total_tput_tps);
  assert.equal(point.throughput, row.metrics.tput_per_gpu);
  assert.ok(Math.abs(point.throughput * point.num_decode_gpu - point.totalThroughput) < 0.0001);
  assert.equal(point.interactivity, row.metrics.p90_intvty);
  assert.equal(point.ttft, row.metrics.p90_ttft);
  assert.equal(point.endToEnd, row.metrics.p90_e2el);
  assert.deepEqual(point.evidence.originalMetrics, row.metrics);
}

// Exercise the actual startup routine: adding a dated reference must preserve
// the existing public/native/simulated lines and all user edits and deletions.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const startup = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createInitialDataState');
assert.ok(startup);
const compiled = ts.transpileModule(startup.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const existing = JSON.parse(readFileSync(new URL('../src/data/agentxMi355x20261102_3600s.json', import.meta.url))).series;
function restore(saved) {
  const initial = (lines) => ({
    activeSeriesIds: new Set(lines.map((line) => line.id)), activeSeriesIdsByView: new Map(),
    chartMetric: 'meanInteractivity', chartYMetric: 'totalThroughput', mtpFilter: '__all__'
  });
  const context = vm.createContext({
    structuredClone, exampleSeries: structuredClone([...existing, history]),
    agentx20261102Series: [], agentxHistory20261015Series: [structuredClone(history)],
    fixedLengthComparisonSeries: [], fixed16220261101Series: [], ALL_VALUE: '__all__',
    loadPersistedAppData: () => structuredClone(saved),
    draftsFromSeriesForRestore: (lines) => structuredClone(lines),
    draftsToSeriesAllowEmpty: (lines) => structuredClone(lines),
    makeRestoredEmptySeriesDraft: () => ({ id: 'empty', points: [] }),
    createInitialState: initial,
    restoreAppState: (state, prior) => ({ ...state, ...prior }),
    createInferenceXSyncState: (prior) => ({ configs: prior?.configs ?? [] })
  });
  return JSON.parse(JSON.stringify(vm.runInContext(`${compiled}\ncreateInitialDataState()`, context)));
}
const saved = (lines, extra = {}) => ({
  fixed180BaselineAdded: true, fixed180LabelsAdded: true, fixed16220261031Added: true,
  fixed16220261101LabelsAdded: true, agentx20261102Added: true,
  currentSeries: structuredClone(lines), seriesDrafts: structuredClone(lines),
  state: { chartMetric: 'meanInteractivity', chartYMetric: 'totalThroughput' },
  inferenceXSync: { configs: [] }, ...extra
});
assert.equal(restore(null).currentSeries.length, existing.length + 1);
const migrated = restore(saved(existing));
assert.equal(migrated.currentSeries.length, existing.length + 1);
assert.deepEqual(migrated.currentSeries.slice(0, existing.length), existing);
assert.equal(migrated.currentSeries.at(-1).name, history.name);
const edited = { ...structuredClone(history), name: 'My historical line', color: '#123456', note: 'Keep my note' };
const retained = restore(saved([...existing, edited]));
assert.deepEqual(retained.currentSeries, [...existing, edited]);
assert.equal(restore(saved([])).currentSeries.length, 0);
assert.deepEqual(restore(saved(existing, { agentxHistory20261015Added: true })).currentSeries, existing);
assert.ok(main.includes('agentxHistory20261015Added: data.agentxHistory20261015Added === true'));
assert.ok(main.includes('agentxHistory20261015Added: true'));
console.log('Historical AgentX 20261015: nine original API metric/config projections and existing-line/edit/empty/deletion preservation passed.');
