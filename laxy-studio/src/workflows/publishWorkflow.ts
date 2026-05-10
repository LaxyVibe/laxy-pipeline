import type { ContractPipelineResponse } from '../contracts/pipeline';
import type {
  EntityConfig,
  LanguageAudio,
  SpotImageMapping,
  SpotMetadata,
  SpotSlideshow,
  SlideshowImage,
} from '../types/entity';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStepOutput(response: ContractPipelineResponse, stepId: string): unknown {
  const step = (response.steps ?? []).find((item) => item.stepId === stepId);
  return step?.output ?? null;
}

export function buildInitialSlideshows(args: {
  spots: SpotMetadata[];
  imageMappings: SpotImageMapping[];
  audioFiles: LanguageAudio[];
  coreLanguage: string;
}): SpotSlideshow[] {
  const { spots, imageMappings, audioFiles, coreLanguage } = args;
  const hasCoreAudio = audioFiles.some((audio) => audio.lang === coreLanguage);

  return spots.map((spot, idx) => {
    const mapping = imageMappings.find((item) => item.spotId === spot.id);
    const audioDuration = hasCoreAudio ? 30 : 15;

    const images: SlideshowImage[] = (mapping?.assignedAssetIds ?? []).map(
      (assetId: string, imageIndex: number) => ({
        assetId,
        order: imageIndex,
        startSec: 0,
        durationSec: 0,
        caption: '',
      }),
    );

    if (images.length > 0) {
      const perImage = audioDuration / images.length;
      images.forEach((image, imageIndex) => {
        image.startSec = parseFloat((imageIndex * perImage).toFixed(2));
        image.durationSec = parseFloat(perImage.toFixed(2));
      });
    }

    return {
      spotId: spot.id,
      spotNumber: spot.spotNumber ?? idx + 1,
      title: spot.title,
      audioDurationSec: audioDuration,
      images,
    };
  });
}

export function isPublishReady(args: {
  ingestionStatus: string;
  scriptStatus: string;
  translationStatus: string;
  audioStatus: string;
  supportedLanguages: string[];
  srtCount: number;
  slideshows: SpotSlideshow[];
}): boolean {
  const {
    ingestionStatus,
    scriptStatus,
    translationStatus,
    audioStatus,
    supportedLanguages,
    srtCount,
    slideshows,
  } = args;

  const ingestionOk = ingestionStatus === 'approved';
  const scriptOk = scriptStatus === 'approved';
  const audioOk = audioStatus === 'approved';
  const srtOk = srtCount > 0;
  const slideshowOk = slideshows.length > 0 && slideshows.every((slideshow) => slideshow.images.length > 0);
  const translationOk = supportedLanguages.length <= 1 || translationStatus === 'approved';

  return ingestionOk && scriptOk && translationOk && audioOk && srtOk && slideshowOk;
}

export function buildPublishQuestion(args: {
  spots: SpotMetadata[];
  imageMappings: SpotImageMapping[];
  scripts: Array<{ spotId: string }>;
  audioCount: number;
  srtCount: number;
  slideshowsCount: number;
  customSlug: string;
  entityConfig: EntityConfig;
}): string {
  const {
    spots,
    imageMappings,
    scripts,
    audioCount,
    srtCount,
    slideshowsCount,
    customSlug,
    entityConfig,
  } = args;

  const spotSummary = spots
    .map(
      (spot, index) =>
        `Spot ${index + 1}: "${spot.title}" — `
        + `${imageMappings.find((mapping) => mapping.spotId === spot.id)?.assignedAssetIds.length ?? 0} images, `
        + `script ${scripts.find((script) => script.spotId === spot.id) ? 'ready' : 'missing'}`,
    )
    .join('\n');

  return [
    `[PUBLISH] Guide "${entityConfig.venueName}"`,
    `Venue: ${entityConfig.venueName}`,
    `Languages: ${entityConfig.coreLanguage}${(entityConfig.supportedLanguages ?? []).length > 0 ? ', ' + entityConfig.supportedLanguages.join(', ') : ''}`,
    `Spots (${spots.length}):`,
    spotSummary,
    `Audio files: ${audioCount}`,
    `SRT files: ${srtCount}`,
    `Slideshows configured: ${slideshowsCount}`,
    customSlug ? `Custom slug: ${customSlug}` : '',
    '',
    'Bundle and publish this guide to CDN. Generate QR code and shortlink.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPublishSessionId(
  venueName: string,
  now: number = Date.now(),
): string {
  return `publish-${venueName || 'guide'}-${now}`;
}

export function parsePublishPipelineResult(
  response: ContractPipelineResponse,
): {
  guideUrl: string;
  shortUrl: string;
  slug: string;
} {
  let guideUrl = '';
  let shortUrl = '';
  let slug = '';

  const pipelineCompleteOutput = getStepOutput(response, 'pipeline_complete');
  if (isRecord(pipelineCompleteOutput)) {
    guideUrl = typeof pipelineCompleteOutput.guideUrl === 'string' ? pipelineCompleteOutput.guideUrl : '';
    shortUrl = typeof pipelineCompleteOutput.shortUrl === 'string' ? pipelineCompleteOutput.shortUrl : '';
    slug = typeof pipelineCompleteOutput.slug === 'string' ? pipelineCompleteOutput.slug : '';
  }

  if (!guideUrl) {
    const labelOutput = (response.steps ?? [])
      .find((step) => step.label === 'Publish Result')
      ?.output;
    if (isRecord(labelOutput)) {
      guideUrl = typeof labelOutput.guideUrl === 'string' ? labelOutput.guideUrl : '';
      shortUrl = typeof labelOutput.shortUrl === 'string' ? labelOutput.shortUrl : shortUrl;
      slug = typeof labelOutput.slug === 'string' ? labelOutput.slug : slug;
    }
  }

  if (!guideUrl && response.finalText) {
    try {
      const parsed = JSON.parse(response.finalText) as Record<string, unknown>;
      guideUrl = typeof parsed.guideUrl === 'string'
        ? parsed.guideUrl
        : typeof parsed.url === 'string'
          ? parsed.url
          : '';
      shortUrl = typeof parsed.shortUrl === 'string' ? parsed.shortUrl : shortUrl;
      slug = typeof parsed.slug === 'string' ? parsed.slug : slug;
    } catch {
      guideUrl = response.finalText.includes('http') ? response.finalText.trim() : '';
    }
  }

  return { guideUrl, shortUrl, slug };
}

export function derivePublishSlug(args: {
  pipelineSlug?: string;
  customSlug?: string;
  venueName?: string;
}): string {
  const { pipelineSlug, customSlug, venueName } = args;
  if (pipelineSlug) return pipelineSlug;
  if (customSlug) return customSlug;

  return (venueName || 'guide')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}