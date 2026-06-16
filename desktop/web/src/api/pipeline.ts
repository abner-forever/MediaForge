import { get, post } from './base';
import { ssePost } from './sse';
import type { PipelineConfig, PipelineEvent, PipelineSummary } from '../types';

export const pipelineApi = {
  run: (
    config: PipelineConfig,
    onEvent: (evt: PipelineEvent) => void,
    signal?: AbortSignal,
  ): Promise<PipelineSummary> => {
    return ssePost<PipelineEvent, PipelineSummary>(
      '/api/pipeline/run',
      config,
      (evt) => {
        onEvent(evt);
        if (evt.type === 'step_error') {
          console.error('[Pipeline] step error:', evt.error);
        }
        if (evt.type === 'cancelled') {
          throw new DOMException('Cancelled', 'AbortError');
        }
      },
      {
        signal,
        extractResult: (evt) => {
          if (evt.type === 'completed' && evt.summary) {
            return evt.summary as unknown as PipelineSummary;
          }
          return null;
        },
      },
    );
  },

  confirm: (runId: string) => post<{ success: boolean }>(`/api/pipeline/confirm/${runId}`),

  cancel: (runId: string) => post<{ success: boolean }>(`/api/pipeline/cancel/${runId}`),

  detail: (runId: string) =>
    get<{
      run_id: string;
      events: Array<{ ts: string; event: string; payload: Record<string, unknown> }>;
    }>(`/api/pipeline/runs/${runId}`),

  decide: (runId: string, optionId: string) =>
    post<{ success: boolean }>(`/api/pipeline/decide/${runId}`, { option_id: optionId }),
};
