import type { ContractPipelineResponse } from '../contracts/pipeline';
import type { SpotImageMapping, SpotMetadata, SpotScript } from '../types/entity';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStepOutput(response: ContractPipelineResponse, stepId: string): unknown {
  const step = (response.steps ?? []).find((item) => item.stepId === stepId);
  return step?.output ?? null;
}

export function buildScriptQuestion(
  spots: SpotMetadata[],
  coreLanguage: string,
): string {
  const spotsSummary = spots
    .map(
      (spot) =>
        `Spot #${spot.spotNumber}: "${spot.title}" by ${spot.artist || 'Unknown'} (${spot.period || 'Unknown period'})`
        + `\n  Material: ${spot.material || 'N/A'}`
        + `\n  Dimensions: ${spot.dimensions || 'N/A'}`
        + `\n  Highlight: ${spot.highlight || 'N/A'}`
        + `\n  Cultural Designation: ${spot.culturalDesignation || 'N/A'}`,
    )
    .join('\n\n');

  return (
    `Generate audio guide scripts for the following ${spots.length} approved spots.\n`
    + `Core language: ${coreLanguage}\n\n`
    + `Approved Metadata:\n${spotsSummary}`
  );
}

export function buildScriptGateApprovalPayload(scripts: SpotScript[]): {
  approvedSpots: string[];
  rejectedSpots: string[];
  fastTrackSpots: string[];
  editedScripts: Array<{ spotId: string; scriptText: string }>;
} {
  return {
    approvedSpots: scripts.filter((script) => script.approved).map((script) => script.spotId),
    rejectedSpots: scripts.filter((script) => !script.approved).map((script) => script.spotId),
    fastTrackSpots: scripts.filter((script) => script.fastTrack).map((script) => script.spotId),
    editedScripts: scripts.map((script) => ({
      spotId: script.spotId,
      scriptText: script.scriptText,
    })),
  };
}

export type ParsedScriptResponse = {
  scripts: SpotScript[];
  imageMappings: SpotImageMapping[];
  error?: string;
};

export function parseScriptPipelineResponse(
  response: ContractPipelineResponse,
  spots: SpotMetadata[],
): ParsedScriptResponse {
  const scriptOutput = getStepOutput(response, 's4_script_gen');
  const imageMapOutput = getStepOutput(response, 's5_image_map');

  let extractedScripts: SpotScript[] = [];
  let extractedMappings: SpotImageMapping[] = [];

  if (isRecord(scriptOutput)) {
    const rawScripts = scriptOutput.scripts ?? scriptOutput.spots ?? (Array.isArray(scriptOutput) ? scriptOutput : null);
    if (Array.isArray(rawScripts)) {
      extractedScripts = rawScripts.map((rawScript, idx) => {
        const raw = isRecord(rawScript) ? rawScript : {};
        let text =
          (typeof raw.scriptText === 'string' ? raw.scriptText : undefined)
          ?? (typeof raw.script === 'string' ? raw.script : undefined)
          ?? (typeof raw.text === 'string' ? raw.text : undefined)
          ?? '';

        if (!text && isRecord(raw.variants)) {
          const variants = raw.variants;
          text =
            (typeof variants.professional === 'string' ? variants.professional : undefined)
            ?? (typeof variants.academic === 'string' ? variants.academic : undefined)
            ?? (typeof variants.quick === 'string' ? variants.quick : undefined)
            ?? (typeof variants.kids === 'string' ? variants.kids : undefined)
            ?? (typeof variants.brief === 'string' ? variants.brief : undefined)
            ?? '';
        }

        return {
          spotId:
            (typeof raw.spotId === 'string' ? raw.spotId : undefined)
            ?? (typeof raw.id === 'string' ? raw.id : undefined)
            ?? spots[idx]?.id
            ?? `spot-${idx}`,
          spotNumber: typeof raw.spotNumber === 'number' ? raw.spotNumber : idx + 1,
          title: (typeof raw.title === 'string' ? raw.title : undefined) ?? spots[idx]?.title ?? `Spot ${idx + 1}`,
          scriptText: text,
          approved: false,
          fastTrack: false,
        };
      });
    }
  }

  if (isRecord(imageMapOutput)) {
    const rawMappings =
      imageMapOutput.mappings
      ?? imageMapOutput.spots
      ?? (Array.isArray(imageMapOutput) ? imageMapOutput : null);

    if (Array.isArray(rawMappings)) {
      extractedMappings = rawMappings.map((rawMapping, idx) => {
        const raw = isRecord(rawMapping) ? rawMapping : {};
        return {
          spotId: (typeof raw.spotId === 'string' ? raw.spotId : undefined) ?? spots[idx]?.id ?? `spot-${idx}`,
          assignedAssetIds: Array.isArray(raw.suggestedImages)
            ? raw.suggestedImages.filter((value): value is string => typeof value === 'string')
            : Array.isArray(raw.assetIds)
              ? raw.assetIds.filter((value): value is string => typeof value === 'string')
              : [],
          aiSuggested: true,
        };
      });
    }
  }

  if (extractedScripts.length === 0) {
    return {
      scripts: [],
      imageMappings: extractedMappings,
      error: 'AI did not return any scripts. Please check the pipeline logs and try again.',
    };
  }

  return {
    scripts: extractedScripts,
    imageMappings: extractedMappings,
  };
}