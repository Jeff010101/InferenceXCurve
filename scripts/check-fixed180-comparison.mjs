import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createServer } from 'vite';

// Exercise the actual pure transformations in main.ts without starting a browser.
const mainSource = fs.readFileSync('src/main.ts', 'utf8');
const ast = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.Latest, true);
const declarations = new Map();
for (const node of ast.statements) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node);
  if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, node);
  }
}
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const scenario = await server.ssrLoadModule('/src/sequenceScenario.ts');
  const chart = await server.ssrLoadModule('/src/inferenceCurveChart.ts');
  const sync = await server.ssrLoadModule('/src/inferenceXSync.ts');
  const data = await server.ssrLoadModule('/src/exampleData.ts');
  const simulation = data.fixed180BaselineSeries;
  const all = data.fixedLengthComparisonSeries;
  const common = {
    ...scenario, ...chart, ...sync, ...data,
    getTheme: () => 'dark',
    getDefaultDraftModel: () => 'DeepSeek-V4.1-Flash',
    getDefaultDraftIslOsl: () => 'ISL 131072 / OSL 1024 / E 512',
    getDefaultDraftPrecision: () => 'fp4'
  };
  function api(names, overrides = {}) {
    const scope = { ...common, ...overrides };
    const needed = new Set();
    function include(name) {
      if (name in scope || !declarations.has(name)) return;
      const node = declarations.get(name);
      if (needed.has(node)) return;
      needed.add(node);
      function visit(child) {
        if (ts.isIdentifier(child)) include(child.text);
        ts.forEachChild(child, visit);
      }
      visit(node);
    }
    names.forEach(include);
    const source = [...ast.statements].filter(n => needed.has(n)).map(n => n.getText(ast)).join('\n');
    assert.ok(!/document\.|window\./u.test(source), 'CPU checks must not initialize browser UI');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    return new Function(...Object.keys(scope), `${js}\nreturn { ${names.join(', ')} };`)(...Object.values(scope));
  }

  assert.equal(simulation.length, 18);
  assert.equal(all.length, 36);
  assert.equal(simulation.flatMap(s => s.points).length, 162);
  const groups = new Map();
  for (const line of all) {
    const key = `${scenario.getComparisonContextKey(line.islOsl, line.comparisonContext)}|${scenario.getSequenceExtendKey(line.islOsl)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
    assert.equal(line.points.length, 9);
  }
  assert.equal(groups.size, 18);
  for (const lines of groups.values()) {
    assert.equal(lines.length, 2);
    assert.equal(new Set(lines.map(s => s.group)).size, 2);
    assert.deepEqual(lines[0].points.map(p => `${p.prefill_tp}/${p.concurrency}`).sort(), lines[1].points.map(p => `${p.prefill_tp}/${p.concurrency}`).sort());
  }
  const actual = 'ISL 131072 / OSL 1024 / E 512';
  const strict = scenario.getSequenceContextKey(actual);
  for (const invalid of ['', 'Agentic Traces', 'ISL 131072 / OSL 2048', 'ISL 131072 / OSL 1024 / E 512', 'ISL 0 / OSL 1024']) {
    assert.equal(scenario.getComparisonContextKey(actual, invalid), strict);
  }
  assert.equal(scenario.getComparisonContextKey(actual, 'ISL 131072 / OSL 1024'), 'ISL 131072 / OSL 1024');
  assert.equal(scenario.getComparisonContextKey('Agentic Traces', 'ISL 131072 / OSL 1024'), 'Agentic Traces');

  const originals = structuredClone(simulation);
  const transforms = api(['seriesToDrafts', 'draftsToSeriesAllowEmpty', 'readNativeSeries', 'restorePersistedSeriesDrafts']);
  const drafts = transforms.seriesToDrafts(simulation);
  const restored = transforms.restorePersistedSeriesDrafts(JSON.parse(JSON.stringify(drafts)));
  const rebuilt = transforms.draftsToSeriesAllowEmpty(restored);
  const imported = transforms.readNativeSeries({ series: rebuilt });
  function compareMetrics(lines) {
    assert.equal(lines.length, originals.length);
    lines.forEach((line, i) => {
      const source = originals[i];
      assert.equal(line.islOsl, source.islOsl);
      assert.equal(line.comparisonContext, source.comparisonContext);
      assert.equal(line.mtp, 'Unknown');
      assert.equal(line.points.length, source.points.length);
      line.points.forEach((point, j) => {
        for (const metric of ['meanInteractivity', 'totalThroughput', 'throughput', 'ttft', 'endToEnd']) {
          assert.equal(point[metric], source.points[j][metric], `${source.id}/${j}/${metric}`);
        }
      });
    });
  }
  compareMetrics(imported);
  const state = { modelFilter: '__all__', scenarioFilter: 'Fixed Sequence Length', islOslFilter: 'ISL 131072 / OSL 1024', extendFilter: '__all__', mtpFilter: '__all__', selectedPrecisions: new Set(['fp4']), activeSeriesIds: new Set(simulation.map(s => s.id)), highContrast: false, theme: 'dark', chartMetric: 'meanInteractivity', chartYMetric: 'totalThroughput', latencyPercentile: 'p90', showNonOptimalPoints: true };
  const csvApi = api(['buildChartCsvRows', 'seriesFromEditorRecords'], {
    state,
    getSeriesForPersistence: () => simulation,
    getChartColorSourceSeries: () => simulation,
    shouldEnforceEndToEndPareto: () => false,
    getTcoHourlyCosts: () => undefined
  });
  const rows = csvApi.buildChartCsvRows('all');
  assert.equal(rows.length, 163);
  const records = rows.slice(1).map(row => {
    assert.equal(row.length, rows[0].length);
    return Object.fromEntries(rows[0].map((header, i) => [header, row[i]]));
  });
  compareMetrics(csvApi.seriesFromEditorRecords(records));
  assert.deepEqual(simulation, originals, 'All display and export operations leave original data unchanged');

  const prior = data.exampleSeries.find(s => s.islOsl === 'Agentic Traces');
  const edited = structuredClone(all[0]);
  edited.name = 'User edited reference';
  edited.points[0].meanInteractivity = 123.456;
  const saved = { currentSeries: [prior, edited], seriesDrafts: transforms.seriesToDrafts([prior, edited]), state: {}, inferenceXSync: {} };
  function initial(persisted) {
    return api(['createInitialDataState'], {
      loadPersistedAppData: () => structuredClone(persisted),
      createInferenceXSyncState: () => ({})
    }).createInitialDataState();
  }
  const migrated = initial(saved);
  assert.equal(migrated.currentSeries.length, 37);
  assert.equal(migrated.seriesDrafts.length, 37);
  assert.equal(migrated.currentSeries.find(s => s.id === edited.id).name, edited.name);
  assert.equal(migrated.currentSeries.find(s => s.id === edited.id).points[0].meanInteractivity, 123.456);
  assert.equal(migrated.state.chartMetric, 'meanInteractivity');
  assert.equal(migrated.state.chartYMetric, 'totalThroughput');
  const repeated = initial({ ...saved, fixed180BaselineAdded: true });
  assert.equal(repeated.currentSeries.length, 2);
  assert.equal(repeated.seriesDrafts.length, 2, 'No empty draft is appended on reload');
  const empty = initial({ currentSeries: [], seriesDrafts: [], state: {}, inferenceXSync: {} });
  assert.equal(empty.currentSeries.length, 0, 'An intentionally cleared workspace stays empty');
  assert.equal(empty.seriesDrafts.length, 1);
  assert.equal(empty.seriesDrafts[0].points.length, 1);
  const baseName = 'E2E-SimOpus-Mi355x-baseline';
  const suffixes = new Set();
  for (const line of simulation) {
    const { isl, e } = scenario.parseIslOslLengths(line.islOsl);
    const suffix = e === isl ? 'Cold' : `E ${e < 1024 ? e : `${e / 1024}K`}`;
    assert.equal(line.name, `${baseName} / ${suffix}`);
    suffixes.add(suffix);
  }
  assert.deepEqual([...suffixes].sort(), ['Cold', 'E 1K', 'E 2K', 'E 4K', 'E 512']);
  const oldLabels = structuredClone(simulation).map(line => ({ ...line, name: baseName }));
  oldLabels[0].name = 'My custom simulation';
  const agentxBaseline = data.exampleSeries.find(line => line.islOsl === 'Agentic Traces' && line.name === baseName);
  assert.ok(agentxBaseline, 'AgentX baseline keeps its separate identity and unsuffixed name');
  const oldLines = [...oldLabels, agentxBaseline];
  const labelFixture = { fixed180BaselineAdded: true, currentSeries: oldLines, seriesDrafts: transforms.seriesToDrafts(oldLines), state: {}, inferenceXSync: {} };
  const relabeled = initial(labelFixture);
  for (const collection of [relabeled.currentSeries, relabeled.seriesDrafts]) {
    assert.equal(collection.find(line => line.id === oldLabels[0].id).name, 'My custom simulation');
    assert.equal(collection.find(line => line.id === agentxBaseline.id).name, baseName);
    for (const expected of simulation.slice(1)) {
      assert.equal(collection.find(line => line.id === expected.id).name, expected.name);
    }
  }
  const alreadyRelabeled = initial({ ...labelFixture, fixed180LabelsAdded: true });
  assert.equal(alreadyRelabeled.currentSeries.find(line => line.id === oldLabels[1].id).name, baseName,
    'Label migration runs only once, preserving subsequent user renames');

  // Fresh repository/migrated lines may carry precision only on the series.
  // Put simulations first to reproduce first-entry ordering before a draft reload.
  const ordered = [...simulation, ...data.exampleSeries.filter(s => !simulation.some(sim => sim.id === s.id))];
  assert.deepEqual(chart.getAvailablePrecisions(simulation), ['fp4']);
  const fresh = api(['createInitialState']).createInitialState(ordered);
  assert.equal(fresh.scenarioFilter, 'agentic');
  const switching = api([
    'saveActiveSeriesForCurrentView', 'getDefaultSequenceForScenario', 'getModelFilteredSeries',
    'reconcileFiltersForSeries', 'resetSelectionsForSeries', 'getModelSequenceMtpFilteredSeries',
    'restoreActiveSeriesForCurrentView', 'getFilteredSeriesForChart'
  ], { state: fresh, currentSeries: ordered, scheduleLocalSave: () => {} });
  switching.saveActiveSeriesForCurrentView();
  fresh.scenarioFilter = 'fixed-sequence';
  fresh.islOslFilter = switching.getDefaultSequenceForScenario(switching.getModelFilteredSeries(), fresh.scenarioFilter);
  fresh.extendFilter = '__all__';
  switching.reconcileFiltersForSeries(ordered);
  switching.resetSelectionsForSeries(switching.getModelSequenceMtpFilteredSeries());
  switching.restoreActiveSeriesForCurrentView();
  assert.deepEqual([...fresh.selectedPrecisions], ['fp4']);
  const shown = switching.getFilteredSeriesForChart();
  assert.equal(shown.length, 10, 'First Agentic to Fixed switch shows five real/simulation case pairs');
  assert.equal(fresh.activeSeriesIds.size, 10);
  assert.equal(chart.getInferenceCurveColorSourceSeries(shown, fresh.activeSeriesIds, ['fp4'], 'meanInteractivity').length, 10);
  const prepared = chart.prepareInferenceCurveSeries(shown, false, 'dark', shown, 'meanInteractivity', false, undefined, 'maximize', 'p90', 'totalThroughput');
  assert.equal(prepared.flatMap(s => s.points).length, 90);
  assert.ok(prepared.flatMap(s => s.points).every(p => p.precision === 'fp4'));

  console.log('Fixed180 comparison passed: 18 paired cases, 162 unchanged metrics, context guards, JSON/draft/CSV roundtrip, additive migration, and first Agentic-to-Fixed switch precision.');
} finally {
  await server.close();
}
