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
    items?: Array<{ title: string; desc?: string; celebrity?: string; images: number; score?: number; cover?: string; image_list?: string[] }>;
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
  setPipelineCurrentStep: (step: string | null) => void;
  setPipelineStepProgress: (progress: { current: number; total: number } | null) => void;
  setPipelineSummary: (summary: PipelineSummary | null) => void;
  setPipelineError: (error: string | null) => void;
  setPipelineCheckpoint: (checkpoint: { message: string; runId: string; items?: Array<{ title: string; desc?: string; celebrity?: string; images: number; score?: number; cover?: string; image_list?: string[] }> } | null) => void;
  setPipelineDecisionReq: (req: { message: string; runId: string; options: Array<{ id: string; label: string }>; context?: Record<string, unknown> } | null) => void;
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
