import { DEFAULT_ENTITY_CONFIG, type SpotMetadata } from '../../types/entity';
import type { GuidesStore } from '../../guidesStore';

type GuidesStoreSetter = (
  partial:
    | Partial<GuidesStore>
    | ((state: GuidesStore) => Partial<GuidesStore>),
) => void;

type GuidesStoreGetter = () => GuidesStore;

export function createDomainActions(
  set: GuidesStoreSetter,
  get: GuidesStoreGetter,
): Partial<GuidesStore> {
  return {
    setEntityField: (key, value) => {
      set((state) => ({
        entityConfig: { ...state.entityConfig, [key]: value },
        isDirty: true,
      }));
    },

    setEntityConfig: (config) => {
      set((state) => {
        const patch: Partial<GuidesStore> = {
          entityConfig: { ...state.entityConfig, ...config },
          isDirty: true,
        };

        if (config.supportedLanguages && state.translations.length > 0) {
          const newTarget = config.supportedLanguages.filter(
            (language) => language !== (config.coreLanguage ?? state.entityConfig.coreLanguage),
          );
          const oldLangs = state.translations.map((translation) => translation.lang);
          const changed =
            newTarget.length !== oldLangs.length
            || !newTarget.every((language) => oldLangs.includes(language));

          if (changed && state.translationStatus === 'approved') {
            patch.translationStatus = 'review';
          }
        }

        return patch;
      });
    },

    resetEntityConfig: () => {
      set({ entityConfig: { ...DEFAULT_ENTITY_CONFIG }, isDirty: false });
    },

    addAssets: (files) => {
      set((state) => ({ assets: [...state.assets, ...files], isDirty: true }));
    },

    removeAsset: (id) => {
      set((state) => {
        const asset = state.assets.find((item) => item.id === id);
        if (asset?.previewUrl) URL.revokeObjectURL(asset.previewUrl);
        return { assets: state.assets.filter((item) => item.id !== id), isDirty: true };
      });
    },

    updateAsset: (id, patch) => {
      set((state) => ({
        assets: state.assets.map((asset) => (asset.id === id ? { ...asset, ...patch } : asset)),
      }));
    },

    clearAssets: () => {
      set((state) => {
        state.assets.forEach((asset) => {
          if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
        });
        return { assets: [], isDirty: true };
      });
    },

    setSelectedAssetIds: (ids) => set({ selectedAssetIds: ids }),

    setIngestionStatus: (status) => set({ ingestionStatus: status }),

    setIngestionError: (error) => set({ ingestionError: error }),

    setSpots: (spots) => set({ spots, isDirty: true }),

    updateSpot: (id, patch) => {
      set((state) => ({
        spots: state.spots.map((spot) => (spot.id === id ? { ...spot, ...patch } : spot)),
        isDirty: true,
      }));
    },

    removeSpot: (id) => {
      set((state) => {
        const filtered = state.spots.filter((spot) => spot.id !== id);
        const renumbered = filtered.map((spot, idx) => ({ ...spot, spotNumber: idx + 1 }));
        return { spots: renumbered, isDirty: true };
      });
    },

    addSpot: (spot) => {
      set((state) => ({ spots: [...state.spots, spot], isDirty: true }));
    },

    reorderSpots: (spotIds) => {
      set((state) => {
        const byId = new Map(state.spots.map((spot) => [spot.id, spot]));
        const reordered = spotIds
          .map((id) => byId.get(id))
          .filter(Boolean) as SpotMetadata[];
        const renumbered = reordered.map((spot, idx) => ({ ...spot, spotNumber: idx + 1 }));
        return { spots: renumbered, isDirty: true };
      });
    },

    setPipelineIds: (sessionId, checkpointId) =>
      set({ pipelineSessionId: sessionId, pipelineCheckpointId: checkpointId }),

    resetIngestion: () =>
      set({
        spots: [],
        ingestionStatus: 'idle',
        ingestionError: null,
        selectedAssetIds: [],
        pipelineSessionId: null,
        pipelineCheckpointId: null,
      }),

    setScripts: (scripts) => set({ scripts, isDirty: true }),

    updateScript: (spotId, patch) => {
      set((state) => ({
        scripts: state.scripts.map((script) => (script.spotId === spotId ? { ...script, ...patch } : script)),
        isDirty: true,
      }));
    },

    setScriptStatus: (status) => set({ scriptStatus: status }),

    setScriptError: (error) => set({ scriptError: error }),

    approveScript: (spotId) => {
      set((state) => ({
        scripts: state.scripts.map((script) =>
          script.spotId === spotId ? { ...script, approved: true } : script
        ),
        isDirty: true,
      }));
    },

    rejectScript: (spotId) => {
      set((state) => ({
        scripts: state.scripts.map((script) =>
          script.spotId === spotId ? { ...script, approved: false } : script
        ),
        isDirty: true,
      }));
    },

    approveAllScripts: () => {
      set((state) => ({
        scripts: state.scripts.map((script) => ({ ...script, approved: true })),
        isDirty: true,
      }));
    },

    rejectAllScripts: () => {
      set((state) => ({
        scripts: state.scripts.map((script) => ({ ...script, approved: false })),
        isDirty: true,
      }));
    },

    toggleFastTrack: (spotId) => {
      set((state) => ({
        scripts: state.scripts.map((script) =>
          script.spotId === spotId ? { ...script, fastTrack: !script.fastTrack } : script
        ),
        isDirty: true,
      }));
    },

    setImageMappings: (mappings) => set({ imageMappings: mappings, isDirty: true }),

    updateImageMapping: (spotId, assetIds) => {
      set((state) => ({
        imageMappings: state.imageMappings.map((mapping) =>
          mapping.spotId === spotId ? { ...mapping, assignedAssetIds: assetIds, aiSuggested: false } : mapping
        ),
        isDirty: true,
      }));
    },

    resetScripts: () =>
      set({
        scripts: [],
        imageMappings: [],
        scriptStatus: 'idle',
        scriptError: null,
      }),

    setTranslations: (translations) => set({ translations, isDirty: true }),

    updateTranslation: (lang, spotId, translatedText) => {
      set((state) => ({
        translations: state.translations.map((translation) =>
          translation.lang === lang
            ? {
              ...translation,
              spots: translation.spots.map((spot) =>
                spot.spotId === spotId ? { ...spot, translatedText } : spot
              ),
            }
            : translation
        ),
        isDirty: true,
      }));
    },

    setTranslationStatus: (status) => set({ translationStatus: status }),

    setTranslationError: (error) => set({ translationError: error }),

    approveLanguage: (lang) => {
      set((state) => ({
        translations: state.translations.map((translation) =>
          translation.lang === lang ? { ...translation, approved: true } : translation
        ),
        isDirty: true,
      }));
    },

    rejectLanguage: (lang) => {
      set((state) => ({
        translations: state.translations.map((translation) =>
          translation.lang === lang ? { ...translation, approved: false } : translation
        ),
        isDirty: true,
      }));
    },

    approveAllLanguages: () => {
      set((state) => ({
        translations: state.translations.map((translation) => ({ ...translation, approved: true })),
        isDirty: true,
      }));
    },

    rejectAllLanguages: () => {
      set((state) => ({
        translations: state.translations.map((translation) => ({ ...translation, approved: false })),
        isDirty: true,
      }));
    },

    resetTranslations: () =>
      set({
        translations: [],
        translationStatus: 'idle',
        translationError: null,
      }),

    setSelectedCharacterId: (id) => set({ selectedCharacterId: id, isDirty: true }),

    setSelectedVoiceId: (id) => set({ selectedVoiceId: id, isDirty: true }),

    setDirectorNote: (note) => {
      set((state) => ({
        directorNote: { ...state.directorNote, ...note },
        isDirty: true,
      }));
    },

    setAudioFiles: (files) => set({ audioFiles: files, isDirty: true }),

    approveAudioLang: (lang) => {
      set((state) => ({
        audioFiles: state.audioFiles.map((audioFile) =>
          audioFile.lang === lang ? { ...audioFile, approved: true } : audioFile
        ),
        isDirty: true,
      }));
    },

    rejectAudioLang: (lang) => {
      set((state) => ({
        audioFiles: state.audioFiles.map((audioFile) =>
          audioFile.lang === lang ? { ...audioFile, approved: false } : audioFile
        ),
        isDirty: true,
      }));
    },

    approveAllAudio: () => {
      set((state) => ({
        audioFiles: state.audioFiles.map((audioFile) => ({ ...audioFile, approved: true })),
        isDirty: true,
      }));
    },

    rejectAllAudio: () => {
      set((state) => ({
        audioFiles: state.audioFiles.map((audioFile) => ({ ...audioFile, approved: false })),
        isDirty: true,
      }));
    },

    addPronunciationMarker: (marker) => {
      set((state) => ({
        pronunciationMarkers: [...state.pronunciationMarkers, marker],
        isDirty: true,
      }));
    },

    removePronunciationMarker: (id) => {
      set((state) => ({
        pronunciationMarkers: state.pronunciationMarkers.filter((marker) => marker.id !== id),
        isDirty: true,
      }));
    },

    addGenerationRun: (run) => {
      set((state) => ({
        generationHistory: [run, ...state.generationHistory],
        isDirty: true,
      }));
    },

    setSrtFiles: (files) => set({ srtFiles: files, isDirty: true }),

    setAudioStatus: (status) => set({ audioStatus: status }),

    setAudioError: (error) => set({ audioError: error }),

    resetAudio: () =>
      set({
        selectedCharacterId: null,
        selectedVoiceId: null,
        directorNote: { scene: '', style: '', pacing: '' },
        audioFiles: [],
        pronunciationMarkers: [],
        srtFiles: [],
        audioStatus: 'idle',
        audioError: null,
      }),

    setSlideshows: (slideshows) => set({ slideshows, isDirty: true }),

    updateSlideshow: (spotId, images) => {
      set((state) => ({
        slideshows: state.slideshows.map((slideshow) =>
          slideshow.spotId === spotId ? { ...slideshow, images } : slideshow
        ),
        isDirty: true,
      }));
    },

    setPublishStatus: (status) => set({ publishStatus: status }),

    setPublishError: (error) => set({ publishError: error }),

    setPreviewDevice: (device) => set({ previewDevice: device }),

    setCustomSlug: (slug) => set({ customSlug: slug, isDirty: true }),

    setPublishJobId: (publishId) => set({ publishJobId: publishId }),

    setPublishedGuide: (guide) => set({ publishedGuide: guide }),

    resetPublish: () =>
      set({
        slideshows: [],
        publishStatus: 'idle',
        publishError: null,
        customSlug: '',
        publishJobId: null,
        publishedGuide: null,
      }),
  };
}
