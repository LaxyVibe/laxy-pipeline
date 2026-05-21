import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  bootstrapAudioSession,
  enhanceScript,
  generateDetailedPerformanceGuidelines,
  generateAudioForLanguage,
  generateCharacter,
  generateJapaneseHiragana,
  type GenerateCharacterResponse,
} from '../../api';
import { getCustomClaims } from '../../admin/auth/authenticator';
import { useAuthStore } from '../../authStore';
import { initFirebase } from '../../firebase';
import { SUPPORTED_LANGUAGES, langLabel, type LanguageAudio, type LanguageSRT } from '../../types/entity';
import {
  AUDIO_MVP_VOICES,
  buildDirectorPayload,
  clearCompiledPromptCustomization,
  clearGeneratedPerformanceGuidelines,
  buildExcerpt,
  createDefaultDirectorNote,
  createDefaultSettings,
  estimateTokensForSettings,
  isScriptEnhancementActive,
  normalizeAudioMvpCharacter,
  PRESET_AUDIO_CHARACTERS,
  recommendVoice,
  resolveCompiledPrompt,
  validateEnhancedScript,
  type AudioGuideSettings,
  type AudioMvpCharacter,
  type AudioPoiDraft,
  type ContentVersion,
  type ScriptEnhancementLimit,
} from '../audioMvp/model';
import {
  buildCustomCharacterRecord,
  buildCustomCharacterFirestorePayload,
  createEmptyCharacterDesignerValues,
  type CharacterDesignerValues,
} from './characterLibrary';
import {
  buildAudioTrackDocId,
  buildGenerationHistoryFromVersions,
  mapAudioHistoryVersion,
  mapAudioTrackSummary,
  readAudioHistoryTarget,
  type AudioHistoryTarget,
} from './history';
import type {
  AudioDirectorDraft,
  EnhancementEntry,
  GenerationHistoryEntry,
  ItemGenerationState,
  JapaneseReadingEntry,
  SaveStatus,
  WizardScreen,
} from './types';
import {
  AUDIO_DIRECTOR_DRAFT_STORAGE_KEY,
  buildGenerationStateKey,
  createEmptyValidation,
  createSessionId,
  detectLanguageCode,
  downloadJson,
  estimateEnhancementTokens,
  preprocessScriptForLanguage,
  readStoredAudioDirectorDraft,
  sleep,
  upsertLanguageAudio,
  upsertLanguageSrt,
  writeLocalStorage,
} from './utils';
import { AUDIO_DIRECTOR_WIZARD_STEPS } from './wizard';

const SUPPORTED_LANGUAGE_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((language) => language.code));

function resolveScriptDraft(text: string, previous: AudioPoiDraft[]): AudioPoiDraft[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const prev0 = previous[0];
  return [{
    spotId: prev0?.spotId ?? 'spot_001',
    spotNumber: prev0?.spotNumber ?? 1,
    title: prev0?.title ?? '',
    scriptText: trimmed,
    excerpt: buildExcerpt(trimmed),
    overrideEnabled: prev0?.overrideEnabled ?? false,
    overrideSettings: prev0?.overrideSettings,
  }];
}

function isWizardScreen(value: string | null): value is WizardScreen {
  return value !== null && AUDIO_DIRECTOR_WIZARD_STEPS.includes(value as WizardScreen);
}

function resetPerformanceHint(settings: AudioGuideSettings): AudioGuideSettings {
  return {
    ...settings,
    directorNote: createDefaultDirectorNote(settings.contentVersion),
  };
}

function resetPerformanceHintForItems(items: AudioPoiDraft[]): AudioPoiDraft[] {
  return items.map((item) => (
    item.overrideSettings
      ? {
        ...item,
        overrideSettings: resetPerformanceHint(item.overrideSettings),
      }
      : item
  ));
}

function clearCharacterSelection(settings: AudioGuideSettings): AudioGuideSettings {
  return {
    ...settings,
    characterId: '',
  };
}

function clearCharacterSelectionForItems(items: AudioPoiDraft[]): AudioPoiDraft[] {
  return items.map((item) => (
    item.overrideSettings
      ? {
        ...item,
        overrideSettings: clearCharacterSelection(item.overrideSettings),
      }
      : item
  ));
}

export function useAudioDirectorController() {
  const [searchParams, setSearchParams] = useSearchParams();
  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const analysisRunRef = useRef(0);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const readyPostedRef = useRef(false);
  const lastEmbeddedPayloadRef = useRef<{
    text: string;
    language: string | null;
    compiledPrompt?: string;
    voiceId?: string;
    characterId?: string;
    scene?: string;
    style?: string;
    pacing?: string;
    tone?: string;
    generatedPerformanceGuidelines?: string;
  } | null>(null);
  const isEmbedded = window.self !== window.top;
  const hasWindowOpener = window.opener !== null && window.opener !== window;
  const launchedFromTts = searchParams.get('source') === 'tts' && (isEmbedded || hasWindowOpener);
  const parentWindow = hasWindowOpener ? window.opener : (isEmbedded ? window.parent : null);
  const embeddedHistoryTarget = useMemo<AudioHistoryTarget | null>(
    () => (launchedFromTts ? readAudioHistoryTarget(searchParams) : null),
    [launchedFromTts, searchParams],
  );
  const searchTenantId = useMemo(() => {
    const raw = searchParams.get('tenantId');
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    return normalized || undefined;
  }, [searchParams]);
  const searchGuideId = useMemo(() => {
    const raw = searchParams.get('guideId');
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    return normalized || undefined;
  }, [searchParams]);
  const searchGuideTitle = useMemo(() => {
    const raw = searchParams.get('guideTitle');
    const normalized = typeof raw === 'string' ? raw.trim() : '';
    return normalized || undefined;
  }, [searchParams]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [configPreviewOpen, setConfigPreviewOpen] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [directorNoteEditorOpen, setDirectorNoteEditorOpen] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [manuscriptText, setManuscriptText] = useState('');
  const [items, setItems] = useState<AudioPoiDraft[]>([]);
  const [coreLanguage, setCoreLanguage] = useState('en');
  const [enhancementCache, setEnhancementCache] = useState<Record<string, Record<string, EnhancementEntry>>>({});
  const [readingAssistCache, setReadingAssistCache] = useState<Record<string, Record<string, JapaneseReadingEntry>>>({});
  const defaultSettings = useMemo(() => createDefaultSettings(), []);
  const [globalSettings, setGlobalSettings] = useState<AudioGuideSettings>(defaultSettings);
  const [audioFiles, setAudioFiles] = useState<LanguageAudio[]>([]);
  const [srtFiles, setSrtFiles] = useState<LanguageSRT[]>([]);
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryEntry[]>([]);
  const [storedGenerationHistory, setStoredGenerationHistory] = useState<GenerationHistoryEntry[]>([]);
  const [itemStates, setItemStates] = useState<Record<string, ItemGenerationState>>({});
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingJapaneseReading, setIsGeneratingJapaneseReading] = useState(false);
  const [lastGenerationLatencyMs, setLastGenerationLatencyMs] = useState<number | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isHydratingHistory, setIsHydratingHistory] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState(0);
  const [detectedLangLabel, setDetectedLangLabel] = useState<string | null>(null);
  const [resultDialogRequestAt, setResultDialogRequestAt] = useState<number | null>(null);
  const [generationCompletedAt, setGenerationCompletedAt] = useState<number | null>(null);
  const [progressSummary, setProgressSummary] = useState({
    completed: 0,
    total: 0,
    currentLabel: '',
  });
  const busyOperationSeqRef = useRef(0);
  const [busyOperations, setBusyOperations] = useState<Array<{ id: number; label: string }>>([]);
  const storeUser = useAuthStore((state) => state.user);
  const { auth } = initFirebase();
  const currentUser = storeUser ?? auth.currentUser;
  const [claimTenantId, setClaimTenantId] = useState<string | undefined>();
  const [tenantScopeLoading, setTenantScopeLoading] = useState(true);
  const [customCharacters, setCustomCharacters] = useState<AudioMvpCharacter[]>([]);
  const [customCharactersLoading, setCustomCharactersLoading] = useState(false);
  const [customCharactersError, setCustomCharactersError] = useState<string | null>(null);
  const [customCharactersHydrated, setCustomCharactersHydrated] = useState(false);
  const [characterPickerTab, setCharacterPickerTab] = useState<'preset' | 'custom'>('preset');
  const [characterDesignerOpen, setCharacterDesignerOpen] = useState(false);
  const [characterDesignerMode, setCharacterDesignerMode] = useState<'create' | 'edit'>('create');
  const [characterDesignerInitialValues, setCharacterDesignerInitialValues] = useState<CharacterDesignerValues>(
    createEmptyCharacterDesignerValues(),
  );
  const [characterDesignerPreview, setCharacterDesignerPreview] = useState<GenerateCharacterResponse['character'] | null>(null);
  const [characterDesignerError, setCharacterDesignerError] = useState<string | null>(null);
  const [characterDesignerSaving, setCharacterDesignerSaving] = useState(false);
  const [characterDesignerGenerating, setCharacterDesignerGenerating] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [pendingDeleteCharacterId, setPendingDeleteCharacterId] = useState<string | null>(null);
  const [hasExplicitVoiceSelection, setHasExplicitVoiceSelection] = useState(false);

  const allCharacters = useMemo(
    () => [...PRESET_AUDIO_CHARACTERS, ...customCharacters],
    [customCharacters],
  );
  const effectiveTenantId = claimTenantId || embeddedHistoryTarget?.tenantId || searchTenantId;
  const effectiveGuideId = embeddedHistoryTarget?.guideId || searchGuideId;
  const effectiveGuideTitle = embeddedHistoryTarget?.guideTitle || searchGuideTitle;
  const effectiveSpotTitle = embeddedHistoryTarget?.spotTitle;
  const characterLibraryScope = useMemo(() => {
    if (effectiveTenantId) {
      return {
        kind: 'tenant' as const,
        path: ['tenants', effectiveTenantId, 'audioCharacters'] as const,
        tenantId: effectiveTenantId,
        guideId: undefined,
      };
    }
    if (effectiveGuideId) {
      return {
        kind: 'guide' as const,
        path: ['guides', effectiveGuideId, 'audioCharacters'] as const,
        tenantId: undefined,
        guideId: effectiveGuideId,
      };
    }
    return null;
  }, [effectiveGuideId, effectiveTenantId]);
  const scriptEnhancementEnabled = isScriptEnhancementActive(globalSettings.scriptEnhancementLimit);
  const combinedGenerationHistory = useMemo(
    () => [...generationHistory, ...storedGenerationHistory].sort((left, right) => right.generatedAt - left.generatedAt),
    [generationHistory, storedGenerationHistory],
  );
  const activeBusyLabel = busyOperations[busyOperations.length - 1]?.label ?? null;
  const hasBusyOverlay = busyOperations.length > 0;

  const beginBusyOperation = useCallback((label: string) => {
    const id = busyOperationSeqRef.current + 1;
    busyOperationSeqRef.current = id;
    setBusyOperations((previous) => [...previous, { id, label }]);
    return id;
  }, []);

  const updateBusyOperation = useCallback((id: number, label: string) => {
    setBusyOperations((previous) => previous.map((operation) => (
      operation.id === id ? { ...operation, label } : operation
    )));
  }, []);

  const endBusyOperation = useCallback((id: number) => {
    setBusyOperations((previous) => previous.filter((operation) => operation.id !== id));
  }, []);

  const resetScriptBoundState = useCallback(() => {
    setSessionId(null);
    setCoreLanguage('en');
    setEnhancementCache({});
    setReadingAssistCache({});
    setGenerationHistory([]);
    setAudioFiles([]);
    setSrtFiles([]);
    setItemStates({});
    setGenerationError(null);
    setLastGenerationLatencyMs(null);
    setProgressSummary({
      completed: 0,
      total: 0,
      currentLabel: '',
    });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setClaimTenantId(undefined);
      setTenantScopeLoading(false);
      return;
    }

    let cancelled = false;
    setTenantScopeLoading(true);
    void getCustomClaims(currentUser).then((claims) => {
      if (cancelled) return;
      setClaimTenantId(claims.tenantId);
      setTenantScopeLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setClaimTenantId(undefined);
      setTenantScopeLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const applyEmbeddedScriptPayload = useCallback((payload: {
    text: string;
    language: string | null;
    compiledPrompt?: string;
    voiceId?: string;
    characterId?: string;
    scene?: string;
    style?: string;
    pacing?: string;
    tone?: string;
    generatedPerformanceGuidelines?: string;
  }) => {
    const normalizedPayload = {
      text: payload.text,
      language: payload.language,
      compiledPrompt: payload.compiledPrompt?.trim() || '',
      voiceId: payload.voiceId?.trim() || '',
      characterId: payload.characterId?.trim() || '',
      scene: payload.scene?.trim() || '',
      style: payload.style?.trim() || '',
      pacing: payload.pacing?.trim() || '',
      tone: payload.tone?.trim() || '',
      generatedPerformanceGuidelines: payload.generatedPerformanceGuidelines?.trim() || '',
    };
    const previousPayload = lastEmbeddedPayloadRef.current;
    if (
      previousPayload
      && previousPayload.text === normalizedPayload.text
      && previousPayload.language === normalizedPayload.language
      && (previousPayload.compiledPrompt ?? '') === normalizedPayload.compiledPrompt
      && (previousPayload.voiceId ?? '') === normalizedPayload.voiceId
      && (previousPayload.characterId ?? '') === normalizedPayload.characterId
      && (previousPayload.scene ?? '') === normalizedPayload.scene
      && (previousPayload.style ?? '') === normalizedPayload.style
      && (previousPayload.pacing ?? '') === normalizedPayload.pacing
      && (previousPayload.tone ?? '') === normalizedPayload.tone
      && (previousPayload.generatedPerformanceGuidelines ?? '') === normalizedPayload.generatedPerformanceGuidelines
    ) {
      return;
    }

    lastEmbeddedPayloadRef.current = normalizedPayload;
    resetScriptBoundState();
    setManuscriptText(payload.text);
    const nextSettings = createDefaultSettings();
    setGlobalSettings({
      ...nextSettings,
      characterId: normalizedPayload.characterId,
      voiceId: normalizedPayload.voiceId || nextSettings.voiceId,
      directorNote: {
        ...createDefaultDirectorNote(nextSettings.contentVersion),
        scene: normalizedPayload.scene,
        style: normalizedPayload.style,
        pacing: normalizedPayload.pacing,
        tone: normalizedPayload.tone,
        generatedPerformanceGuidelines: normalizedPayload.generatedPerformanceGuidelines,
        compiledPromptOverride: normalizedPayload.compiledPrompt,
        isPromptCustomized: Boolean(normalizedPayload.compiledPrompt),
      },
    });
    setHasExplicitVoiceSelection(Boolean(normalizedPayload.voiceId));
    if (payload.language) {
      setCoreLanguage(payload.language);
    } else {
      const detected = detectLanguageCode(payload.text.trim());
      if (detected) setCoreLanguage(detected.code);
    }
    const nextSearchParams = new URLSearchParams(window.location.search);
    nextSearchParams.set('screen', 'guide-settings');
    setSearchParams(nextSearchParams);
  }, [resetScriptBoundState, setSearchParams]);

  useEffect(() => {
    const saved = readStoredAudioDirectorDraft();
    if (!saved) {
      setItems(resolveScriptDraft('', []));
      return;
    }

    const savedGlobalSettings = clearCharacterSelection(
      resetPerformanceHint(saved.globalSettings ?? defaultSettings),
    );
    const savedItems = clearCharacterSelectionForItems(
      resetPerformanceHintForItems(saved.items ?? []),
    );

    if (launchedFromTts) {
      resetScriptBoundState();
      setManuscriptText('');
      setGlobalSettings(savedGlobalSettings);
      setHasExplicitVoiceSelection(false);
      setCustomCharacters(saved.customCharacters ?? []);
      setReadingAssistCache(saved.readingAssistCache ?? {});
      setItems([]);
      return;
    }

    setManuscriptText(saved.manuscriptText ?? '');
    setSessionId(saved.sessionId ?? null);
    setCoreLanguage(saved.coreLanguage ?? 'en');
    setGlobalSettings(savedGlobalSettings);
    setHasExplicitVoiceSelection(false);
    setCustomCharacters(saved.customCharacters ?? []);
    setEnhancementCache(saved.enhancementCache ?? {});
    setReadingAssistCache(saved.readingAssistCache ?? {});
    setGenerationHistory(saved.generationHistory ?? []);
    setItems(resolveScriptDraft(saved.manuscriptText ?? '', savedItems));
  }, [defaultSettings, launchedFromTts]);

  useEffect(() => {
    if (tenantScopeLoading) return;
    if (!characterLibraryScope) {
      setCustomCharactersLoading(false);
      setCustomCharactersError(null);
      setCustomCharactersHydrated(true);
      return;
    }

    const { db } = initFirebase();
    const characterCollectionRef = characterLibraryScope.kind === 'tenant'
      ? collection(db, 'tenants', characterLibraryScope.tenantId, 'audioCharacters')
      : collection(db, 'guides', characterLibraryScope.guideId, 'audioCharacters');
    const libraryQuery = query(
      characterCollectionRef,
      orderBy('updatedAt', 'desc'),
    );

    setCustomCharactersLoading(true);
    setCustomCharactersError(null);
    setCustomCharactersHydrated(false);

    const unsubscribe = onSnapshot(
      libraryQuery,
      (snapshot) => {
        const nextCharacters = snapshot.docs
          .map((item) => normalizeAudioMvpCharacter({
            id: item.id,
            ...item.data(),
            source: 'custom',
            tenantId: characterLibraryScope.tenantId,
            guideId: characterLibraryScope.guideId,
          }))
          .filter((item): item is AudioMvpCharacter => Boolean(item));
        setCustomCharacters(nextCharacters);
        setCustomCharactersLoading(false);
        setCustomCharactersHydrated(true);
      },
      (error) => {
        setCustomCharacters([]);
        setCustomCharactersLoading(false);
        setCustomCharactersHydrated(true);
        setCustomCharactersError(error.message || 'Unable to load tenant characters.');
      },
    );

    return unsubscribe;
  }, [characterLibraryScope, tenantScopeLoading]);

  useEffect(() => {
    setItems((previous) => resolveScriptDraft(manuscriptText, previous));
  }, [manuscriptText]);

  useEffect(() => {
    if (!embeddedHistoryTarget) return;

    let cancelled = false;

    const hydrateHistory = async () => {
      const busyOperationId = beginBusyOperation('Loading saved audio history…');
      setIsHydratingHistory(true);
      setStoredGenerationHistory([]);

      try {
        const { db } = initFirebase();
        const summaryDocRef = doc(
          db,
          'guides',
          embeddedHistoryTarget.guideId,
          'audioTracks',
          buildAudioTrackDocId(embeddedHistoryTarget.spotId, embeddedHistoryTarget.lang),
        );

        const directSummaryDoc = await getDoc(summaryDocRef);
        let summary = directSummaryDoc.exists()
          ? mapAudioTrackSummary({
            guideId: embeddedHistoryTarget.guideId,
            docId: directSummaryDoc.id,
            data: directSummaryDoc.data() as Record<string, unknown>,
          })
          : null;

        if (!summary) {
          updateBusyOperation(busyOperationId, 'Searching for saved audio history…');
          const summarySnapshot = await getDocs(query(
            collection(db, 'guides', embeddedHistoryTarget.guideId, 'audioTracks'),
            where('spotId', '==', embeddedHistoryTarget.spotId),
            where('lang', '==', embeddedHistoryTarget.lang),
            limit(1),
          ));
          const fallbackDoc = summarySnapshot.docs[0];
          if (fallbackDoc) {
            summary = mapAudioTrackSummary({
              guideId: embeddedHistoryTarget.guideId,
              docId: fallbackDoc.id,
              data: fallbackDoc.data() as Record<string, unknown>,
            });
          }
        }

        if (!summary) {
          if (!cancelled) {
            setStoredGenerationHistory([]);
          }
          return;
        }

        updateBusyOperation(busyOperationId, 'Loading saved versions…');
        const versionsSnapshot = await getDocs(query(
          collection(db, 'guides', embeddedHistoryTarget.guideId, 'audioTracks', summary.id, 'versions'),
          orderBy('createdAt', 'desc'),
        ));

        const versionRecords = versionsSnapshot.docs
          .map((versionDoc) => mapAudioHistoryVersion({
            guideId: embeddedHistoryTarget.guideId,
            target: {
              ...embeddedHistoryTarget,
              spotTitle: summary?.spotTitle,
            },
            summary,
            docId: versionDoc.id,
            data: versionDoc.data() as Record<string, unknown>,
          }))
          .filter((record): record is NonNullable<typeof record> => Boolean(record));

        if (!versionRecords.length) {
          if (!cancelled) {
            setStoredGenerationHistory([]);
          }
          return;
        }

        if (cancelled) return;

        const historyEntries = buildGenerationHistoryFromVersions(versionRecords);
        setStoredGenerationHistory(historyEntries);
        setResultDialogRequestAt(Date.now());
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setGenerationError(`Audio history retrieval failed: ${message}`);
      } finally {
        if (!cancelled) {
          setIsHydratingHistory(false);
        }
        endBusyOperation(busyOperationId);
      }
    };

    void hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, [beginBusyOperation, embeddedHistoryTarget, endBusyOperation, updateBusyOperation]);

  useEffect(() => {
    writeLocalStorage(AUDIO_DIRECTOR_DRAFT_STORAGE_KEY, {
      manuscriptText,
      sessionId,
      coreLanguage,
      scriptEnhancementEnabled,
      globalSettings,
      items,
      customCharacters,
      enhancementCache,
      readingAssistCache,
      generationHistory,
    } satisfies AudioDirectorDraft);
  }, [
    coreLanguage,
    customCharacters,
    enhancementCache,
    globalSettings,
    generationHistory,
    items,
    manuscriptText,
    readingAssistCache,
    scriptEnhancementEnabled,
    sessionId,
  ]);

  useEffect(() => () => {
    analysisRunRef.current += 1;
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
    }
  }, []);

  // When launched from /tts in an iframe or popup, advertise readiness and receive the script via postMessage.
  useEffect(() => {
    if (!launchedFromTts || !parentWindow) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'laxy:script') {
        const incomingLaunchId = typeof event.data.launchId === 'string' ? event.data.launchId : '';
        if (embeddedHistoryTarget?.launchId && incomingLaunchId && incomingLaunchId !== embeddedHistoryTarget.launchId) {
          return;
        }
        const payload = {
          text: typeof event.data.text === 'string' ? event.data.text : '',
          language: typeof event.data.language === 'string' && SUPPORTED_LANGUAGE_CODES.has(event.data.language)
          ? event.data.language
          : null,
          compiledPrompt: typeof event.data.compiledPrompt === 'string' ? event.data.compiledPrompt : '',
          voiceId: typeof event.data.voiceId === 'string' ? event.data.voiceId : '',
          characterId: typeof event.data.characterId === 'string' ? event.data.characterId : '',
          scene: typeof event.data.scene === 'string' ? event.data.scene : '',
          style: typeof event.data.style === 'string' ? event.data.style : '',
          pacing: typeof event.data.pacing === 'string' ? event.data.pacing : '',
          tone: typeof event.data.tone === 'string' ? event.data.tone : '',
          generatedPerformanceGuidelines:
            typeof event.data.generatedPerformanceGuidelines === 'string'
              ? event.data.generatedPerformanceGuidelines
              : '',
        };
        applyEmbeddedScriptPayload(payload);
      }
    };

    window.addEventListener('message', handleMessage);
    if (!readyPostedRef.current) {
      readyPostedRef.current = true;
      // Signal the opener that this launched Audio Director is ready to receive the script.
      parentWindow.postMessage(
        {
          type: 'laxy:ready',
          launchId: embeddedHistoryTarget?.launchId,
        },
        window.location.origin,
      );
    }

    return () => window.removeEventListener('message', handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyEmbeddedScriptPayload, embeddedHistoryTarget?.launchId, launchedFromTts, parentWindow]);

  const getCharacter = (characterId: string) => (
    allCharacters.find((character) => character.id === characterId)
  );
  const getVoice = (voiceId: string) => (
    AUDIO_MVP_VOICES.find((voice) => voice.id === voiceId) ?? AUDIO_MVP_VOICES[0]
  );
  const getItemSettings = (item: AudioPoiDraft) => (
    item.overrideEnabled && item.overrideSettings ? item.overrideSettings : globalSettings
  );

  const selectedCharacter = getCharacter(globalSettings.characterId) ?? null;
  const selectedVoice = getVoice(globalSettings.voiceId);

  useEffect(() => {
    const nextSelectedCharacter = getCharacter(globalSettings.characterId);
    if (!nextSelectedCharacter) return;
    setCharacterPickerTab(nextSelectedCharacter.source === 'custom' ? 'custom' : 'preset');
  }, [allCharacters, globalSettings.characterId]);

  const globalRecommendation = useMemo(
    () => (selectedCharacter
      ? recommendVoice({
        character: selectedCharacter,
        manuscriptText,
        contentVersion: globalSettings.contentVersion,
      })
      : {
        recommendedVoiceId: '',
        reason: 'Select a character to receive a voice recommendation.',
        fallbackVoiceIds: [],
      }),
    [globalSettings.contentVersion, manuscriptText, selectedCharacter],
  );

  const femaleVoices = useMemo(
    () => AUDIO_MVP_VOICES.filter((voice) => voice.gender === 'female'),
    [],
  );
  const maleVoices = useMemo(
    () => AUDIO_MVP_VOICES.filter((voice) => voice.gender === 'male'),
    [],
  );
  const currentItem = items[0];
  const currentScriptText = useMemo(() => {
    if (!currentItem) return manuscriptText;
    if (!scriptEnhancementEnabled) {
      return currentItem.scriptText ?? manuscriptText;
    }
    return enhancementCache[coreLanguage]?.[currentItem.spotId]?.enhancedText ?? currentItem.scriptText ?? manuscriptText;
  }, [coreLanguage, currentItem, enhancementCache, manuscriptText, scriptEnhancementEnabled]);
  const getPreparedScriptForItem = useCallback((language: string, item: AudioPoiDraft) => {
    const sourceText = item.scriptText;
    const effectiveText = scriptEnhancementEnabled
      ? enhancementCache[language]?.[item.spotId]?.enhancedText ?? sourceText
      : sourceText;
    const japaneseReadingEntry = language === 'ja' ? readingAssistCache[language]?.[item.spotId] : undefined;
    const ttsSourceText = language === 'ja' && japaneseReadingEntry?.sourceText === effectiveText
      ? japaneseReadingEntry.hiraganaText.trim() || effectiveText
      : effectiveText;
    const preprocessing = preprocessScriptForLanguage(language, ttsSourceText);
    return { sourceText, effectiveText, ttsSourceText, preprocessing };
  }, [enhancementCache, readingAssistCache, scriptEnhancementEnabled]);
  const currentPreparedScript = useMemo(
    () => (currentItem ? getPreparedScriptForItem(coreLanguage, currentItem) : null),
    [coreLanguage, currentItem, getPreparedScriptForItem],
  );

  const globalCompiledPrompt = useMemo(
    () => (selectedCharacter
      ? resolveCompiledPrompt({
        settings: globalSettings,
        character: selectedCharacter,
        voice: selectedVoice,
        scriptText: currentPreparedScript?.preprocessing.processedText ?? currentScriptText,
        poiName: effectiveSpotTitle || items[0]?.title,
        projectTitle: effectiveGuideTitle,
      })
      : ''),
    [
      currentPreparedScript,
      currentScriptText,
      effectiveGuideTitle,
      effectiveSpotTitle,
      globalSettings,
      items,
      selectedCharacter,
      selectedVoice,
    ],
  );

  const estimatedTokens = useMemo(() => {
    const base = estimateTokensForSettings({
      items,
      settingsResolver: getItemSettings,
      characterResolver: getCharacter,
      languageCount: 1,
    });
    const enhancement = scriptEnhancementEnabled ? estimateEnhancementTokens(items, 1) : 0;
    return base + enhancement;
  }, [allCharacters, globalSettings, items, manuscriptText, scriptEnhancementEnabled]);

  const summaryPayload = useMemo(
    () => ({
      sessionId,
      coreLanguage,
      appId: 'audio-director',
      scriptEnhancementEnabled,
      globalSettings: {
        ...globalSettings,
        directorNote: {
          ...globalSettings.directorNote,
          compiledPrompt: globalCompiledPrompt,
        },
      },
      items: items.map((item) => {
        const settings = item.overrideEnabled && item.overrideSettings ? item.overrideSettings : globalSettings;
        const character = getCharacter(settings.characterId);
        const voice = getVoice(settings.voiceId);
        const promptScriptText = getPreparedScriptForItem(coreLanguage, item).preprocessing.processedText;
        return {
          spotId: item.spotId,
          spotNumber: item.spotNumber,
          title: item.title,
          overrideEnabled: item.overrideEnabled,
          settings: {
            ...settings,
            directorNote: {
              ...settings.directorNote,
              compiledPrompt: character
                ? resolveCompiledPrompt({
                  settings,
                  character,
                  voice,
                  scriptText: promptScriptText,
                  poiName: effectiveSpotTitle || item.title,
                  projectTitle: effectiveGuideTitle,
                })
                : '',
            },
          },
          enhancement: Object.fromEntries(
            Object.entries(enhancementCache)
              .map(([language, map]) => [language, map[item.spotId]])
              .filter(([, entry]) => Boolean(entry)),
          ),
        };
      }),
      generatedAudio: audioFiles,
      generatedSrt: srtFiles,
    }),
    [
      allCharacters,
      audioFiles,
      coreLanguage,
      effectiveGuideTitle,
      effectiveSpotTitle,
      getPreparedScriptForItem,
      globalCompiledPrompt,
      globalSettings,
      items,
      scriptEnhancementEnabled,
      selectedCharacter,
      sessionId,
      srtFiles,
    ],
  );

  const promptPreviewPayload = useMemo(
    () => ({
      appId: 'audio-director',
      previewType: 'gemini-tts-request-source',
      language: coreLanguage,
      sessionId: sessionId ?? '<generated-at-save-or-run-time>',
      scriptEnhancementEnabled,
      requests: items.map((item) => {
        const settings = item.overrideEnabled && item.overrideSettings ? item.overrideSettings : globalSettings;
        const character = getCharacter(settings.characterId);
        const voice = getVoice(settings.voiceId);
        const { sourceText, effectiveText, ttsSourceText, preprocessing } = getPreparedScriptForItem(coreLanguage, item);
        const directorPayload = character
          ? buildDirectorPayload({
            settings,
            character,
            voice,
            scriptText: preprocessing.processedText,
            poiName: effectiveSpotTitle || item.title,
            projectTitle: effectiveGuideTitle,
          })
          : {
            scene: settings.directorNote.scene,
            style: settings.directorNote.style,
            pacing: settings.directorNote.pacing,
            compiledPrompt: '',
            contentVersion: settings.contentVersion,
            scriptEnhancementLimit: settings.scriptEnhancementLimit,
          };
        const contents = directorPayload.compiledPrompt.trim() || preprocessing.processedText;

        return {
          spotId: item.spotId,
          spotNumber: item.spotNumber,
          title: item.title,
          character: {
            id: character?.id ?? '',
            name: character?.name ?? '',
            role: character?.role ?? '',
          },
          voice: {
            id: voice.id,
            name: voice.name,
          },
          script: {
            originalText: sourceText,
            effectiveText,
            ttsSourceText,
            processedText: preprocessing.processedText,
            preprocessingNotes: preprocessing.preprocessingNotes,
          },
          directorNote: directorPayload,
          pipelineRequest: {
            sessionId: sessionId ?? '<generated-at-save-or-run-time>',
            scripts: [{
              spotId: item.spotId,
              spotNumber: item.spotNumber,
              title: '',
            }],
            voiceId: settings.voiceId,
            language: coreLanguage,
            directorNote: directorPayload,
          },
          geminiRequestSource: {
            contents,
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: settings.voiceId,
                  },
                },
              },
            },
            modelNote: 'Uses the backend-configured TTS model.',
          },
        };
      }),
    }),
    [
      coreLanguage,
      effectiveGuideTitle,
      effectiveSpotTitle,
      getPreparedScriptForItem,
      globalSettings,
      items,
      scriptEnhancementEnabled,
      selectedCharacter,
      sessionId,
    ],
  );

  const activeEnhancementEntries = enhancementCache[coreLanguage] ?? {};
  const activeReadingEntries = readingAssistCache[coreLanguage] ?? {};
  const currentScreen: WizardScreen = isWizardScreen(searchParams.get('screen'))
    ? searchParams.get('screen') as WizardScreen
    : 'guide-settings';
  const canAdvance = manuscriptText.trim().length > 0;

  const handleNavigate = (screen: WizardScreen) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('screen', screen);
    setSearchParams(nextSearchParams);
  };

  const runScriptAnalysis = async () => {
    if (!canAdvance || isAnalyzing) return;
    const runId = analysisRunRef.current + 1;
    analysisRunRef.current = runId;
    setIsAnalyzing(true);
    setAnalysisPhase(0);
    setDetectedLangLabel(null);

    await sleep(350);
    if (analysisRunRef.current !== runId) return;
    setAnalysisPhase(1);

    await sleep(850);
    if (analysisRunRef.current !== runId) return;
    const detected = detectLanguageCode(manuscriptText.trim());
    if (detected) {
      setCoreLanguage(detected.code);
      setDetectedLangLabel(langLabel(detected.code));
    }
    setAnalysisPhase(2);

    await sleep(700);
    if (analysisRunRef.current !== runId) return;
    setAnalysisPhase(3);

    await sleep(700);
    if (analysisRunRef.current !== runId) return;
    setIsAnalyzing(false);
    setAnalysisPhase(0);
    handleNavigate('guide-settings');
  };

  const triggerTxtUpload = () => {
    txtInputRef.current?.click();
  };

  const handleTxtUpload = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setManuscriptText(text);
  };

  const handleGlobalCharacterChange = (characterId: string) => {
    const character = getCharacter(characterId);
    if (!character) {
      setGlobalSettings((previous) => ({
        ...previous,
        characterId: '',
        directorNote: {
          ...clearGeneratedPerformanceGuidelines(
            clearCompiledPromptCustomization(previous.directorNote),
          ),
          scene: '',
          style: '',
          pacing: '',
          tone: '',
        },
      }));
      return;
    }
    const recommendation = recommendVoice({
      character,
      manuscriptText,
      contentVersion: globalSettings.contentVersion,
    });
    setCharacterPickerTab(character.source === 'custom' ? 'custom' : 'preset');
    setGlobalSettings((previous) => ({
      ...previous,
      characterId,
      voiceId: hasExplicitVoiceSelection && previous.voiceId
        ? previous.voiceId
        : recommendation.recommendedVoiceId,
      directorNote: {
        ...clearGeneratedPerformanceGuidelines(
          clearCompiledPromptCustomization(previous.directorNote),
        ),
        scene: '',
        style: '',
        pacing: '',
        tone: '',
      },
    }));
  };

  const resetCharacterDesignerState = useCallback(() => {
    setCharacterDesignerPreview(null);
    setCharacterDesignerError(null);
    setCharacterDesignerGenerating(false);
    setCharacterDesignerSaving(false);
    setEditingCharacterId(null);
    setCharacterDesignerInitialValues(createEmptyCharacterDesignerValues());
  }, []);

  const openCreateCharacterDesigner = useCallback(() => {
    setCharacterPickerOpen(false);
    setCharacterDesignerMode('create');
    setCharacterDesignerInitialValues(createEmptyCharacterDesignerValues());
    setCharacterDesignerPreview(null);
    setCharacterDesignerError(null);
    setEditingCharacterId(null);
    setCharacterDesignerOpen(true);
  }, []);

  const openEditCharacterDesigner = useCallback((character: AudioMvpCharacter) => {
    setCharacterPickerOpen(false);
    setCharacterDesignerMode('edit');
    setCharacterDesignerInitialValues({
      name: character.name,
      gender: character.gender ?? '',
      role: character.role,
      context: character.context ?? '',
    });
    setCharacterDesignerPreview(null);
    setCharacterDesignerError(null);
    setEditingCharacterId(character.id);
    setCharacterDesignerOpen(true);
  }, []);

  const closeCharacterDesigner = useCallback(() => {
    if (characterDesignerGenerating || characterDesignerSaving) return;
    setCharacterDesignerOpen(false);
    resetCharacterDesignerState();
  }, [characterDesignerGenerating, characterDesignerSaving, resetCharacterDesignerState]);

  const handleGenerateCharacterProfile = useCallback(async (values: CharacterDesignerValues) => {
    const busyOperationId = beginBusyOperation('Designing character profile…');
    setCharacterDesignerGenerating(true);
    setCharacterDesignerError(null);
    setCharacterDesignerPreview(null);
    try {
      const result = await generateCharacter(values);
      setCharacterDesignerPreview(result.character);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCharacterDesignerError(`Character profile generation failed: ${message}`);
    } finally {
      setCharacterDesignerGenerating(false);
      endBusyOperation(busyOperationId);
    }
  }, [beginBusyOperation, endBusyOperation]);

  const handleSaveCustomCharacter = useCallback(async (values: CharacterDesignerValues) => {
    if (!currentUser?.uid) {
      setCharacterDesignerError('A signed-in user is required to save custom characters.');
      return;
    }
    if (!characterDesignerPreview) {
      setCharacterDesignerError('Generate the character profile before saving.');
      return;
    }

    const busyOperationId = beginBusyOperation(
      characterDesignerMode === 'create' ? 'Saving custom character…' : 'Updating custom character…',
    );
    setCharacterDesignerSaving(true);
    setCharacterDesignerError(null);
    try {
      const documentId = editingCharacterId ?? `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      if (characterLibraryScope) {
        const { db } = initFirebase();
        const collectionRef = characterLibraryScope.kind === 'tenant'
          ? collection(db, 'tenants', characterLibraryScope.tenantId, 'audioCharacters')
          : collection(db, 'guides', characterLibraryScope.guideId, 'audioCharacters');
        const documentRef = doc(collectionRef, documentId);
        const payload = buildCustomCharacterFirestorePayload({
          tenantId: characterLibraryScope.tenantId,
          guideId: characterLibraryScope.guideId,
          createdBy: currentUser.uid,
          values,
          character: characterDesignerPreview,
        });
        await setDoc(
          documentRef,
          editingCharacterId
            ? {
              ...payload,
              updatedAt: serverTimestamp(),
            }
            : {
              ...payload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          { merge: Boolean(editingCharacterId) },
        );
      }
      const existingCharacter = customCharacters.find((item) => item.id === documentId);
      const optimisticCharacter = buildCustomCharacterRecord({
        id: documentId,
        tenantId: characterLibraryScope?.tenantId,
        guideId: characterLibraryScope?.guideId,
        createdBy: currentUser.uid,
        values,
        character: characterDesignerPreview,
        createdAt: existingCharacter?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
      setCustomCharacters((previous) => {
        const remaining = previous.filter((item) => item.id !== documentId);
        return [optimisticCharacter, ...remaining];
      });
      void handleGlobalCharacterChange(documentId);
      setCharacterDesignerOpen(false);
      resetCharacterDesignerState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCharacterDesignerError(`Saving custom character failed: ${message}`);
    } finally {
      setCharacterDesignerSaving(false);
      endBusyOperation(busyOperationId);
    }
  }, [
    beginBusyOperation,
    characterDesignerMode,
    characterDesignerPreview,
    characterLibraryScope,
    customCharacters,
    currentUser?.uid,
    editingCharacterId,
    endBusyOperation,
    handleGlobalCharacterChange,
    resetCharacterDesignerState,
  ]);

  const handleDeleteCustomCharacter = useCallback(async (character: AudioMvpCharacter) => {
    if (!window.confirm(`Delete ${character.name} from this character library?`)) return;

    const busyOperationId = beginBusyOperation(`Deleting ${character.name}…`);
    setPendingDeleteCharacterId(character.id);
    try {
      if (characterLibraryScope) {
        const { db } = initFirebase();
        const collectionRef = characterLibraryScope.kind === 'tenant'
          ? collection(db, 'tenants', characterLibraryScope.tenantId, 'audioCharacters')
          : collection(db, 'guides', characterLibraryScope.guideId, 'audioCharacters');
        await deleteDoc(doc(collectionRef, character.id));
      }
      setCustomCharacters((previous) => previous.filter((item) => item.id !== character.id));
      if (globalSettings.characterId === character.id) {
        void handleGlobalCharacterChange('');
      }
      if (editingCharacterId === character.id) {
        setCharacterDesignerOpen(false);
        resetCharacterDesignerState();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCustomCharactersError(`Deleting character failed: ${message}`);
    } finally {
      setPendingDeleteCharacterId(null);
      endBusyOperation(busyOperationId);
    }
  }, [
    beginBusyOperation,
    editingCharacterId,
    endBusyOperation,
    globalSettings.characterId,
    handleGlobalCharacterChange,
    resetCharacterDesignerState,
    characterLibraryScope,
  ]);

  const handleGlobalVoiceChange = (voiceId: string) => {
    setHasExplicitVoiceSelection(true);
    setGlobalSettings((previous) => ({
      ...previous,
      voiceId,
      directorNote: clearCompiledPromptCustomization(previous.directorNote),
    }));
  };

  const handleGlobalContentVersionChange = (contentVersion: ContentVersion) => {
    setGlobalSettings((previous) => ({
      ...previous,
      contentVersion,
      directorNote: createDefaultDirectorNote(contentVersion),
    }));
  };

  const handleScriptEnhancementLimitChange = (limit: ScriptEnhancementLimit) => {
    setGlobalSettings((previous) => ({
      ...previous,
      scriptEnhancementLimit: limit,
      directorNote: clearCompiledPromptCustomization(previous.directorNote),
    }));
  };

  const handleDirectorNoteFieldChange = (field: 'scene' | 'style' | 'pacing' | 'tone', value: string) => {
    setGlobalSettings((previous) => ({
      ...previous,
      directorNote: {
        ...clearGeneratedPerformanceGuidelines(
          clearCompiledPromptCustomization(previous.directorNote),
        ),
        [field]: value,
      },
    }));
  };

  const handleDirectorNoteDialogDone = async () => {
    const selected = selectedCharacter;
    const where = globalSettings.directorNote.scene.trim();
    const who = globalSettings.directorNote.style.trim();
    const what = globalSettings.directorNote.pacing.trim();
    const how = globalSettings.directorNote.tone.trim();

    if (!selected || (!where && !who && !what && !how)) {
      setGlobalSettings((previous) => ({
        ...previous,
        directorNote: clearGeneratedPerformanceGuidelines(previous.directorNote),
      }));
      return true;
    }

    const busyOperationId = beginBusyOperation('Generating detailed performance guidelines…');
    setGenerationError(null);
    try {
      const result = await generateDetailedPerformanceGuidelines({
        where,
        who,
        what,
        how,
        characterName: selected.name,
        characterRole: selected.role,
        characterContext: selected.context || selected.personalityDNA || undefined,
        characterStaticInstruction: selected.staticInstruction || undefined,
      });

      setGlobalSettings((previous) => ({
        ...previous,
        directorNote: {
          ...clearCompiledPromptCustomization(previous.directorNote),
          generatedPerformanceGuidelines: result.detailedPerformanceGuidelines.trim(),
        },
      }));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGenerationError(`Detailed performance guidelines generation failed: ${message}`);
      return false;
    } finally {
      endBusyOperation(busyOperationId);
    }
  };

  const handleGeneratedPerformanceGuidelinesChange = (value: string) => {
    setGlobalSettings((previous) => ({
      ...previous,
      directorNote: {
        ...clearCompiledPromptCustomization(previous.directorNote),
        generatedPerformanceGuidelines: value,
      },
    }));
  };

  const handleCompiledPromptChange = (value: string) => {
    setGlobalSettings((previous) => ({
      ...previous,
      directorNote: {
        ...previous.directorNote,
        compiledPromptOverride: value,
        isPromptCustomized: true,
      },
    }));
  };

  const persistSessionSnapshot = async () => {
    const nextSessionId = sessionId ?? createSessionId();
    await bootstrapAudioSession({
      sessionId: nextSessionId,
      context: {
        flow: 'audio-director',
        audioDirector: summaryPayload,
      },
    });
    setSessionId(nextSessionId);
    return nextSessionId;
  };

  const playVoicePreview = async (voiceId: string, forceRestart = false) => {
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
    }

    if (!forceRestart && playingVoiceId === voiceId) {
      setPlayingVoiceId(null);
      return;
    }

    const audio = new Audio(`/voice-samples/${voiceId.toLowerCase()}.wav`);
    audio.onended = () => setPlayingVoiceId(null);
    voiceAudioRef.current = audio;
    setPlayingVoiceId(voiceId);

    try {
      await audio.play();
    } catch {
      setPlayingVoiceId(null);
    }
  };

  const handleVoicePreview = async (voiceId: string) => {
    await playVoicePreview(voiceId, false);
  };

  const handleVoicePreviewRestart = async (voiceId: string) => {
    await playVoicePreview(voiceId, true);
  };

  const handleSaveToBackend = async () => {
    const busyOperationId = beginBusyOperation('Saving session snapshot…');
    setSaveStatus('saving');
    setSaveMessage(null);
    try {
      await persistSessionSnapshot();
      setSaveStatus('saved');
      setSaveMessage('Session snapshot created successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveStatus('error');
      setSaveMessage(`Save failed: ${message}`);
    } finally {
      endBusyOperation(busyOperationId);
    }
  };

  const handleDownloadConfig = () => {
    downloadJson('audio-director-gemini-request-source.json', promptPreviewPayload);
  };

  const ensureEnhancementEntries = async (
    language: string,
    targetItems: AudioPoiDraft[] = items,
    forceRegenerate = false,
  ): Promise<Record<string, EnhancementEntry>> => {
    const existingLanguageCache = enhancementCache[language] ?? {};
    const nextLanguageCache: Record<string, EnhancementEntry> = { ...existingLanguageCache };
    const busyOperationId = beginBusyOperation(
      forceRegenerate ? `Regenerating polished ${langLabel(language)} script…` : `Generating polished ${langLabel(language)} script…`,
    );
    setIsEnhancing(true);
    try {
      if (!selectedCharacter) {
        setGenerationError('Select a character before polishing the script.');
        setCharacterPickerOpen(true);
        return existingLanguageCache;
      }

      for (const item of targetItems) {
        updateBusyOperation(
          busyOperationId,
          `${forceRegenerate ? 'Regenerating' : 'Generating'} polished ${langLabel(language)} script for ${item.title.trim() || item.spotId}…`,
        );
        const settings = getItemSettings(item);
        const character = getCharacter(settings.characterId) ?? selectedCharacter;
        if (!character) {
          throw new Error('Select a character before polishing the script.');
        }
        const sourceText = item.scriptText;
        const existing = existingLanguageCache[item.spotId];
        if (!forceRegenerate && existing && existing.sourceText === sourceText) {
          nextLanguageCache[item.spotId] = existing;
          continue;
        }

        const result = await enhanceScript({
          scriptContent: sourceText,
          characterName: character.name,
          characterRole: character.role,
          contextDirective: settings.directorNote.scene || undefined,
          cueDensity: settings.scriptEnhancementLimit,
        });
        const enhancedText = result.enhancedScript;
        const validation = validateEnhancedScript(enhancedText);

        nextLanguageCache[item.spotId] = {
          sourceText,
          enhancedText,
          isEdited: false,
          generatedAt: Date.now(),
          phoneticOverrides: existing?.phoneticOverrides ?? [],
          validation,
        };
      }
    } finally {
      setIsEnhancing(false);
      endBusyOperation(busyOperationId);
    }

    setEnhancementCache((previous) => ({
      ...previous,
      [language]: nextLanguageCache,
    }));

    if (targetItems.some((item) => {
      const entry = nextLanguageCache[item.spotId];
      const previousEntry = existingLanguageCache[item.spotId];
      if (!entry) return false;
      return (
        !previousEntry
        || previousEntry.enhancedText !== entry.enhancedText
        || previousEntry.sourceText !== entry.sourceText
        || previousEntry.isEdited !== entry.isEdited
      );
    })) {
      setGlobalSettings((previous) => ({
        ...previous,
        directorNote: clearCompiledPromptCustomization(previous.directorNote),
      }));
    }

    return nextLanguageCache;
  };

  const handleEnhanceActiveLanguage = async (forceRegenerate = false) => {
    try {
      setGenerationError(null);
      await ensureEnhancementEntries(coreLanguage, items, forceRegenerate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGenerationError(`Script enhancement failed: ${message}`);
    }
  };

  const handleRegenerateStopEnhancement = async (language: string, item: AudioPoiDraft) => {
    try {
      const existing = enhancementCache[language]?.[item.spotId];
      if (
        existing?.isEdited
        && !window.confirm('Regenerating this stop will overwrite your edited performance script. Continue?')
      ) {
        return;
      }
      setGenerationError(null);
      await ensureEnhancementEntries(language, [item], true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGenerationError(`Script enhancement failed: ${message}`);
    }
  };

  const handleEnhancedScriptChange = (language: string, item: AudioPoiDraft, nextText: string) => {
    const existing = enhancementCache[language]?.[item.spotId];
    const sourceText = existing?.sourceText ?? item.scriptText;
    const validation = validateEnhancedScript(nextText);

    setGlobalSettings((previous) => ({
      ...previous,
      directorNote: clearCompiledPromptCustomization(previous.directorNote),
    }));

    setEnhancementCache((previous) => ({
      ...previous,
      [language]: {
        ...(previous[language] ?? {}),
        [item.spotId]: {
          sourceText,
          enhancedText: nextText,
          isEdited: true,
          generatedAt: existing?.generatedAt ?? Date.now(),
          phoneticOverrides: existing?.phoneticOverrides ?? [],
          validation,
        },
      },
    }));
  };

  const handlePhoneticOverridesChange = (
    language: string,
    item: AudioPoiDraft,
    overrides: Array<{ source: string; target: string }>,
  ) => {
    const existing = enhancementCache[language]?.[item.spotId];
    const sourceText = existing?.sourceText ?? item.scriptText;
    const enhancedText = existing?.enhancedText ?? item.scriptText;
    const validation = validateEnhancedScript(enhancedText);

    setEnhancementCache((previous) => ({
      ...previous,
      [language]: {
        ...(previous[language] ?? {}),
        [item.spotId]: {
          sourceText,
          enhancedText,
          isEdited: existing?.isEdited ?? false,
          generatedAt: existing?.generatedAt ?? Date.now(),
          phoneticOverrides: overrides,
          validation,
        },
      },
    }));
  };

  const setJapaneseReadingEntry = (
    language: string,
    item: AudioPoiDraft,
    sourceText: string,
    hiraganaText: string,
    isEdited: boolean,
  ) => {
    const nextEntry: JapaneseReadingEntry = {
      sourceText,
      hiraganaText,
      isEdited,
      generatedAt: Date.now(),
    };
    setReadingAssistCache((previous) => ({
      ...previous,
      [language]: {
        ...(previous[language] ?? {}),
        [item.spotId]: nextEntry,
      },
    }));
    return nextEntry;
  };

  const ensureJapaneseReadingEntry = async (
    language: string,
    item: AudioPoiDraft,
    sourceText: string,
  ): Promise<JapaneseReadingEntry | null> => {
    if (language !== 'ja') return null;

    const existing = readingAssistCache[language]?.[item.spotId];
    if (existing && existing.sourceText === sourceText && existing.hiraganaText.trim()) {
      return existing;
    }
    const busyOperationId = beginBusyOperation(`Generating Hiragana reading for ${item.title.trim() || item.spotId}…`);
    const result = await generateJapaneseHiragana({
      scriptContent: sourceText,
    }).finally(() => {
      endBusyOperation(busyOperationId);
    });
    return setJapaneseReadingEntry(language, item, sourceText, result.hiraganaText.trim(), false);
  };

  const runGeneration = async () => {
    if (items.length === 0) {
      setGenerationError('Add guide text first to prepare audio.');
      return;
    }
    if (!selectedCharacter) {
      setGenerationError('Select a character before generating audio.');
      setCharacterPickerOpen(true);
      return;
    }

    const language = coreLanguage;
    setGenerationError(null);
    setIsGenerating(true);
    // Treat each full generate click as a fresh review run so the results panel
    // reflects only the audio files produced in that run.
    setAudioFiles([]);
    setSrtFiles([]);
    setProgressSummary({
      completed: 0,
      total: items.length,
      currentLabel: 'Preparing assets',
    });
    setItemStates({});

    let nextAudioFiles: LanguageAudio[] = [];
    let nextSrtFiles: LanguageSRT[] = [];
    let completed = 0;
    const runStartedAt = performance.now();
    const busyOperationId = beginBusyOperation('Preparing audio generation…');

    try {
      updateBusyOperation(busyOperationId, 'Saving session snapshot…');
      const activeSessionId = await persistSessionSnapshot();

      updateBusyOperation(busyOperationId, `Preparing ${langLabel(language)} audio generation…`);
      setProgressSummary((previous) => ({
        ...previous,
        currentLabel: `Preparing ${langLabel(language)}`,
      }));
      const languageEnhancementEntries = enhancementCache[language] ?? {};

      for (const item of items) {
        const settings = getItemSettings(item);
        const character = getCharacter(settings.characterId) ?? selectedCharacter;
        const voice = getVoice(settings.voiceId);
        if (!character) {
          throw new Error('Select a character before generating audio.');
        }
        const stateKey = buildGenerationStateKey(language, item.spotId);
        const generationTarget = embeddedHistoryTarget && embeddedHistoryTarget.lang === language
          ? embeddedHistoryTarget
          : null;
        const requestSpotId = generationTarget?.spotId ?? item.spotId;
        const requestTitle = generationTarget?.spotTitle?.trim() || item.title.trim() || '';
        const sourceText = item.scriptText;
        const enhancementEntry = languageEnhancementEntries[item.spotId];
        const effectiveText = scriptEnhancementEnabled
          ? enhancementEntry?.enhancedText ?? sourceText
          : sourceText;
        const validation = enhancementEntry?.validation ?? createEmptyValidation();

        if (scriptEnhancementEnabled && !validation.isValid) {
          throw new Error('Fix enhancement tags in the polished script before generating audio.');
        }

        const japaneseReadingEntry = await ensureJapaneseReadingEntry(language, item, effectiveText);
        const ttsSourceText = language === 'ja'
          ? japaneseReadingEntry?.hiraganaText?.trim() || effectiveText
          : effectiveText;
        const preprocessing = preprocessScriptForLanguage(language, ttsSourceText);
        setItemStates((previous) => ({
          ...previous,
          [stateKey]: {
            status: 'generating',
            label: 'Script',
            message: `${langLabel(language)} generation in progress`,
            originalScript: sourceText,
            finalScript: ttsSourceText,
          },
        }));
        setProgressSummary((previous) => ({
          ...previous,
          currentLabel: 'Generating script',
        }));
        updateBusyOperation(
          busyOperationId,
          `Generating ${langLabel(language)} audio for ${item.title.trim() || requestSpotId}…`,
        );

        const response = await generateAudioForLanguage({
          sessionId: activeSessionId,
          scripts: [{
            spotId: requestSpotId,
            spotNumber: item.spotNumber,
            title: requestTitle,
          }],
          voiceId: settings.voiceId,
          language,
          historyTarget: generationTarget
            ? {
              tenantId: generationTarget.tenantId,
              guideId: generationTarget.guideId,
              spotId: generationTarget.spotId,
              spotTitle: generationTarget.spotTitle,
              lang: generationTarget.lang,
            }
            : undefined,
          directorNote: buildDirectorPayload({
            settings,
            character,
            voice,
            scriptText: preprocessing.processedText,
            poiName: requestTitle,
            projectTitle: effectiveGuideTitle,
          }),
        });

        const generatedAudio = response.audioFiles[0];
        if (!generatedAudio?.audioUrl) {
          throw new Error(
            generatedAudio?.error?.trim() || 'The generated script did not return a playable audio file.',
          );
        }

        const enrichedGeneratedAudio = {
          ...generatedAudio,
          scriptText: effectiveText,
        };

        nextAudioFiles = upsertLanguageAudio(nextAudioFiles, language, enrichedGeneratedAudio);
        if (response.srtFiles[0]) {
          nextSrtFiles = upsertLanguageSrt(nextSrtFiles, language, response.srtFiles[0]);
        }

        completed += 1;
        setAudioFiles([...nextAudioFiles]);
        setSrtFiles([...nextSrtFiles]);
        setItemStates((previous) => ({
          ...previous,
          [stateKey]: {
            status: 'done',
            label: 'Script',
            message: language === 'ja'
              ? 'Japanese Hiragana reading applied before TTS.'
              : preprocessing.preprocessingNotes.join(' ') || 'Ready to review',
            originalScript: sourceText,
            finalScript: ttsSourceText,
          },
        }));
        setProgressSummary((previous) => ({
          ...previous,
          completed,
        }));
      }

      setProgressSummary((previous) => ({
        ...previous,
        currentLabel: 'Generation complete',
      }));
      updateBusyOperation(busyOperationId, 'Finalizing generated audio…');

      setGenerationHistory((previous) => [
        {
          runId: `${activeSessionId}-${Date.now().toString(36)}`,
          generatedAt: Date.now(),
          coreLanguage: language,
          label: `${langLabel(language)} generation run`,
          audioFiles: nextAudioFiles,
          srtFiles: nextSrtFiles,
          itemCount: items.length,
        },
        ...previous,
      ]);
      setGenerationCompletedAt(Date.now());
      setLastGenerationLatencyMs(Math.max(0, Math.round(performance.now() - runStartedAt)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGenerationError(`Audio generation failed: ${message}`);
    } finally {
      setIsGenerating(false);
      endBusyOperation(busyOperationId);
    }
  };

  const currentScriptLabel = scriptEnhancementEnabled ? 'Polished script' : 'Original script';
  const currentJapaneseReadingEntry = useMemo(() => {
    if (coreLanguage !== 'ja' || !currentItem) return undefined;
    return activeReadingEntries[currentItem.spotId];
  }, [activeReadingEntries, coreLanguage, currentItem]);
  const currentJapaneseReadingText = currentJapaneseReadingEntry?.hiraganaText ?? '';
  const currentJapaneseReadingStale = coreLanguage === 'ja'
    && Boolean(currentItem)
    && Boolean(currentJapaneseReadingEntry)
    && (currentJapaneseReadingEntry?.sourceText ?? '') !== currentScriptText;

  const handleCurrentScriptTextChange = (nextText: string) => {
    setGlobalSettings((previous) => ({
      ...previous,
      directorNote: clearCompiledPromptCustomization(previous.directorNote),
    }));

    if (!currentItem) {
      setManuscriptText(nextText);
      return;
    }

    if (scriptEnhancementEnabled) {
      handleEnhancedScriptChange(coreLanguage, currentItem, nextText);
      return;
    }

    setManuscriptText(nextText);
  };

  const handleJapaneseReadingTextChange = (nextText: string) => {
    if (coreLanguage !== 'ja' || !currentItem) return;
    setGlobalSettings((previous) => ({
      ...previous,
      directorNote: clearCompiledPromptCustomization(previous.directorNote),
    }));
    setJapaneseReadingEntry(coreLanguage, currentItem, currentScriptText, nextText, true);
  };

  const handleGenerateJapaneseReading = async () => {
    if (coreLanguage !== 'ja' || !currentItem || !currentScriptText.trim()) return;

    const existing = activeReadingEntries[currentItem.spotId];
    if (
      existing?.isEdited
      && existing.sourceText === currentScriptText
      && !window.confirm('Regenerating the Hiragana reading will overwrite your manual reading edits. Continue?')
    ) {
      return;
    }

    setGenerationError(null);
    const busyOperationId = beginBusyOperation('Generating Hiragana reading…');
    setIsGeneratingJapaneseReading(true);
    try {
      const result = await generateJapaneseHiragana({
        scriptContent: currentScriptText,
      });
      setGlobalSettings((previous) => ({
        ...previous,
        directorNote: clearCompiledPromptCustomization(previous.directorNote),
      }));
      setJapaneseReadingEntry(coreLanguage, currentItem, currentScriptText, result.hiraganaText.trim(), false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGenerationError(`Japanese reading conversion failed: ${message}`);
    } finally {
      setIsGeneratingJapaneseReading(false);
      endBusyOperation(busyOperationId);
    }
  };

  return {
    activeEnhancementEntries,
    activeReadingEntries,
    allCharacters,
    analysisPhase,
    audioFiles,
    canAdvance,
    canManageCustomCharacters: Boolean(currentUser?.uid),
    characterPickerOpen,
    characterPickerTab,
    characterDesignerError,
    characterDesignerGenerating,
    characterDesignerInitialValues,
    characterDesignerMode,
    characterDesignerOpen,
    characterDesignerPreview,
    characterDesignerSaving,
    configPreviewOpen,
    coreLanguage,
    customCharacters,
    customCharactersError,
    customCharactersLoading,
    currentScreen,
    currentJapaneseReadingStale,
    currentJapaneseReadingText,
    currentScriptLabel,
    currentScriptText,
    detectedLangLabel,
    directorNoteEditorOpen,
    estimatedTokens,
    femaleVoices,
    generationError,
    generationCompletedAt,
    hasBusyOverlay,
    getItemSettings,
    globalCompiledPrompt,
    globalRecommendation,
    globalSettings,
    generationHistory: combinedGenerationHistory,
    handleCompiledPromptChange,
    handleCurrentScriptTextChange,
    handleDeleteCustomCharacter,
    handleDirectorNoteFieldChange,
    handleDirectorNoteDialogDone,
    handleGeneratedPerformanceGuidelinesChange,
    handleDownloadConfig,
    handleEnhanceActiveLanguage,
    handleEnhancedScriptChange,
    handleGenerateCharacterProfile,
    handleGenerateJapaneseReading,
    handlePhoneticOverridesChange,
    handleGlobalCharacterChange,
    handleGlobalContentVersionChange,
    handleGlobalVoiceChange,
    handleSaveCustomCharacter,
    handleJapaneseReadingTextChange,
    handleNavigate,
    openCreateCharacterDesigner,
    openEditCharacterDesigner,
    handleSaveToBackend,
    handleScriptEnhancementLimitChange,
    handleTxtUpload,
    handleVoicePreview,
    handleVoicePreviewRestart,
    isAnalyzing,
    isEnhancing,
    isGenerating,
    isGeneratingJapaneseReading,
    isHydratingHistory,
    lastGenerationLatencyMs,
    activeBusyLabel,
    itemStates,
    items,
    maleVoices,
    manuscriptText,
    pendingDeleteCharacterId,
    playingVoiceId,
    progressSummary,
    promptPreviewPayload,
    resultDialogRequestAt,
    runGeneration,
    runScriptAnalysis,
    saveMessage,
    saveStatus,
    scriptEnhancementEnabled,
    selectedCharacter,
    selectedVoice,
    closeCharacterDesigner,
    setCharacterPickerOpen,
    setCharacterPickerTab,
    setConfigPreviewOpen,
    setCoreLanguage,
    setDirectorNoteEditorOpen,
    setManuscriptText,
    srtFiles,
    summaryPayload,
    triggerTxtUpload,
    txtInputRef,
    voicePickerOpen,
    setVoicePickerOpen,
  };
}
