import {
  DEFAULT_CHART_WATERMARK,
  normalizeInferenceCurveLineLabelPositions,
  prepareInferenceCurveSeries,
  renderInferenceCurveChart,
  resetInferenceCurveZoom,
  type InferenceCurveSeries,
  type InferenceCurveLineLabelPositions,
  type ParetoGoal
} from './inferenceCurveChart';
import { getTheme, THEME_CHANGE_EVENT } from './theme';
import agentxReference from './data/inferencexAgentx39596624542.json';

const PLOT_TOOL_STORAGE_KEY = 'inferencex-curve:plot-tool-data:v1';
const AGENTX_REFERENCE_LINE_ID = 'inferencex-agentx-mi355x-fp4-run39596624542';
const SAVE_DEBOUNCE_MS = 300;
const MAX_WATERMARK_LENGTH = 64;
const CSV_HEADERS = [
  'Line ID',
  'Line Name',
  'X',
  'Y',
  'Color',
  'Line Type',
  'Line Marker',
  'Layer'
] as const;
const DEFAULT_COLORS = [
  '#4e79a7',
  '#f28e2c',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc949',
  '#af7aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ab'
];
const COLOR_PRESETS = [
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' }
];

interface PlotPointDraft {
  x: string;
  y: string;
}

interface PlotLineDraft {
  id: string;
  name: string;
  color: string;
  lineStyle: string;
  marker: string;
  renderOrder: number;
  collapsed: boolean;
  points: PlotPointDraft[];
}

interface PlotToolState {
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  watermark: string;
  xGoal: ParetoGoal;
  yGoal: ParetoGoal;
  activeLineIds: Set<string>;
  search: string;
  showNonOptimalPoints: boolean;
  logX: boolean;
  logY: boolean;
  showLineLabels: boolean;
  lineLabelPositions: InferenceCurveLineLabelPositions;
  showGoalDirection: boolean;
}

interface PersistedPlotToolData {
  version: 4;
  savedAt: string;
  lines: PlotLineDraft[];
  state: Omit<PlotToolState, 'activeLineIds'> & { activeLineIds: string[] };
}

interface PendingPlotImport {
  line: PlotLineDraft;
  selected: boolean;
  conflict: boolean;
  replace: boolean;
}

interface ParsedCsvRow {
  cells: string[];
  lineNumber: number;
}

interface LineMetadata {
  name: string;
  color: string;
  lineStyle: string;
  marker: string;
  layer: string;
}

function createDefaultState(): PlotToolState {
  return {
    title: 'Pareto Plot',
    subtitle: '',
    xLabel: 'X',
    yLabel: 'Y',
    watermark: DEFAULT_CHART_WATERMARK,
    xGoal: 'maximize',
    yGoal: 'maximize',
    activeLineIds: new Set(),
    search: '',
    showNonOptimalPoints: false,
    logX: false,
    logY: false,
    showLineLabels: false,
    lineLabelPositions: {},
    showGoalDirection: true
  };
}

function createDefaultLines(): PlotLineDraft[] {
  return [];
}

function createReferenceLines(): PlotLineDraft[] {
  return [{
    id: AGENTX_REFERENCE_LINE_ID,
    name: agentxReference.name,
    color: agentxReference.color,
    lineStyle: 'solid',
    marker: 'circle',
    renderOrder: 1,
    collapsed: false,
    points: agentxReference.points.map((point) => ({ x: String(point.x), y: String(point.y) }))
  }];
}

function createReferenceState(): PlotToolState {
  return {
    ...createDefaultState(),
    title: agentxReference.title,
    subtitle: agentxReference.subtitle,
    xLabel: agentxReference.xLabel,
    yLabel: agentxReference.yLabel,
    watermark: '',
    showNonOptimalPoints: true,
    activeLineIds: new Set([AGENTX_REFERENCE_LINE_ID])
  };
}

export function mountPlotTool(root: HTMLElement): () => void {
  // Only this explicitly published snapshot is accepted; URLs never trigger remote imports.
  const reference = new URLSearchParams(window.location.search).get('reference') === agentxReference.id
    ? agentxReference
    : null;
  const restored = reference ? null : loadPlotToolData();
  let lines = reference ? createReferenceLines() : restored?.lines ?? createDefaultLines();
  let state = reference ? createReferenceState() : restored?.state ?? createDefaultState();
  const workspaceUrl = new URL(window.location.href);
  workspaceUrl.searchParams.delete('reference');
  workspaceUrl.hash = '/plot-tool';
  const referenceCsvUrl = new URL('./data/inferencex-agentx-run39596624542.plot.csv', document.baseURI);
  let pendingImport: PendingPlotImport[] = [];
  let saveTimer: number | null = null;
  let resetWithoutPersistence = false;
  let destroyed = false;
  let draggedLineIndex: number | null = null;
  const controller = new AbortController();
  const { signal } = controller;

  root.innerHTML = `
    <main class="container page plot-tool-page">
      <header class="page-intro no-export">
        <div>
          <p class="page-eyebrow">Plot workspace</p>
          <h1>Find your frontier<span class="heading-period">.</span></h1>
          <p class="page-description">Turn your data into clear comparisons. Shape, style, and export your curves.</p>
        </div>
        <a class="workspace-shortcut" href="#/inferencex">Explore benchmarks <span aria-hidden="true">↗</span></a>
      </header>
      ${reference ? `
        <section class="filter-card published-reference no-export" aria-label="Published reference">
          <p><strong>Published reference: ${escapeHtml(reference.name)}</strong> · ${escapeHtml(reference.sourceDate)} · ${reference.points.length} configurations</p>
          <p>Edits in this view are temporary. Export CSV to keep changes; reopening or resetting restores the published reference. Your saved workspace is unchanged.</p>
          <p><a href="${escapeAttribute(reference.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source run</a> · <a href="${escapeAttribute(referenceCsvUrl.href)}" download>Original reference CSV</a> · <a href="${escapeAttribute(workspaceUrl.href)}">Open my saved workspace</a></p>
        </section>
      ` : ''}
      <section class="filter-card plot-settings-card no-export" aria-label="Plot settings">
        ${renderTextSetting('title', 'Title', state.title)}
        ${renderTextSetting('subtitle', 'Subtitle', state.subtitle)}
        ${renderTextSetting('xLabel', 'X Axis Title', state.xLabel)}
        ${renderTextSetting('yLabel', 'Y Axis Title', state.yLabel)}
        ${renderGoalSetting('xGoal', 'X Goal', state.xGoal)}
        ${renderGoalSetting('yGoal', 'Y Goal', state.yGoal)}
      </section>

      <section class="chart-card">
        <div class="chart-card-toolbar no-export">
          <div id="plot-watermark-menu" class="watermark-menu">
            <button id="plot-watermark-menu-toggle" class="tool-button" type="button" title="Chart options" aria-label="Chart options" aria-expanded="false" aria-controls="plot-watermark-menu-panel">
              ${icon('sliders')}
            </button>
            <div id="plot-watermark-menu-panel" class="watermark-menu-panel" hidden>
              <label class="watermark-control">
                <span>Watermark</span>
                <input id="plot-watermark" type="text" value="${escapeAttribute(state.watermark)}" maxlength="${MAX_WATERMARK_LENGTH}" placeholder="${escapeAttribute(DEFAULT_CHART_WATERMARK)}" aria-label="Chart watermark text" />
              </label>
              <div class="watermark-panel-actions">
                <button id="plot-reset-watermark" class="action-button watermark-reset-button" type="button">${icon('reset')}<span>Reset</span></button>
              </div>
            </div>
          </div>
          <button id="plot-download-png" class="tool-button" type="button" title="Download PNG" aria-label="Download PNG">
            ${icon('download')}
          </button>
          <button id="plot-download-csv" class="tool-button" type="button" title="Download CSV" aria-label="Download CSV">
            ${icon('table')}
          </button>
          <button id="plot-reset-zoom" class="tool-button" type="button" title="Reset zoom" aria-label="Reset zoom">
            ${icon('reset')}
          </button>
        </div>
        <figcaption class="chart-caption">
          <h2 id="plot-chart-title"></h2>
          <p id="plot-chart-subtitle"></p>
        </figcaption>
        <div class="chart-layout">
          <div class="chart-main">
            <div id="plot-chart"></div>
            <p class="chart-instructions no-export">Shift+Scroll to zoom • Drag to pan • Double-click to reset • Hover a point for details</p>
          </div>
          <aside id="plot-legend" class="legend-shell no-export"></aside>
        </div>
      </section>

      <section class="data-card">
        <div class="data-card-header">
          <div>
            <h2>Plot Lines</h2>
            <p>${reference ? 'Edit line styles and X/Y points temporarily. Export CSV to keep your changes.' : 'Edit line styles and X/Y points. Plot Tool data is saved separately from InferenceX Curve.'}</p>
          </div>
          <div class="data-header-controls">
            <div class="data-header-actions">
              <button id="plot-render" type="button" class="primary action-button" title="Render chart (Ctrl/Cmd+Enter)">
                ${icon('play')}<span>Render Chart</span>
              </button>
              <div class="data-action-group" aria-label="Line actions">
                <button id="plot-add-line" class="action-button" type="button">${icon('plus')}<span>Add Line</span></button>
                <button id="plot-import-file" class="action-button" type="button">${icon('upload')}<span>Import CSV</span></button>
              </div>
              <input id="plot-import-input" type="file" accept=".csv,text/csv" hidden />
              <div class="data-action-group data-action-group-muted" aria-label="Data actions">
                <button id="plot-reset" class="action-button" type="button">${icon('reset')}<span>Reset All</span></button>
                <button id="plot-clear" class="action-button danger" type="button">${icon('trash')}<span>Clear Data</span></button>
              </div>
            </div>
            <p id="plot-status" class="status data-header-status" role="status"></p>
          </div>
        </div>
        <div id="plot-import-preview" class="import-preview plot-import-preview"></div>
        <div id="plot-series-editor" class="series-editor plot-series-editor"></div>
      </section>
    </main>
    <aside class="quick-toolbar no-export" aria-label="Quick actions">
      <button id="plot-quick-render" class="quick-tool-button" type="button" title="Render chart" aria-label="Render chart">${icon('redraw')}</button>
      <button id="plot-quick-top" class="quick-tool-button" type="button" title="Back to top" aria-label="Back to top">${icon('up')}</button>
    </aside>
  `;

  const settingsEl = root.querySelector<HTMLElement>('.plot-settings-card')!;
  const chartEl = root.querySelector<HTMLElement>('#plot-chart')!;
  const chartTitleEl = root.querySelector<HTMLElement>('#plot-chart-title')!;
  const chartSubtitleEl = root.querySelector<HTMLElement>('#plot-chart-subtitle')!;
  const legendEl = root.querySelector<HTMLElement>('#plot-legend')!;
  const editorEl = root.querySelector<HTMLElement>('#plot-series-editor')!;
  const statusEl = root.querySelector<HTMLElement>('#plot-status')!;
  const importInputEl = root.querySelector<HTMLInputElement>('#plot-import-input')!;
  const importPreviewEl = root.querySelector<HTMLElement>('#plot-import-preview')!;
  const watermarkMenuEl = root.querySelector<HTMLElement>('#plot-watermark-menu')!;
  const watermarkToggleEl = root.querySelector<HTMLButtonElement>('#plot-watermark-menu-toggle')!;
  const watermarkPanelEl = root.querySelector<HTMLElement>('#plot-watermark-menu-panel')!;
  const watermarkInputEl = root.querySelector<HTMLInputElement>('#plot-watermark')!;

  function scheduleSave(): void {
    if (reference) return;
    resetWithoutPersistence = false;
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  function saveNow(): void {
    if (reference || resetWithoutPersistence) return;
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      const payload: PersistedPlotToolData = {
        version: 4,
        savedAt: new Date().toISOString(),
        lines,
        state: { ...state, activeLineIds: Array.from(state.activeLineIds) }
      };
      window.localStorage.setItem(PLOT_TOOL_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Could not save Plot Tool browser data.', error);
    }
  }

  function setStatus(message: string, error = false): void {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', error);
    statusEl.classList.remove('dirty');
  }

  function markDirty(): void {
    statusEl.textContent = reference
      ? 'Temporary changes. Render Chart to refresh; export CSV to keep them.'
      : 'Draft changes saved. Render Chart to validate and refresh the plot.';
    statusEl.classList.remove('error');
    statusEl.classList.add('dirty');
    scheduleSave();
  }

  function getChartSeries(strict: boolean): InferenceCurveSeries[] {
    const seenIds = new Set<string>();
    return lines.map((line, lineIndex) => {
      const id = line.id.trim();
      const name = line.name.trim();
      if (!id) throw new Error(`Line ${lineIndex + 1}: Line ID is required.`);
      if (seenIds.has(id)) throw new Error(`Line ${lineIndex + 1}: duplicate Line ID "${id}".`);
      seenIds.add(id);
      if (!name) throw new Error(`Line ${lineIndex + 1}: Name is required.`);
      const points = line.points.flatMap((point, pointIndex) => {
        const xText = point.x.trim();
        const yText = point.y.trim();
        if (!xText && !yText) return [];
        const x = Number(xText);
        const y = Number(yText);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          if (strict) throw new Error(`${name}, row ${pointIndex + 1}: X and Y must both be finite numbers.`);
          return [];
        }
        return [{ interactivity: x, throughput: y, precision: 'default' }];
      });
      return {
        id,
        name,
        color: line.color,
        lineStyle: line.lineStyle,
        marker: line.marker,
        renderOrder: line.renderOrder,
        points
      };
    });
  }

  function getVisiblePoints(series: InferenceCurveSeries[]): { x: number; y: number }[] {
    return series
      .filter((line) => state.activeLineIds.has(line.id))
      .flatMap((line) =>
        line.points.map((point) => ({ x: Number(point.interactivity), y: Number(point.throughput) }))
      );
  }

  function validateLogScale(axis: 'x' | 'y', series: InferenceCurveSeries[]): string | null {
    const points = getVisiblePoints(series);
    if (points.length === 0) return `Cannot enable ${axis.toUpperCase()} Log Scale: there are no visible points.`;
    const invalid = points.find((point) => point[axis] <= 0);
    return invalid
      ? `Cannot enable ${axis.toUpperCase()} Log Scale: every visible ${axis.toUpperCase()} value must be greater than 0 (found ${invalid[axis]}).`
      : null;
  }

  function renderChart(strict = false, persist = true): boolean {
    let series: InferenceCurveSeries[];
    try {
      series = getChartSeries(strict);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Invalid plot data.', true);
      return false;
    }

    let logError: string | null = null;
    if (state.logX) {
      logError = validateLogScale('x', series);
      if (logError) state.logX = false;
    }
    if (state.logY) {
      const error = validateLogScale('y', series);
      if (error) {
        state.logY = false;
        logError ??= error;
      }
    }

    chartTitleEl.textContent = state.title;
    chartSubtitleEl.textContent = state.subtitle;
    renderInferenceCurveChart(chartEl, series, {
      activeSeriesIds: state.activeLineIds,
      xMetric: 'interactivity',
      xGoal: state.xGoal,
      yGoal: state.yGoal,
      showNonOptimalPoints: state.showNonOptimalPoints,
      hidePointLabels: true,
      showLineLabels: state.showLineLabels,
      lineLabelPositions: state.lineLabelPositions,
      onLineLabelPositionsChange: (positions) => {
        state.lineLabelPositions = positions;
        scheduleSave();
      },
      showOffloadRings: false,
      showGoalIndicators: state.showGoalDirection,
      logX: state.logX,
      logY: state.logY,
      genericTooltip: true,
      theme: getTheme(),
      title: state.title,
      subtitle: state.subtitle,
      watermark: state.watermark,
      xLabel: state.xLabel,
      yLabel: state.yLabel
    });
    renderLegend(series);
    if (logError) setStatus(logError, true);
    if (persist) scheduleSave();
    return !logError;
  }

  function renderEditor(): void {
    if (lines.length === 0) {
      editorEl.innerHTML = '<div class="series-empty plot-empty-lines"><strong>No plot lines yet.</strong><span>Add a line or import a Plot Tool CSV to begin.</span></div>';
      return;
    }
    const sorted = lines.map((line, index) => ({ line, index })).sort(compareLineOrder);
    editorEl.innerHTML = sorted
      .map(({ line, index }) => renderLineCard(line, index))
      .join('');
  }

  function renderLineCard(line: PlotLineDraft, index: number): string {
    const pointCount = line.points.filter((point) => point.x.trim() || point.y.trim()).length;
    const color = line.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]!;
    return `
      <section class="series-card plot-series-card${line.collapsed ? ' collapsed' : ''}" data-line-card data-line-index="${index}">
        <div class="series-card-head">
          <div class="series-card-title">
            <button class="series-drag-handle" type="button" draggable="true" data-line-action="drag" title="Drag to reorder layer" aria-label="Drag to reorder layer">${icon('grip')}</button>
            <span class="series-swatch" style="background:${escapeAttribute(color)}"></span>
            <div><h3>${escapeHtml(line.name || `Line ${index + 1}`)}</h3><p>ID: ${escapeHtml(line.id)} • Layer ${formatLayer(line.renderOrder)}</p></div>
          </div>
          <div class="series-card-actions">
            <button class="series-action-button" type="button" data-line-action="move-up">${icon('up')}<span>Up</span></button>
            <button class="series-action-button" type="button" data-line-action="move-down">${icon('down')}<span>Down</span></button>
            <button class="series-action-button" type="button" data-line-action="copy">${icon('copy')}<span>Copy</span></button>
            <button class="series-action-button" type="button" data-line-action="add-row">${icon('plus')}<span>Add Row</span></button>
            <button class="series-action-button danger" type="button" data-line-action="remove">${icon('trash')}<span>Remove</span></button>
          </div>
        </div>
        <div class="series-fields plot-series-fields">
          <label class="series-field plot-line-name"><span>Name *</span><input type="text" required data-line-field="name" value="${escapeAttribute(line.name)}" /></label>
          <label class="series-field plot-line-marker"><span>Marker</span><select data-line-field="marker">${renderMarkerOptions(line.marker)}</select></label>
          <label class="series-field plot-line-style"><span>Line Type</span><select data-line-field="lineStyle">${renderLineStyleOptions(line.lineStyle)}</select></label>
          ${renderPlotColorField(line, index)}
        </div>
        <button type="button" class="point-data-toggle" data-line-action="toggle" aria-expanded="${line.collapsed ? 'false' : 'true'}">
          <span class="point-data-toggle-main">${icon(line.collapsed ? 'right' : 'down')}<span>${line.collapsed ? 'Show' : 'Hide'} ${pointCount} Point Rows</span></span>
          <span class="point-data-toggle-meta">${line.collapsed ? 'Data hidden' : 'Data visible'}</span>
        </button>
        ${line.collapsed ? '' : renderPointTable(line, index)}
      </section>
    `;
  }

  function renderPointTable(line: PlotLineDraft, lineIndex: number): string {
    const rows = line.points.length ? line.points : [{ x: '', y: '' }];
    return `
      <div class="table-wrap point-table-wrap plot-point-table-wrap">
        <table class="data-table point-table plot-point-table" aria-label="${escapeAttribute(line.name)} point data">
          <thead><tr><th class="row-num">#</th><th class="point-actions-head">Actions</th><th>X *</th><th>Y *</th></tr></thead>
          <tbody>${rows.map((point, pointIndex) => `
            <tr data-point-row="${pointIndex}">
              <td class="row-num">${pointIndex + 1}</td>
              <td class="point-actions-cell point-row-actions">
                <button class="point-action-button" type="button" data-point-action="up" title="Move row up" aria-label="Move row up">${icon('up')}</button>
                <button class="point-action-button" type="button" data-point-action="down" title="Move row down" aria-label="Move row down">${icon('down')}</button>
                <button class="point-action-button danger" type="button" data-point-action="remove" title="Remove row" aria-label="Remove row">${icon('trash')}</button>
              </td>
              <td><input type="text" inputmode="decimal" data-point-field="x" value="${escapeAttribute(point.x)}" data-line-index="${lineIndex}" /></td>
              <td><input type="text" inputmode="decimal" data-point-field="y" value="${escapeAttribute(point.y)}" data-line-index="${lineIndex}" /></td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    `;
  }

  function renderLegend(series = getChartSeries(false)): void {
    const previousScroll = legendEl.querySelector<HTMLElement>('.legend-list')?.scrollTop ?? 0;
    const prepared = prepareInferenceCurveSeries(
      series,
      false,
      getTheme(),
      series,
      'interactivity',
      false,
      state.xGoal,
      state.yGoal
    );
    const query = state.search.trim().toLowerCase();
    const visible = prepared.filter((line) => !query || line.name.toLowerCase().includes(query));
    const activeCount = prepared.filter((line) => state.activeLineIds.has(line.id)).length;
    legendEl.innerHTML = `
      <div class="legend-container">
        <div class="legend-search"><input id="plot-legend-search" type="text" value="${escapeAttribute(state.search)}" placeholder="Search..." />${state.search ? '<button type="button" data-legend-action="clear" aria-label="Clear search">×</button>' : ''}</div>
        <ul class="legend-list">${visible.map((line) => {
          const active = state.activeLineIds.has(line.id);
          return `<li class="${active ? '' : 'inactive'}"><label title="${escapeAttribute(line.name)}"><input type="checkbox" data-visible-line="${escapeAttribute(line.id)}" ${active ? 'checked' : ''} /><svg class="legend-line" viewBox="0 0 34 12" aria-hidden="true"><line x1="2" y1="6" x2="32" y2="6" stroke="${escapeAttribute(line.color)}" stroke-width="3" stroke-linecap="round" ${line.lineDasharray ? `stroke-dasharray="${escapeAttribute(line.lineDasharray)}"` : ''}></line></svg><span class="legend-text">${escapeHtml(line.name)}</span></label><span class="legend-row-actions"><button class="legend-only" type="button" data-only-line="${escapeAttribute(line.id)}">Only</button></span></li>`;
        }).join('')}</ul>
        <div class="legend-bottom">
          ${activeCount < prepared.length ? '<div class="legend-line-toolbar"><span></span><button class="legend-line-action" type="button" data-legend-action="show-all">Show all lines</button></div>' : ''}
          ${renderSwitch('optimal', 'Optimal Only', !state.showNonOptimalPoints)}
          ${renderSwitch('logX', 'X Log Scale', state.logX)}
          ${renderSwitch('logY', 'Y Log Scale', state.logY)}
          ${renderSwitch('labels', 'Line Labels', state.showLineLabels)}
          ${renderSwitch('direction', 'Better Direction', state.showGoalDirection)}
        </div>
      </div>
    `;
    const list = legendEl.querySelector<HTMLElement>('.legend-list');
    if (list) list.scrollTop = previousScroll;
  }

  function renderImportPreview(): void {
    if (pendingImport.length === 0) {
      importPreviewEl.replaceChildren();
      return;
    }
    const pointCount = pendingImport.reduce((sum, entry) => sum + entry.line.points.length, 0);
    importPreviewEl.innerHTML = `
      <div class="import-preview-head"><div><strong>CSV Import Preview</strong><span>${pendingImport.length} lines • ${pointCount} points</span></div><div class="import-preview-actions"><button type="button" class="action-button primary" data-import-action="add">Add Selected</button><button type="button" class="action-button" data-import-action="cancel">Cancel</button></div></div>
      <div class="plot-import-list">${pendingImport.map((entry, index) => `
        <div class="plot-import-item${entry.conflict ? ' conflict' : ''}">
          <label class="plot-import-select"><input type="checkbox" data-import-select="${index}" ${entry.selected ? 'checked' : ''} /><span><strong>${escapeHtml(entry.line.name)}</strong><small>${escapeHtml(entry.line.id)} • ${entry.line.points.length} points${entry.conflict ? ' • Line ID already exists' : ''}</small></span></label>
          ${entry.conflict ? `<label class="plot-import-replace"><input type="checkbox" data-import-replace="${index}" ${entry.replace ? 'checked' : ''} /><span>Replace existing line</span></label>` : ''}
        </div>`).join('')}</div>
    `;
  }

  function addLine(): void {
    const ordinal = nextLineOrdinal(lines);
    const line: PlotLineDraft = {
      id: makeUniqueLineId(`line-${ordinal}`, lines),
      name: `Line ${ordinal}`,
      color: DEFAULT_COLORS[(ordinal - 1) % DEFAULT_COLORS.length]!,
      lineStyle: 'solid',
      marker: 'circle',
      renderOrder: nextLayer(lines),
      collapsed: false,
      points: [{ x: '', y: '' }]
    };
    lines.push(line);
    state.activeLineIds.add(line.id);
    renderEditor();
    renderChart();
    setStatus('Added a blank plot line.');
    scheduleSave();
  }

  function moveLine(index: number, direction: -1 | 1): void {
    const ordered = lines.map((line, originalIndex) => ({ line, index: originalIndex })).sort(compareLineOrder);
    const position = ordered.findIndex((entry) => entry.index === index);
    const nextPosition = position + direction;
    if (position < 0 || nextPosition < 0 || nextPosition >= ordered.length) return;
    [ordered[position], ordered[nextPosition]] = [ordered[nextPosition]!, ordered[position]!];
    ordered.forEach((entry, order) => {
      entry.line.renderOrder = order + 1;
    });
    lines = ordered.map((entry) => entry.line);
    renderEditor();
    renderChart();
    scheduleSave();
  }

  function handleEditorInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const card = target.closest<HTMLElement>('[data-line-card]');
    const lineIndex = Number(card?.dataset.lineIndex);
    const line = lines[lineIndex];
    if (!line) return;
    const lineField = target.dataset.lineField as 'name' | 'marker' | 'lineStyle' | 'color' | undefined;
    if (lineField) {
      line[lineField] = target.value;
      if (lineField === 'color' && target instanceof HTMLInputElement && target.type === 'color') {
        const swatch = card?.querySelector<HTMLElement>('.series-swatch');
        if (swatch) swatch.style.background = target.value;
        card?.querySelectorAll<HTMLElement>('[data-color-preset]').forEach((preset) => {
          preset.classList.toggle(
            'selected',
            preset.getAttribute('data-color-preset')?.toLowerCase() === target.value.toLowerCase()
          );
        });
      }
      markDirty();
      return;
    }
    const pointField = target.dataset.pointField as keyof PlotPointDraft | undefined;
    const row = target.closest<HTMLElement>('[data-point-row]');
    const pointIndex = Number(row?.dataset.pointRow);
    if (!pointField || !line.points[pointIndex]) return;
    line.points[pointIndex]![pointField] = target.value.trim();
    markDirty();
  }

  function handleEditorClick(event: MouseEvent): void {
    const target = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
    if (!target) return;
    const card = target.closest<HTMLElement>('[data-line-card]');
    const lineIndex = Number(card?.dataset.lineIndex);
    const line = lines[lineIndex];
    if (!line) return;
    const presetColor = target.dataset.colorPreset;
    if (presetColor) {
      line.color = presetColor;
      renderEditor();
      markDirty();
      return;
    }
    const action = target.dataset.lineAction;
    if (action === 'toggle') {
      line.collapsed = !line.collapsed;
      renderEditor();
    } else if (action === 'copy') {
      const copy = structuredClone(line);
      copy.id = makeUniqueLineId(`${line.id}-copy`, lines);
      copy.name = `${line.name} Copy`;
      copy.renderOrder = nextLayer(lines);
      lines.push(copy);
      state.activeLineIds.add(copy.id);
      renderEditor();
      renderChart();
    } else if (action === 'add-row') {
      line.points.push({ x: '', y: '' });
      line.collapsed = false;
      renderEditor();
    } else if (action === 'remove') {
      lines.splice(lineIndex, 1);
      state.activeLineIds.delete(line.id);
      renderEditor();
      renderChart();
    } else if (action === 'move-up') {
      moveLine(lineIndex, -1);
      return;
    } else if (action === 'move-down') {
      moveLine(lineIndex, 1);
      return;
    }

    const pointAction = target.dataset.pointAction;
    if (pointAction) {
      const row = target.closest<HTMLElement>('[data-point-row]');
      const pointIndex = Number(row?.dataset.pointRow);
      if (!line.points[pointIndex]) return;
      if (pointAction === 'remove') {
        line.points.splice(pointIndex, 1);
        if (line.points.length === 0) line.points.push({ x: '', y: '' });
      } else {
        const nextIndex = pointIndex + (pointAction === 'up' ? -1 : 1);
        if (nextIndex < 0 || nextIndex >= line.points.length) return;
        [line.points[pointIndex], line.points[nextIndex]] = [line.points[nextIndex]!, line.points[pointIndex]!];
      }
      renderEditor();
    }
    scheduleSave();
  }

  function handleLegendChange(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const lineId = input.dataset.visibleLine;
    if (lineId) {
      input.checked ? state.activeLineIds.add(lineId) : state.activeLineIds.delete(lineId);
      renderChart();
      return;
    }
    const switchName = input.dataset.plotSwitch;
    if (switchName === 'optimal') {
      state.showNonOptimalPoints = !input.checked;
    } else if (switchName === 'labels') {
      state.showLineLabels = input.checked;
    } else if (switchName === 'direction') {
      state.showGoalDirection = input.checked;
    } else if (switchName === 'logX' || switchName === 'logY') {
      const series = getChartSeries(false);
      if (input.checked) {
        const error = validateLogScale(switchName === 'logX' ? 'x' : 'y', series);
        if (error) {
          input.checked = false;
          setStatus(error, true);
          return;
        }
      }
      state[switchName] = input.checked;
    }
    renderChart();
  }

  function handleLegendClick(event: MouseEvent): void {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
    if (!button) return;
    const onlyId = button.dataset.onlyLine;
    if (onlyId) state.activeLineIds = new Set([onlyId]);
    if (button.dataset.legendAction === 'show-all') state.activeLineIds = new Set(lines.map((line) => line.id));
    if (button.dataset.legendAction === 'clear') state.search = '';
    renderChart();
  }

  async function importCsvFile(file: File | undefined): Promise<void> {
    importInputEl.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setStatus('Plot Tool imports CSV files only.', true);
      return;
    }
    try {
      const imported = parsePlotToolCsv(await file.text());
      pendingImport = imported.map((line) => ({
        line,
        selected: true,
        conflict: lines.some((current) => current.id === line.id),
        replace: false
      }));
      renderImportPreview();
      setStatus(`Parsed ${imported.length} lines for review.`);
    } catch (error) {
      pendingImport = [];
      renderImportPreview();
      setStatus(error instanceof Error ? error.message : 'Could not parse CSV.', true);
    }
  }

  function handleImportChange(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const selectIndex = input.dataset.importSelect;
    const replaceIndex = input.dataset.importReplace;
    if (selectIndex !== undefined && pendingImport[Number(selectIndex)]) {
      pendingImport[Number(selectIndex)]!.selected = input.checked;
    }
    if (replaceIndex !== undefined && pendingImport[Number(replaceIndex)]) {
      pendingImport[Number(replaceIndex)]!.replace = input.checked;
    }
  }

  function handleImportClick(event: MouseEvent): void {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-import-action]');
    if (!button) return;
    if (button.dataset.importAction === 'cancel') {
      pendingImport = [];
      renderImportPreview();
      setStatus('Import cancelled.');
      return;
    }
    const selected = pendingImport.filter((entry) => entry.selected);
    if (selected.length === 0) {
      setStatus('Select at least one line to import.', true);
      return;
    }
    const unresolved = selected.filter((entry) => entry.conflict && !entry.replace);
    if (unresolved.length > 0) {
      setStatus(`Choose Replace for conflicting Line ID: ${unresolved.map((entry) => entry.line.id).join(', ')}.`, true);
      return;
    }
    selected.forEach((entry) => {
      const existingIndex = lines.findIndex((line) => line.id === entry.line.id);
      if (existingIndex >= 0) {
        const wasActive = state.activeLineIds.has(entry.line.id);
        lines[existingIndex] = entry.line;
        if (wasActive) state.activeLineIds.add(entry.line.id);
      } else {
        lines.push(entry.line);
        state.activeLineIds.add(entry.line.id);
      }
    });
    pendingImport = [];
    renderImportPreview();
    renderEditor();
    renderChart();
    setStatus(`Imported ${selected.length} lines.`);
    scheduleSave();
  }

  function clearData(resetAll: boolean): void {
    if (resetAll && reference) {
      lines = createReferenceLines();
      state = createReferenceState();
      pendingImport = [];
      syncSettingsInputs(settingsEl, state);
      watermarkInputEl.value = state.watermark;
      renderImportPreview();
      renderEditor();
      renderChart(false, false);
      setStatus('Published reference restored. Your saved workspace is unchanged.');
      return;
    }
    lines = resetAll ? createDefaultLines() : [];
    pendingImport = [];
    if (resetAll) {
      state = createDefaultState();
      resetWithoutPersistence = true;
      syncSettingsInputs(settingsEl, state);
      watermarkInputEl.value = state.watermark;
    } else {
      state.activeLineIds.clear();
      state.search = '';
    }
    renderImportPreview();
    renderEditor();
    renderChart(false, !resetAll);
    if (resetAll) {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
      }
      try {
        window.localStorage.removeItem(PLOT_TOOL_STORAGE_KEY);
      } catch (error) {
        console.warn('Could not clear Plot Tool browser data.', error);
      }
    } else {
      scheduleSave();
    }
    setStatus(
      resetAll
        ? 'Plot Tool settings reset; the workspace is empty.'
        : reference ? 'Temporary view cleared. Reset All or reload to restore the published reference.' : 'Plot data cleared.'
    );
  }

  settingsEl.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const key = input.dataset.plotSetting as 'title' | 'subtitle' | 'xLabel' | 'yLabel' | undefined;
    if (!key) return;
    state[key] = input.value;
    renderChart();
  }, { signal });
  settingsEl.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const key = select.dataset.plotSetting as 'xGoal' | 'yGoal' | undefined;
    if (!key) return;
    state[key] = select.value === 'minimize' ? 'minimize' : 'maximize';
    renderChart();
  }, { signal });
  watermarkToggleEl.addEventListener('click', () => {
    const open = watermarkPanelEl.hidden;
    watermarkPanelEl.hidden = !open;
    watermarkToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      watermarkInputEl.value = state.watermark;
      window.setTimeout(() => watermarkInputEl.select(), 0);
    }
  }, { signal });
  watermarkInputEl.addEventListener('input', () => {
    state.watermark = watermarkInputEl.value.slice(0, MAX_WATERMARK_LENGTH);
    if (watermarkInputEl.value !== state.watermark) watermarkInputEl.value = state.watermark;
    renderChart();
  }, { signal });
  root.querySelector('#plot-reset-watermark')?.addEventListener('click', () => {
    state.watermark = reference ? '' : DEFAULT_CHART_WATERMARK;
    watermarkInputEl.value = state.watermark;
    renderChart();
    setStatus('Watermark reset to default.');
  }, { signal });
  document.addEventListener('click', (event) => {
    if (watermarkPanelEl.hidden) return;
    const target = event.target;
    if (target instanceof Node && watermarkMenuEl.contains(target)) return;
    watermarkPanelEl.hidden = true;
    watermarkToggleEl.setAttribute('aria-expanded', 'false');
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || watermarkPanelEl.hidden) return;
    watermarkPanelEl.hidden = true;
    watermarkToggleEl.setAttribute('aria-expanded', 'false');
    watermarkToggleEl.focus();
  }, { signal });
  editorEl.addEventListener('input', handleEditorInput, { signal });
  editorEl.addEventListener('change', handleEditorInput, { signal });
  editorEl.addEventListener('click', handleEditorClick, { signal });
  editorEl.addEventListener('dragstart', (event) => {
    const card = (event.target as Element | null)?.closest<HTMLElement>('[data-line-card]');
    if (!card) return;
    draggedLineIndex = Number(card.dataset.lineIndex);
    event.dataTransfer?.setData('text/plain', String(draggedLineIndex));
    event.dataTransfer?.setDragImage(card, 20, 20);
    card.classList.add('dragging');
  }, { signal });
  editorEl.addEventListener('dragover', (event) => {
    if (draggedLineIndex === null) return;
    const card = (event.target as Element | null)?.closest<HTMLElement>('[data-line-card]');
    if (!card) return;
    event.preventDefault();
    card.classList.add('drag-over');
  }, { signal });
  editorEl.addEventListener('dragleave', (event) => {
    (event.target as Element | null)?.closest<HTMLElement>('[data-line-card]')?.classList.remove('drag-over');
  }, { signal });
  editorEl.addEventListener('drop', (event) => {
    const card = (event.target as Element | null)?.closest<HTMLElement>('[data-line-card]');
    if (!card || draggedLineIndex === null) return;
    event.preventDefault();
    const targetIndex = Number(card.dataset.lineIndex);
    if (targetIndex !== draggedLineIndex) {
      const draggedOrder = lines[draggedLineIndex]!.renderOrder;
      lines[draggedLineIndex]!.renderOrder = lines[targetIndex]!.renderOrder;
      lines[targetIndex]!.renderOrder = draggedOrder;
    }
    draggedLineIndex = null;
    renderEditor();
    renderChart();
    scheduleSave();
  }, { signal });
  editorEl.addEventListener('dragend', () => {
    draggedLineIndex = null;
    editorEl.querySelectorAll('.dragging,.drag-over').forEach((element) => element.classList.remove('dragging', 'drag-over'));
  }, { signal });
  legendEl.addEventListener('input', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.id === 'plot-legend-search') {
      state.search = input.value;
      renderLegend();
      scheduleSave();
    }
  }, { signal });
  legendEl.addEventListener('change', handleLegendChange, { signal });
  legendEl.addEventListener('click', handleLegendClick, { signal });
  importPreviewEl.addEventListener('change', handleImportChange, { signal });
  importPreviewEl.addEventListener('click', handleImportClick, { signal });
  root.querySelector('#plot-add-line')?.addEventListener('click', addLine, { signal });
  root.querySelector('#plot-render')?.addEventListener('click', () => {
    if (renderChart(true)) setStatus(`Rendered ${lines.length} lines with ${countPoints(lines)} points.`);
  }, { signal });
  root.querySelector('#plot-quick-render')?.addEventListener('click', () => {
    if (renderChart(true)) setStatus(`Rendered ${lines.length} lines with ${countPoints(lines)} points.`);
  }, { signal });
  root.querySelector('#plot-quick-top')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }), { signal });
  root.querySelector('#plot-import-file')?.addEventListener('click', () => importInputEl.click(), { signal });
  importInputEl.addEventListener('change', () => void importCsvFile(importInputEl.files?.[0]), { signal });
  root.querySelector('#plot-download-csv')?.addEventListener('click', () => exportPlotCsv(lines, setStatus), { signal });
  root.querySelector('#plot-download-png')?.addEventListener('click', () => exportPlotPng(chartEl, state, lines, setStatus), { signal });
  root.querySelector('#plot-reset-zoom')?.addEventListener('click', resetInferenceCurveZoom, { signal });
  root.querySelector('#plot-reset')?.addEventListener('click', () => clearData(true), { signal });
  root.querySelector('#plot-clear')?.addEventListener('click', () => clearData(false), { signal });
  window.addEventListener('resize', () => {
    if (!destroyed) renderChart();
  }, { signal });
  window.addEventListener(THEME_CHANGE_EVENT, () => renderChart(false, false), { signal });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    if (renderChart(true)) setStatus(`Rendered ${lines.length} lines with ${countPoints(lines)} points.`);
  }, { signal });
  window.addEventListener('beforeunload', saveNow, { signal });

  renderEditor();
  renderImportPreview();
  renderChart();
  if (reference) setStatus(`Loaded ${reference.points.length} published reference points. Edits are temporary; export CSV to keep changes.`);
  else if (restored) setStatus('Loaded saved Plot Tool data.');

  return () => {
    destroyed = true;
    saveNow();
    controller.abort();
    root.replaceChildren();
  };
}

function loadPlotToolData(): { lines: PlotLineDraft[]; state: PlotToolState } | null {
  try {
    const raw = window.localStorage.getItem(PLOT_TOOL_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (
      !isRecord(data) ||
      (data.version !== 1 && data.version !== 2 && data.version !== 3 && data.version !== 4) ||
      !Array.isArray(data.lines)
    ) {
      return null;
    }
    const storageVersion = data.version;
    const lines = data.lines.flatMap((value, index) => {
      if (!isRecord(value)) return [];
      const id = readString(value.id).trim();
      const name = readString(value.name).trim();
      if (!id || !name) return [];
      const points = Array.isArray(value.points)
        ? value.points.flatMap((point) =>
            isRecord(point) ? [{ x: readString(point.x), y: readString(point.y) }] : []
          )
        : [];
      return [{
        id,
        name,
        color: readString(value.color) || DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
        lineStyle: readString(value.lineStyle) || 'solid',
        marker: readString(value.marker) || 'circle',
        renderOrder: readFinite(value.renderOrder) ?? index + 1,
        collapsed: value.collapsed === true,
        points: points.length ? points : [{ x: '', y: '' }]
      } satisfies PlotLineDraft];
    });
    const savedState = isRecord(data.state) ? data.state : {};
    const defaults = createDefaultState();
    const lineIds = new Set(lines.map((line) => line.id));
    const savedActive = Array.isArray(savedState.activeLineIds)
      ? savedState.activeLineIds.map(String).filter((id) => lineIds.has(id))
      : lines.map((line) => line.id);
    return {
      lines,
      state: {
        title: readString(savedState.title) || defaults.title,
        subtitle: readString(savedState.subtitle),
        xLabel: readString(savedState.xLabel) || defaults.xLabel,
        yLabel: readString(savedState.yLabel) || defaults.yLabel,
        watermark:
          storageVersion === 1
            ? defaults.watermark
            : readString(savedState.watermark).slice(0, MAX_WATERMARK_LENGTH),
        xGoal: savedState.xGoal === 'minimize' ? 'minimize' : 'maximize',
        yGoal: savedState.yGoal === 'minimize' ? 'minimize' : 'maximize',
        activeLineIds: new Set(savedActive),
        search: readString(savedState.search),
        showNonOptimalPoints: savedState.showNonOptimalPoints === true,
        logX: savedState.logX === true,
        logY: savedState.logY === true,
        showLineLabels: savedState.showLineLabels === true,
        lineLabelPositions: normalizeInferenceCurveLineLabelPositions(savedState.lineLabelPositions),
        showGoalDirection: savedState.showGoalDirection !== false
      }
    };
  } catch (error) {
    console.warn('Could not load Plot Tool browser data.', error);
    return null;
  }
}

export function parsePlotToolCsv(text: string): PlotLineDraft[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new Error('CSV is empty.');
  const header = rows[0]!.cells.map(normalizeHeader);
  const indexes = new Map<string, number>();
  header.forEach((name, index) => {
    if (name && !indexes.has(name)) indexes.set(name, index);
  });
  const required = ['Line ID', 'Line Name', 'X', 'Y'];
  const missing = required.filter((name) => !indexes.has(normalizeHeader(name)));
  if (missing.length) throw new Error(`Missing required CSV headers: ${missing.join(', ')}.`);
  const column = (name: (typeof CSV_HEADERS)[number]) => indexes.get(normalizeHeader(name));
  const groups = new Map<string, { metadata: LineMetadata; firstRow: number; points: PlotPointDraft[] }>();

  rows.slice(1).forEach((row) => {
    if (row.cells.every((cell) => !cell.trim())) return;
    const value = (name: (typeof CSV_HEADERS)[number]) => {
      const index = column(name);
      return index === undefined ? '' : (row.cells[index] ?? '').trim();
    };
    const id = value('Line ID');
    const name = value('Line Name');
    if (!id) throw new Error(`Row ${row.lineNumber}: Line ID is required.`);
    if (!name) throw new Error(`Row ${row.lineNumber}: Line Name is required.`);
    const xText = value('X');
    const yText = value('Y');
    const x = Number(xText);
    const y = Number(yText);
    if (!xText || !Number.isFinite(x)) throw new Error(`Row ${row.lineNumber}: X must be a finite number.`);
    if (!yText || !Number.isFinite(y)) throw new Error(`Row ${row.lineNumber}: Y must be a finite number.`);
    const layerText = value('Layer');
    if (layerText && !Number.isFinite(Number(layerText))) {
      throw new Error(`Row ${row.lineNumber}: Layer must be a finite number when provided.`);
    }
    const metadata: LineMetadata = {
      name,
      color: value('Color'),
      lineStyle: value('Line Type'),
      marker: value('Line Marker'),
      layer: layerText ? String(Number(layerText)) : ''
    };
    const existing = groups.get(id);
    if (existing) {
      const labels: Record<keyof LineMetadata, string> = {
        name: 'Line Name',
        color: 'Color',
        lineStyle: 'Line Type',
        marker: 'Line Marker',
        layer: 'Layer'
      };
      (Object.keys(metadata) as (keyof LineMetadata)[]).forEach((key) => {
        if (existing.metadata[key] !== metadata[key]) {
          throw new Error(`Row ${row.lineNumber}: Line ID "${id}" has inconsistent ${labels[key]} (first seen on row ${existing.firstRow}).`);
        }
      });
      existing.points.push({ x: String(x), y: String(y) });
    } else {
      groups.set(id, { metadata, firstRow: row.lineNumber, points: [{ x: String(x), y: String(y) }] });
    }
  });
  if (groups.size === 0) throw new Error('CSV contains no point rows.');
  return Array.from(groups.entries()).map(([id, group], index) => ({
    id,
    name: group.metadata.name,
    color: group.metadata.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
    lineStyle: group.metadata.lineStyle || 'solid',
    marker: group.metadata.marker || 'circle',
    renderOrder: group.metadata.layer ? Number(group.metadata.layer) : index + 1,
    collapsed: false,
    points: group.points
  }));
}

function parseCsvRows(text: string): ParsedCsvRow[] {
  const rows: ParsedCsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let lineNumber = 1;
  let rowStart = 1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
        if (char === '\n') lineNumber += 1;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      cells.push(cell);
      rows.push({ cells, lineNumber: rowStart });
      cells = [];
      cell = '';
      lineNumber += 1;
      rowStart = lineNumber;
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error(`Row ${rowStart}: unterminated quoted CSV field.`);
  if (cell.length || cells.length) {
    cells.push(cell);
    rows.push({ cells, lineNumber: rowStart });
  }
  if (rows[0]?.cells[0]) rows[0].cells[0] = rows[0].cells[0]!.replace(/^\uFEFF/u, '');
  return rows;
}

function exportPlotCsv(lines: PlotLineDraft[], setStatus: (message: string, error?: boolean) => void): void {
  const rows: string[][] = [[...CSV_HEADERS]];
  lines.forEach((line) => {
    line.points.forEach((point) => {
      const x = Number(point.x.trim());
      const y = Number(point.y.trim());
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      rows.push([
        line.id,
        line.name,
        String(x),
        String(y),
        line.color,
        line.lineStyle,
        line.marker,
        String(line.renderOrder)
      ]);
    });
  });
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  downloadBlob(`pareto-plot-${today()}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  setStatus(`Exported ${rows.length - 1} point rows from all ${lines.length} lines.`);
}

function exportPlotPng(
  chartEl: HTMLElement,
  state: PlotToolState,
  lines: PlotLineDraft[],
  setStatus: (message: string, error?: boolean) => void
): void {
  const svg = chartEl.querySelector<SVGSVGElement>('svg');
  if (!svg) {
    setStatus('No chart is available to export.', true);
    return;
  }
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const background = read('--background', '#131416');
  const foreground = read('--foreground', '#eaebec');
  const muted = read('--muted-foreground', '#b4b9bc');
  const border = read('--border', '#656b72');
  const borderAlt = read('--border-alt', '#222426');
  const rect = svg.getBoundingClientRect();
  const width = Number(svg.getAttribute('width')) || rect.width || 960;
  const height = Number(svg.getAttribute('height')) || rect.height || 575;
  const padding = 32;
  const titleHeight = 70;
  const outerWidth = width + padding * 2;
  const outerHeight = height + padding * 2 + titleHeight;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('x', String(padding));
  clone.setAttribute('y', String(padding + titleHeight));
  clone.querySelector('.ruler-group')?.remove();
  const title = escapeHtml(state.title || 'Pareto Plot');
  const subtitle = escapeHtml(state.subtitle);
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${outerWidth}" height="${outerHeight}" viewBox="0 0 ${outerWidth} ${outerHeight}">
    <style>
      text { font-family: ${styles.fontFamily || 'sans-serif'}; }
      .chart-root .x-axis .domain, .chart-root .y-axis .domain, .chart-root .tick line { stroke: ${border}; }
      .chart-root .tick text, .x-axis-label, .y-axis-label { fill: ${foreground}; }
      .goal-direction-arrow { fill: ${foreground}; stroke: ${foreground}; stroke-width: 4; stroke-linejoin: round; opacity: .95; }
      .goal-direction-label { fill: ${muted}; font-size: 14px; font-weight: 800; letter-spacing: .12em; paint-order: stroke; stroke: ${background}; stroke-width: 3px; stroke-linejoin: round; }
      .chart-root .grid line { stroke: ${borderAlt}; }
      .chart-watermark { fill: ${foreground}; opacity: .055; font-weight: 800; }
      .pill-text { fill: #fff; font-size: 11px; font-weight: 700; }
      .pill-bg { opacity: .9; }
    </style>
    <rect width="100%" height="100%" fill="${escapeAttribute(background)}" />
    <text x="${padding}" y="${padding + 20}" fill="${escapeAttribute(foreground)}" font-size="18" font-weight="700">${title}</text>
    <text x="${padding}" y="${padding + 44}" fill="${escapeAttribute(muted)}" font-size="12">${subtitle}</text>
    <line x1="${padding}" y1="${padding + 58}" x2="${outerWidth - padding}" y2="${padding + 58}" stroke="${escapeAttribute(border)}" stroke-opacity=".35" />
    ${new XMLSerializer().serializeToString(clone)}
  </svg>`;
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = outerWidth * 2;
    canvas.height = outerHeight * 2;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `pareto-plot-${today()}.png`;
      link.click();
      URL.revokeObjectURL(pngUrl);
      setStatus(`Exported PNG with ${lines.length} plot lines.`);
    });
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus('Could not export PNG.', true);
  };
  image.src = url;
}

function renderTextSetting(key: string, label: string, value: string, maxLength?: number): string {
  return `<label><span>${label}</span><input type="text" data-plot-setting="${key}" value="${escapeAttribute(value)}" ${maxLength ? `maxlength="${maxLength}"` : ''} /></label>`;
}

function renderGoalSetting(key: string, label: string, value: ParetoGoal): string {
  const isX = key === 'xGoal';
  return `<label class="plot-goal-setting"><span>${label}</span><select data-plot-setting="${key}" aria-label="${label}"><option value="maximize" ${value === 'maximize' ? 'selected' : ''}>${isX ? 'Maximize · Better →' : 'Maximize · Better ↑'}</option><option value="minimize" ${value === 'minimize' ? 'selected' : ''}>${isX ? 'Minimize · Better ←' : 'Minimize · Better ↓'}</option></select></label>`;
}

function renderPlotColorField(
  line: PlotLineDraft,
  index: number
): string {
  const color = line.color.trim();
  return `
    <label class="series-field color-field plot-line-color">
      <span>Color</span>
      <div class="color-controls custom">
        <input type="color" data-line-field="color" value="${escapeAttribute(toHexColor(color, index))}" aria-label="Pick custom color" title="Pick custom color" />
        <div class="color-presets" aria-label="Basic colors">
          ${COLOR_PRESETS.map((preset) => `
            <button type="button" class="color-preset${color.toLowerCase() === preset.value.toLowerCase() ? ' selected' : ''}" data-color-preset="${preset.value}" title="${preset.name}" aria-label="${preset.name}" style="--swatch-color:${preset.value}"></button>
          `).join('')}
        </div>
      </div>
    </label>
  `;
}

function renderMarkerOptions(selected: string): string {
  return ['circle', 'square', 'triangle', 'diamond', 'star', 'plus', 'cross']
    .map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${titleCase(value)}</option>`)
    .join('');
}

function renderLineStyleOptions(selected: string): string {
  return [
    ['solid', 'Solid'],
    ['dashed', 'Dashed'],
    ['dotted', 'Dotted'],
    ['dashdot', 'Dash Dot'],
    ['long-dash', 'Long Dash']
  ].map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderSwitch(key: string, label: string, checked: boolean): string {
  return `<label class="legend-switch"><input type="checkbox" data-plot-switch="${key}" ${checked ? 'checked' : ''} /><span class="switch-track"></span><span>${label}</span></label>`;
}

function syncSettingsInputs(container: HTMLElement, state: PlotToolState): void {
  container.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-plot-setting]').forEach((control) => {
    const key = control.dataset.plotSetting as keyof PlotToolState;
    const value = state[key];
    if (typeof value === 'string') control.value = value;
  });
}

function icon(name: string): string {
  const paths: Record<string, string> = {
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/>',
    table: '<path d="M4 4h16v16H4zM8 4v16m8-16v16M4 10h16M4 16h16"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/>',
    redraw: '<path d="M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6.4 6.6L4 9M5.5 15A7 7 0 0 0 17.6 17.4L20 15"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
    grip: '<path d="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" stroke-width="3"/>'
  };
  return `<svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ''}</svg>`;
}

function compareLineOrder(
  a: { line: PlotLineDraft; index: number },
  b: { line: PlotLineDraft; index: number }
): number {
  return a.line.renderOrder - b.line.renderOrder || a.index - b.index;
}

function nextLineOrdinal(lines: PlotLineDraft[]): number {
  let ordinal = lines.length + 1;
  while (lines.some((line) => line.id === `line-${ordinal}`)) ordinal += 1;
  return ordinal;
}

function nextLayer(lines: PlotLineDraft[]): number {
  return lines.length ? Math.max(...lines.map((line) => line.renderOrder)) + 1 : 1;
}

function makeUniqueLineId(base: string, lines: PlotLineDraft[]): string {
  if (!lines.some((line) => line.id === base)) return base;
  let suffix = 2;
  while (lines.some((line) => line.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function formatLayer(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '');
}

function countPoints(lines: PlotLineDraft[]): number {
  return lines.reduce(
    (sum, line) => sum + line.points.filter((point) => point.x.trim() || point.y.trim()).length,
    0
  );
}

function toHexColor(value: string, index: number): string {
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/iu.test(color)) return color;
  const short = color.match(/^#([0-9a-f]{3})$/iu)?.[1];
  if (short) return `#${short.split('').map((char) => `${char}${char}`).join('')}`;
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length]!;
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/u, '').trim().toLowerCase().replace(/\s+/gu, ' ');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadBlob(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function readFinite(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeHtml(value: string): string {
  const span = document.createElement('span');
  span.textContent = value;
  return span.innerHTML;
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
