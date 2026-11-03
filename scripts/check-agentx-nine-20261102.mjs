import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = new URL('../src/data/agentxMi355x20261102_3600s.json', import.meta.url);
const raw = readFileSync(sourcePath);
assert.deepEqual(raw, readFileSync(new URL('../public/data/agentx-mi355x-20261102-3600s.json', import.meta.url)));
const data = JSON.parse(raw);
const reference = JSON.parse(readFileSync(new URL('../src/data/inferencexAgentx39596624542.json', import.meta.url)));
const configs = ['C01', 'C02', 'C03', 'C04', 'C05', 'C07', 'C08', 'C09', 'C10'];
assert.deepEqual(data.selectedConfigurations, configs);
assert.equal(data.requestedHorizonSeconds, 3600);
const [native, simulation] = data.series;
assert.equal(native.name, 'AgentX-Local-Mi355X');
assert.equal(native.group, 'Local-real-run');
assert.equal(simulation.name, 'E2E-SimOpus-Mi355x-20261102-3600s');
assert.equal(simulation.group, 'E2E-SimOpus-Mi355x');
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-10, Math.abs(expected) * 1e-12), `${actual} != ${expected}`);
for (const line of data.series) {
  assert.deepEqual(line.points.map((point) => point.configId), configs);
  assert.equal(line.model, 'DeepSeek-V4.1-Flash');
  assert.equal(line.islOsl, 'Agentic Traces');
  assert.equal(line.mtp, undefined);
  for (const point of line.points) {
    const e = point.evidence;
    assert.equal(point.dp_attention, false);
    assert.equal(e.configParameters.ADP, 1);
    assert.equal(e.configParameters.monokernel_backend, null);
    assert.equal(e.formalErrors + e.formalCancelled + e.formalContextSkips, 0);
    assert.match(e.originalAIPerfAggregateSha256, /^[a-f0-9]{64}$/);
    assert.match(e.originalAIPerfJsonlSha256, /^[a-f0-9]{64}$/);
    close(point.meanInteractivity, 1 / e.meanFullResponseITLSecondsRounded5);
    close(point.totalThroughput, (e.inputTokens + e.outputTokens) / e.observedDurationSeconds);
    close(point.throughput, point.totalThroughput / point.tp);
    close(point.ttft, point.ttftPercentiles.p90);
    close(point.endToEnd, point.endToEndPercentiles.p90);
    assert.equal(e.accuracyAccepted, false);
  }
}
for (const [index, report] of data.comparisons.entries()) {
  assert.equal(report.configCount, 9);
  let interactivity = 0;
  let throughput = 0;
  for (const [i, point] of simulation.points.entries()) {
    const truth = index === 0 ? native.points[i] : reference.points.find((candidate) =>
      candidate.tp === point.tp && candidate.adp === 1 && candidate.concurrency === point.concurrency);
    assert.ok(truth);
    const x = index === 0 ? truth.meanInteractivity : truth.metrics.mean_intvty;
    const y = index === 0 ? truth.totalThroughput : truth.metrics.total_tput_tps;
    interactivity += Math.abs(point.meanInteractivity / x - 1) * 100 / 9;
    throughput += Math.abs(point.totalThroughput / y - 1) * 100 / 9;
    close(report.points[i].mean_interactivity.reference, x);
    close(report.points[i].total_throughput.reference, y);
  }
  close(report.meanInteractivityMAPEPercent, interactivity);
  close(report.totalThroughputMAPEPercent, throughput);
}
assert.ok(data.comparisons[0].points.find((point) => point.config === 'C05').mean_interactivity.absolutePercentageError > 20);
assert.equal(data.provenance.accuracyAccepted, false);
assert.equal(data.provenance.versionFreeze, false);

// Exercise the actual startup function with saved-workspace boundaries, without DOM/network mocks.
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const startup = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'createInitialDataState');
assert.ok(startup);
const compiled = ts.transpileModule(startup.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function restore(saved) {
  const initial = (lines) => ({
    activeSeriesIds: new Set(lines.map((line) => line.id)), activeSeriesIdsByView: new Map(),
    chartMetric: 'meanInteractivity', chartYMetric: 'totalThroughput', mtpFilter: '__all__'
  });
  const context = vm.createContext({
    structuredClone, exampleSeries: structuredClone(data.series), agentx20261102Series: structuredClone(data.series),
    agentxHistory20261015Series: [],
    fixedLengthComparisonSeries: [], fixed16220261101Series: [], ALL_VALUE: '__all__',
    loadPersistedAppData: () => structuredClone(saved),
    draftsFromSeriesForRestore: (lines) => structuredClone(lines),
    draftsToSeriesAllowEmpty: (lines) => structuredClone(lines),
    makeRestoredEmptySeriesDraft: () => ({ id: 'empty', points: [] }),
    createInitialState: initial,
    restoreAppState: (state, prior) => ({ ...state, ...prior }),
    createInferenceXSyncState: (prior) => ({ configs: prior?.configs ?? [] })
  });
  return vm.runInContext(`${compiled}\ncreateInitialDataState()`, context);
}
const existing = { id: 'user-line', name: 'User data', points: [{ throughput: 123, meanInteractivity: 456 }] };
const saved = (lines, extra = {}) => ({
  fixed180BaselineAdded: true, fixed180LabelsAdded: true, fixed16220261031Added: true,
  fixed16220261101LabelsAdded: true, currentSeries: structuredClone(lines), seriesDrafts: structuredClone(lines),
  state: { chartMetric: 'endToEnd', chartYMetric: 'throughput' }, inferenceXSync: { configs: [{ id: 'user-sync' }] }, ...extra
});
assert.equal(restore(null).currentSeries.length, 2);
const migrated = restore(saved([existing]));
assert.equal(migrated.currentSeries.length, 3);
assert.equal(migrated.currentSeries[0].name, 'User data');
assert.equal(migrated.state.chartMetric, 'endToEnd');
assert.equal(migrated.state.chartYMetric, 'throughput');
assert.equal(migrated.inferenceXSync.configs[0].id, 'user-sync');
const edited = { ...structuredClone(native), name: 'My edited native line', color: '#123456' };
const retained = restore(saved([existing, edited]));
assert.equal(retained.currentSeries.length, 3);
assert.equal(retained.currentSeries.find((line) => line.id === native.id).name, edited.name);
assert.equal(retained.currentSeries.find((line) => line.id === native.id).color, edited.color);
assert.equal(restore(saved([])).currentSeries.length, 0);
assert.equal(restore(saved([existing], { agentx20261102Added: true })).currentSeries.length, 1);
assert.ok(main.includes('agentx20261102Added: data.agentx20261102Added === true'));
assert.ok(main.includes('agentx20261102Added: true'));
console.log('AgentX 20261102: 18 original metric projections, two nine-config MAPE comparisons, and saved-workspace migration boundaries passed.');
