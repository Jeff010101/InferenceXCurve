import './styles.css';
import { getTheme, setTheme, THEME_CHANGE_EVENT } from './theme';

type Workspace = 'inferencex' | 'plot-tool';
type PlotToolModule = typeof import('./plotTool');

// Retire the temporary reference view: old bookmarks open the ordinary editor.
const entryUrl = new URL(window.location.href);
if (entryUrl.searchParams.get('reference') === 'inferencex-agentx-run39596624542') {
  entryUrl.searchParams.delete('reference');
  entryUrl.hash = '/inferencex';
  window.history.replaceState(null, '', entryUrl);
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

app.innerHTML = `
  <header class="workspace-header no-export">
    <div class="workspace-toolbar">
      <nav class="workspace-tabs" aria-label="Workspace">
        <a class="workspace-tab" href="#/inferencex" data-workspace="inferencex">InferenceX Curve</a>
        <a class="workspace-tab" href="#/plot-tool" data-workspace="plot-tool">Plot Tool</a>
      </nav>
      <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Light background" aria-pressed="false">
        <svg class="theme-icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>
        </svg>
        <svg class="theme-icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>
        </svg>
        <span id="theme-toggle-label"></span>
      </button>
    </div>
  </header>
  <div id="inferencex-workspace-root" class="workspace-panel" hidden></div>
  <div id="plot-tool-workspace-root" class="workspace-panel" hidden></div>
`;

const inferenceRoot = document.querySelector<HTMLDivElement>('#inferencex-workspace-root')!;
const plotRoot = document.querySelector<HTMLDivElement>('#plot-tool-workspace-root')!;
const tabs = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-workspace]'));
const themeToggle = document.querySelector<HTMLButtonElement>('#theme-toggle')!;
const themeToggleLabel = document.querySelector<HTMLSpanElement>('#theme-toggle-label')!;

function updateThemeToggle(): void {
  const isLight = getTheme() === 'light';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.title = isLight ? 'Switch to dark background' : 'Switch to light background';
  themeToggle.setAttribute('aria-label', themeToggle.title);
  themeToggleLabel.textContent = isLight ? 'Dark background' : 'Light background';
}

themeToggle.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'));
window.addEventListener(THEME_CHANGE_EVENT, updateThemeToggle);
updateThemeToggle();

let activeWorkspace: Workspace | null = null;
let inferenceLoaded = false;
let plotToolModule: PlotToolModule | null = null;
let unmountPlotTool: (() => void) | null = null;
let navigationVersion = 0;

function readWorkspace(): Workspace | null {
  if (window.location.hash === '#/inferencex') return 'inferencex';
  if (window.location.hash === '#/plot-tool') return 'plot-tool';
  return null;
}

function normalizeWorkspaceHash(): Workspace {
  const workspace = readWorkspace();
  if (workspace) return workspace;
  const url = `${window.location.pathname}${window.location.search}#/inferencex`;
  window.history.replaceState(null, '', url);
  return 'inferencex';
}

async function activateWorkspace(workspace: Workspace): Promise<void> {
  const version = ++navigationVersion;
  if (activeWorkspace === workspace) return;

  if (activeWorkspace === 'inferencex') {
    window.dispatchEvent(new Event('inferencex-workspace-deactivate'));
  }
  if (activeWorkspace === 'plot-tool') {
    unmountPlotTool?.();
    unmountPlotTool = null;
  }

  activeWorkspace = workspace;
  inferenceRoot.hidden = workspace !== 'inferencex';
  plotRoot.hidden = workspace !== 'plot-tool';
  tabs.forEach((tab) => {
    const selected = tab.dataset.workspace === workspace;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-current', selected ? 'page' : 'false');
  });
  document.title = workspace === 'inferencex' ? 'InferenceX Curve' : 'Pareto Plot Tool';

  if (workspace === 'inferencex') {
    if (!inferenceLoaded) {
      await import('./main');
      inferenceLoaded = true;
    }
    if (version !== navigationVersion || activeWorkspace !== workspace) return;
    window.dispatchEvent(new Event('inferencex-workspace-activate'));
    return;
  }

  plotToolModule ??= await import('./plotTool');
  if (version !== navigationVersion || activeWorkspace !== workspace) return;
  unmountPlotTool = plotToolModule.mountPlotTool(plotRoot);
}

function handleNavigation(): void {
  void activateWorkspace(normalizeWorkspaceHash());
}

window.addEventListener('hashchange', handleNavigation);
handleNavigation();
