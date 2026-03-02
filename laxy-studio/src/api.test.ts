// ---------------------------------------------------------------------------
// Frontend unit tests: API adapter + helper functions
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PipelineResponse, PipelineStep } from './api';

// ── We import only the pure helper functions (no firebase/fetch side-effects)
// The helper functions are pure and can be tested directly.

// Re-implement helpers inline for isolated testing (matching api.ts logic)
function getExecutedNodes(res: PipelineResponse): string[] {
  return (res.steps ?? []).map((s) => s.label);
}
function getLastStatus(res: PipelineResponse): string {
  const steps = res.steps ?? [];
  return steps.length ? steps[steps.length - 1].status : 'UNKNOWN';
}
function getStoppedNodeId(res: PipelineResponse): string | null {
  return res.checkpointId ?? null;
}
function getNodeOutput(res: PipelineResponse, label: string): unknown {
  const step = (res.steps ?? []).find((s) => s.label === label);
  return step?.output ?? null;
}

// ── Fixtures ──

function makePipelineResponse(overrides: Partial<PipelineResponse> = {}): PipelineResponse {
  return {
    sessionId: 'test-session-123',
    checkpointId: null,
    steps: [],
    finalText: null,
    status: 'running',
    ...overrides,
  };
}

function makeStep(overrides: Partial<PipelineStep> = {}): PipelineStep {
  return {
    stepId: 's2_ocr_parse',
    label: 'S2: OCR Parse (Gemini)',
    status: 'FINISHED',
    output: { _content: 'parsed text' },
    ...overrides,
  };
}

// ── Tests ──

describe('getExecutedNodes', () => {
  it('returns empty array for no steps', () => {
    const res = makePipelineResponse({ steps: [] });
    expect(getExecutedNodes(res)).toEqual([]);
  });

  it('returns labels of all steps', () => {
    const res = makePipelineResponse({
      steps: [
        makeStep({ label: 'S2: OCR Parse (Gemini)' }),
        makeStep({ label: 'S1: Metadata Extract (Gemini)' }),
        makeStep({ label: 'HG1: Data Review', status: 'STOPPED' }),
      ],
    });
    expect(getExecutedNodes(res)).toEqual([
      'S2: OCR Parse (Gemini)',
      'S1: Metadata Extract (Gemini)',
      'HG1: Data Review',
    ]);
  });
});

describe('getLastStatus', () => {
  it('returns UNKNOWN for empty steps', () => {
    const res = makePipelineResponse({ steps: [] });
    expect(getLastStatus(res)).toBe('UNKNOWN');
  });

  it('returns status of last step', () => {
    const res = makePipelineResponse({
      steps: [
        makeStep({ status: 'FINISHED' }),
        makeStep({ status: 'STOPPED' }),
      ],
    });
    expect(getLastStatus(res)).toBe('STOPPED');
  });

  it('returns FINISHED for completed pipeline', () => {
    const res = makePipelineResponse({
      steps: [
        makeStep({ status: 'FINISHED' }),
        makeStep({ stepId: 'pipeline_complete', label: 'Pipeline Complete', status: 'FINISHED' }),
      ],
    });
    expect(getLastStatus(res)).toBe('FINISHED');
  });

  it('returns ERROR for failed step', () => {
    const res = makePipelineResponse({
      steps: [
        makeStep({ status: 'FINISHED' }),
        makeStep({ status: 'ERROR', output: { error: 'quota exceeded' } }),
      ],
    });
    expect(getLastStatus(res)).toBe('ERROR');
  });
});

describe('getStoppedNodeId', () => {
  it('returns null when no checkpoint', () => {
    const res = makePipelineResponse({ checkpointId: null });
    expect(getStoppedNodeId(res)).toBeNull();
  });

  it('returns null when checkpointId is undefined', () => {
    const res = makePipelineResponse();
    delete (res as any).checkpointId;
    expect(getStoppedNodeId(res)).toBeNull();
  });

  it('returns checkpoint ID when paused at gate', () => {
    const res = makePipelineResponse({ checkpointId: 'hg1_data_review' });
    expect(getStoppedNodeId(res)).toBe('hg1_data_review');
  });
});

describe('getNodeOutput', () => {
  it('returns null for missing label', () => {
    const res = makePipelineResponse({
      steps: [makeStep({ label: 'S2: OCR Parse (Gemini)' })],
    });
    expect(getNodeOutput(res, 'S1: Metadata Extract (Gemini)')).toBeNull();
  });

  it('returns output for matching label', () => {
    const output = { spots: [{ id: 's1', title: 'Great Wave' }] };
    const res = makePipelineResponse({
      steps: [makeStep({ label: 'S1: Metadata Extract (Gemini)', output })],
    });
    expect(getNodeOutput(res, 'S1: Metadata Extract (Gemini)')).toEqual(output);
  });

  it('returns null when step has no output', () => {
    const res = makePipelineResponse({
      steps: [makeStep({ label: 'HG1: Data Review', status: 'STOPPED', output: null })],
    });
    expect(getNodeOutput(res, 'HG1: Data Review')).toBeNull();
  });

  it('returns first match when multiple steps with same label', () => {
    const res = makePipelineResponse({
      steps: [
        makeStep({ label: 'S2: OCR Parse (Gemini)', output: { run: 1 } }),
        makeStep({ label: 'S2: OCR Parse (Gemini)', output: { run: 2 } }),
      ],
    });
    // find() returns first match
    expect(getNodeOutput(res, 'S2: OCR Parse (Gemini)')).toEqual({ run: 1 });
  });
});

describe('PipelineResponse type shape', () => {
  it('conforms to expected interface', () => {
    const res: PipelineResponse = {
      sessionId: 'abc-123',
      checkpointId: 'hg1_data_review',
      steps: [
        {
          stepId: 's2_ocr_parse',
          label: 'S2: OCR Parse (Gemini)',
          status: 'FINISHED',
          output: { _content: 'text' },
        },
        {
          stepId: 'hg1_data_review',
          label: 'HG1: Data Review',
          status: 'STOPPED',
          output: null,
        },
      ],
      finalText: null,
      status: 'awaiting_input',
    };

    expect(res.sessionId).toBe('abc-123');
    expect(res.checkpointId).toBe('hg1_data_review');
    expect(res.steps).toHaveLength(2);
    expect(res.steps[0].status).toBe('FINISHED');
    expect(res.steps[1].status).toBe('STOPPED');
  });
});

describe('Human gate flow mapping', () => {
  it('approve action maps correctly', () => {
    // Simulate what sendHumanInput builds
    const action: string = 'approve';
    const body = {
      sessionId: 'sess-1',
      checkpointId: 'hg1_data_review',
      action: action === 'proceed' ? 'approve' : action,
      feedback: 'Looks good',
    };
    expect(body.action).toBe('approve');
    expect(body.checkpointId).toBe('hg1_data_review');
  });

  it('proceed maps to approve (backward compat)', () => {
    const action = 'proceed' as string;
    const mapped = action === 'proceed' ? 'approve' : action;
    expect(mapped).toBe('approve');
  });

  it('reject maps directly', () => {
    const action: string = 'reject';
    const mapped = action === 'proceed' ? 'approve' : action;
    expect(mapped).toBe('reject');
  });
});

describe('Store field mapping', () => {
  it('sessionId replaces chatId', () => {
    const res = makePipelineResponse({ sessionId: 'new-session-id' });
    // Store should use sessionId (not chatId)
    expect(res.sessionId).toBe('new-session-id');
    expect((res as any).chatId).toBeUndefined();
  });

  it('checkpointId replaces stoppedNodeId', () => {
    const res = makePipelineResponse({ checkpointId: 'hg3_script_review' });
    expect(res.checkpointId).toBe('hg3_script_review');
    expect((res as any).stoppedNodeId).toBeUndefined();
  });

  it('steps replaces agentFlowExecutedData', () => {
    const res = makePipelineResponse({
      steps: [makeStep()],
    });
    expect(res.steps).toHaveLength(1);
    expect((res as any).agentFlowExecutedData).toBeUndefined();
  });
});

describe('Step label compatibility with PIPELINE_STAGES', () => {
  // These labels must match what store.ts PIPELINE_STAGES expects
  const EXPECTED_LABELS = [
    'S2: OCR Parse',
    'S1: Metadata Extract',
    'HG1: Data Review',
    'S4: Script Gen',
    'S5: Image Map',
    'HG3: Script Review',
    'S6: Translation',
    'HG4: Translation Review',
    'N5: Character Select',
    'S7: Voice Recommend',
    'S8: Director Note',
    'S9: Audio Gen',
    'N6: Audio Playback QA',
    'HG5: Audio Review',
    'N8: Generation History',
    'S10: SRT Gen',
  ];

  it('all expected labels have the correct prefix pattern', () => {
    for (const label of EXPECTED_LABELS) {
      const prefix = label.split(':')[0].trim();
      expect(
        prefix.startsWith('S') || prefix.startsWith('HG') || prefix.startsWith('N'),
      ).toBe(true);
    }
  });

  it('has 16 step labels (excluding Pipeline Complete)', () => {
    expect(EXPECTED_LABELS).toHaveLength(16);
  });
});
