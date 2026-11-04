import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
  const newSimulation = data.fixed16220261101Series;
  const latestSimulation = data.fixed16220261103Series;
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
  assert.equal(newSimulation.length, 18);
  assert.equal(latestSimulation.length, 18);
  assert.equal(all.length, 72);
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
    assert.equal(lines.length, 4);
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
  function compareMetrics(lines, expected = originals) {
    assert.equal(lines.length, expected.length);
    lines.forEach((line, i) => {
      const source = expected[i];
      assert.equal(line.islOsl, source.islOsl);
      assert.equal(line.comparisonContext, source.comparisonContext);
      assert.equal(line.mtp.toLowerCase(), source.mtp.toLowerCase(), 'CSV preserves the MTP category');
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
      loadPersistedAppData: () => structuredClone({
        fixed16220261103Added: true, agentx20261102Added: true,
        agentxHistory20261015Added: true, ...persisted
      }),
      createInferenceXSyncState: () => ({})
    }).createInitialDataState();
  }
  const migrated = initial(saved);
  assert.equal(migrated.currentSeries.length, 73);
  assert.equal(migrated.seriesDrafts.length, 73);
  assert.equal(migrated.currentSeries.find(s => s.id === edited.id).name, edited.name);
  assert.equal(migrated.currentSeries.find(s => s.id === edited.id).points[0].meanInteractivity, 123.456);
  assert.equal(migrated.state.chartMetric, 'meanInteractivity');
  assert.equal(migrated.state.chartYMetric, 'totalThroughput');
  const repeated = initial({ ...saved, fixed180BaselineAdded: true, fixed16220261031Added: true });
  assert.equal(repeated.currentSeries.length, 2);
  assert.equal(repeated.seriesDrafts.length, 2, 'No empty draft is appended on reload');
  const upgraded = initial({ ...saved, fixed180BaselineAdded: true });
  assert.equal(upgraded.currentSeries.length, 20, 'Existing browsers receive just the new 18 curves');
  assert.equal(upgraded.currentSeries.find(s => s.id === edited.id).name, edited.name);
  const savedAxes = initial({ ...saved, fixed180BaselineAdded: true,
    state: { ...saved.state, chartMetric: 'ttft', chartYMetric: 'throughput', mtpFilter: 'MTP' } });
  assert.equal(savedAxes.state.chartMetric, 'ttft', 'Adding the new version preserves existing axes');
  assert.equal(savedAxes.state.chartYMetric, 'throughput');
  assert.equal(savedAxes.state.mtpFilter, 'MTP');
  const editedNew = structuredClone(newSimulation[0]);
  editedNew.name = 'User edited new snapshot';
  editedNew.points[0].meanInteractivity = 321.123;
  const upgradedWithEdit = initial({ ...saved, fixed180BaselineAdded: true,
    currentSeries: [editedNew], seriesDrafts: transforms.seriesToDrafts([editedNew]) });
  assert.equal(upgradedWithEdit.currentSeries.length, 18, 'Existing new IDs are not duplicated');
  assert.equal(upgradedWithEdit.currentSeries[0].name, editedNew.name);
  assert.equal(upgradedWithEdit.currentSeries[0].points[0].meanInteractivity, 321.123);
  const deletedAfterUpgrade = initial({ ...saved, fixed180BaselineAdded: true,
    fixed16220261031Added: true, currentSeries: [editedNew],
    seriesDrafts: transforms.seriesToDrafts([editedNew]) });
  assert.equal(deletedAfterUpgrade.currentSeries.length, 1, 'Deleted snapshot lines stay deleted');
  const datedLines = structuredClone(newSimulation).map(line => ({
    ...line, name: line.name.replace('-20261101 /', '-20261031 /')
  }));
  datedLines[0].name = 'My edited simulation name';
  datedLines[1].points[0].meanInteractivity = 987.654;
  const dateFixture = { ...saved, fixed180BaselineAdded: true, fixed16220261031Added: true,
    currentSeries: datedLines, seriesDrafts: transforms.seriesToDrafts(datedLines) };
  const correctedDates = initial(dateFixture);
  for (const collection of [correctedDates.currentSeries, correctedDates.seriesDrafts]) {
    assert.equal(collection.length, 18, 'Correcting the date never duplicates an existing version');
    assert.equal(collection[0].name, datedLines[0].name, 'Custom names are preserved');
    assert.equal(collection[1].name, newSimulation[1].name);
  }
  assert.equal(correctedDates.currentSeries[1].points[0].meanInteractivity, 987.654);
  assert.deepEqual(correctedDates.currentSeries.map(line => line.id), datedLines.map(line => line.id));
  const alreadyCorrected = initial({ ...dateFixture, fixed16220261101LabelsAdded: true });
  assert.equal(alreadyCorrected.currentSeries[1].name, datedLines[1].name,
    'The date migration runs once, preserving subsequent intentional renames');
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
  assert.equal(shown.length, 20, 'First Agentic to Fixed switch shows all four versions for five cases');
  assert.equal(fresh.activeSeriesIds.size, 20);
  assert.equal(chart.getInferenceCurveColorSourceSeries(shown, fresh.activeSeriesIds, ['fp4'], 'meanInteractivity').length, 20);
  const prepared = chart.prepareInferenceCurveSeries(shown, false, 'dark', shown, 'meanInteractivity', false, undefined, 'maximize', 'p90', 'totalThroughput');
  assert.equal(prepared.flatMap(s => s.points).length, 180);
  assert.ok(prepared.flatMap(s => s.points).every(p => p.precision === 'fp4'));

  const publicBytes = fs.readFileSync('public/data/e2e-simopus-mi355x-20261101.json');
  assert.deepEqual(publicBytes, fs.readFileSync('src/data/fixed162SimOpusMi355x20261101.json'));
  const snapshot = JSON.parse(publicBytes);
  const publicationManifest = JSON.parse(fs.readFileSync('public/data/e2e-simopus-mi355x-20261101.manifest.json'));
  assert.equal(publicBytes.length, publicationManifest.bytes);
  assert.equal(createHash('sha256').update(publicBytes).digest('hex'), publicationManifest.sha256);
  assert.ok(!publicBytes.includes(Buffer.from('\r\n')), 'Public snapshot bytes use canonical LF newlines');
  assert.equal(snapshot.visibility, 'public');
  assert.equal(snapshot.provenance.formalRequests, 15840);
  assert.equal(snapshot.accuracyAccepted, false);
  assert.equal(newSimulation.flatMap(s => s.points).length, 162);
  const newSuffixes = new Set();
  for (const line of newSimulation) {
    assert.ok(line.name.startsWith('E2E-SimOpus-Mi355x-20261101 / '));
    assert.ok(line.id.startsWith('e2e-simopus-mi355x-20261031::'), 'Stable legacy IDs survive a display-date correction');
    newSuffixes.add(line.name.split(' / ')[1]);
    assert.equal(line.group, 'E2E-SimOpus-Mi355x');
    assert.equal(line.mtp, 'MTP');
    for (const point of line.points) {
      assert.equal(point.failed_requests, 0);
      assert.equal(point.completed_requests, point.concurrency * 10);
      assert.equal(point.totalThroughput / point.num_prefill_gpu, point.throughput);
      assert.ok(Math.abs(point.meanInteractivity * point.mean_tpot_seconds - 1) < 1e-14);
      assert.equal(point.interactivityPercentiles, undefined, 'No mean is relabeled as a percentile');
    }
  }
  assert.deepEqual([...newSuffixes].sort(), ['Cold', 'E1K', 'E2K', 'E4K', 'E512']);
  const rebuiltNew = transforms.readNativeSeries({ series: transforms.draftsToSeriesAllowEmpty(
    transforms.restorePersistedSeriesDrafts(JSON.parse(JSON.stringify(transforms.seriesToDrafts(newSimulation))))
  ) });
  rebuiltNew.forEach((line, i) => {
    assert.equal(line.islOsl, newSimulation[i].islOsl);
    assert.equal(line.comparisonContext, newSimulation[i].comparisonContext);
    line.points.forEach((point, j) => {
      for (const metric of ['meanInteractivity', 'totalThroughput', 'throughput', 'ttft', 'endToEnd']) {
        assert.equal(point[metric], newSimulation[i].points[j][metric]);
      }
    });
  });
  const newCsvApi = api(['buildChartCsvRows', 'seriesFromEditorRecords'], {
    state: { ...state, activeSeriesIds: new Set(newSimulation.map(s => s.id)) },
    getSeriesForPersistence: () => newSimulation,
    getChartColorSourceSeries: () => newSimulation,
    shouldEnforceEndToEndPareto: () => false,
    getTcoHourlyCosts: () => undefined
  });
  const newCsvRows = newCsvApi.buildChartCsvRows('all');
  assert.equal(newCsvRows.length, 163);
  compareMetrics(newCsvApi.seriesFromEditorRecords(newCsvRows.slice(1).map(row =>
    Object.fromEntries(newCsvRows[0].map((header, i) => [header, row[i]]))
  )), newSimulation);
  const latestBytes = fs.readFileSync('public/data/e2e-simopus-mi355x-20261103.json');
  assert.deepEqual(latestBytes, fs.readFileSync('src/data/fixed162SimOpusMi355x20261103.json'));
  const latest = JSON.parse(latestBytes);
  const latestManifest = JSON.parse(fs.readFileSync('public/data/e2e-simopus-mi355x-20261103.manifest.json'));
  assert.equal(createHash('sha256').update(latestBytes).digest('hex'), latestManifest.sha256);
  assert.equal(latestBytes.length, latestManifest.bytes);
  assert.equal(latest.provenance.formalRequests, 15840);
  assert.equal(latest.accuracyAccepted, false);
  assert.equal(latest.independentNaturalAcceptancePrediction, false);
  assert.equal(latest.inputMode, 'conditional_given_published_mean_AL');
  assert.equal(latestSimulation.flatMap(s => s.points).length, 162);
  assert.ok(!/[A-Z]:\\|\/mnt\/|\/data\/|\.dcgpu/.test(latestBytes.toString()), 'Public exports omit internal paths');
  const suffixes20261103 = new Set();
  for (const line of latestSimulation) {
    assert.ok(line.name.startsWith('E2E-SimOpus-Mi355x-20261103 / '));
    assert.equal(line.mtp, 'MTP');
    suffixes20261103.add(line.name.split(' / ')[1]);
    for (const point of line.points) {
      assert.equal(point.completed_requests, point.concurrency * 10);
      assert.equal(point.failed_requests, 0);
      assert.equal(point.totalThroughput / point.num_prefill_gpu, point.throughput);
      assert.ok(Math.abs(point.meanInteractivity * point.mean_tpot_seconds - 1) < 1e-14);
      assert.equal(point.interactivity, undefined);
      assert.equal(point.interactivityPercentiles, undefined);
      assert.match(point.source_result_sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.deepEqual([...suffixes20261103].sort(), ['Cold', 'E1K', 'E2K', 'E4K', 'E512']);
  const latestImported = transforms.readNativeSeries({ series: transforms.draftsToSeriesAllowEmpty(
    transforms.restorePersistedSeriesDrafts(JSON.parse(JSON.stringify(transforms.seriesToDrafts(latestSimulation))))
  ) });
  compareMetrics(latestImported, latestSimulation);
  assert.ok(latestSimulation.every(line => line.color === '#ef4444'));
  const oldGreen = structuredClone(latestSimulation[0]); oldGreen.color = '#22c55e';
  const autoLatest = structuredClone(latestSimulation[1]); autoLatest.color = '';
  const customBlue = structuredClone(latestSimulation[2]); customBlue.color = '#123abc';
  const otherGreen = structuredClone(newSimulation[0]); otherGreen.color = '#22c55e';
  const colorLines = [oldGreen, autoLatest, customBlue, otherGreen];
  const colorSaved = { ...saved, fixed180BaselineAdded: true, fixed16220261031Added: true,
    currentSeries: colorLines, seriesDrafts: transforms.seriesToDrafts(colorLines) };
  const recolored = initial(colorSaved);
  for (const collection of [recolored.currentSeries, recolored.seriesDrafts]) {
    assert.equal(collection[0].color, '#ef4444');
    assert.equal(collection[1].color, '#ef4444');
    assert.equal(collection[2].color, '#123abc');
    assert.equal(collection[3].color, '#22c55e');
  }
  compareMetrics(recolored.currentSeries, colorLines);
  assert.equal(initial({ ...colorSaved, fixed16220261103ColorsAdded: true }).currentSeries[0].color, '#22c55e',
    'A later intentional color edit survives the one-time migration');
  const upgradeLatest = { ...saved, fixed180BaselineAdded: true, fixed16220261031Added: true,
    fixed16220261103Added: false, state: { chartMetric: 'ttft', chartYMetric: 'throughput', mtpFilter: 'MTP' } };
  const addedLatest = initial(upgradeLatest);
  assert.equal(addedLatest.currentSeries.length, 20);
  assert.equal(addedLatest.state.chartMetric, 'ttft');
  assert.equal(addedLatest.state.chartYMetric, 'throughput');
  assert.equal(addedLatest.currentSeries.find(s => s.id === edited.id).points[0].meanInteractivity, 123.456);
  const customLatest = structuredClone(latestSimulation[0]);
  customLatest.name = 'Keep my name'; customLatest.points[0].totalThroughput = 456.789;
  const editedLatest = initial({ ...upgradeLatest, currentSeries: [customLatest], seriesDrafts: transforms.seriesToDrafts([customLatest]) });
  assert.equal(editedLatest.currentSeries.length, 18);
  assert.equal(editedLatest.currentSeries[0].name, 'Keep my name');
  assert.equal(editedLatest.currentSeries[0].points[0].totalThroughput, 456.789);
  assert.equal(initial({ ...upgradeLatest, fixed16220261103Added: true }).currentSeries.length, 2);
  assert.equal(initial({ ...upgradeLatest, currentSeries: [], seriesDrafts: [] }).currentSeries.length, 0);
  const latestCsvApi = api(['buildChartCsvRows', 'seriesFromEditorRecords'], {
    state: { ...state, activeSeriesIds: new Set(latestSimulation.map(s => s.id)) },
    getSeriesForPersistence: () => latestSimulation,
    getChartColorSourceSeries: () => latestSimulation,
    shouldEnforceEndToEndPareto: () => false,
    getTcoHourlyCosts: () => undefined
  });
  const latestCsvRows = latestCsvApi.buildChartCsvRows('all');
  assert.equal(latestCsvRows.length, 163);
  compareMetrics(latestCsvApi.seriesFromEditorRecords(latestCsvRows.slice(1).map(row =>
    Object.fromEntries(latestCsvRows[0].map((header, i) => [header, row[i]]))
  )), latestSimulation);
  console.log('Fixed comparison passed: 18 workload groups/four versions, latest162 metrics/JSON/CSV, source digests and edit/empty/deletion-safe migration.');
} finally {
  await server.close();
}
