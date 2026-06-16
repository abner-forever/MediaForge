import type { StateCreator } from 'zustand';
import type { AppState } from './types';
import type { PipelineEvent, PipelineSummary } from '../types';

export interface PipelineSlice {
  pipelineRunning: boolean;
  setPipelineRunning: (running: boolean) => void;
  pipelineEvents: PipelineEvent[];
  pipelineCurrentStep: string | null;
  pipelineStepProgress: { current: number; total: number } | null;
  pipelineSummary: PipelineSummary | null;
  pipelineError: string | null;
  pipelineCheckpoint: {
    message: string;
    runId: string;
    items?: Array<{
      title: string;
      desc?: string;
      celebrity?: string;
      images: number;
      score?: number;
      cover?: string;
      image_list?: string[];
    }>;
  } | null;
  pipelineDecisionReq: {
    message: string;
    runId: string;
    options: Array<{ id: string; label: string }>;
    context?: Record<string, unknown>;
  } | null;
  pipelineAbortController: AbortController | null;
  setPipelineAbortController: (controller: AbortController | null) => void;
  setPipelineEvents: (events: PipelineEvent[]) => void;
  addPipelineEvent: (evt: PipelineEvent) => void;
  processPipelineEvent: (evt: PipelineEvent) => void;
  setPipelineCurrentStep: (step: string | null) => void;
  setPipelineStepProgress: (progress: { current: number; total: number } | null) => void;
  setPipelineSummary: (summary: PipelineSummary | null) => void;
  setPipelineError: (error: string | null) => void;
  setPipelineCheckpoint: (
    checkpoint: {
      message: string;
      runId: string;
      items?: Array<{
        title: string;
        desc?: string;
        celebrity?: string;
        images: number;
        score?: number;
        cover?: string;
        image_list?: string[];
      }>;
    } | null,
  ) => void;
  setPipelineDecisionReq: (
    req: {
      message: string;
      runId: string;
      options: Array<{ id: string; label: string }>;
      context?: Record<string, unknown>;
    } | null,
  ) => void;
  resetPipelineState: () => void;
}

export const createPipelineSlice: StateCreator<AppState, [], [], PipelineSlice> = (set, get) => ({
  pipelineRunning: false,
  setPipelineRunning: (running) => set({ pipelineRunning: running }),
  pipelineEvents: [],
  pipelineCurrentStep: null,
  pipelineStepProgress: null,
  pipelineSummary: null,
  pipelineError: null,
  pipelineCheckpoint: null,
  pipelineDecisionReq: null,
  pipelineAbortController: null,
  setPipelineAbortController: (controller) => set({ pipelineAbortController: controller }),
  setPipelineEvents: (events) => set({ pipelineEvents: events }),
  addPipelineEvent: (evt) => set((s) => ({ pipelineEvents: [...s.pipelineEvents, evt] })),
  processPipelineEvent: (evt: PipelineEvent) =>
    set((s) => {
      const update: Record<string, unknown> = {
        pipelineEvents: [...s.pipelineEvents, evt],
      };
      if (evt.type === 'step_start' && evt.step) update.pipelineCurrentStep = evt.step;
      if (evt.type === 'step_error') update.pipelineCurrentStep = evt.step;
      if (evt.type === 'step_progress' && evt.current !== undefined && evt.total !== undefined) {
        update.pipelineStepProgress = {
          current: evt.current as number,
          total: evt.total as number,
        };
      }
      if (evt.type === 'checkpoint_required') {
        update.pipelineCheckpoint = {
          message: (evt.message as string) || '确认发布？',
          runId: (evt.pipeline_run_id as string) || '',
          items: evt.items as
            | Array<{
                title: string;
                desc?: string;
                celebrity?: string;
                images: number;
                score?: number;
                cover?: string;
                image_list?: string[];
              }>
            | undefined,
        };
      }
      if (evt.type === 'step_error' && !evt.step)
        update.pipelineError = (evt.error as string) || '运行出错';
      if (evt.type === 'decision_required') {
        update.pipelineDecisionReq = {
          message: (evt.message as string) || '请做出选择',
          runId: (evt.pipeline_run_id as string) || '',
          options: (evt.options as Array<{ id: string; label: string }>) || [],
          context: evt.context as Record<string, unknown> | undefined,
        };
      }
      return update;
    }),
  setPipelineCurrentStep: (step) => set({ pipelineCurrentStep: step }),
  setPipelineStepProgress: (progress) => set({ pipelineStepProgress: progress }),
  setPipelineSummary: (summary) => set({ pipelineSummary: summary }),
  setPipelineError: (error) => set({ pipelineError: error }),
  setPipelineCheckpoint: (checkpoint) => set({ pipelineCheckpoint: checkpoint }),
  setPipelineDecisionReq: (req) => set({ pipelineDecisionReq: req }),
  resetPipelineState: () => {
    const controller = get().pipelineAbortController;
    if (controller) {
      controller.abort();
    }
    set({
      pipelineRunning: false,
      pipelineEvents: [],
      pipelineCurrentStep: null,
      pipelineStepProgress: null,
      pipelineSummary: null,
      pipelineError: null,
      pipelineCheckpoint: null,
      pipelineDecisionReq: null,
      pipelineAbortController: null,
    });
  },
});
