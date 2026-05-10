import type { ContractPipelineResponse } from '../contracts/pipeline';
import type { AssetFile, SpotMetadata } from '../types/entity';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStepOutput(response: ContractPipelineResponse, stepId: string): unknown {
  const step = (response.steps ?? []).find((item) => item.stepId === stepId);
  return step?.output ?? null;
}

export function buildIngestionQuestion(
  assets: AssetFile[],
  selectedAssetIds: string[],
): string {
  const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));
  const assetSummary = selectedAssets
    .map((asset) => {
      const base = `- ${asset.name} (${asset.mimeType})`;
      if (asset.downloadUrl) return `${base}: ${asset.downloadUrl}`;
      if (asset.sourceUrl) return `${base}: ${asset.sourceUrl}`;
      return base;
    })
    .join('\n');

  return `Process the following ${selectedAssets.length} asset(s) for metadata extraction.\nCore language: Japanese\n\nAssets:\n${assetSummary}`;
}

export function validateIngestionAssets(
  assets: AssetFile[],
  selectedAssetIds: string[],
): string | null {
  const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));

  const pendingUploads = selectedAssets.filter(
    (asset) => asset.source === 'file' && asset.status !== 'done',
  );
  if (pendingUploads.length > 0) {
    return `${pendingUploads.length} file(s) still uploading. Please wait for uploads to finish.`;
  }

  const missingUrls = selectedAssets.filter(
    (asset) => asset.source === 'file' && !asset.downloadUrl,
  );
  if (missingUrls.length > 0) {
    return 'Some files failed to upload to storage. Please remove and re-add them.';
  }

  return null;
}

export type ParsedIngestionResponse =
  | {
    kind: 'success';
    spots: SpotMetadata[];
  }
  | {
    kind: 'error';
    message: string;
  };

export function parseIngestionPipelineResponse(args: {
  response: ContractPipelineResponse;
  selectedAssetIds: string[];
  now?: number;
}): ParsedIngestionResponse {
  const { response, selectedAssetIds } = args;
  const now = args.now ?? Date.now();

  const metadataOutput = getStepOutput(response, 's1_metadata_extract');
  let extractedSpots: SpotMetadata[] = [];

  if (isRecord(metadataOutput)) {
    const rawSpots = metadataOutput.spots ?? metadataOutput.items ?? (Array.isArray(metadataOutput) ? metadataOutput : null);
    if (Array.isArray(rawSpots)) {
      extractedSpots = rawSpots.map((rawSpot, idx) => {
        const raw = isRecord(rawSpot) ? rawSpot : {};
        return {
          id: typeof raw.id === 'string' && raw.id ? raw.id : `spot-${now}-${idx}`,
          spotNumber: idx + 1,
          title: typeof raw.title === 'string' ? raw.title : '',
          artist: typeof raw.artist === 'string' ? raw.artist : '',
          period: typeof raw.period === 'string' ? raw.period : '',
          material: typeof raw.material === 'string' ? raw.material : '',
          dimensions: typeof raw.dimensions === 'string' ? raw.dimensions : '',
          highlight: typeof raw.highlight === 'string' ? raw.highlight : '',
          culturalDesignation:
            (typeof raw.culturalDesignation === 'string' ? raw.culturalDesignation : undefined)
            ?? (typeof raw.cultural_designation === 'string' ? raw.cultural_designation : '')
            ?? '',
          sourceText: typeof raw.sourceText === 'string' ? raw.sourceText : undefined,
          assetIds: selectedAssetIds,
        };
      });
    }
  }

  const ocrOutput = getStepOutput(response, 's2_ocr_parse');
  let ocrText: string | undefined;
  if (typeof ocrOutput === 'string') {
    ocrText = ocrOutput;
  } else if (isRecord(ocrOutput)) {
    ocrText = (typeof ocrOutput.text === 'string' ? ocrOutput.text : undefined)
      ?? (typeof ocrOutput._content === 'string' ? ocrOutput._content : undefined);
  }

  const stepErrors = (response.steps ?? [])
    .filter((step) => step.status === 'ERROR' && step.output)
    .map((step) => {
      const output = isRecord(step.output) ? step.output : {};
      const message =
        (typeof output.error === 'string' ? output.error : undefined)
        ?? (typeof output.message === 'string' ? output.message : undefined)
        ?? 'Unknown step error';
      return `[${step.label}] ${message}`;
    });

  if (stepErrors.length > 0 && extractedSpots.length === 0) {
    return {
      kind: 'error',
      message: stepErrors.join('\n'),
    };
  }

  if (extractedSpots.length === 0 && ocrText) {
    extractedSpots = [{
      id: `spot-${now}-0`,
      spotNumber: 1,
      title: 'Untitled',
      artist: '',
      period: '',
      material: '',
      dimensions: '',
      highlight: '',
      culturalDesignation: '',
      sourceText: ocrText,
      assetIds: selectedAssetIds,
    }];
  }

  if (extractedSpots.length === 0) {
    if (response.status === 'error') {
      return {
        kind: 'error',
        message: response.finalText ?? 'Pipeline returned an error with no details.',
      };
    }
    return {
      kind: 'error',
      message: 'AI could not extract any metadata from the uploaded content. Please check your files and try again.',
    };
  }

  return {
    kind: 'success',
    spots: extractedSpots,
  };
}