import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const scenario = await server.ssrLoadModule('/src/sequenceScenario.ts');
  const {
    parseIslOslLengths, formatIslOslLabel, normalizeMergeIslOsl, sortIslOslValues,
    getSequenceContextKey, getSequenceExtendKey, sortExtendKeys, formatExtendLabel, COLD_EXTEND
  } = scenario;
  const legacy = 'ISL 131072 / OSL 1024';
  assert.deepEqual(parseIslOslLengths(legacy), { isl: 131072, osl: 1024 });
  assert.equal(formatIslOslLabel(legacy), '128K / 1K');
  assert.equal(normalizeMergeIslOsl(legacy), normalizeMergeIslOsl('131,072 / 1,024'));

  const extended = `${legacy} / E 2048`;
  assert.deepEqual(parseIslOslLengths(extended), { isl: 131072, osl: 1024, e: 2048 });
  assert.equal(formatIslOslLabel(extended), '128K / 1K / E 2K');
  assert.equal(normalizeMergeIslOsl(extended), normalizeMergeIslOsl(' isl 131,072 / osl 1,024 / e 2,048 '));
  assert.notEqual(normalizeMergeIslOsl(legacy), normalizeMergeIslOsl(extended));

  const workloads = [
    [131072, [131072, 2048, 1024, 512]],
    [262144, [262144, 4096, 2048, 1024, 512]]
  ].flatMap(([isl, eValues]) => [1024, 2048].flatMap((osl) =>
    eValues.map((e) => `ISL ${isl} / OSL ${osl} / E ${e}`)
  ));
  assert.equal(workloads.length, 18);
  assert.equal(new Set(workloads.map(normalizeMergeIslOsl)).size, 18,
    'All fixed workloads retain distinct merge keys, including each E geometry');
  assert.equal(new Set(workloads.map(formatIslOslLabel)).size, 18,
    'The scenario selector displays a distinct label for every fixed workload');
  assert.deepEqual(sortIslOslValues([`${legacy} / E 512`, extended, legacy, extended]),
    [extended, `${legacy} / E 512`, legacy], 'E sorts numerically without discarding distinct scenarios');

  const customScenarios = [
    `${legacy} / E 2048 / branch warm`,
    `${legacy} / E 512 / branch warm`,
    `${legacy} / E unknown`,
    `${legacy} / E 2048 / E 512`,
    '131072/1024/e-2048',
    `${legacy} / cache 2048`,
    'ISL 131072 / OSL 1024.5',
    'Agentic Traces'
  ];
  for (const value of customScenarios) {
    assert.equal(parseIslOslLengths(value), null);
    assert.equal(formatIslOslLabel(value), value, 'Unknown qualifiers remain visible');
    assert.notEqual(normalizeMergeIslOsl(value), normalizeMergeIslOsl(legacy));
    assert.notEqual(normalizeMergeIslOsl(value), normalizeMergeIslOsl(extended));
  }
  assert.equal(new Set(customScenarios.map(normalizeMergeIslOsl)).size, customScenarios.length,
    'Unknown suffixes must not collapse into a known geometry or each other');

  // Cached C + E workloads and their cold run share one context; E selects among them.
  const realRun = [
    'ISL 131072 / OSL 1024 / E 131072',
    'ISL 131584 / OSL 1024 / E 512',
    'ISL 132096 / OSL 1024 / E 1024',
    'ISL 133120 / OSL 1024 / E 2048'
  ];
  assert.deepEqual(new Set(realRun.map(getSequenceContextKey)), new Set([legacy]));
  assert.deepEqual(realRun.map(getSequenceExtendKey), [COLD_EXTEND, '512', '1024', '2048']);
  assert.deepEqual(sortExtendKeys(['2048', COLD_EXTEND, '512', '', '512']), ['', COLD_EXTEND, '512', '2048']);
  assert.equal(formatExtendLabel(COLD_EXTEND), 'Cold');
  assert.equal(formatExtendLabel('1024'), 'E 1K');
  assert.equal(getSequenceContextKey(extended), 'ISL 129024 / OSL 1024',
    'A total-ISL workload groups under its own cached prefix, not a nominal length');
  assert.equal(getSequenceExtendKey(legacy), '');
  for (const value of [...customScenarios, legacy]) {
    assert.equal(getSequenceContextKey(value), value, 'Values without a parsed E keep their own group');
  }
  console.log('Sequence scenario checks passed: legacy, 18 E geometries, labels, sorting, and unknown suffix isolation.');
} finally {
  await server.close();
}
