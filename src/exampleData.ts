import type { InferenceCurveSeries } from './inferenceCurveChart';
import agentxReference from './data/inferencexAgentx39596624542.json';
import agentxBaseline from './data/agentxSimOpusMi355xBaseline.json';
import agentx1200 from './data/agentxSimOpusMi355x20261027_1200s.json';
import agentxCompat1200 from './data/agentxSimOpusMi355x20261029_1200s.json';
import fixedRealrun from './data/fixedRealrunMi355x20261030.json';

type FixedRealrunPoint = (typeof fixedRealrun.points)[number];

const FIXED_REALRUN_COLORS: Record<string, string> = {
  cold: '#a78bfa',
  512: '#34d399',
  1024: '#f472b6',
  2048: '#facc15',
  4096: '#fb923c'
};

function formatK(tokens: number): string {
  if (tokens < 1024) return String(tokens);
  return tokens % 1024 === 0 ? `${tokens / 1024}K` : `${(tokens / 1024).toFixed(1)}K`;
}

// One curve per fixed workload (ISL, OSL, E); cold workloads record E = ISL.
function fixedRealrunSeries(): InferenceCurveSeries[] {
  const workloads = new Map<string, FixedRealrunPoint[]>();
  for (const point of fixedRealrun.points) {
    const key = `ISL ${point.isl_tokens} / OSL ${point.osl_tokens} / E ${point.extend_tokens}`;
    workloads.set(key, [...(workloads.get(key) ?? []), point]);
  }
  return Array.from(workloads, ([scenario, points]) => {
    const { isl_tokens: isl, osl_tokens: osl, extend_tokens: e, prefix_tokens: prefix } = points[0]!;
    const cold = prefix === 0;
    const extend = cold ? 'Cold' : `E ${formatK(e)}`;
    const geometry = cold
      ? `${formatK(isl)} cold (radix cache off) / OSL ${formatK(osl)}`
      : `C ${formatK(prefix)} cached + E ${formatK(e)} (ISL ${isl}) / OSL ${formatK(osl)}`;
    const stalled = points.filter((point) => point.compile_stall).map((point) => `TP${point.tp} C${point.concurrency}`);
    return {
      id: `${fixedRealrun.id}-isl${isl}-osl${osl}-e${e}`,
      name: `${fixedRealrun.name} / ${extend}`,
      group: fixedRealrun.group,
      hwKey: 'mi355x_sglang',
      model: fixedRealrun.model,
      islOsl: scenario,
      precision: 'fp4',
      mtp: 'MTP',
      color: FIXED_REALRUN_COLORS[cold ? 'cold' : String(e)] ?? '#94a3b8',
      marker: 'diamond',
      lineStyle: 'solid',
      title: `DeepSeek-V4.1-Flash | MI355X / SGLang | fixed-length real run | ${geometry}`,
      note: `Measured ${fixedRealrun.measured_from} to ${fixedRealrun.measured_to}, ${fixedRealrun.source_repo}; ${fixedRealrun.framework}, MTP (DSPARK). ${fixedRealrun.workload} ${fixedRealrun.limitations}${stalled.length ? ` Compile stall in this workload: ${stalled.join(', ')}.` : ''} Evidence: src/data/fixedRealrunMi355x20261030.json.`,
      points: points.map((point) => ({
        precision: 'fp4',
        meanInteractivity: point.mean_interactivity,
        totalThroughput: point.total_throughput,
        throughput: point.tput_per_gpu,
        ttft: point.mean_ttft_s,
        endToEnd: point.mean_e2el_s,
        tp: point.tp,
        prefill_tp: point.tp,
        decode_tp: point.tp,
        prefill_ep: 1,
        decode_ep: 1,
        dp_attention: false,
        prefill_dp_attention: false,
        decode_dp_attention: false,
        num_prefill_gpu: point.gpu_count,
        num_decode_gpu: point.gpu_count,
        disagg: false,
        spec_decoding: 'mtp',
        concurrency: point.concurrency,
        strategy: `TP${point.tp} ADP${point.adp}`,
        label: `TP${point.tp} ADP${point.adp} C${point.concurrency}${point.compile_stall ? ' (compile stall)' : ''}`,
        note: `Case ${point.point_id}; ${point.gpu_count} physical GPUs; ${point.completed_requests} measured requests after ${point.warmup_requests} warm-up (${point.warmup.replaceAll('_', ' ')}); mean accept length ${point.mean_accept_length}; run ${point.source_run_id} @ ${point.source_commit}${point.compile_stall ? `; JIT compile stall in the measurement window (max engine log gap ${point.max_engine_log_gap_s}s)` : ''}`
      }))
    };
  });
}

// Repository-maintained data enters the normal editable workspace. Saved browser
// edits take precedence; Reset All restores this dataset without a special URL.
export const exampleSeries: InferenceCurveSeries[] = [{
  id: 'inferencex-agentx-mi355x-fp4-run39596624542',
  name: 'InferenceX-AgentX',
  group: 'InferenceX reference',
  hwKey: 'mi355x_sglang',
  model: agentxReference.model,
  islOsl: 'Agentic Traces',
  precision: 'fp4',
  color: '#718096',
  marker: 'circle',
  lineStyle: 'solid',
  title: 'DeepSeek-V4.1-Flash | MI355X / SGLang | 10 configs | 3600s',
  note: `Reference run 39596624542, attempt 1, ${agentxReference.sourceDate}. ${agentxReference.sourceUrl}. Mean interactivity = metrics.mean_intvty; all-GPU input + output throughput = metrics.total_tput_tps. P90 and per-GPU metrics are retained separately.`,
  points: agentxReference.points.map((point) => ({
    precision: 'fp4',
    meanInteractivity: point.metrics.mean_intvty,
    totalThroughput: point.metrics.total_tput_tps,
    interactivity: point.metrics.p90_intvty,
    interactivityPercentiles: { p90: point.metrics.p90_intvty },
    throughput: point.metrics.tput_per_gpu,
    ttft: point.metrics.p90_ttft,
    ttftPercentiles: { p90: point.metrics.p90_ttft },
    endToEnd: point.metrics.p90_e2el,
    endToEndPercentiles: { p90: point.metrics.p90_e2el },
    tp: point.tp,
    prefill_tp: point.tp,
    decode_tp: point.tp,
    prefill_ep: 1,
    decode_ep: 1,
    dp_attention: point.adp > 1,
    prefill_dp_attention: point.adp > 1,
    decode_dp_attention: point.adp > 1,
    num_prefill_gpu: point.gpuCount,
    num_decode_gpu: point.gpuCount,
    disagg: false,
    spec_decoding: 'mtp',
    concurrency: point.concurrency,
    strategy: `TP${point.tp} ADP${point.adp}`,
    label: `TP${point.tp} ADP${point.adp} C${point.concurrency}`,
    note: `Config ${point.configId}; reference result ${point.referenceId}; ${point.gpuCount} physical GPUs; source ${agentxReference.sourceUrl}`
  }))
}, {
  id: agentxBaseline.id,
  name: agentxBaseline.name,
  group: agentxBaseline.group,
  hwKey: 'mi355x_sglang',
  model: agentxBaseline.model,
  islOsl: agentxBaseline.scenario,
  precision: 'fp4',
  color: '#38bdf8',
  marker: 'square',
  lineStyle: 'solid',
  title: 'DeepSeek-V4.1-Flash | MI355X | AgentX simulation baseline | 3600s',
  note: `First batch simulation baseline, ${agentxBaseline.sourceDate}. Nine full configuration results plus one limited ADP2/C64 result; accuracy acceptance pending. ADP2/C64 has a grace timeout, full_AgentX_point=false, unknown query coverage and source-only uncalibrated joint cost. Mean and all-GPU input + output total use the same definitions as InferenceX-AgentX. Source hashes and per-point versions: src/data/agentxSimOpusMi355xBaseline.json.`,
  points: agentxBaseline.points.map((point) => ({
    precision: 'fp4',
    meanInteractivity: point.mean_interactivity,
    totalThroughput: point.total_throughput,
    interactivity: point.p90_interactivity,
    interactivityPercentiles: { p90: point.p90_interactivity },
    throughput: point.tput_per_gpu,
    tp: point.tp,
    prefill_tp: point.tp,
    decode_tp: point.tp,
    prefill_ep: 1,
    decode_ep: 1,
    dp_attention: point.adp > 1,
    prefill_dp_attention: point.adp > 1,
    decode_dp_attention: point.adp > 1,
    num_prefill_gpu: point.gpu_count,
    num_decode_gpu: point.gpu_count,
    disagg: false,
    spec_decoding: 'mtp',
    concurrency: point.concurrency,
    strategy: `TP${point.tp} ADP${point.adp}`,
    label: `TP${point.tp} ADP${point.adp} C${point.concurrency}${point.limited ? ' (limited)' : ''}; run ${point.point_id}; source SHA256 ${point.source_sha256}`,
    note: point.note
  }))
}, {
  id: agentx1200.id,
  name: agentx1200.name,
  group: agentx1200.group,
  hwKey: 'mi355x_sglang',
  model: agentx1200.model,
  islOsl: agentx1200.scenario,
  precision: 'fp4',
  color: '#f59e0b',
  marker: 'triangle',
  lineStyle: 'solid',
  title: 'DeepSeek-V4.1-Flash | MI355X | AgentX simulation | 1200s | 4/10 configs',
  note: '2026-10-27 1200s simulation, 4/10 configurations available: TP2 C1/C4 and TP4 C1/C2. Each short window completed; not a full 3600s reference run. Accuracy acceptance pending; source hashes and metric evidence retained in src/data/agentxSimOpusMi355x20261027_1200s.json. TP4 C2 has an outer cleanup CPU-affinity assertion (exit 1, saved inspect absent). TP2 C4 uses source-observed warm buffer1; the other three use cold0 natural growth.',
  points: agentx1200.points.map((point) => ({
    precision: 'fp4',
    meanInteractivity: point.mean_interactivity,
    totalThroughput: point.total_throughput,
    interactivity: point.p90_interactivity,
    interactivityPercentiles: { p90: point.p90_interactivity },
    throughput: point.tput_per_gpu,
    tp: point.tp,
    prefill_tp: point.tp,
    decode_tp: point.tp,
    prefill_ep: 1,
    decode_ep: 1,
    dp_attention: point.adp > 1,
    prefill_dp_attention: point.adp > 1,
    decode_dp_attention: point.adp > 1,
    num_prefill_gpu: point.gpu_count,
    num_decode_gpu: point.gpu_count,
    disagg: false,
    spec_decoding: 'mtp',
    concurrency: point.concurrency,
    strategy: `TP${point.tp} ADP${point.adp}`,
    label: `TP${point.tp} ADP${point.adp} C${point.concurrency}; 1200s; run ${point.point_id}; source SHA256 ${point.source_sha256}`,
    note: point.note
  }))
}, {
  id: agentxCompat1200.id,
  name: agentxCompat1200.name,
  group: agentxCompat1200.group,
  hwKey: 'mi355x_sglang',
  model: agentxCompat1200.model,
  islOsl: agentxCompat1200.scenario,
  precision: 'fp4',
  color: '#22c55e',
  marker: 'diamond',
  lineStyle: 'solid',
  title: agentxCompat1200.title,
  note: agentxCompat1200.note,
  points: agentxCompat1200.points.map((point) => ({
    precision: 'fp4',
    meanInteractivity: point.mean_interactivity,
    totalThroughput: point.total_throughput,
    interactivity: point.p90_interactivity,
    interactivityPercentiles: { p90: point.p90_interactivity },
    throughput: point.tput_per_gpu,
    tp: point.tp,
    prefill_tp: point.tp,
    decode_tp: point.tp,
    prefill_ep: 1,
    decode_ep: 1,
    dp_attention: false,
    prefill_dp_attention: false,
    decode_dp_attention: false,
    num_prefill_gpu: point.gpu_count,
    num_decode_gpu: point.gpu_count,
    disagg: false,
    spec_decoding: 'mtp',
    concurrency: point.concurrency,
    strategy: `TP${point.tp} ADP${point.adp}`,
    label: point.label,
    note: point.note
  }))
}, ...fixedRealrunSeries()];
