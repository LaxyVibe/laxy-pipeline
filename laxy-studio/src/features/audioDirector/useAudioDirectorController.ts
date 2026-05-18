import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  bootstrapAudioSession,
  enhanceScript,
  generateAudioForLanguage,
  generateCharacter,
  generateDirectorNote,
} from '../../api';
import { SUPPORTED_LANGUAGES, langLabel, type LanguageAudio, type LanguageSRT } from '../../types/entity';
import {
  AUDIO_MVP_VOICES,
  buildDirectorPayload,
  buildExcerpt,
  createDefaultDirectorNote,
  createDefaultSettings,
  draftCharacterFromPrompt,
  estimateTokensForSettings,
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
import type {
  AudioDirectorDraft,
  EnhancementEntry,
  GenerationHistoryEntry,
  ItemGenerationState,
  SaveStatus,
  WizardScreen,
} from './types';
import {
  AUDIO_DIRECTOR_DRAFT_STORAGE_KEY,
  buildGenerationStateKey,
  createEmptyCharacterDraft,
  createEmptyValidation,
  createSessionId,
  detectLanguageCode,
  downloadJson,
  estimateEnhancementTokens,
  preprocessScriptForLanguage,
  readStoredAudioDirectorDraft,
  sleep,
  toCharacterDraft,
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
    spotId: 'spot_001',
    spotNumber: 1,
    title: '',
    scriptText: trimmed,
    excerpt: buildExcerpt(trimmed),
    overrideEnabled: prev0?.overrideEnabled ?? false,
    overrideSettings: prev0?.overrideSettings,
  }];
}

function isWizardScreen(value: string | null): value is WizardScreen {
  return value !== null && AUDIO_DIRECTOR_WIZARD_STEPS.includes(value as WizardScreen);
}

export function useAudioDirectorController() {
  const [searchParams, setSearchParams] = useSearchParams();
  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const analysisRunRef = useRef(0);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const isEmbedded = window.self !== window.top;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [designerPrompt, setDesignerPrompt] = useState('');
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [characterCreatorOpen, setCharacterCreatorOpen] = useState(false);
  const [configPreviewOpen, setConfigPreviewOpen] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [directorNoteEditorOpen, setDirectorNoteEditorOpen] = useState(false);
  const [directorNotePrompt, setDirectorNotePrompt] = useState('');
  const [directorNoteGenerating, setDirectorNoteGenerating] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);

  const [characterDraft, setCharacterDraft] = useState(createEmptyCharacterDraft());
  const [customCharacters, setCustomCharacters] = useState<AudioMvpCharacter[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [manuscriptText, setManuscriptText] = useState('');
  const [items, setItems] = useState<AudioPoiDraft[]>([]);
  const [coreLanguage, setCoreLanguage] = useState('en');
  const [scriptEnhancementEnabled, setScriptEnhancementEnabled] = useState(false);
  const [enhancementCache, setEnhancementCache] = useState<Record<string, Record<string, EnhancementEntry>>>({});
  const defaultSettings = useMemo(() => createDefaultSettings(PRESET_AUDIO_CHARACTERS[0]), []);
  const [globalSettings, setGlobalSettings] = useState<AudioGuideSettings>(defaultSettings);
  const [audioFiles, setAudioFiles] = useState<LanguageAudio[]>([]);
  const [srtFiles, setSrtFiles] = useState<LanguageSRT[]>([]);
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryEntry[]>([]);
  const [itemStates, setItemStates] = useState<Record<string, ItemGenerationState>>({});
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGenerationLatencyMs, setLastGenerationLatencyMs] = useState<number | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState(0);
  const [detectedLangLabel, setDetectedLangLabel] = useState<string | null>(null);
  const [progressSummary, setProgressSummary] = useState({
    completed: 0,
    total: 0,
    currentLabel: '',
  });

  const allCharacters = useMemo(
    () => [...PRESET_AUDIO_CHARACTERS, ...customCharacters],
    [customCharacters],
  );

  const resetScriptBoundState = () => {
    setSessionId(null);
    setCoreLanguage('en');
    setEnhancementCache({});
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
  };

  useEffect(() => {
    const saved = readStoredAudioDirectorDraft();
    if (!saved) {
      setItems(resolveScriptDraft('', []));
      return;
    }

    if (isEmbedded) {
      resetScriptBoundState();
      setManuscriptText('');
      setScriptEnhancementEnabled(saved.scriptEnhancementEnabled ?? false);
      setCustomCharacters(saved.customCharacters ?? []);
      setGlobalSettings(saved.globalSettings ?? defaultSettings);
      setItems([]);
      return;
    }

    setManuscriptText(saved.manuscriptText ?? '');
    setSessionId(saved.sessionId ?? null);
    setCoreLanguage(saved.coreLanguage ?? 'en');
    setScriptEnhancementEnabled(saved.scriptEnhancementEnabled ?? false);
    setCustomCharacters(saved.customCharacters ?? []);
    setGlobalSettings(saved.globalSettings ?? defaultSettings);
    setEnhancementCache(saved.enhancementCache ?? {});
    setGenerationHistory(saved.generationHistory ?? []);
    setItems(resolveScriptDraft(saved.manuscriptText ?? '', saved.items ?? []));
  }, [defaultSettings, isEmbedded]);

  useEffect(() => {
    setItems((previous) => resolveScriptDraft(manuscriptText, previous));
  }, [manuscriptText]);

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

  // When embedded in an iframe, advertise readiness and receive the script via postMessage.
  useEffect(() => {
    if (!isEmbedded) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'laxy:script') {
        const text = typeof event.data.text === 'string' ? event.data.text : '';
        const manualLanguage = typeof event.data.language === 'string' && SUPPORTED_LANGUAGE_CODES.has(event.data.language)
          ? event.data.language
          : null;
        resetScriptBoundState();
        setManuscriptText(text);
        if (manualLanguage) {
          setCoreLanguage(manualLanguage);
        } else {
          const detected = detectLanguageCode(text.trim());
          if (detected) setCoreLanguage(detected.code);
        }
        setSearchParams({ screen: 'guide-settings' });
      }
    };

    window.addEventListener('message', handleMessage);
    // Signal the parent that the iframe is ready to receive the script.
    window.parent.postMessage({ type: 'laxy:ready' }, window.location.origin);

    return () => window.removeEventListener('message', handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCharacter = (characterId: string) => (
    allCharacters.find((character) => character.id === characterId)
  );
  const getVoice = (voiceId: string) => (
    AUDIO_MVP_VOICES.find((voice) => voice.id === voiceId) ?? AUDIO_MVP_VOICES[0]
  );
  const getItemSettings = (item: AudioPoiDraft) => (
    item.overrideEnabled && item.overrideSettings ? item.overrideSettings : globalSettings
  );

  const selectedCharacter = getCharacter(globalSettings.characterId) ?? PRESET_AUDIO_CHARACTERS[0];
  const selectedVoice = getVoice(globalSettings.voiceId);

  const globalRecommendation = useMemo(
    () => recommendVoice({
      character: selectedCharacter,
      manuscriptText,
      contentVersion: globalSettings.contentVersion,
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

  const globalCompiledPrompt = useMemo(
    () => resolveCompiledPrompt({
      settings: globalSettings,
      character: selectedCharacter,
      voice: selectedVoice,
      scriptText: manuscriptText,
    }),
    [globalSettings, manuscriptText, selectedCharacter, selectedVoice],
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
        const character = getCharacter(settings.characterId) ?? selectedCharacter;
        const voice = getVoice(settings.voiceId);
        return {
          spotId: item.spotId,
          spotNumber: item.spotNumber,
          title: '',
          overrideEnabled: item.overrideEnabled,
          settings: {
            ...settings,
            directorNote: {
              ...settings.directorNote,
              compiledPrompt: resolveCompiledPrompt({
                settings,
                character,
                voice,
                scriptText: item.scriptText,
              }),
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
      enhancementCache,
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
        const character = getCharacter(settings.characterId) ?? selectedCharacter;
        const voice = getVoice(settings.voiceId);
        const sourceText = item.scriptText;
        const effectiveText = scriptEnhancementEnabled
          ? enhancementCache[coreLanguage]?.[item.spotId]?.enhancedText ?? sourceText
          : sourceText;
        const preprocessing = preprocessScriptForLanguage(coreLanguage, effectiveText);
        const directorPayload = buildDirectorPayload({
          settings,
          character,
          voice,
          scriptText: effectiveText,
        });
        const contents = directorPayload.compiledPrompt.trim()
          ? `${directorPayload.compiledPrompt}\n\n#### TRANSCRIPT\n${preprocessing.processedText}`
          : preprocessing.processedText;

        return {
          spotId: item.spotId,
          spotNumber: item.spotNumber,
          title: '',
          character: {
            id: character.id,
            name: character.name,
            role: character.role,
          },
          voice: {
            id: voice.id,
            name: voice.name,
          },
          script: {
            originalText: sourceText,
            effectiveText,
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
              scriptText: preprocessing.processedText,
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
      enhancementCache,
      globalSettings,
      items,
      scriptEnhancementEnabled,
      selectedCharacter,
      sessionId,
    ],
  );

  const activeEnhancementEntries = enhancementCache[coreLanguage] ?? {};
  const currentScreen: WizardScreen = isWizardScreen(searchParams.get('screen'))
    ? searchParams.get('screen') as WizardScreen
    : 'guide-settings';
  const canAdvance = manuscriptText.trim().length > 0;

  const handleNavigate = (screen: WizardScreen) => {
    setSearchParams({ screen });
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
    const character = getCharacter(characterId) ?? PRESET_AUDIO_CHARACTERS[0];
    const recommendation = recommendVoice({
      character,
      manuscriptText,
      contentVersion: globalSettings.contentVersion,
    });
    setGlobalSettings((previous) => ({
      ...previous,
      characterId,
      voiceId: recommendation.recommendedVoiceId,
    }));
  };

  const handleGlobalVoiceChange = (voiceId: string) => {
    setGlobalSettings((previous) => ({
      ...previous,
      voiceId,
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
    }));
  };

  const handleDirectorNoteFieldChange = (field: 'scene' | 'style' | 'pacing', value: string) => {
    setGlobalSettings((previous) => ({
      ...previous,
      directorNote: {
        ...previous.directorNote,
        [field]: value,
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

  const handleGenerateDirectorNote = async () => {
    const scriptContent = items.map((item) => item.scriptText).filter(Boolean).join('\n\n');
    if (!scriptContent.trim()) return;
    setDirectorNoteGenerating(true);
    try {
      const result = await generateDirectorNote({
        scriptContent,
        characterName: selectedCharacter.name,
        characterRole: selectedCharacter.role,
        contentVersion: globalSettings.contentVersion,
        context: directorNotePrompt.trim() || undefined,
      });
      setGlobalSettings((previous) => ({
        ...previous,
        directorNote: {
          ...previous.directorNote,
          scene: result.directorNote.scene || previous.directorNote.scene,
          style: result.directorNote.style || previous.directorNote.style,
          pacing: result.directorNote.pacing || previous.directorNote.pacing,
        },
      }));
    } catch (error) {
      console.error('Director note generation failed:', error);
    } finally {
      setDirectorNoteGenerating(false);
    }
  };

  const openCreateCharacterDialog = () => {
    setEditingCharacterId(null);
    setDesignerPrompt('');
    setCharacterDraft(createEmptyCharacterDraft());
    setCharacterCreatorOpen(true);
  };

  const openEditCharacterDialog = (characterId: string) => {
    const character = customCharacters.find((item) => item.id === characterId);
    if (!character) return;
    setEditingCharacterId(characterId);
    setDesignerPrompt('');
    setCharacterDraft(toCharacterDraft(character));
    setCharacterCreatorOpen(true);
  };

  const closeCharacterCreator = () => {
    setCharacterCreatorOpen(false);
    setDesignerPrompt('');
    setEditingCharacterId(null);
    setCharacterDraft(createEmptyCharacterDraft());
  };

  const handleSaveCharacter = () => {
    if (!characterDraft.name.trim() || !characterDraft.role.trim()) return;

    const nextCharacterBase: AudioMvpCharacter = {
      id: editingCharacterId ?? `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      source: 'custom',
      ...characterDraft,
      name: characterDraft.name.trim(),
      role: characterDraft.role.trim(),
      coreTimbre: characterDraft.coreTimbre.trim(),
      personalityDNA: characterDraft.personalityDNA.trim(),
      linguisticFingerprint: characterDraft.linguisticFingerprint.trim(),
      brandPersona: characterDraft.brandPersona.trim(),
      accent: characterDraft.accent.trim(),
      staticInstruction: characterDraft.staticInstruction.trim(),
    };

    const recommendation = recommendVoice({
      character: nextCharacterBase,
      manuscriptText,
      contentVersion: globalSettings.contentVersion,
    });
    const nextCharacter: AudioMvpCharacter = {
      ...nextCharacterBase,
      recommendedVoiceId: recommendation.recommendedVoiceId,
    };

    setCustomCharacters((previous) => {
      const withoutExisting = previous.filter((item) => item.id !== nextCharacter.id);
      return [nextCharacter, ...withoutExisting];
    });

    setGlobalSettings((previous) => ({
      ...previous,
      characterId: nextCharacter.id,
      voiceId: recommendation.recommendedVoiceId,
    }));

    closeCharacterCreator();
  };

  const handleDraftCharacter = async () => {
    if (!designerPrompt.trim()) return;
    setIsGeneratingCharacter(true);
    try {
      const response = await generateCharacter({ designerPrompt });
      const character = response.character;
      setCharacterDraft({
        name: character.name,
        role: character.role,
        avatar: character.avatar,
        genderIdentity: character.genderIdentity,
        coreTimbre: character.coreTimbre,
        personalityDNA: character.personalityDNA,
        linguisticFingerprint: character.linguisticFingerprint,
        brandPersona: character.brandPersona,
        accent: character.accent ?? '',
        staticInstruction: character.staticInstruction,
        recommendedVoiceId: undefined,
      });
      setEditingCharacterId(null);
    } catch (error) {
      console.error('Character generation failed:', error);
      const drafted = draftCharacterFromPrompt(designerPrompt);
      setCharacterDraft(toCharacterDraft(drafted));
      setEditingCharacterId(null);
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

  const handleDeleteCharacter = (characterId: string) => {
    setCustomCharacters((previous) => previous.filter((item) => item.id !== characterId));
    if (globalSettings.characterId === characterId) {
      const fallback = PRESET_AUDIO_CHARACTERS[0];
      setGlobalSettings(createDefaultSettings(fallback));
    }
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

    setIsEnhancing(true);
    try {
      for (const item of targetItems) {
        const settings = getItemSettings(item);
        const character = getCharacter(settings.characterId) ?? selectedCharacter;
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
    }

    setEnhancementCache((previous) => ({
      ...previous,
      [language]: nextLanguageCache,
    }));

    return nextLanguageCache;
  };

  const handleEnhanceActiveLanguage = async (forceRegenerate = false) => {
    try {
      if (forceRegenerate) {
        const editedEntries = Object.values(activeEnhancementEntries).filter((entry) => entry.isEdited);
        if (
          editedEntries.length > 0
          && !window.confirm('Regenerating enhancement will overwrite your edited performance script. Continue?')
        ) {
          return;
        }
      }
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

  const runGeneration = async () => {
    if (items.length === 0) {
      setGenerationError('Add guide text first to prepare audio.');
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

    try {
      const activeSessionId = await persistSessionSnapshot();

      setProgressSummary((previous) => ({
        ...previous,
        currentLabel: `Preparing ${langLabel(language)}`,
      }));
      const languageEnhancementEntries = enhancementCache[language] ?? {};

      for (const item of items) {
        const settings = getItemSettings(item);
        const character = getCharacter(settings.characterId) ?? selectedCharacter;
        const voice = getVoice(settings.voiceId);
        const stateKey = buildGenerationStateKey(language, item.spotId);
        const sourceText = item.scriptText;
        const enhancementEntry = languageEnhancementEntries[item.spotId];
        const effectiveText = scriptEnhancementEnabled
          ? enhancementEntry?.enhancedText ?? sourceText
          : sourceText;
        const validation = enhancementEntry?.validation ?? createEmptyValidation();

        if (scriptEnhancementEnabled && !validation.isValid) {
          throw new Error('Fix enhancement tags in the polished script before generating audio.');
        }

        const preprocessing = preprocessScriptForLanguage(language, effectiveText);
        setItemStates((previous) => ({
          ...previous,
          [stateKey]: {
            status: 'generating',
            label: 'Script',
            message: `${langLabel(language)} generation in progress`,
            originalScript: sourceText,
            finalScript: effectiveText,
          },
        }));
        setProgressSummary((previous) => ({
          ...previous,
          currentLabel: 'Generating script',
        }));

        const response = await generateAudioForLanguage({
          sessionId: activeSessionId,
          scripts: [{
            spotId: item.spotId,
            spotNumber: item.spotNumber,
            title: '',
            scriptText: preprocessing.processedText,
          }],
          voiceId: settings.voiceId,
          language,
          directorNote: buildDirectorPayload({
            settings,
            character,
            voice,
            scriptText: effectiveText,
          }),
        });

        const generatedAudio = response.audioFiles[0];
        if (!generatedAudio?.audioUrl) {
          throw new Error(
            generatedAudio?.error?.trim() || 'The generated script did not return a playable audio file.',
          );
        }

        nextAudioFiles = upsertLanguageAudio(nextAudioFiles, language, generatedAudio);
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
            message: preprocessing.preprocessingNotes.join(' ') || 'Ready to review',
            originalScript: sourceText,
            finalScript: effectiveText,
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
      setLastGenerationLatencyMs(Math.max(0, Math.round(performance.now() - runStartedAt)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGenerationError(`Audio generation failed: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const currentScriptText = useMemo(() => {
    const currentItem = items[0];
    if (!currentItem) return '';
    if (!scriptEnhancementEnabled) {
      return currentItem.scriptText ?? '';
    }
    return activeEnhancementEntries[currentItem.spotId]?.enhancedText ?? currentItem.scriptText ?? '';
  }, [activeEnhancementEntries, items, scriptEnhancementEnabled]);

  const currentScriptLabel = scriptEnhancementEnabled ? 'Polished script' : 'Original script';

  const handleCurrentScriptTextChange = (nextText: string) => {
    const currentItem = items[0];
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

  return {
    activeEnhancementEntries,
    allCharacters,
    analysisPhase,
    audioFiles,
    canAdvance,
    characterCreatorOpen,
    characterDraft,
    characterPickerOpen,
    configPreviewOpen,
    coreLanguage,
    currentScreen,
    currentScriptLabel,
    currentScriptText,
    customCharacters,
    detectedLangLabel,
    designerPrompt,
    directorNoteEditorOpen,
    directorNoteGenerating,
    directorNotePrompt,
    editingCharacterId,
    estimatedTokens,
    femaleVoices,
    generationError,
    getItemSettings,
    globalCompiledPrompt,
    globalRecommendation,
    globalSettings,
    generationHistory,
    handleCompiledPromptChange,
    handleCurrentScriptTextChange,
    handleDeleteCharacter,
    handleDirectorNoteFieldChange,
    handleDownloadConfig,
    handleDraftCharacter,
    handleEnhanceActiveLanguage,
    handleEnhancedScriptChange,
    handlePhoneticOverridesChange,
    handleGenerateDirectorNote,
    handleGlobalCharacterChange,
    handleGlobalContentVersionChange,
    handleGlobalVoiceChange,
    handleNavigate,
    handleSaveCharacter,
    handleSaveToBackend,
    handleScriptEnhancementLimitChange,
    handleTxtUpload,
    handleVoicePreview,
    handleVoicePreviewRestart,
    isAnalyzing,
    isEnhancing,
    isGenerating,
    isGeneratingCharacter,
    lastGenerationLatencyMs,
    itemStates,
    items,
    maleVoices,
    manuscriptText,
    openCreateCharacterDialog,
    openEditCharacterDialog,
    playingVoiceId,
    progressSummary,
    promptPreviewPayload,
    runGeneration,
    runScriptAnalysis,
    saveMessage,
    saveStatus,
    scriptEnhancementEnabled,
    selectedCharacter,
    selectedVoice,
    setCharacterCreatorOpen,
    setCharacterDraft,
    setCharacterPickerOpen,
    setConfigPreviewOpen,
    setCoreLanguage,
    setDesignerPrompt,
    setDirectorNoteEditorOpen,
    setDirectorNotePrompt,
    setManuscriptText,
    setScriptEnhancementEnabled,
    srtFiles,
    summaryPayload,
    triggerTxtUpload,
    txtInputRef,
    voicePickerOpen,
    setVoicePickerOpen,
    closeCharacterCreator,
  };
}
