import { describe, expect, it } from 'vitest';
import {
  buildScriptGateApprovalPayload,
  buildScriptQuestion,
  parseScriptPipelineResponse,
} from './scriptWorkflow';

describe('script workflow', () => {
  it('builds script question from approved spots', () => {
    const question = buildScriptQuestion(
      [
        {
          id: 'spot-1',
          spotNumber: 1,
          title: 'Entrance',
          artist: 'Unknown',
          period: '',
          material: '',
          dimensions: '',
          highlight: '',
          culturalDesignation: '',
          assetIds: [],
        },
      ],
      'en',
    );

    expect(question).toContain('Generate audio guide scripts');
    expect(question).toContain('Core language: en');
    expect(question).toContain('Spot #1');
  });

  it('parses scripts and image mappings from response', () => {
    const parsed = parseScriptPipelineResponse(
      {
        apiVersion: 'v1',
        sessionId: 'sess-1',
        steps: [
          {
            stepId: 's4_script_gen',
            label: 'S4: Script Gen (Gemini Pro)',
            status: 'FINISHED',
            output: {
              scripts: [
                {
                  spotId: 'spot-1',
                  spotNumber: 1,
                  title: 'Entrance',
                  variants: {
                    professional: 'Professional script',
                  },
                },
              ],
            },
          },
          {
            stepId: 's5_image_map',
            label: 'S5: Image Map (Gemini)',
            status: 'FINISHED',
            output: {
              mappings: [
                {
                  spotId: 'spot-1',
                  suggestedImages: ['asset-a', 'asset-b'],
                },
              ],
            },
          },
        ],
        status: 'awaiting_input',
      },
      [
        {
          id: 'spot-1',
          spotNumber: 1,
          title: 'Entrance',
          artist: '',
          period: '',
          material: '',
          dimensions: '',
          highlight: '',
          culturalDesignation: '',
          assetIds: [],
        },
      ],
    );

    expect(parsed.error).toBeUndefined();
    expect(parsed.scripts).toHaveLength(1);
    expect(parsed.scripts[0].scriptText).toBe('Professional script');
    expect(parsed.imageMappings[0].assignedAssetIds).toEqual(['asset-a', 'asset-b']);
  });

  it('returns parser error when no scripts are present', () => {
    const parsed = parseScriptPipelineResponse(
      {
        apiVersion: 'v1',
        sessionId: 'sess-2',
        steps: [],
        status: 'running',
      },
      [],
    );

    expect(parsed.error).toBe('AI did not return any scripts. Please check the pipeline logs and try again.');
    expect(parsed.scripts).toEqual([]);
  });

  it('builds gate approval payload from script review state', () => {
    const payload = buildScriptGateApprovalPayload([
      {
        spotId: 'spot-1',
        spotNumber: 1,
        title: 'Entrance',
        scriptText: 'Text A',
        approved: true,
        fastTrack: true,
      },
      {
        spotId: 'spot-2',
        spotNumber: 2,
        title: 'Gallery',
        scriptText: 'Text B',
        approved: false,
        fastTrack: false,
      },
    ]);

    expect(payload.approvedSpots).toEqual(['spot-1']);
    expect(payload.rejectedSpots).toEqual(['spot-2']);
    expect(payload.fastTrackSpots).toEqual(['spot-1']);
    expect(payload.editedScripts).toEqual([
      { spotId: 'spot-1', scriptText: 'Text A' },
      { spotId: 'spot-2', scriptText: 'Text B' },
    ]);
  });
});