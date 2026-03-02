// ---------------------------------------------------------------------------
// Zustand store — pipeline state
// ---------------------------------------------------------------------------
import { create } from 'zustand';
import {
  PipelineResponse,
  getExecutedNodes,
  getLastStatus,
  getStoppedNodeId,
  getNodeOutput,
  startPipeline,
  sendHumanInput,
} from './api';

// The ordered pipeline stages the UI tracks. Each one maps to one or more
// ADK pipeline step labels that execute during that stage.
export const PIPELINE_STAGES = [
  {
    id: 'ingest',
    title: 'Ingestion',
    description: 'Gemini OCR parse & metadata extraction',
    nodes: ['S2: OCR Parse (Gemini)', 'S1: Metadata Extract (Gemini)'],
    gate: 'HG1: Data Review',
    gateDescription: 'Review AI-extracted metadata. Verify titles, artists, periods, materials, dimensions and cultural designations.',
  },
  {
    id: 'script',
    title: 'Script Generation',
    description: 'Gemini Pro script generation & image mapping',
    nodes: ['S4: Script Gen (Gemini Pro)', 'S5: Image Map (Gemini)'],
    gate: 'HG3: Script Review',
    gateDescription: 'Review AI-generated scripts for each spot. Approve individually or in bulk.',
  },
  {
    id: 'translation',
    title: 'Translation',
    description: 'Gemini Pro translation to all target languages',
    nodes: ['S6: Translation (Gemini Pro)'],
    gate: 'HG4: Translation Review',
    gateDescription: 'Review translated scripts per language. Export to Excel for external translators if needed.',
  },
  {
    id: 'audio',
    title: 'Audio Production',
    description: 'Character & voice selection, Gemini director note, TTS audio generation, QA',
    nodes: [
      'N5: Character Select',
      'S7: Voice Recommend (Gemini)',
      'S8: Director Note (Gemini)',
      'S9: Audio Gen (Gemini TTS)',
      'N6: Audio Playback QA',
    ],
    gate: 'HG5: Audio Review',
    gateDescription: 'Listen to generated audio per language. Mark timestamps with comments for voice issues.',
  },
  {
    id: 'publish',
    title: 'Publishing',
    description: 'Generation history & SRT subtitle generation',
    nodes: ['N8: Generation History', 'S10: SRT Gen (rule-based)', 'Pipeline Complete'],
    gate: null,
    gateDescription: null,
  },
] as const;

export type StageStatus = 'pending' | 'running' | 'gate' | 'completed' | 'rejected';

export interface StageState {
  status: StageStatus;
  nodeOutputs: Record<string, unknown>;
  gateText?: string;
}

export interface PipelineStore {
  // session
  sessionId: string;

  // overall state
  status: 'idle' | 'running' | 'stopped' | 'finished' | 'error';
  error: string | null;

  // per-stage state
  stages: Record<string, StageState>;
  currentStageIndex: number;

  // last raw response (for debugging)
  lastResponse: PipelineResponse | null;
  checkpointId: string | null;

  // log of all responses
  history: { action: string; response: PipelineResponse; timestamp: number }[];

  // actions
  start: () => Promise<void>;
  approve: (feedback: string) => Promise<void>;
  reject: (feedback: string) => Promise<void>;
  reset: () => void;
}

function buildInitialStages(): Record<string, StageState> {
  const stages: Record<string, StageState> = {};
  for (const s of PIPELINE_STAGES) {
    stages[s.id] = { status: 'pending', nodeOutputs: {} };
  }
  return stages;
}

function generateSessionId(): string {
  return `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Determine which stage index we're at based on the executed node labels
function resolveStageIndex(executedNodes: string[], lastStatus: string): number {
  // Walk backwards through stages and find the last one that has nodes executed
  for (let i = PIPELINE_STAGES.length - 1; i >= 0; i--) {
    const stage = PIPELINE_STAGES[i];
    const gateReached = stage.gate && executedNodes.includes(stage.gate);
    const anyNode = stage.nodes.some((n) => executedNodes.includes(n));
    if (gateReached || anyNode) {
      // If we stopped at this gate, stay on this stage
      if (gateReached && lastStatus === 'STOPPED') return i;
      // If this is the last stage and finished, stay
      if (i === PIPELINE_STAGES.length - 1 && lastStatus === 'FINISHED') return i;
      // Otherwise we passed this stage, move to next
      if (gateReached && lastStatus !== 'STOPPED') return Math.min(i + 1, PIPELINE_STAGES.length - 1);
      return i;
    }
  }
  return 0;
}

function deriveStages(executedNodes: string[], lastStatus: string, response: PipelineResponse): { stages: Record<string, StageState>; currentIndex: number } {
  const stages = buildInitialStages();
  const currentIndex = resolveStageIndex(executedNodes, lastStatus);

  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const def = PIPELINE_STAGES[i];
    const stage = stages[def.id];

    // Collect node outputs for this stage
    for (const nodeLabel of def.nodes) {
      if (executedNodes.includes(nodeLabel)) {
        stage.nodeOutputs[nodeLabel] = getNodeOutput(response, nodeLabel);
      }
    }

    if (i < currentIndex) {
      stage.status = 'completed';
    } else if (i === currentIndex) {
      const gateReached = def.gate && executedNodes.includes(def.gate);
      if (gateReached && lastStatus === 'STOPPED') {
        stage.status = 'gate';
        // Get the gate's display text from the response
        const gateStep = response.steps?.find((s) => s.label === def.gate);
        stage.gateText = (gateStep?.output as Record<string, unknown>)?.content as string ?? def.gateDescription ?? undefined;
      } else if (i === PIPELINE_STAGES.length - 1 && lastStatus === 'FINISHED') {
        stage.status = 'completed';
      } else {
        stage.status = 'running';
      }
    }
    // else: pending
  }

  return { stages, currentIndex };
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  sessionId: generateSessionId(),
  status: 'idle',
  error: null,
  stages: buildInitialStages(),
  currentStageIndex: -1,
  lastResponse: null,
  checkpointId: null,
  history: [],

  start: async () => {
    const { sessionId } = get();
    set({ status: 'running', error: null });
    try {
      const response = await startPipeline(
        'Process museum exhibits for audio guide generation',
        sessionId,
      );
      const executedNodes = getExecutedNodes(response);
      const lastStatus = getLastStatus(response);
      const { stages, currentIndex } = deriveStages(executedNodes, lastStatus, response);

      set({
        status: lastStatus === 'STOPPED' ? 'stopped' : lastStatus === 'FINISHED' ? 'finished' : 'running',
        lastResponse: response,
        checkpointId: getStoppedNodeId(response),
        stages,
        currentStageIndex: currentIndex,
        history: [{ action: 'start', response, timestamp: Date.now() }],
      });
    } catch (e: unknown) {
      set({ status: 'error', error: (e as Error).message });
    }
  },

  approve: async (feedback: string) => {
    const { sessionId, checkpointId } = get();
    if (!checkpointId) return;

    set({ status: 'running', error: null });
    try {
      const response = await sendHumanInput(sessionId, 'approve', checkpointId, feedback);
      const executedNodes = getExecutedNodes(response);
      const lastStatus = getLastStatus(response);
      const { stages, currentIndex } = deriveStages(executedNodes, lastStatus, response);

      set((s) => ({
        status: lastStatus === 'STOPPED' ? 'stopped' : lastStatus === 'FINISHED' ? 'finished' : 'running',
        lastResponse: response,
        checkpointId: getStoppedNodeId(response),
        stages,
        currentStageIndex: currentIndex,
        history: [...s.history, { action: 'approve', response, timestamp: Date.now() }],
      }));
    } catch (e: unknown) {
      set({ status: 'error', error: (e as Error).message });
    }
  },

  reject: async (feedback: string) => {
    const { sessionId, checkpointId, currentStageIndex } = get();
    if (!checkpointId) return;

    set({ status: 'running', error: null });
    try {
      const response = await sendHumanInput(sessionId, 'reject', checkpointId, feedback);
      const executedNodes = getExecutedNodes(response);
      const lastStatus = getLastStatus(response);
      const { stages, currentIndex } = deriveStages(executedNodes, lastStatus, response);

      // Mark the current stage as rejected then re-derive after loop
      const stageId = PIPELINE_STAGES[currentStageIndex]?.id;
      if (stageId && stages[stageId]) {
        stages[stageId].status = lastStatus === 'STOPPED' ? 'gate' : 'rejected';
      }

      set((s) => ({
        status: lastStatus === 'STOPPED' ? 'stopped' : 'running',
        lastResponse: response,
        checkpointId: getStoppedNodeId(response),
        stages,
        currentStageIndex: currentIndex,
        history: [...s.history, { action: 'reject', response, timestamp: Date.now() }],
      }));
    } catch (e: unknown) {
      set({ status: 'error', error: (e as Error).message });
    }
  },

  reset: () => {
    set({
      sessionId: generateSessionId(),
      status: 'idle',
      error: null,
      stages: buildInitialStages(),
      currentStageIndex: -1,
      lastResponse: null,
      checkpointId: null,
      history: [],
    });
  },
}));
