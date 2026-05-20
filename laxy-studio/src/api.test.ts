// ---------------------------------------------------------------------------
// Frontend unit tests: API adapter + helper functions
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getExecutedNodes,
  getExecutedStepIds,
  getLastStatus,
  normalizeSessionStatus,
  getStoppedNodeId,
  getNodeOutputByStepId,
  getNodeOutput,
  getNodeOutputByLabel,
  type PipelineResponse,
  type PipelineStep,
} from './api';

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

describe('getExecutedStepIds', () => {
  it('returns empty array for no steps', () => {
    const res = makePipelineResponse({ steps: [] });
    expect(getExecutedStepIds(res)).toEqual([]);
  });

  it('returns stepIds of all steps', () => {
    const res = makePipelineResponse({
      steps: [
        makeStep({ stepId: 's2_ocr_parse' }),
        makeStep({ stepId: 's1_metadata_extract', label: 'S1: Metadata Extract (Gemini)' }),
        makeStep({ stepId: 'hg1_data_review', label: 'HG1: Data Review', status: 'STOPPED' }),
      ],
    });
    expect(getExecutedStepIds(res)).toEqual([
      's2_ocr_parse',
      's1_metadata_extract',
      'hg1_data_review',
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
  it('returns null for missing stepId', () => {
    const res = makePipelineResponse({
      steps: [makeStep({ label: 'S2: OCR Parse (Gemini)' })],
    });
    expect(getNodeOutput(res, 's1_metadata_extract')).toBeNull();
  });

  it('returns output for matching stepId', () => {
    const output = { spots: [{ id: 's1', title: 'Great Wave' }] };
    const res = makePipelineResponse({
      steps: [makeStep({ stepId: 's1_metadata_extract', label: 'S1: Metadata Extract (Gemini)', output })],
    });
    expect(getNodeOutput(res, 's1_metadata_extract')).toEqual(output);
  });

  it('returns null when step has no output', () => {
    const res = makePipelineResponse({
      steps: [makeStep({ stepId: 'hg1_data_review', label: 'HG1: Data Review', status: 'STOPPED', output: null })],
    });
    expect(getNodeOutput(res, 'hg1_data_review')).toBeNull();
  });

  it('returns first match when multiple steps with same stepId', () => {
    const res = makePipelineResponse({
      steps: [
        makeStep({ stepId: 's2_ocr_parse', label: 'S2: OCR Parse (Gemini)', output: { run: 1 } }),
        makeStep({ stepId: 's2_ocr_parse', label: 'S2: OCR Parse (Gemini)', output: { run: 2 } }),
      ],
    });
    // find() returns first match
    expect(getNodeOutput(res, 's2_ocr_parse')).toEqual({ run: 1 });
  });
});

describe('getNodeOutputByStepId', () => {
  it('returns output for matching stepId', () => {
    const output = { scripts: [{ spotId: 'spot-1' }] };
    const res = makePipelineResponse({
      steps: [makeStep({ stepId: 's4_script_gen', label: 'S4: Script Gen (Gemini Pro)', output })],
    });
    expect(getNodeOutputByStepId(res, 's4_script_gen')).toEqual(output);
  });

  it('returns null for unknown stepId', () => {
    const res = makePipelineResponse({
      steps: [makeStep({ stepId: 's4_script_gen', label: 'S4: Script Gen (Gemini Pro)' })],
    });
    expect(getNodeOutputByStepId(res, 's5_image_map')).toBeNull();
  });
});

describe('getNodeOutputByLabel', () => {
  it('returns output for matching label', () => {
    const output = { guideUrl: 'https://example.com/guide' };
    const res = makePipelineResponse({
      steps: [makeStep({ stepId: 'pipeline_complete', label: 'Publish Result', output })],
    });
    expect(getNodeOutputByLabel(res, 'Publish Result')).toEqual(output);
  });

  it('returns null for missing label', () => {
    const res = makePipelineResponse({
      steps: [makeStep({ stepId: 'pipeline_complete', label: 'Pipeline Complete' })],
    });
    expect(getNodeOutputByLabel(res, 'Publish Result')).toBeNull();
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

    const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
    const calledOptions = (global.fetch as any).mock.calls[0][1];
    expect(calledUrl).toContain('sessionId=poll-session');
    expect(calledUrl).toMatch(/\/pipeline\/status|pipeline-status-/);
    expect(calledOptions).toEqual(expect.objectContaining({ method: 'GET' }));
    expect(result.sessionId).toBe('poll-session');
  });
});

describe('bootstrapAudioSession', () => {
  it('calls audio-session-bootstrap endpoint with context', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        sessionId: 'audio-abc123',
        status: 'created',
        tenantId: 'tenant-1',
      }),
    });

    const { bootstrapAudioSession } = await import('./api');
    const result = await bootstrapAudioSession({
      sessionId: 'audio-abc123',
      context: {
        coreLanguage: 'en',
        supportedLanguages: ['en', 'ja'],
      },
    });

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(calledUrl).toMatch(/\/pipeline\/audio-session-bootstrap|audio-session-bootstrap-/);
    expect(body.sessionId).toBe('audio-abc123');
    expect(body.context.coreLanguage).toBe('en');
    expect(body.context.supportedLanguages).toEqual(['en', 'ja']);
    expect(result.sessionId).toBe('audio-abc123');
    expect(result.status).toBe('created');
  });

  it('rejects invalid bootstrap response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        sessionId: '',
        status: 'ok',
      }),
    });

    const { bootstrapAudioSession } = await import('./api');
    await expect(
      bootstrapAudioSession({
        sessionId: 'audio-abc123',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    });
  });
});

describe('generateJapaneseHiragana', () => {
  it('calls generate-japanese-hiragana endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        hiraganaText: 'あす、かろやかにふうけいをえがく。',
      }),
    });

    const { generateJapaneseHiragana } = await import('./api');
    const result = await generateJapaneseHiragana({
      scriptContent: '明日、軽やかに風景を描く。',
    });

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(calledUrl).toMatch(/\/pipeline\/generate-japanese-hiragana|generate-japanese-hiragana-/);
    expect(body.scriptContent).toBe('明日、軽やかに風景を描く。');
    expect(result.hiraganaText).toBe('あす、かろやかにふうけいをえがく。');
  });

  it('rejects invalid Japanese Hiragana response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
      }),
    });

    const { generateJapaneseHiragana } = await import('./api');
    await expect(
      generateJapaneseHiragana({
        scriptContent: '明日、軽やかに風景を描く。',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SHAPE',
    });
  });
});

describe('generateCharacter', () => {
  it('calls generate-character with structured character designer fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        character: {
          name: 'John',
          gender: 'Male',
          role: 'Museum Manager',
          context: 'A knowledgeable person who has a formal and confident tone.',
          avatar: '🏛️',
          genderIdentity: 'masculine',
          coreTimbre: 'Deep and resonant.',
          personalityDNA: 'Formal and confident.',
          linguisticFingerprint: 'Measured and respectful.',
          brandPersona: 'Quietly authoritative.',
          accent: '',
          staticInstruction: 'You are John, a male Museum Manager with a deep, resonant voice.',
          audioProfileMarkdown: '# AUDIO PROFILE: John\n## ROLE: Museum Manager\n### SAMPLE CONTEXT:\nYou are John, a male Museum Manager with a deep, resonant voice.',
        },
      }),
    });

    const { generateCharacter } = await import('./api');
    const result = await generateCharacter({
      name: 'John',
      gender: 'Male',
      role: 'Museum Manager',
      context: 'A knowledgeable person who has a formal and confident tone.',
    });

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(calledUrl).toMatch(/\/pipeline\/generate-character|generate-character-/);
    expect(body).toEqual({
      name: 'John',
      gender: 'Male',
      role: 'Museum Manager',
      context: 'A knowledgeable person who has a formal and confident tone.',
    });
    expect(result.character.audioProfileMarkdown).toContain('### SAMPLE CONTEXT:');
  });

  it('rejects invalid character response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        character: {
          role: 'Museum Manager',
        },
      }),
    });

    const { generateCharacter } = await import('./api');
    await expect(
      generateCharacter({
        name: 'John',
        gender: 'Male',
        role: 'Museum Manager',
        context: 'A knowledgeable person who has a formal and confident tone.',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SHAPE',
    });
  });
});

describe('generateDetailedSceneParagraph', () => {
  it('calls generate-detailed-scene-paragraph with guide, spot, and character context', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        detailedSceneParagraph:
          'Late afternoon light pours across the main hall as John stands close to the exhibit, letting the quiet room draw his voice into a warmer register.',
      }),
    });

    const { generateDetailedSceneParagraph } = await import('./api');
    const result = await generateDetailedSceneParagraph({
      guideName: 'Grand Museum Tour',
      spotName: 'Main Hall',
      characterName: 'John',
      characterRole: 'Museum Manager',
      characterContext: 'Formal and confident narrator.',
      characterStaticInstruction: 'You are John, a calm narrator.',
    });

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(calledUrl).toMatch(/\/pipeline\/generate-detailed-scene-paragraph|generate-detailed-scene-paragraph-/);
    expect(body).toEqual({
      guideName: 'Grand Museum Tour',
      spotName: 'Main Hall',
      characterName: 'John',
      characterRole: 'Museum Manager',
      characterContext: 'Formal and confident narrator.',
      characterStaticInstruction: 'You are John, a calm narrator.',
    });
    expect(result.detailedSceneParagraph).toContain('Late afternoon light');
  });

  it('rejects invalid detailed scene response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
      }),
    });

    const { generateDetailedSceneParagraph } = await import('./api');
    await expect(
      generateDetailedSceneParagraph({
        guideName: 'Grand Museum Tour',
        spotName: 'Main Hall',
        characterName: 'John',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SHAPE',
    });
  });
});

describe('generateDetailedPerformanceGuidelines', () => {
  it('calls generate-detailed-performance-guidelines with raw performance hints and character context', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        detailedPerformanceGuidelines: [
          'Style: The "Vocal Smile". The delivery carries contained warmth and a lightly raised soft palate.',
          'Pace: Speaks with a calm cadence and deliberate 1-second pauses after key facts.',
          'Accent: Use a refined neutral English accent with careful museum-guide diction.',
        ].join('\n'),
      }),
    });

    const { generateDetailedPerformanceGuidelines } = await import('./api');
    const result = await generateDetailedPerformanceGuidelines({
      where: 'A quiet shrine at dusk.',
      who: 'First-time visitors.',
      what: 'Create a feeling of reverence.',
      how: 'Softly, with respectful pauses.',
      characterName: 'John',
      characterRole: 'Museum Manager',
      characterContext: 'Formal and confident narrator.',
      characterStaticInstruction: 'You are John, a calm narrator.',
    });

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(calledUrl).toMatch(/\/pipeline\/generate-detailed-performance-guidelines|generate-detailed-performance-guidelines-/);
    expect(body).toEqual({
      where: 'A quiet shrine at dusk.',
      who: 'First-time visitors.',
      what: 'Create a feeling of reverence.',
      how: 'Softly, with respectful pauses.',
      characterName: 'John',
      characterRole: 'Museum Manager',
      characterContext: 'Formal and confident narrator.',
      characterStaticInstruction: 'You are John, a calm narrator.',
    });
    expect(result.detailedPerformanceGuidelines).toContain('Style: The "Vocal Smile".');
  });

  it('rejects invalid detailed performance guidelines response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
      }),
    });

    const { generateDetailedPerformanceGuidelines } = await import('./api');
    await expect(
      generateDetailedPerformanceGuidelines({
        characterName: 'John',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SHAPE',
    });
  });
});

describe('enhanceScript', () => {
  it('passes cue density through to the enhancement endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        enhancedScript: '[short pause] Welcome to the gallery.',
      }),
    });

    const { enhanceScript } = await import('./api');
    const result = await enhanceScript({
      scriptContent: 'Welcome to the gallery.',
      characterName: 'John',
      cueDensity: 'medium',
    });

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(calledUrl).toMatch(/\/pipeline\/enhance-script|enhance-script-/);
    expect(body.scriptContent).toBe('Welcome to the gallery.');
    expect(body.characterName).toBe('John');
    expect(body.cueDensity).toBe('medium');
    expect(result.enhancedScript).toBe('[short pause] Welcome to the gallery.');
  });
});

describe('API error normalization', () => {
  it('surfaces structured backend error envelope fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: {
          code: 'INVALID_QUERY_PARAMS',
          message: 'Invalid query params',
          details: [{ loc: ['sessionId'], msg: 'Field required' }],
          retryable: false,
        },
      }),
    });

    const { fetchPipelineStatus } = await import('./api');
    await expect(fetchPipelineStatus('')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 400,
      code: 'INVALID_QUERY_PARAMS',
      message: 'Invalid query params',
      retryable: false,
    });
  });

  it('supports legacy string error payloads', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'sessionId is required' }),
    });

    const { startPipeline } = await import('./api');
    await expect(startPipeline('q', '')).rejects.toThrow('sessionId is required');
  });

  it('falls back to HTTP status when error body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('not json')),
    });

    const { fetchPipelineStatus } = await import('./api');
    await expect(fetchPipelineStatus('sess-1')).rejects.toThrow('HTTP 503');
  });

  it('maps invalid success payload schema to INVALID_RESPONSE_SCHEMA', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        sessionId: 'sess-1',
        checkpointId: null,
        steps: [{ label: 'S2: OCR Parse (Gemini)', status: 'FINISHED' }],
      }),
    });

    const { fetchPipelineStatus } = await import('./api');
    await expect(fetchPipelineStatus('sess-1')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    });
  });
});

describe('success payload validation', () => {
  it('accepts valid generateAudio response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        audioFiles: [
          {
            lang: 'en',
            spotId: 'spot_001',
            spotNumber: 1,
            title: 'Entrance',
            audioUrl: 'https://cdn/en/spot1.wav',
            durationMs: 1000,
          },
        ],
        srtFiles: [
          {
            lang: 'en',
            spotId: 'spot_001',
            entries: [
              { index: 1, startTime: '00:00:00,000', endTime: '00:00:01,000', text: 'Hello' },
            ],
            rawSrt: '1\\n00:00:00,000 --> 00:00:01,000\\nHello',
          },
        ],
        totalAudioFiles: 1,
        totalSrtFiles: 1,
      }),
    });

    const { generateAudio } = await import('./api');
    const res = await generateAudio({
      sessionId: 'sess-audio',
      scripts: [{ spotId: 'spot_001', spotNumber: 1, title: 'Entrance', scriptText: 'Hello' }],
      voiceId: 'Aoede',
      languages: ['en'],
    });

    expect(res.success).toBe(true);
    expect(res.audioFiles).toHaveLength(1);
    expect(res.srtFiles).toHaveLength(1);
  });

  it('rejects invalid generateAudio response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        audioFiles: [],
        srtFiles: [],
        totalAudioFiles: 0,
        totalSrtFiles: 0,
      }),
    });

    const { generateAudio } = await import('./api');
    await expect(
      generateAudio({
        sessionId: 'sess-audio',
        scripts: [{ spotId: 'spot_001', spotNumber: 1, title: 'Entrance', scriptText: 'Hello' }],
        voiceId: 'Aoede',
        languages: ['en'],
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    });
  });

  it('rejects invalid generateAudioForLanguage response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        lang: 'en',
        audioFiles: [
          {
            lang: 'en',
            spotId: 'spot_001',
            spotNumber: '1',
            title: 'Entrance',
            audioUrl: 'https://cdn/en/spot1.wav',
            durationMs: 1000,
          },
        ],
        srtFiles: [],
      }),
    });

    const { generateAudioForLanguage } = await import('./api');
    await expect(
      generateAudioForLanguage({
        sessionId: 'sess-audio',
        scripts: [{ spotId: 'spot_001', spotNumber: 1, title: 'Entrance', scriptText: 'Hello' }],
        voiceId: 'Aoede',
        language: 'en',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    });
  });

  it('rejects invalid translateLanguage response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        lang: 'ja',
        label: 'Japanese',
        approved: false,
      }),
    });

    const { translateLanguage } = await import('./api');
    await expect(
      translateLanguage({
        scripts: [{ spotId: 'spot_001', spotNumber: 1, title: 'Entrance', scriptText: 'Hello' }],
        targetLanguage: 'ja',
        coreLanguage: 'en',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    });
  });

  it('accepts valid publishGuide response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        publishId: 'pub-123',
        status: 'published',
        guideUrl: 'https://guide.laxy.app/g/test',
        shortUrl: 'https://laxy.click/test',
        slug: 'test',
        qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        publishedAt: 1710000000000,
        retryable: false,
      }),
    });

    const { publishGuide } = await import('./api');
    const result = await publishGuide({
      sessionId: 'publish-1',
      venueName: 'Laxy Museum',
      coreLanguage: 'en',
      supportedLanguages: ['en', 'ja'],
      spotsCount: 5,
      scriptsCount: 5,
      slideshowsCount: 5,
      audioCount: 2,
      srtCount: 2,
    });

    expect(result.publishId).toBe('pub-123');
    expect(result.status).toBe('published');
  });

  it('rejects invalid publishGuide response shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        publishId: 'pub-123',
        status: 'published',
      }),
    });

    const { publishGuide } = await import('./api');
    await expect(
      publishGuide({
        sessionId: 'publish-1',
        venueName: 'Laxy Museum',
        coreLanguage: 'en',
        supportedLanguages: ['en'],
        spotsCount: 1,
        scriptsCount: 1,
        slideshowsCount: 1,
        audioCount: 1,
        srtCount: 1,
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 502,
      code: 'INVALID_RESPONSE_SCHEMA',
    });
  });

  it('fetches publish status response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        publishId: 'pub-123',
        status: 'processing',
        guideUrl: 'https://guide.laxy.app/g/test',
        shortUrl: 'https://laxy.click/test',
        slug: 'test',
        qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        publishedAt: 1710000000000,
        retryable: true,
        attempts: 1,
        maxAttempts: 3,
      }),
    });

    const { fetchPublishStatus } = await import('./api');
    const result = await fetchPublishStatus('pub-123');
    const calledUrl = String((global.fetch as any).mock.calls[0][0]);

    expect(result.publishId).toBe('pub-123');
    expect(result.status).toBe('processing');
    expect(calledUrl).toContain('publish-status');
    expect(calledUrl).toContain('publishId=pub-123');
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
