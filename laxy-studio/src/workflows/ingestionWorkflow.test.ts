import { describe, expect, it } from 'vitest';
import {
  buildIngestionQuestion,
  parseIngestionPipelineResponse,
  validateIngestionAssets,
} from './ingestionWorkflow';

describe('ingestion workflow', () => {
  it('builds ingestion question with selected assets', () => {
    const question = buildIngestionQuestion(
      [
        {
          id: 'a1',
          name: 'catalog.pdf',
          mimeType: 'application/pdf',
          fileType: 'pdf',
          size: 100,
          source: 'file',
          status: 'done',
          addedAt: 1,
          downloadUrl: 'https://cdn/catalog.pdf',
        },
        {
          id: 'a2',
          name: 'notes.txt',
          mimeType: 'text/plain',
          fileType: 'pdf',
          size: 20,
          source: 'text',
          status: 'done',
          addedAt: 2,
        },
      ],
      ['a1'],
    );

    expect(question).toContain('Process the following 1 asset(s)');
    expect(question).toContain('catalog.pdf');
    expect(question).toContain('https://cdn/catalog.pdf');
  });

  it('returns validation error when selected file uploads are pending', () => {
    const message = validateIngestionAssets(
      [
        {
          id: 'a1',
          name: 'image.png',
          mimeType: 'image/png',
          fileType: 'image',
          size: 120,
          source: 'file',
          status: 'uploading',
          addedAt: 1,
        },
      ],
      ['a1'],
    );

    expect(message).toContain('still uploading');
  });

  it('parses extracted spots from metadata node output', () => {
    const parsed = parseIngestionPipelineResponse({
      response: {
        apiVersion: 'v1',
        sessionId: 'sess-1',
        steps: [
          {
            stepId: 's1_metadata_extract',
            label: 'S1: Metadata Extract (Gemini)',
            status: 'FINISHED',
            output: {
              spots: [{ id: 'spot-1', title: 'Entrance', artist: 'Team' }],
            },
          },
        ],
        status: 'running',
      },
      selectedAssetIds: ['asset-1'],
      now: 123,
    });

    expect(parsed.kind).toBe('success');
    if (parsed.kind === 'success') {
      expect(parsed.spots).toHaveLength(1);
      expect(parsed.spots[0].id).toBe('spot-1');
      expect(parsed.spots[0].assetIds).toEqual(['asset-1']);
    }
  });

  it('falls back to OCR text when metadata extraction returns no spots', () => {
    const parsed = parseIngestionPipelineResponse({
      response: {
        apiVersion: 'v1',
        sessionId: 'sess-2',
        steps: [
          {
            stepId: 's2_ocr_parse',
            label: 'S2: OCR Parse (Gemini)',
            status: 'FINISHED',
            output: { text: 'Recovered OCR text' },
          },
        ],
        status: 'running',
      },
      selectedAssetIds: ['asset-1'],
      now: 456,
    });

    expect(parsed.kind).toBe('success');
    if (parsed.kind === 'success') {
      expect(parsed.spots[0].sourceText).toBe('Recovered OCR text');
      expect(parsed.spots[0].id).toBe('spot-456-0');
    }
  });

  it('returns error message when extraction fails with step errors', () => {
    const parsed = parseIngestionPipelineResponse({
      response: {
        apiVersion: 'v1',
        sessionId: 'sess-3',
        steps: [
          {
            stepId: 's1_metadata_extract',
            label: 'S1: Metadata Extract (Gemini)',
            status: 'ERROR',
            output: { error: 'metadata failed' },
          },
        ],
        status: 'error',
      },
      selectedAssetIds: [],
      now: 789,
    });

    expect(parsed).toEqual({
      kind: 'error',
      message: '[S1: Metadata Extract (Gemini)] metadata failed',
    });
  });
});