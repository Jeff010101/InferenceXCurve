import type { InferenceCurveSeries } from './inferenceCurveChart';
import agentxReference from './data/inferencexAgentx39596624542.json';

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
}];
