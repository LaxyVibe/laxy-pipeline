// ---------------------------------------------------------------------------
// usePipelineSync — reconcile wizard state with ADK pipeline responses
// ---------------------------------------------------------------------------
import { useCallback } from 'react';
import { useGuidesStore } from '../guidesStore';
import {
  type PipelineResponse,
  getStoppedNodeId,
} from '../api';

/**
 * Hook providing helpers to parse ADK pipeline responses and push
 * corrected wizard data back through the human-input API.
 *
 * Flow:
 *   1. Pipeline returns → `applyResponse()` extracts step outputs → updates store
 *   2. User edits in wizard  → store `isDirty` + `syncStatus: 'local-changes'`
 *   3. User approves gate    → `buildGatePayload()` serialises current edits
 */
export function usePipelineSync() {
  const applyStepData = useGuidesStore((s) => s.applyStepData);
  const setSyncStatus = useGuidesStore((s) => s.setSyncStatus);
  const setPipelineIds = useGuidesStore((s) => s.setPipelineIds);

  /**
   * Parse an ADK PipelineResponse and feed relevant step outputs
   * into the wizard store so forms are pre-populated with AI data.
   */
  const applyResponse = useCallback(
    (res: PipelineResponse) => {
      setSyncStatus('syncing');

      // Update pipeline session tracking
      const checkpointId = getStoppedNodeId(res);
      setPipelineIds(res.sessionId, checkpointId);

      // Walk executed steps and apply their outputs by canonical stepId.
      for (const step of res.steps ?? []) {
        if (step.output != null) {
          applyStepData(step.stepId, step.output);
        }
      }

      setSyncStatus('synced');
    },
    [applyStepData, setSyncStatus, setPipelineIds],
  );

  /**
   * Build the JSON payload that will be sent back to the pipeline when the user
   * approves a human gate. Contains the latest wizard-edited data.
   */
  const buildGatePayload = useCallback(() => {
    const s = useGuidesStore.getState();

    return {
      entityConfig: {
        venueName: s.entityConfig.venueName,
        coreLanguage: s.entityConfig.coreLanguage,
        supportedLanguages: s.entityConfig.supportedLanguages,
        enabledModules: s.entityConfig.enabledModules,
      },
      spots: s.spots,
      scripts: s.scripts.map((sc) => ({
        spotId: sc.spotId,
        scriptText: sc.scriptText,
        approved: sc.approved,
        fastTrack: sc.fastTrack,
      })),
      imageMappings: s.imageMappings,
      translations: s.translations.map((lt) => ({
        lang: lt.lang,
        approved: lt.approved,
        spots: lt.spots.map((sp) => ({
          spotId: sp.spotId,
          translatedText: sp.translatedText,
        })),
      })),
      audio: {
        characterId: s.selectedCharacterId,
        voiceId: s.selectedVoiceId,
        directorNote: s.directorNote,
        approvedLanguages: s.audioFiles
          .filter((af) => af.approved)
          .map((af) => af.lang),
        pronunciationMarkers: s.pronunciationMarkers,
      },
    };
  }, []);

  /**
   * Mark local state as having diverged from the last pipeline response.
   * Called by the wizard whenever the user edits AI-generated data.
   */
  const markLocalChanges = useCallback(() => {
    setSyncStatus('local-changes');
  }, [setSyncStatus]);

  return {
    applyResponse,
    buildGatePayload,
    markLocalChanges,
  };
}
