import {
  langLabel,
  type DirectorNote,
  type LanguageAudio,
  type LanguageSRT,
  type LanguageTranslation,
  type SpotImageMapping,
  type SpotMetadata,
  type SpotScript,
} from '../../types/entity';
import type { GuidesStore } from '../../guidesStore';

type GuidesStoreSetter = (
  partial:
    | Partial<GuidesStore>
    | ((state: GuidesStore) => Partial<GuidesStore>),
) => void;

type GuidesStoreGetter = () => GuidesStore;

export function applyPipelineStepData(
  set: GuidesStoreSetter,
  get: GuidesStoreGetter,
  stepId: string,
  data: unknown,
): void {
  const parsed = data as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') return;

  set({ lastPipelineResponseAt: Date.now(), syncStatus: 'synced' });

  switch (stepId) {
    case 's1_metadata_extract': {
      const spots = (parsed as { spots?: SpotMetadata[] }).spots;
      if (Array.isArray(spots)) {
        const patch: Record<string, unknown> = { spots, isDirty: true };
        if (get().ingestionStatus !== 'approved') {
          patch.ingestionStatus = 'review';
        }
        set(patch as Partial<GuidesStore>);
      }
      break;
    }
    case 's4_script_gen': {
      const rawScripts = (parsed as { scripts?: Record<string, unknown>[] }).scripts;
      if (Array.isArray(rawScripts)) {
        const mapped: SpotScript[] = rawScripts.map((raw, idx) => {
          let text = (raw.scriptText as string) ?? '';
          if (!text && typeof raw.variants === 'object' && raw.variants !== null) {
            const variants = raw.variants as Record<string, string>;
            text = variants.professional ?? variants.academic ?? variants.quick ?? variants.kids ?? variants.brief ?? '';
          }
          return {
            spotId: (raw.spotId as string) ?? `spot-${idx}`,
            spotNumber: (raw.spotNumber as number) ?? idx + 1,
            title: (raw.title as string) ?? `Spot ${idx + 1}`,
            scriptText: text,
            approved: false,
            fastTrack: false,
          };
        });
        const patch: Record<string, unknown> = { scripts: mapped, isDirty: true };
        if (get().scriptStatus !== 'approved') {
          patch.scriptStatus = 'review';
        }
        set(patch as Partial<GuidesStore>);
      }
      break;
    }
    case 's5_image_map': {
      const mappings = parsed as { mappings?: SpotImageMapping[] };
      if (Array.isArray(mappings.mappings)) {
        set({ imageMappings: mappings.mappings, isDirty: true });
      }
      break;
    }
    case 's6_translation': {
      const rawTranslations = (parsed as { translations?: Record<string, unknown>[] }).translations;
      if (Array.isArray(rawTranslations)) {
        const firstItem = rawTranslations[0];
        const isSpotFirst =
          firstItem
          && typeof firstItem.translations === 'object'
          && !Array.isArray(firstItem.translations)
          && !firstItem.lang;

        if (isSpotFirst) {
          const scriptsBySpotId = new Map<string, string>(
            get().scripts.map((script) => [script.spotId, script.scriptText]),
          );
          const langMap = new Map<string, {
            spotId: string;
            spotNumber: number;
            title: string;
            originalText: string;
            translatedText: string;
          }[]>();

          rawTranslations.forEach((item, idx) => {
            const spotId = (item.spotId as string) ?? `spot-${idx}`;
            const spotNumber = (item.spotNumber as number) ?? idx + 1;
            const title = (item.title as string) ?? `Spot ${idx + 1}`;
            const originalText = scriptsBySpotId.get(spotId) ?? '';
            const translations = item.translations as Record<string, string> | undefined;

            if (translations && typeof translations === 'object') {
              for (const [lang, text] of Object.entries(translations)) {
                if (!langMap.has(lang)) langMap.set(lang, []);
                langMap.get(lang)!.push({
                  spotId,
                  spotNumber,
                  title,
                  originalText,
                  translatedText: String(text),
                });
              }
            }
          });

          const pivoted: LanguageTranslation[] = Array.from(langMap.entries()).map(([lang, spots]) => ({
            lang,
            label: langLabel(lang),
            spots,
            approved: false,
          }));

          const patch: Record<string, unknown> = { translations: pivoted, isDirty: true };
          if (get().translationStatus !== 'approved') {
            patch.translationStatus = 'review';
          }
          set(patch as Partial<GuidesStore>);
        } else {
          const patch: Record<string, unknown> = {
            translations: rawTranslations as unknown as LanguageTranslation[],
            isDirty: true,
          };
          if (get().translationStatus !== 'approved') {
            patch.translationStatus = 'review';
          }
          set(patch as Partial<GuidesStore>);
        }
      }
      break;
    }
    case 's7_voice_recommend': {
      const recommendation = parsed as { suggested?: string };
      if (recommendation.suggested) {
        set({ selectedVoiceId: recommendation.suggested, isDirty: true });
      }
      break;
    }
    case 's8_director_note': {
      const wrapper = parsed as { directorNote?: Record<string, unknown> };
      const raw = (wrapper.directorNote && typeof wrapper.directorNote === 'object')
        ? wrapper.directorNote
        : parsed as Record<string, unknown>;

      const mapped: Partial<DirectorNote> = {
        scene: (raw.scene as string) ?? (raw.vocalEnvironment as string) ?? '',
        style: (raw.style as string) ?? (raw.mission as string) ?? (raw.missionOfSpeech as string) ?? '',
        pacing: (raw.pacing as string) ?? (raw.pacingAndEnergy as string) ?? '',
      };

      if (mapped.scene || mapped.style || mapped.pacing) {
        set((state) => ({
          directorNote: { ...state.directorNote, ...mapped },
          isDirty: true,
        }));
      }
      break;
    }
    case 's9_audio_gen': {
      const audio = parsed as { audioFiles?: Record<string, unknown>[] };
      if (Array.isArray(audio.audioFiles)) {
        const audioByLang = new Map<string, LanguageAudio>();
        for (const audioFile of audio.audioFiles) {
          const lang = (audioFile.lang as string) ?? '';
          const audioUrl = (audioFile.audioUrl as string) ?? '';
          const durationMs = (audioFile.durationMs as number) ?? 0;
          if (!audioUrl) continue;

          const spotEntry = {
            spotId: (audioFile.spotId as string) ?? '',
            spotNumber: (audioFile.spotNumber as number) ?? 0,
            title: (audioFile.title as string) ?? '',
            audioUrl,
            durationMs,
          };

          const existing = audioByLang.get(lang);
          if (!existing) {
            audioByLang.set(lang, {
              lang,
              label: langLabel(lang),
              audioUrl,
              durationMs,
              approved: false,
              spots: [spotEntry],
            });
          } else {
            existing.durationMs += durationMs;
            existing.spots = [...(existing.spots ?? []), spotEntry];
          }
        }

        const enriched: LanguageAudio[] = Array.from(audioByLang.values());
        const patch: Record<string, unknown> = { audioFiles: enriched, isDirty: true };
        const currentAudioStatus = get().audioStatus;
        if (
          currentAudioStatus !== 'approved'
          && currentAudioStatus !== 'idle'
          && currentAudioStatus !== 'configuring'
        ) {
          patch.audioStatus = 'review';
        }
        set(patch as Partial<GuidesStore>);
      }
      break;
    }
    case 's10_srt_gen': {
      const srt = parsed as { srtFiles?: LanguageSRT[] };
      if (Array.isArray(srt.srtFiles)) {
        set({ srtFiles: srt.srtFiles, isDirty: true });
      }
      break;
    }
    default:
      console.warn(`[PipelineSync] Unknown step key: ${stepId}`, parsed);
  }
}
