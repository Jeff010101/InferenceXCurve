interface SequenceLengths {
  isl: number;
  osl: number;
  e?: number;
}

export function parseIslOslLengths(value: string): SequenceLengths | null {
  // Match the entire scenario: stripping an unrecognized suffix can merge
  // workloads whose execution geometry is different.
  const labelled = value.trim().match(
    /^ISL\s*([\d,]+)\s*\/\s*OSL\s*([\d,]+)(?:\s*\/\s*E\s*([\d,]+))?$/iu
  );
  const simple = value.trim().match(
    /^([\d,]+)\s*\/\s*([\d,]+)(?:\s*\/\s*E\s*([\d,]+))?$/iu
  );
  const match = labelled ?? simple;
  if (!match) return null;

  const isl = Number(match[1]!.replaceAll(',', ''));
  const osl = Number(match[2]!.replaceAll(',', ''));
  const e = match[3] === undefined ? undefined : Number(match[3].replaceAll(',', ''));
  if (!Number.isFinite(isl) || !Number.isFinite(osl) || (e !== undefined && !Number.isFinite(e))) {
    return null;
  }
  return e === undefined ? { isl, osl } : { isl, osl, e };
}

export function sortIslOslValues(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => {
    const aLengths = parseIslOslLengths(a);
    const bLengths = parseIslOslLengths(b);
    if (aLengths && bLengths) {
      return bLengths.isl - aLengths.isl ||
        bLengths.osl - aLengths.osl ||
        (bLengths.e ?? -1) - (aLengths.e ?? -1) ||
        a.localeCompare(b);
    }
    if (aLengths) return -1;
    if (bLengths) return 1;
    return a.localeCompare(b);
  });
}

export function formatIslOslLabel(value: string): string {
  const lengths = parseIslOslLengths(value);
  if (!lengths) return value;
  const sequence = `${formatTokenLength(lengths.isl)} / ${formatTokenLength(lengths.osl)}`;
  return lengths.e === undefined ? sequence : `${sequence} / E ${formatTokenLength(lengths.e)}`;
}

function formatTokenLength(value: number): string {
  if (value < 1024) return String(value);
  const inK = value / 1024;
  const compact = Number.isInteger(inK) ? String(inK) : inK.toFixed(1).replace(/\.0$/u, '');
  return `${compact}K`;
}

export const COLD_EXTEND = 'cold';

// E workloads group under the context they extend: the cached prefix ISL - E, or the
// whole ISL when E covers it (cold). Values without a parsed E remain their own group.
export function getSequenceContextKey(value: string): string {
  const lengths = parseIslOslLengths(value);
  if (lengths?.e === undefined) return value;
  const context = lengths.e >= lengths.isl ? lengths.isl : lengths.isl - lengths.e;
  return `ISL ${context} / OSL ${lengths.osl}`;
}

// An explicitly declared comparison context changes only chart grouping.
// The measured/simulated ISL and the merge identity remain untouched.
export function getComparisonContextKey(value: string, comparisonContext?: string): string {
  const actual = parseIslOslLengths(value);
  const comparison = comparisonContext ? parseIslOslLengths(comparisonContext) : null;
  if (actual?.e !== undefined && comparison && comparison.e === undefined &&
      comparison.isl > 0 && comparison.osl === actual.osl) {
    return `ISL ${comparison.isl} / OSL ${comparison.osl}`;
  }
  return getSequenceContextKey(value);
}

export function getSequenceExtendKey(value: string): string {
  const lengths = parseIslOslLengths(value);
  if (lengths?.e === undefined) return '';
  return lengths.e >= lengths.isl ? COLD_EXTEND : String(lengths.e);
}

export function sortExtendKeys(values: string[]): string[] {
  const rank = (value: string) => (value === '' ? -2 : value === COLD_EXTEND ? -1 : Number(value));
  return Array.from(new Set(values)).sort((a, b) => rank(a) - rank(b));
}

export function formatExtendLabel(key: string, contextKey: string): string {
  if (key === '') return 'Not specified';
  const context = parseIslOslLengths(contextKey);
  if (key === COLD_EXTEND) return context ? `Cold (${formatTokenLength(context.isl)} uncached)` : 'Cold';
  const e = Number(key);
  return context
    ? `E ${formatTokenLength(e)} (ISL ${formatTokenLength(context.isl + e)})`
    : `E ${formatTokenLength(e)}`;
}

export function normalizeMergeIslOsl(value: string): string {
  const lengths = parseIslOslLengths(value);
  if (!lengths) return value.trim().toLowerCase().replace(/\s+/gu, ' ');
  const sequence = `${lengths.isl}/${lengths.osl}`;
  return lengths.e === undefined ? sequence : `${sequence}/e${lengths.e}`;
}
