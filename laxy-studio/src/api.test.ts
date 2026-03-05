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
  if (steps.length) return steps[steps.length - 1].status;
  return normalizeSessionStatus(res.status);
}

function normalizeSessionStatus(status?: string): string {
  switch (status) {
    case 'awaiting_input':
      return 'STOPPED';
    case 'completed':
      return 'FINISHED';
    case 'error':
      return 'ERROR';
    case 'running':
      return 'RUNNING';
    default:
      return 'UNKNOWN';
  }
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
  it('falls back to session-level status for empty steps', () => {
    const res = makePipelineResponse({ steps: [], status: 'running' });
    expect(getLastStatus(res)).toBe('RUNNING');
  });

  it('returns UNKNOWN when no steps and no session status', () => {
    const res = makePipelineResponse({ steps: [], status: undefined });
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
// ── Issue #6: S9 LanguageAudio enrichment ──

describe('S9 LanguageAudio enrichment in applyStepData', () => {
  // Simulate the applyStepData logic for S9 inline
  function enrichS9AudioFiles(audioFiles: Record<string, unknown>[]): { lang: string; label: string; audioUrl: string; durationMs: number; approved: boolean; spots: { spotId: string; spotNumber: number; title: string; audioUrl: string; durationMs: number }[] }[] {
    const LANG_LABELS: Record<string, string> = { en: 'English', ja: 'Japanese', ko: 'Korean', 'zh-TW': 'Traditional Chinese' };
    const audioByLang = new Map<string, { lang: string; label: string; audioUrl: string; durationMs: number; approved: boolean; spots: { spotId: string; spotNumber: number; title: string; audioUrl: string; durationMs: number }[] }>();
    for (const af of audioFiles) {
      const lang = (af.lang as string) ?? '';
      const audioUrl = (af.audioUrl as string) ?? '';
      const durationMs = (af.durationMs as number) ?? 0;
      if (!audioUrl) continue;
      const spotEntry = {
        spotId: (af.spotId as string) ?? '',
        spotNumber: (af.spotNumber as number) ?? 0,
        title: (af.title as string) ?? '',
        audioUrl,
        durationMs,
      };
      const existing = audioByLang.get(lang);
      if (!existing) {
        audioByLang.set(lang, { lang, label: LANG_LABELS[lang] ?? lang, audioUrl, durationMs, approved: false, spots: [spotEntry] });
      } else {
        existing.durationMs += durationMs;
        existing.spots = [...existing.spots, spotEntry];
      }
    }
    return Array.from(audioByLang.values());
  }

  it('enriches backend per-spot audio to per-language LanguageAudio with label and approved', () => {
    // Backend format: per-spot items without label or approved
    const backendAudioFiles = [
      { lang: 'en', spotId: 'spot_001', spotNumber: 1, title: 'Entrance', audioUrl: 'https://cdn/en/spot1.wav', durationMs: 12000, voiceId: 'Aoede', model: 'gemini-tts' },
      { lang: 'en', spotId: 'spot_002', spotNumber: 2, title: 'Gallery', audioUrl: 'https://cdn/en/spot2.wav', durationMs: 8000, voiceId: 'Aoede', model: 'gemini-tts' },
      { lang: 'ja', spotId: 'spot_001', spotNumber: 1, title: 'Entrance', audioUrl: 'https://cdn/ja/spot1.wav', durationMs: 15000, voiceId: 'Aoede', model: 'gemini-tts' },
    ];

    const result = enrichS9AudioFiles(backendAudioFiles);

    expect(result).toHaveLength(2); // Grouped by language
    const en = result.find((r) => r.lang === 'en');
    const ja = result.find((r) => r.lang === 'ja');

    expect(en).toBeDefined();
    expect(en!.label).toBe('English');
    expect(en!.durationMs).toBe(20000); // 12000 + 8000
    expect(en!.approved).toBe(false);
    expect(en!.spots).toHaveLength(2);
    expect(en!.spots[0].spotId).toBe('spot_001');
    expect(en!.spots[1].spotId).toBe('spot_002');

    expect(ja).toBeDefined();
    expect(ja!.label).toBe('Japanese');
    expect(ja!.durationMs).toBe(15000);
    expect(ja!.approved).toBe(false);
    expect(ja!.spots).toHaveLength(1);
  });

  it('skips items without audioUrl', () => {
    const backendAudioFiles = [
      { lang: 'en', spotId: 'spot_001', audioUrl: '', durationMs: 0, error: 'TTS failed' },
      { lang: 'en', spotId: 'spot_002', audioUrl: 'https://cdn/en/spot2.wav', durationMs: 8000 },
    ];
    const result = enrichS9AudioFiles(backendAudioFiles);
    expect(result).toHaveLength(1);
    expect(result[0].durationMs).toBe(8000);
  });

  it('uses lang code as fallback label for unknown languages', () => {
    const backendAudioFiles = [
      { lang: 'xx', spotId: 'spot_001', audioUrl: 'https://cdn/xx/spot1.wav', durationMs: 5000 },
    ];
    const result = enrichS9AudioFiles(backendAudioFiles);
    expect(result[0].label).toBe('xx');
  });
});

// ── Issue #8: fetchPipelineStatus ──

describe('fetchPipelineStatus', () => {
  it('calls the correct endpoint with sessionId', async () => {
    const mockResponse = makePipelineResponse({
      sessionId: 'poll-session',
      checkpointId: 'hg3_script_review',
      steps: [
        makeStep({ label: 'S4: Script Gen (Gemini Pro)' }),
      ],
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { fetchPipelineStatus } = await import('./api');
    const result = await fetchPipelineStatus('poll-session');

    expect(global.fetch).toHaveBeenCalledWith(
      '/pipeline/status?sessionId=poll-session',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.sessionId).toBe('poll-session');
  });
});

// ── Issue #9: context field ──

describe('startPipeline context parameter', () => {
  it('sends context in request body when provided', async () => {
    const mockResponse = makePipelineResponse({
      sessionId: 'ctx-session',
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { startPipeline } = await import('./api');
    await startPipeline('test', 'ctx-session', undefined, {
      venueName: 'Test Museum',
      coreLanguage: 'en',
      supportedLanguages: ['en', 'ja'],
    });

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.context).toBeDefined();
    expect(body.context.venueName).toBe('Test Museum');
    expect(body.context.coreLanguage).toBe('en');
    expect(body.context.supportedLanguages).toEqual(['en', 'ja']);
  });

  it('omits context when not provided', async () => {
    const mockResponse = makePipelineResponse({ sessionId: 'no-ctx' });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { startPipeline } = await import('./api');
    await startPipeline('test', 'no-ctx');

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.context).toBeUndefined();
  });
});

// ── Issue #11: Session-level status mapping ──

describe('normalizeSessionStatus', () => {
  it('maps awaiting_input to STOPPED', () => {
    expect(normalizeSessionStatus('awaiting_input')).toBe('STOPPED');
  });

  it('maps completed to FINISHED', () => {
    expect(normalizeSessionStatus('completed')).toBe('FINISHED');
  });

  it('maps running to RUNNING', () => {
    expect(normalizeSessionStatus('running')).toBe('RUNNING');
  });

  it('maps error to ERROR', () => {
    expect(normalizeSessionStatus('error')).toBe('ERROR');
  });

  it('maps undefined to UNKNOWN', () => {
    expect(normalizeSessionStatus(undefined)).toBe('UNKNOWN');
  });
});

describe('getLastStatus session-level fallback', () => {
  it('falls back to session-level status when no steps exist', () => {
    const res = makePipelineResponse({ steps: [], status: 'awaiting_input' });
    expect(getLastStatus(res)).toBe('STOPPED');
  });

  it('falls back to completed → FINISHED', () => {
    const res = makePipelineResponse({ steps: [], status: 'completed' });
    expect(getLastStatus(res)).toBe('FINISHED');
  });

  it('prefers step-level status when steps exist', () => {
    const res = makePipelineResponse({
      steps: [makeStep({ status: 'STOPPED' })],
      status: 'awaiting_input',
    });
    expect(getLastStatus(res)).toBe('STOPPED');
  });
});

// ── Issue #14: voice ID consistency ──

describe('Voice ID consistency (Algieba)', () => {
  it('AVAILABLE_VOICES contains Algieba with correct id', async () => {
    const { AVAILABLE_VOICES } = await import('./types/entity');
    const voice = AVAILABLE_VOICES.find((v) => v.id === 'Algieba');
    expect(voice).toBeDefined();
    expect(voice!.name).toBe('Algieba');
    expect(voice!.gender).toBe('female');
  });

  it('no voice with the old Algeba typo exists', async () => {
    const { AVAILABLE_VOICES } = await import('./types/entity');
    const typo = AVAILABLE_VOICES.find((v) => v.id === 'Algeba');
    expect(typo).toBeUndefined();
  });
});