import { useEffect, useMemo, useRef, useState } from 'react';
import { francAll } from 'franc-min';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Container,
  Divider,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LibraryMusicOutlinedIcon from '@mui/icons-material/LibraryMusicOutlined';
import {
  bootstrapAudioSession,
  generateAudioForLanguage,
  translateLanguage,
  type AudioGenerateLanguageResponse,
} from '../api';
import {
  SUPPORTED_LANGUAGES,
  langLabel,
  type LanguageAudio,
  type LanguageSRT,
} from '../types/entity';
import {
  AUDIO_MVP_VOICES,
  CONTENT_VERSION_OPTIONS,
  PRESET_AUDIO_CHARACTERS,
  SCRIPT_ENHANCEMENT_OPTIONS,
  SCRIPT_TAG_EXAMPLES,
  buildDirectorPayload,
  createDefaultDirectorNote,
  createDefaultSettings,
  draftCharacterFromPrompt,
  estimateTokensForSettings,
  normalizeAudioGuideSettings,
  normalizeAudioMvpCharacter,
  normalizeAudioPoiDraft,
  recommendVoice,
  resolveCompiledPrompt,
  resolvePoiDrafts,
  splitParagraphs,
  type AudioGuideSettings,
  type AudioMvpCharacter,
  type AudioPoiDraft,
  type ContentVersion,
  type ScriptEnhancementLimit,
  type VoiceGenderFilter,
} from '../features/audioMvp/model';

type ProgressStatus = 'idle' | 'generating' | 'done' | 'error';

type ItemGenerationState = {
  status: ProgressStatus;
  message?: string;
};

type PersistedDraft = {
  manuscriptText: string;
  coreLanguage: string;
  selectedLanguages: string[];
  globalSettings: AudioGuideSettings;
  items: AudioPoiDraft[];
  sessionId: string | null;
};

type CharacterEditorDraft = Omit<AudioMvpCharacter, 'id' | 'source'>;

const DEFAULT_CORE_LANGUAGE = 'en';
const DETECT_MIN_LENGTH = 30;
const DETECT_DEBOUNCE_MS = 700;
const DETECT_MIN_CONFIDENCE = 0.86;
const DETECT_MIN_MARGIN = 0.08;
const DETECT_AUTO_APPLY_CONFIDENCE = 0.97;
const LOCAL_DRAFT_STORAGE_KEY = 'audio-mvp-draft-v3';
const CUSTOM_CHARACTER_STORAGE_KEY = 'audio-mvp-characters-v3';
const SESSION_STORAGE_KEY = 'audio-mvp-session-v3';

const ISO3_TO_LANGUAGE_CODE: Record<string, string> = {
  eng: 'en',
  jpn: 'ja',
  kor: 'ko',
  cmn: 'zh',
  zho: 'zh',
  fra: 'fr',
  deu: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  tha: 'th',
  vie: 'vi',
  ind: 'id',
  msa: 'ms',
  arb: 'ar',
  rus: 'ru',
};

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createSessionId(): string {
  return `audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneSettings(settings: AudioGuideSettings): AudioGuideSettings {
  return JSON.parse(JSON.stringify(settings)) as AudioGuideSettings;
}

function buildVoicePreviewSentence(language: string): string {
  if (language.startsWith('zh')) return '您好，這是一段語音導覽設定預覽。';
  if (language === 'ja') return 'こんにちは。これは音声ガイド設定のプレビューです。';
  if (language === 'ko') return '안녕하세요. 이것은 오디오 가이드 설정 미리보기입니다.';
  return 'Hello, this is a preview of the audio guide settings.';
}

function downloadSrt(language: string, rawSrt: string) {
  const blob = new Blob([rawSrt], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${language}.srt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function detectChineseVariant(text: string): 'zh-TW' | 'zh-CN' {
  const simplifiedHints = text.match(/[这后发国云体台万与门术级]/g)?.length ?? 0;
  const traditionalHints = text.match(/[這後發國雲體臺萬與門術級]/g)?.length ?? 0;
  return traditionalHints >= simplifiedHints ? 'zh-TW' : 'zh-CN';
}

function detectLanguageCode(text: string): { code: string; confidence: number } | null {
  const candidates = francAll(text, { minLength: DETECT_MIN_LENGTH });
  if (candidates.length === 0) return null;

  const [bestIso, bestScore] = candidates[0];
  if (!bestIso || bestIso === 'und') return null;

  const secondScore = candidates[1]?.[1] ?? 0;
  const confidence = Number.isFinite(bestScore) ? bestScore : 0;
  const margin = confidence - secondScore;
  if (confidence < DETECT_MIN_CONFIDENCE || margin < DETECT_MIN_MARGIN) return null;

  const mapped = ISO3_TO_LANGUAGE_CODE[bestIso];
  if (!mapped) return null;

  if (mapped === 'zh') {
    return {
      code: detectChineseVariant(text),
      confidence,
    };
  }

  return {
    code: mapped,
    confidence,
  };
}

function upsertLanguageAudio(
  previous: LanguageAudio[],
  language: string,
  item: AudioGenerateLanguageResponse['audioFiles'][number],
): LanguageAudio[] {
  if (!item.audioUrl) return previous;
  const existingIndex = previous.findIndex((entry) => entry.lang === language);
  const nextSpot = {
    spotId: item.spotId,
    spotNumber: item.spotNumber,
    title: item.title,
    audioUrl: item.audioUrl,
    durationMs: item.durationMs,
  };

  if (existingIndex < 0) {
    return [
      ...previous,
      {
        lang: language,
        label: langLabel(language),
        audioUrl: nextSpot.audioUrl,
        durationMs: nextSpot.durationMs,
        approved: false,
        spots: [nextSpot],
      },
    ];
  }

  const existing = previous[existingIndex];
  const mergedSpots = [
    ...(existing.spots ?? []).filter((spot) => spot.spotId !== nextSpot.spotId),
    nextSpot,
  ].sort((left, right) => left.spotNumber - right.spotNumber);

  const updated = [...previous];
  updated[existingIndex] = {
    ...existing,
    audioUrl: mergedSpots[0]?.audioUrl ?? existing.audioUrl,
    durationMs: mergedSpots.reduce((sum, spot) => sum + spot.durationMs, 0),
    spots: mergedSpots,
  };
  return updated;
}

function upsertLanguageSrt(
  previous: LanguageSRT[],
  language: string,
  item: AudioGenerateLanguageResponse['srtFiles'][number],
): LanguageSRT[] {
  const existingIndex = previous.findIndex((entry) => entry.lang === language);
  const srtSegment = {
    lang: language,
    label: langLabel(language),
    entries: item.entries,
    rawSrt: item.rawSrt,
  };

  if (existingIndex < 0) {
    return [...previous, srtSegment];
  }

  const updated = [...previous];
  updated[existingIndex] = {
    ...srtSegment,
    entries: [
      ...updated[existingIndex].entries.filter((entry) => !item.entries.some((next) => next.index === entry.index)),
      ...item.entries,
    ].sort((left, right) => left.index - right.index),
    rawSrt: [
      updated[existingIndex].rawSrt.split('\n\n').filter(Boolean),
      [item.rawSrt],
    ].flat().join('\n\n'),
  };
  return updated;
}

function toCharacterEditorDraft(character: AudioMvpCharacter): CharacterEditorDraft {
  return {
    name: character.name,
    role: character.role,
    avatar: character.avatar,
    genderIdentity: character.genderIdentity,
    coreTimbre: character.coreTimbre,
    personalityDNA: character.personalityDNA,
    linguisticFingerprint: character.linguisticFingerprint,
    brandPersona: character.brandPersona,
    accent: character.accent,
    staticInstruction: character.staticInstruction,
    recommendedVoiceId: character.recommendedVoiceId,
  };
}

function createEmptyCharacterDraft(): CharacterEditorDraft {
  return {
    name: '',
    role: '',
    avatar: '🎙️',
    genderIdentity: 'neutral',
    coreTimbre: '',
    personalityDNA: '',
    linguisticFingerprint: '',
    brandPersona: '',
    accent: '',
    staticInstruction: '',
    recommendedVoiceId: 'Aoede',
  };
}

function statusLabel(status: ProgressStatus): string {
  if (status === 'done') return '完成';
  if (status === 'error') return '失敗';
  if (status === 'generating') return '生成中';
  return '待命';
}

export default function AudioMvpPage() {
  const txtInputRef = useRef<HTMLInputElement | null>(null);
  const detectTimerRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  const [customCharacters, setCustomCharacters] = useState<AudioMvpCharacter[]>(
    () => readLocalStorage<unknown[]>(CUSTOM_CHARACTER_STORAGE_KEY, [])
      .map(normalizeAudioMvpCharacter)
      .filter((item): item is AudioMvpCharacter => Boolean(item)),
  );
  const allCharacters = useMemo(
    () => [...PRESET_AUDIO_CHARACTERS, ...customCharacters],
    [customCharacters],
  );

  const defaultSettings = useMemo(
    () => createDefaultSettings(PRESET_AUDIO_CHARACTERS[0]),
    [],
  );

  const [tabIndex, setTabIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(
    () => readLocalStorage<string | null>(SESSION_STORAGE_KEY, null),
  );
  const [manuscriptText, setManuscriptText] = useState('');
  const [items, setItems] = useState<AudioPoiDraft[]>([]);
  const [coreLanguage, setCoreLanguage] = useState(DEFAULT_CORE_LANGUAGE);
  const [coreLanguageManuallySet, setCoreLanguageManuallySet] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([DEFAULT_CORE_LANGUAGE]);
  const [languageSuggestion, setLanguageSuggestion] = useState<{
    code: string;
    confidence: number;
    autoApplied: boolean;
  } | null>(null);
  const [isDetectingLanguage, setIsDetectingLanguage] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<AudioGuideSettings>(defaultSettings);
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<VoiceGenderFilter>('all');
  const [designerPrompt, setDesignerPrompt] = useState('');
  const [characterDraft, setCharacterDraft] = useState<CharacterEditorDraft>(createEmptyCharacterDraft());
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [audioFiles, setAudioFiles] = useState<LanguageAudio[]>([]);
  const [srtFiles, setSrtFiles] = useState<LanguageSRT[]>([]);
  const [itemStates, setItemStates] = useState<Record<string, ItemGenerationState>>({});
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressSummary, setProgressSummary] = useState({
    completed: 0,
    total: 0,
    currentLabel: '',
  });

  const paragraphCount = useMemo(() => splitParagraphs(manuscriptText).length, [manuscriptText]);
  const getCharacter = (characterId: string) => allCharacters.find((item) => item.id === characterId);
  const getVoice = (voiceId: string) => AUDIO_MVP_VOICES.find((item) => item.id === voiceId) ?? AUDIO_MVP_VOICES[0];
  const selectedCharacter = getCharacter(globalSettings.characterId) ?? PRESET_AUDIO_CHARACTERS[0];
  const selectedVoice = getVoice(globalSettings.voiceId);
  const filteredVoices = useMemo(
    () => voiceGenderFilter === 'all'
      ? AUDIO_MVP_VOICES
      : AUDIO_MVP_VOICES.filter((voice) => voice.gender === voiceGenderFilter),
    [voiceGenderFilter],
  );

  const globalRecommendation = useMemo(
    () => recommendVoice({
      character: selectedCharacter,
      manuscriptText,
      contentVersion: globalSettings.contentVersion,
    }),
    [globalSettings.contentVersion, manuscriptText, selectedCharacter],
  );

  const globalCompiledPrompt = useMemo(
    () => resolveCompiledPrompt({
      settings: globalSettings,
      character: selectedCharacter,
      voice: selectedVoice,
      scriptText: manuscriptText || buildVoicePreviewSentence(coreLanguage),
    }),
    [coreLanguage, globalSettings, manuscriptText, selectedCharacter, selectedVoice],
  );

  const overriddenCount = useMemo(
    () => items.filter((item) => item.overrideEnabled).length,
    [items],
  );

  const estimatedBatchTokens = useMemo(
    () => estimateTokensForSettings({
      items,
      settingsResolver: (item) => item.overrideEnabled && item.overrideSettings ? item.overrideSettings : globalSettings,
      characterResolver: getCharacter,
      languageCount: selectedLanguages.length,
    }),
    [globalSettings, items, selectedLanguages.length, allCharacters],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const savedDraft = readLocalStorage<PersistedDraft | null>(LOCAL_DRAFT_STORAGE_KEY, null);
    if (!savedDraft) {
      setItems(resolvePoiDrafts('', []));
      return;
    }

    setManuscriptText(savedDraft.manuscriptText ?? '');
    setCoreLanguage(savedDraft.coreLanguage ?? DEFAULT_CORE_LANGUAGE);
    setSelectedLanguages(
      (savedDraft.selectedLanguages?.length ? savedDraft.selectedLanguages : [savedDraft.coreLanguage ?? DEFAULT_CORE_LANGUAGE])
        .filter(Boolean),
    );
    const normalizedSettings = normalizeAudioGuideSettings(savedDraft.globalSettings, defaultSettings);
    const normalizedItems = (savedDraft.items ?? [])
      .map((item) => normalizeAudioPoiDraft(item, normalizedSettings))
      .filter((item): item is AudioPoiDraft => Boolean(item));
    setGlobalSettings(normalizedSettings);
    setItems(resolvePoiDrafts(savedDraft.manuscriptText ?? '', normalizedItems));
    setSessionId(savedDraft.sessionId ?? readLocalStorage<string | null>(SESSION_STORAGE_KEY, null));
  }, [defaultSettings]);

  useEffect(() => {
    setItems((previous) => resolvePoiDrafts(manuscriptText, previous));
  }, [manuscriptText]);

  useEffect(() => {
    writeLocalStorage(CUSTOM_CHARACTER_STORAGE_KEY, customCharacters);
  }, [customCharacters]);

  useEffect(() => {
    writeLocalStorage(SESSION_STORAGE_KEY, sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!initializedRef.current) return;
    writeLocalStorage(LOCAL_DRAFT_STORAGE_KEY, {
      manuscriptText,
      coreLanguage,
      selectedLanguages,
      globalSettings,
      items,
      sessionId,
    } satisfies PersistedDraft);
  }, [coreLanguage, globalSettings, items, manuscriptText, selectedLanguages, sessionId]);

  useEffect(() => {
    if (detectTimerRef.current) {
      window.clearTimeout(detectTimerRef.current);
      detectTimerRef.current = null;
    }

    const normalized = manuscriptText.trim();
    if (normalized.length < DETECT_MIN_LENGTH) {
      setIsDetectingLanguage(false);
      setLanguageSuggestion(null);
      return;
    }

    setIsDetectingLanguage(true);
    detectTimerRef.current = window.setTimeout(() => {
      const detected = detectLanguageCode(normalized);
      setIsDetectingLanguage(false);

      if (!detected) {
        setLanguageSuggestion(null);
        return;
      }

      if (!coreLanguageManuallySet && detected.confidence >= DETECT_AUTO_APPLY_CONFIDENCE && detected.code !== coreLanguage) {
        setCoreLanguage(detected.code);
        setSelectedLanguages((previous) => {
          const next = previous.filter((lang) => lang !== coreLanguage);
          return Array.from(new Set([detected.code, ...next]));
        });
        setLanguageSuggestion({ ...detected, autoApplied: true });
        return;
      }

      setLanguageSuggestion({ ...detected, autoApplied: false });
    }, DETECT_DEBOUNCE_MS);

    return () => {
      if (detectTimerRef.current) {
        window.clearTimeout(detectTimerRef.current);
      }
    };
  }, [coreLanguage, coreLanguageManuallySet, manuscriptText]);

  const persistSettings = async (providedSessionId?: string): Promise<string> => {
    const nextSessionId = providedSessionId ?? sessionId ?? createSessionId();
    setSaveStatus('saving');
    setSaveMessage(null);

    try {
      await bootstrapAudioSession({
        sessionId: nextSessionId,
        context: {
          coreLanguage,
          supportedLanguages: selectedLanguages,
          selectedCharacterId: globalSettings.characterId,
          flow: 'audio-mvp',
          audioMvp: {
            savedAt: Date.now(),
            manuscriptText,
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
                title: item.title,
                scriptText: item.scriptText,
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
              };
            }),
            customCharacters,
          },
        },
      });

      setSessionId(nextSessionId);
      setSaveStatus('saved');
      setSaveMessage('設定已寫入後端 Session，可供下一輪音檔生成使用。');
      return nextSessionId;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveStatus('error');
      setSaveMessage(`設定儲存失敗：${message}`);
      throw error;
    }
  };

  const handleLanguageToggle = (language: string, checked: boolean) => {
    setSelectedLanguages((previous) => {
      const next = checked
        ? Array.from(new Set([...previous, language]))
        : previous.filter((entry) => entry !== language);
      if (!next.includes(coreLanguage)) {
        return Array.from(new Set([coreLanguage, ...next]));
      }
      return next;
    });
  };

  const handleCoreLanguageChange = (nextLanguage: string) => {
    setCoreLanguageManuallySet(true);
    setCoreLanguage(nextLanguage);
    setSelectedLanguages((previous) => Array.from(new Set([nextLanguage, ...previous.filter((language) => language !== coreLanguage)])));
  };

  const resetGlobalDirectorNote = (contentVersion: ContentVersion) => {
    setGlobalSettings((previous) => ({
      ...previous,
      directorNote: createDefaultDirectorNote(contentVersion),
    }));
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

  const handleGlobalContentVersionChange = (contentVersion: ContentVersion) => {
    const character = getCharacter(globalSettings.characterId) ?? PRESET_AUDIO_CHARACTERS[0];
    const recommendation = recommendVoice({
      character,
      manuscriptText,
      contentVersion,
    });
    setGlobalSettings((previous) => ({
      ...previous,
      contentVersion,
      voiceId: previous.voiceId || recommendation.recommendedVoiceId,
      directorNote: createDefaultDirectorNote(contentVersion),
    }));
  };

  const updatePoiSettings = (spotId: string, updater: (settings: AudioGuideSettings) => AudioGuideSettings) => {
    setItems((previous) => previous.map((item) => {
      if (item.spotId !== spotId) return item;
      const base = item.overrideEnabled && item.overrideSettings
        ? item.overrideSettings
        : cloneSettings(globalSettings);
      return {
        ...item,
        overrideEnabled: true,
        overrideSettings: updater(cloneSettings(base)),
      };
    }));
  };

  const togglePoiOverride = (spotId: string, enabled: boolean) => {
    setItems((previous) => previous.map((item) => {
      if (item.spotId !== spotId) return item;
      if (!enabled) {
        return {
          ...item,
          overrideEnabled: false,
        };
      }
      return {
        ...item,
        overrideEnabled: true,
        overrideSettings: item.overrideSettings ? cloneSettings(item.overrideSettings) : cloneSettings(globalSettings),
      };
    }));
  };

  const handleDesignerPromptDraft = () => {
    if (!designerPrompt.trim()) return;
    const drafted = draftCharacterFromPrompt(designerPrompt);
    setCharacterDraft(toCharacterEditorDraft(drafted));
    setEditingCharacterId(null);
  };

  const handleSaveCharacter = () => {
    const trimmedName = characterDraft.name.trim();
    const trimmedRole = characterDraft.role.trim();
    if (!trimmedName || !trimmedRole) return;

    const nextCharacter: AudioMvpCharacter = {
      id: editingCharacterId ?? `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      source: 'custom',
      ...characterDraft,
      name: trimmedName,
      role: trimmedRole,
      coreTimbre: characterDraft.coreTimbre.trim(),
      personalityDNA: characterDraft.personalityDNA.trim(),
      linguisticFingerprint: characterDraft.linguisticFingerprint.trim(),
      brandPersona: characterDraft.brandPersona.trim(),
      staticInstruction: characterDraft.staticInstruction.trim(),
    };

    setCustomCharacters((previous) => {
      const filtered = previous.filter((item) => item.id !== nextCharacter.id);
      return [nextCharacter, ...filtered];
    });
    setCharacterDraft(createEmptyCharacterDraft());
    setDesignerPrompt('');
    setEditingCharacterId(null);
  };

  const handleDeleteCharacter = (characterId: string) => {
    setCustomCharacters((previous) => previous.filter((item) => item.id !== characterId));
    if (globalSettings.characterId === characterId) {
      const fallbackCharacter = PRESET_AUDIO_CHARACTERS[0];
      setGlobalSettings(createDefaultSettings(fallbackCharacter));
    }
    setItems((previous) => previous.map((item) => {
      if (!item.overrideSettings || item.overrideSettings.characterId !== characterId) return item;
      return {
        ...item,
        overrideEnabled: false,
        overrideSettings: undefined,
      };
    }));
  };

  const handleLoadTxt = async (file: File) => {
    const text = await file.text();
    setManuscriptText(text);
  };

  const runPreview = async () => {
    const character = getCharacter(globalSettings.characterId) ?? PRESET_AUDIO_CHARACTERS[0];
    const voice = getVoice(globalSettings.voiceId);
    setPreviewAudioUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);

    try {
      const activeSessionId = await persistSettings();
      const response = await generateAudioForLanguage({
        sessionId: activeSessionId,
        scripts: [
          {
            spotId: 'preview_001',
            spotNumber: 1,
            title: 'Voice Preview',
            scriptText: buildVoicePreviewSentence(coreLanguage),
          },
        ],
        voiceId: globalSettings.voiceId,
        language: coreLanguage,
        directorNote: buildDirectorPayload({
          settings: globalSettings,
          character,
          voice,
          scriptText: buildVoicePreviewSentence(coreLanguage),
        }),
      });
      const previewAudio = response.audioFiles.find((item) => item.audioUrl);
      if (!previewAudio?.audioUrl) {
        throw new Error('預覽音檔未成功產生。');
      }
      setPreviewAudioUrl(previewAudio.audioUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPreviewError(`預覽失敗：${message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const buildTranslations = async (drafts: AudioPoiDraft[], languages: string[]) => {
    const translationsByLanguage: Record<string, Record<string, string>> = {};
    const scripts = drafts.map((item) => ({
      spotId: item.spotId,
      spotNumber: item.spotNumber,
      title: item.title,
      scriptText: item.scriptText,
    }));

    for (const language of languages) {
      if (language === coreLanguage) continue;
      setProgressSummary((previous) => ({
        ...previous,
        currentLabel: `翻譯 ${langLabel(language)}`,
      }));
      const translation = await translateLanguage({
        scripts,
        targetLanguage: language,
        coreLanguage,
      });
      translationsByLanguage[language] = Object.fromEntries(
        translation.spots.map((spot) => [spot.spotId, spot.translatedText]),
      );
    }

    return translationsByLanguage;
  };

  const runGeneration = async (targetItems?: AudioPoiDraft[], targetLanguages?: string[]) => {
    const drafts = targetItems ?? items;
    const languages = targetLanguages ?? selectedLanguages;

    if (drafts.length === 0) {
      setGenerationError('請先貼上講稿，並以空行分段。');
      return;
    }

    setGenerationError(null);
    setIsGenerating(true);
    setPreviewError(null);
    setProgressSummary({
      completed: 0,
      total: drafts.length * languages.length,
      currentLabel: '準備中',
    });
    setItemStates({});

    try {
      const activeSessionId = await persistSettings();
      const translationsByLanguage = await buildTranslations(drafts, languages);

      let nextAudioFiles: LanguageAudio[] = targetItems ? [...audioFiles] : [];
      let nextSrtFiles: LanguageSRT[] = targetItems ? [...srtFiles] : [];
      let completed = 0;

      if (!targetItems) {
        setAudioFiles([]);
        setSrtFiles([]);
      }

      for (const language of languages) {
        for (const item of drafts) {
          const stateKey = `${language}::${item.spotId}`;
          const settings = item.overrideEnabled && item.overrideSettings ? item.overrideSettings : globalSettings;
          const character = getCharacter(settings.characterId) ?? selectedCharacter;
          const voice = getVoice(settings.voiceId);
          const translatedText = language === coreLanguage
            ? item.scriptText
            : translationsByLanguage[language]?.[item.spotId] ?? item.scriptText;

          setItemStates((previous) => ({
            ...previous,
            [stateKey]: {
              status: 'generating',
              message: `${langLabel(language)} / ${item.title}`,
            },
          }));
          setProgressSummary((previous) => ({
            ...previous,
            currentLabel: `${langLabel(language)} / POI ${item.spotNumber}`,
          }));

          const response = await generateAudioForLanguage({
            sessionId: activeSessionId,
            scripts: [
              {
                spotId: item.spotId,
                spotNumber: item.spotNumber,
                title: item.title,
                scriptText: translatedText,
              },
            ],
            voiceId: settings.voiceId,
            language,
            directorNote: buildDirectorPayload({
              settings,
              character,
              voice,
              scriptText: translatedText,
            }),
          });

          const generatedAudio = response.audioFiles[0];
          if (!generatedAudio?.audioUrl) {
            throw new Error(`${langLabel(language)} / ${item.title} 沒有回傳可播放音檔。`);
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
            },
          }));
          setProgressSummary((previous) => ({
            ...previous,
            completed,
          }));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGenerationError(`音檔生成失敗：${message}`);
    } finally {
      setIsGenerating(false);
      setProgressSummary((previous) => ({
        ...previous,
        currentLabel: previous.completed === previous.total ? '全部完成' : previous.currentLabel,
      }));
    }
  };

  const handleRegenerateSpot = async (language: string, spotId: string) => {
    const targetItem = items.find((item) => item.spotId === spotId);
    if (!targetItem) return;
    await runGeneration([targetItem], [language]);
  };

  const saveStatusChip = saveStatus === 'saved'
    ? <Chip color="success" label="Backend Saved" size="small" />
    : saveStatus === 'saving'
      ? <Chip label="Saving..." size="small" />
      : saveStatus === 'error'
        ? <Chip color="error" label="Save Failed" size="small" />
        : <Chip variant="outlined" label="Not Saved" size="small" />;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Audio MVP
          </Typography>
          <Typography variant="body2" color="text.secondary">
            流程：音導設定與生成 → 音檔評估與重生成。
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
          <Chip label={`段落數：${paragraphCount}`} variant="outlined" />
          <Chip label={`POI Override：${overriddenCount}`} variant="outlined" />
          <Chip label={`批次語言：${selectedLanguages.length}`} variant="outlined" />
          {saveStatusChip}
        </Stack>

        <Card>
          <CardContent sx={{ pb: 1.5 }}>
            <Tabs
              value={tabIndex}
              onChange={(_, nextTab: number) => setTabIndex(nextTab)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
            >
              <Tab label="1. 音導設定與生成" />
              <Tab label="2. 音檔評估與重生成" />
            </Tabs>
          </CardContent>
        </Card>

        {tabIndex === 0 ? (
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6">Guide Manuscript</Typography>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
                    <Button
                      variant="outlined"
                      startIcon={<UploadFileIcon />}
                      onClick={() => txtInputRef.current?.click()}
                      disabled={isGenerating}
                    >
                      上傳 .txt
                    </Button>
                    <input
                      ref={txtInputRef}
                      type="file"
                      accept=".txt,text/plain"
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleLoadTxt(file);
                        event.currentTarget.value = '';
                      }}
                    />
                    <TextField
                      select
                      label="原稿語言"
                      value={coreLanguage}
                      onChange={(event) => handleCoreLanguageChange(event.target.value)}
                      sx={{ minWidth: 220 }}
                    >
                      {SUPPORTED_LANGUAGES.map((language) => (
                        <MenuItem key={language.code} value={language.code}>
                          {langLabel(language.code)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>

                  <TextField
                    label="原稿（原稿語言）"
                    multiline
                    minRows={10}
                    value={manuscriptText}
                    onChange={(event) => setManuscriptText(event.target.value)}
                    placeholder="請以空行分段；每段會被視為一個 POI。"
                    disabled={isGenerating}
                  />

                  {isDetectingLanguage ? (
                    <Typography variant="caption" color="text.secondary">
                      正在偵測原稿語言...
                    </Typography>
                  ) : null}

                  {languageSuggestion ? (
                    <Alert
                      severity={languageSuggestion.autoApplied ? 'success' : 'info'}
                      action={
                        languageSuggestion.code !== coreLanguage ? (
                          <Button
                            size="small"
                            onClick={() => {
                              setCoreLanguage(languageSuggestion.code);
                              setSelectedLanguages((previous) => Array.from(new Set([languageSuggestion.code, ...previous])));
                              setCoreLanguageManuallySet(true);
                            }}
                          >
                            套用為原稿語言
                          </Button>
                        ) : undefined
                      }
                    >
                      偵測結果：{langLabel(languageSuggestion.code)}（信心 {Math.round(languageSuggestion.confidence * 100)}%）
                      {languageSuggestion.autoApplied ? '，已自動套用。' : '。'}
                    </Alert>
                  ) : null}

                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Batch Languages</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Core language is always included. Additional target languages will be translated first, then generated POI by POI.
                    </Typography>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {SUPPORTED_LANGUAGES.map((language) => {
                        const checked = selectedLanguages.includes(language.code);
                        const disabled = language.code === coreLanguage;
                        return (
                          <FormControlLabel
                            key={language.code}
                            control={(
                              <Checkbox
                                checked={checked}
                                disabled={disabled}
                                onChange={(event) => handleLanguageToggle(language.code, event.target.checked)}
                              />
                            )}
                            label={langLabel(language.code)}
                            sx={{ mr: 2 }}
                          />
                        );
                      })}
                    </Stack>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack spacing={3}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
                    <Box>
                      <Typography variant="h6">Global Audio Guide Settings</Typography>
                      <Typography variant="body2" color="text.secondary">
                        LS-87 baseline: every POI inherits these settings unless the item override panel takes over.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="outlined"
                        startIcon={<SaveOutlinedIcon />}
                        onClick={() => void persistSettings()}
                        disabled={isGenerating || saveStatus === 'saving'}
                      >
                        Save Settings
                      </Button>
                      <Button
                        variant="contained"
                        startIcon={<PlayCircleOutlineIcon />}
                        onClick={() => void runGeneration()}
                        disabled={isGenerating}
                      >
                        {isGenerating ? '生成中...' : `開始生成音檔（約 ${estimatedBatchTokens.toLocaleString()} tokens）`}
                      </Button>
                    </Stack>
                  </Stack>

                  {saveMessage ? (
                    <Alert severity={saveStatus === 'error' ? 'error' : 'success'}>
                      {saveMessage}
                    </Alert>
                  ) : null}

                  <Stack direction={{ xs: 'column', xl: 'row' }} spacing={3} alignItems="flex-start">
                    <Stack spacing={2} sx={{ flex: 1, width: '100%' }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <TextField
                          select
                          label="Content Version"
                          value={globalSettings.contentVersion}
                          onChange={(event) => handleGlobalContentVersionChange(event.target.value as ContentVersion)}
                          fullWidth
                        >
                          {CONTENT_VERSION_OPTIONS.map((option) => (
                            <MenuItem key={option.id} value={option.id}>
                              {option.label} - {option.summary}
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField
                          select
                          label="Script Enhancement Limit"
                          value={globalSettings.scriptEnhancementLimit}
                          onChange={(event) => setGlobalSettings((previous) => ({
                            ...previous,
                            scriptEnhancementLimit: event.target.value as ScriptEnhancementLimit,
                          }))}
                          fullWidth
                        >
                          {SCRIPT_ENHANCEMENT_OPTIONS.map((option) => (
                            <MenuItem key={option.id} value={option.id}>
                              {option.label} - {option.summary}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>

                      <Alert severity="info">
                        Example audio tags: {SCRIPT_TAG_EXAMPLES.join(', ')}
                      </Alert>

                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <TextField
                          select
                          label="Character Library"
                          value={globalSettings.characterId}
                          onChange={(event) => handleGlobalCharacterChange(event.target.value)}
                          fullWidth
                        >
                          {allCharacters.map((character) => (
                            <MenuItem key={character.id} value={character.id}>
                              {character.avatar} {character.name} - {character.role}
                            </MenuItem>
                          ))}
                        </TextField>

                        <TextField
                          label="Recommended Voice"
                          value={`${globalRecommendation.recommendedVoiceId} — ${globalRecommendation.reason}`}
                          fullWidth
                          InputProps={{ readOnly: true }}
                        />
                      </Stack>

                      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                        <Stack spacing={2}>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
                            <Box>
                              <Typography variant="subtitle1" fontWeight={700}>
                                Voice Selection
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                LS-89 canonical pool uses the 6 reviewed Gemini voices only.
                              </Typography>
                            </Box>
                            <ToggleButtonGroup
                              exclusive
                              value={voiceGenderFilter}
                              onChange={(_, next: VoiceGenderFilter | null) => {
                                if (next) setVoiceGenderFilter(next);
                              }}
                              size="small"
                            >
                              <ToggleButton value="all">All</ToggleButton>
                              <ToggleButton value="female">Female</ToggleButton>
                              <ToggleButton value="male">Male</ToggleButton>
                            </ToggleButtonGroup>
                          </Stack>

                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Chip label={`Recommended: ${globalRecommendation.recommendedVoiceId}`} color="warning" />
                            {globalRecommendation.fallbackVoiceIds.map((voiceId) => (
                              <Chip key={voiceId} label={`Fallback: ${voiceId}`} variant="outlined" />
                            ))}
                            <Button
                              size="small"
                              startIcon={<AutoAwesomeIcon />}
                              onClick={() => setGlobalSettings((previous) => ({
                                ...previous,
                                voiceId: globalRecommendation.recommendedVoiceId,
                              }))}
                            >
                              套用推薦
                            </Button>
                          </Stack>

                          <Stack spacing={1.25}>
                            {filteredVoices.map((voice) => (
                              <Box
                                key={voice.id}
                                sx={{
                                  border: '1px solid',
                                  borderColor: globalSettings.voiceId === voice.id ? 'primary.main' : 'divider',
                                  borderRadius: 1.5,
                                  p: 1.5,
                                  bgcolor: globalSettings.voiceId === voice.id ? 'action.selected' : 'background.paper',
                                }}
                              >
                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                                  <Box sx={{ flex: 1 }}>
                                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                      <Typography variant="subtitle2" fontWeight={700}>
                                        {voice.name}
                                      </Typography>
                                      {globalRecommendation.recommendedVoiceId === voice.id ? (
                                        <Chip size="small" color="warning" label="Recommended" />
                                      ) : null}
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                      {voice.summary}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Tone: {voice.tone} | Best for: {voice.bestFor}
                                    </Typography>
                                  </Box>
                                  <Button
                                    variant={globalSettings.voiceId === voice.id ? 'contained' : 'outlined'}
                                    onClick={() => setGlobalSettings((previous) => ({ ...previous, voiceId: voice.id }))}
                                  >
                                    {globalSettings.voiceId === voice.id ? '已套用' : '套用聲線'}
                                  </Button>
                                </Stack>
                              </Box>
                            ))}
                          </Stack>
                        </Stack>
                      </Box>

                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <TextField
                          label="Scene"
                          multiline
                          minRows={3}
                          value={globalSettings.directorNote.scene}
                          onChange={(event) => setGlobalSettings((previous) => ({
                            ...previous,
                            directorNote: {
                              ...previous.directorNote,
                              scene: event.target.value,
                            },
                          }))}
                          fullWidth
                        />
                        <TextField
                          label="Style"
                          multiline
                          minRows={3}
                          value={globalSettings.directorNote.style}
                          onChange={(event) => setGlobalSettings((previous) => ({
                            ...previous,
                            directorNote: {
                              ...previous.directorNote,
                              style: event.target.value,
                            },
                          }))}
                          fullWidth
                        />
                        <TextField
                          label="Pacing & Energy"
                          multiline
                          minRows={3}
                          value={globalSettings.directorNote.pacing}
                          onChange={(event) => setGlobalSettings((previous) => ({
                            ...previous,
                            directorNote: {
                              ...previous.directorNote,
                              pacing: event.target.value,
                            },
                          }))}
                          fullWidth
                        />
                      </Stack>

                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          onClick={() => resetGlobalDirectorNote(globalSettings.contentVersion)}
                        >
                          Reset Helper Fields
                        </Button>
                        <Button
                          size="small"
                          onClick={() => setGlobalSettings((previous) => ({
                            ...previous,
                            directorNote: {
                              ...previous.directorNote,
                              compiledPromptOverride: '',
                              isPromptCustomized: false,
                            },
                          }))}
                        >
                          Rebuild Compiled Prompt
                        </Button>
                      </Stack>

                      <TextField
                        label="Compiled Director Prompt"
                        multiline
                        minRows={8}
                        value={globalCompiledPrompt}
                        onChange={(event) => setGlobalSettings((previous) => ({
                          ...previous,
                          directorNote: {
                            ...previous.directorNote,
                            compiledPromptOverride: event.target.value,
                            isPromptCustomized: true,
                          },
                        }))}
                        helperText="LS-90 runtime payload uses this compiled prompt first. The three helper fields remain editable assistants."
                      />

                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="outlined"
                          startIcon={<LibraryMusicOutlinedIcon />}
                          onClick={() => void runPreview()}
                          disabled={previewLoading || isGenerating}
                        >
                          {previewLoading ? '預覽生成中...' : '預覽一句話人聲'}
                        </Button>
                      </Stack>

                      {previewError ? <Alert severity="error">{previewError}</Alert> : null}
                      {previewAudioUrl ? <audio controls src={previewAudioUrl} style={{ width: '100%' }} /> : null}
                    </Stack>

                    <Box sx={{ width: { xs: '100%', xl: 420 }, flexShrink: 0 }}>
                      <Card variant="outlined">
                        <CardContent>
                          <Stack spacing={2}>
                            <Typography variant="subtitle1" fontWeight={700}>
                              Character Library Builder
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              LS-88 creator-side flow: turn a character designer prompt into a reusable vocal recipe, then save it into this page-level library.
                            </Typography>

                            <TextField
                              label="Character Designer Prompt"
                              multiline
                              minRows={4}
                              value={designerPrompt}
                              onChange={(event) => setDesignerPrompt(event.target.value)}
                              placeholder="Example: Warm local guide who speaks like a welcoming insider and loves hidden details."
                            />
                            <Button
                              variant="outlined"
                              startIcon={<AutoAwesomeIcon />}
                              onClick={handleDesignerPromptDraft}
                              disabled={!designerPrompt.trim()}
                            >
                              Draft Character
                            </Button>

                            <Divider />

                            <TextField
                              label="Name"
                              value={characterDraft.name}
                              onChange={(event) => setCharacterDraft((previous) => ({ ...previous, name: event.target.value }))}
                            />
                            <TextField
                              label="Role"
                              value={characterDraft.role}
                              onChange={(event) => setCharacterDraft((previous) => ({ ...previous, role: event.target.value }))}
                            />
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                              <TextField
                                label="Avatar"
                                value={characterDraft.avatar}
                                onChange={(event) => setCharacterDraft((previous) => ({ ...previous, avatar: event.target.value }))}
                                sx={{ maxWidth: 120 }}
                              />
                              <TextField
                                select
                                label="Gender Identity"
                                value={characterDraft.genderIdentity}
                                onChange={(event) => setCharacterDraft((previous) => ({
                                  ...previous,
                                  genderIdentity: event.target.value as AudioMvpCharacter['genderIdentity'],
                                }))}
                                fullWidth
                              >
                                <MenuItem value="feminine">Feminine</MenuItem>
                                <MenuItem value="masculine">Masculine</MenuItem>
                                <MenuItem value="neutral">Neutral</MenuItem>
                              </TextField>
                            </Stack>
                            <TextField
                              label="Core Timbre"
                              multiline
                              minRows={2}
                              value={characterDraft.coreTimbre}
                              onChange={(event) => setCharacterDraft((previous) => ({ ...previous, coreTimbre: event.target.value }))}
                            />
                            <TextField
                              label="Personality DNA"
                              multiline
                              minRows={2}
                              value={characterDraft.personalityDNA}
                              onChange={(event) => setCharacterDraft((previous) => ({ ...previous, personalityDNA: event.target.value }))}
                            />
                            <TextField
                              label="Linguistic Fingerprint"
                              multiline
                              minRows={2}
                              value={characterDraft.linguisticFingerprint}
                              onChange={(event) => setCharacterDraft((previous) => ({ ...previous, linguisticFingerprint: event.target.value }))}
                            />
                            <TextField
                              label="Brand Persona"
                              multiline
                              minRows={2}
                              value={characterDraft.brandPersona}
                              onChange={(event) => setCharacterDraft((previous) => ({ ...previous, brandPersona: event.target.value }))}
                            />
                            <TextField
                              label="Static System Instruction"
                              multiline
                              minRows={3}
                              value={characterDraft.staticInstruction}
                              onChange={(event) => setCharacterDraft((previous) => ({ ...previous, staticInstruction: event.target.value }))}
                            />
                            <TextField
                              select
                              label="Recommended Voice"
                              value={characterDraft.recommendedVoiceId ?? 'Aoede'}
                              onChange={(event) => setCharacterDraft((previous) => ({
                                ...previous,
                                recommendedVoiceId: event.target.value,
                              }))}
                            >
                              {AUDIO_MVP_VOICES.map((voice) => (
                                <MenuItem key={voice.id} value={voice.id}>
                                  {voice.id}
                                </MenuItem>
                              ))}
                            </TextField>

                            <Stack direction="row" spacing={1}>
                              <Button variant="contained" onClick={handleSaveCharacter}>
                                {editingCharacterId ? 'Update Character' : 'Save Character'}
                              </Button>
                              <Button
                                onClick={() => {
                                  setCharacterDraft(createEmptyCharacterDraft());
                                  setDesignerPrompt('');
                                  setEditingCharacterId(null);
                                }}
                              >
                                Clear
                              </Button>
                            </Stack>

                            {customCharacters.length > 0 ? (
                              <Stack spacing={1}>
                                <Typography variant="subtitle2">Saved Custom Characters</Typography>
                                {customCharacters.map((character) => (
                                  <Box
                                    key={character.id}
                                    sx={{
                                      border: '1px dashed',
                                      borderColor: 'divider',
                                      borderRadius: 1.5,
                                      p: 1.25,
                                    }}
                                  >
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                                      <Box sx={{ flex: 1 }}>
                                        <Typography variant="body2" fontWeight={700}>
                                          {character.avatar} {character.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          {character.role} | Voice {character.recommendedVoiceId ?? 'N/A'}
                                        </Typography>
                                      </Box>
                                      <Stack direction="row" spacing={1}>
                                        <Button
                                          size="small"
                                          onClick={() => {
                                            setEditingCharacterId(character.id);
                                            setCharacterDraft(toCharacterEditorDraft(character));
                                          }}
                                        >
                                          Edit
                                        </Button>
                                        <Button size="small" color="error" onClick={() => handleDeleteCharacter(character.id)}>
                                          Delete
                                        </Button>
                                      </Stack>
                                    </Stack>
                                  </Box>
                                ))}
                              </Stack>
                            ) : null}
                          </Stack>
                        </CardContent>
                      </Card>
                    </Box>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6">POI Batch Mapping</Typography>
                  <Typography variant="body2" color="text.secondary">
                    LS-87 per-item override panel: each POI can break away from the global baseline without triggering generation until you explicitly run it.
                  </Typography>

                  {items.length === 0 ? (
                    <Alert severity="info">
                      Paste a manuscript and separate POIs with blank lines to unlock the batch editor.
                    </Alert>
                  ) : (
                    <Stack spacing={1.5}>
                      {items.map((item) => {
                        const appliedSettings = item.overrideEnabled && item.overrideSettings ? item.overrideSettings : globalSettings;
                        const itemCharacter = getCharacter(appliedSettings.characterId) ?? selectedCharacter;
                        const itemVoice = getVoice(appliedSettings.voiceId);
                        const itemRecommendation = recommendVoice({
                          character: itemCharacter,
                          manuscriptText: item.scriptText,
                          contentVersion: appliedSettings.contentVersion,
                        });
                        const compiledPrompt = resolveCompiledPrompt({
                          settings: appliedSettings,
                          character: itemCharacter,
                          voice: itemVoice,
                          scriptText: item.scriptText,
                        });
                        const primaryState = selectedLanguages
                          .map((language) => itemStates[`${language}::${item.spotId}`])
                          .find(Boolean);

                        return (
                          <Accordion key={item.spotId} disableGutters>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" sx={{ width: '100%' }}>
                                <Box sx={{ flex: 1 }}>
                                  <Typography variant="subtitle2" fontWeight={700}>
                                    {item.spotNumber}. {item.title}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {item.excerpt}
                                  </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                  <Chip size="small" label={item.overrideEnabled ? 'Override' : 'Global'} color={item.overrideEnabled ? 'primary' : 'default'} />
                                  <Chip size="small" label={`${CONTENT_VERSION_OPTIONS.find((option) => option.id === appliedSettings.contentVersion)?.label ?? appliedSettings.contentVersion}`} />
                                  <Chip size="small" label={`${itemVoice.id}`} />
                                  <Chip size="small" label={statusLabel(primaryState?.status ?? 'idle')} color={primaryState?.status === 'done' ? 'success' : primaryState?.status === 'error' ? 'error' : 'default'} />
                                </Stack>
                              </Stack>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Stack spacing={2}>
                                <FormControlLabel
                                  control={(
                                    <Checkbox
                                      checked={item.overrideEnabled}
                                      onChange={(event) => togglePoiOverride(item.spotId, event.target.checked)}
                                    />
                                  )}
                                  label="Override global settings for this POI"
                                />

                                {item.overrideEnabled ? (
                                  <Stack spacing={2}>
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                                      <TextField
                                        select
                                        label="Content Version"
                                        value={appliedSettings.contentVersion}
                                        onChange={(event) => updatePoiSettings(item.spotId, (settings) => {
                                          const nextContentVersion = event.target.value as ContentVersion;
                                          return {
                                            ...settings,
                                            contentVersion: nextContentVersion,
                                            directorNote: createDefaultDirectorNote(nextContentVersion),
                                          };
                                        })}
                                        fullWidth
                                      >
                                        {CONTENT_VERSION_OPTIONS.map((option) => (
                                          <MenuItem key={option.id} value={option.id}>
                                            {option.label}
                                          </MenuItem>
                                        ))}
                                      </TextField>

                                      <TextField
                                        select
                                        label="Character"
                                        value={appliedSettings.characterId}
                                        onChange={(event) => updatePoiSettings(item.spotId, (settings) => {
                                          const nextCharacter = getCharacter(event.target.value) ?? selectedCharacter;
                                          const nextRecommendation = recommendVoice({
                                            character: nextCharacter,
                                            manuscriptText: item.scriptText,
                                            contentVersion: settings.contentVersion,
                                          });
                                          return {
                                            ...settings,
                                            characterId: event.target.value,
                                            voiceId: nextRecommendation.recommendedVoiceId,
                                          };
                                        })}
                                        fullWidth
                                      >
                                        {allCharacters.map((character) => (
                                          <MenuItem key={character.id} value={character.id}>
                                            {character.avatar} {character.name}
                                          </MenuItem>
                                        ))}
                                      </TextField>

                                      <TextField
                                        select
                                        label="Voice"
                                        value={appliedSettings.voiceId}
                                        onChange={(event) => updatePoiSettings(item.spotId, (settings) => ({
                                          ...settings,
                                          voiceId: event.target.value,
                                        }))}
                                        fullWidth
                                      >
                                        {AUDIO_MVP_VOICES.map((voice) => (
                                          <MenuItem key={voice.id} value={voice.id}>
                                            {voice.id} - {voice.summary}
                                          </MenuItem>
                                        ))}
                                      </TextField>
                                    </Stack>

                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                      <Chip color="warning" label={`Recommended: ${itemRecommendation.recommendedVoiceId}`} />
                                      {itemRecommendation.fallbackVoiceIds.map((voiceId) => (
                                        <Chip key={`${item.spotId}-${voiceId}`} variant="outlined" label={`Fallback: ${voiceId}`} />
                                      ))}
                                      <Button
                                        size="small"
                                        onClick={() => updatePoiSettings(item.spotId, (settings) => ({
                                          ...settings,
                                          voiceId: itemRecommendation.recommendedVoiceId,
                                        }))}
                                      >
                                        套用推薦
                                      </Button>
                                    </Stack>

                                    <TextField
                                      select
                                      label="Script Enhancement Limit"
                                      value={appliedSettings.scriptEnhancementLimit}
                                      onChange={(event) => updatePoiSettings(item.spotId, (settings) => ({
                                        ...settings,
                                        scriptEnhancementLimit: event.target.value as ScriptEnhancementLimit,
                                      }))}
                                    >
                                      {SCRIPT_ENHANCEMENT_OPTIONS.map((option) => (
                                        <MenuItem key={option.id} value={option.id}>
                                          {option.label}
                                        </MenuItem>
                                      ))}
                                    </TextField>

                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                                      <TextField
                                        label="Scene"
                                        multiline
                                        minRows={2}
                                        value={appliedSettings.directorNote.scene}
                                        onChange={(event) => updatePoiSettings(item.spotId, (settings) => ({
                                          ...settings,
                                          directorNote: {
                                            ...settings.directorNote,
                                            scene: event.target.value,
                                          },
                                        }))}
                                        fullWidth
                                      />
                                      <TextField
                                        label="Style"
                                        multiline
                                        minRows={2}
                                        value={appliedSettings.directorNote.style}
                                        onChange={(event) => updatePoiSettings(item.spotId, (settings) => ({
                                          ...settings,
                                          directorNote: {
                                            ...settings.directorNote,
                                            style: event.target.value,
                                          },
                                        }))}
                                        fullWidth
                                      />
                                      <TextField
                                        label="Pacing"
                                        multiline
                                        minRows={2}
                                        value={appliedSettings.directorNote.pacing}
                                        onChange={(event) => updatePoiSettings(item.spotId, (settings) => ({
                                          ...settings,
                                          directorNote: {
                                            ...settings.directorNote,
                                            pacing: event.target.value,
                                          },
                                        }))}
                                        fullWidth
                                      />
                                    </Stack>

                                    <TextField
                                      label="Compiled Director Prompt"
                                      multiline
                                      minRows={6}
                                      value={compiledPrompt}
                                      onChange={(event) => updatePoiSettings(item.spotId, (settings) => ({
                                        ...settings,
                                        directorNote: {
                                          ...settings.directorNote,
                                          compiledPromptOverride: event.target.value,
                                          isPromptCustomized: true,
                                        },
                                      }))}
                                    />
                                  </Stack>
                                ) : (
                                  <Alert severity="info">
                                    This POI currently inherits the global batch settings. Enable override to edit it independently.
                                  </Alert>
                                )}
                              </Stack>
                            </AccordionDetails>
                          </Accordion>
                        );
                      })}
                    </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>

            {(isGenerating || generationError || progressSummary.total > 0) ? (
              <Card>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography variant="h6">Generation Status</Typography>
                    {generationError ? <Alert severity="error">{generationError}</Alert> : null}
                    {progressSummary.total > 0 ? (
                      <>
                        <Typography variant="body2" color="text.secondary">
                          {progressSummary.currentLabel || '待命中'} | {progressSummary.completed} / {progressSummary.total}
                        </Typography>
                        <LinearProgress
                          variant={progressSummary.total > 0 ? 'determinate' : 'indeterminate'}
                          value={progressSummary.total > 0 ? (progressSummary.completed / progressSummary.total) * 100 : 0}
                        />
                      </>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            ) : null}
          </Stack>
        ) : null}

        {tabIndex === 1 ? (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">音檔評估與重生成</Typography>
                {audioFiles.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    尚未有可評估音檔。請先完成第 1 階段生成。
                  </Typography>
                ) : (
                  audioFiles.map((audio) => {
                    const srt = srtFiles.find((item) => item.lang === audio.lang);
                    return (
                      <Card key={audio.lang} variant="outlined">
                        <CardContent>
                          <Stack spacing={2}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography variant="subtitle1" fontWeight={700}>
                                {langLabel(audio.lang)}
                              </Typography>
                              {srt ? (
                                <Button
                                  size="small"
                                  startIcon={<DownloadIcon />}
                                  onClick={() => downloadSrt(audio.lang, srt.rawSrt)}
                                >
                                  下載 SRT
                                </Button>
                              ) : null}
                            </Stack>

                            {(audio.spots ?? []).map((spot) => {
                              const state = itemStates[`${audio.lang}::${spot.spotId}`];
                              return (
                                <Box
                                  key={`${audio.lang}-${spot.spotId}`}
                                  sx={{
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1.5,
                                    p: 1.5,
                                  }}
                                >
                                  <Stack spacing={1.25}>
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                                      <Box>
                                        <Typography variant="body2" fontWeight={700}>
                                          {spot.spotNumber}. {spot.title}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          {statusLabel(state?.status ?? 'idle')}
                                        </Typography>
                                      </Box>
                                      <Stack direction="row" spacing={1}>
                                        <Button
                                          size="small"
                                          startIcon={<DownloadIcon />}
                                          href={spot.audioUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          下載音檔
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          startIcon={<RefreshIcon />}
                                          onClick={() => void handleRegenerateSpot(audio.lang, spot.spotId)}
                                          disabled={isGenerating}
                                        >
                                          逐條重生成
                                        </Button>
                                      </Stack>
                                    </Stack>
                                    <audio controls src={spot.audioUrl} style={{ width: '100%' }} />
                                  </Stack>
                                </Box>
                              );
                            })}
                          </Stack>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </Stack>
    </Container>
  );
}
