// ---------------------------------------------------------------------------
// TTSPage — Guide-scoped spot tabs with one row per spot-language job
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { collection, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { getCustomClaims } from '../admin/auth/authenticator';
import { ApiRequestError, bootstrapAudioSession, generateAudioForLanguage, translateLanguage } from '../api';
import { useAuthStore } from '../authStore';
import DeployVersionFooter from '../components/DeployVersionFooter';
import { initFirebase } from '../firebase';
import { AUDIO_MVP_VOICES } from '../features/audioMvp/model';
import {
  buildAudioDirectorHistoryUrl,
  buildAudioTrackDocId,
  mapAudioHistoryVersion,
  mapAudioTrackSummary,
  type AudioHistorySelection,
  type AudioHistoryTarget,
  type AudioTrackSummaryRecord,
  type StoredAudioDirectorConfig,
  type StoredTtsInputSnapshot,
  type StoredTtsPromptSnapshot,
} from '../features/audioDirector/history';
import { ROUTES } from '../routes';
import { SUPPORTED_LANGUAGES, langLabel } from '../types/entity';

type SharedGuideTarget = {
  guideId: string;
  title: string;
  tenantId?: string;
  coreLanguage: string;
  languages: string[];
  status: 'existing' | 'minimal-draft';
};

type TtsJob = {
  id: string;
  spotId: string;
  spotTitle: string;
  language: string;
  inputScript: string;
  promptText: string;
  outputAudio: string;
  voiceId: string;
  voiceName: string;
  characterId: string;
  characterName: string;
  performanceHint: {
    scene: string;
    detailedSceneParagraph: string;
    style: string;
    pacing: string;
    tone: string;
    generatedPerformanceGuidelines: string;
  };
  selectedHistoryVersion?: AudioHistorySelection;
};

type GuidePickerOption = {
  id: string;
  title: string;
  tenantId?: string;
  coreLanguage: string;
  languages: string[];
  updatedAt: number;
  status?: string;
  createdFrom?: string;
};

type SpotOption = {
  spotId: string;
  spotTitle: string;
  languages: string[];
  hasGeneratedAudio: boolean;
};

type PersistedJobSelection = {
  outputAudio: string;
  selectedHistoryVersion: AudioHistorySelection;
};

type DeleteGuideDialogState = {
  open: boolean;
  guide: GuidePickerOption | null;
};

type CopyConfigDialogState = {
  open: boolean;
  targetJobId: string | null;
  sourceJobId: string;
};

type AudioDirectorLaunchRecord = {
  jobId: string;
  windowRef: Window | null;
};

type PersistFieldMode = 'ignore' | 'write' | 'delete';

const AUDIO_DIRECTOR_ORIGIN = window.location.origin;
const SUPPORTED_TTS_JOB_LANGUAGE_CODES = ['en', 'ja', 'ko', 'zh-TW', 'zh-CN', 'fr'] as const;
const SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET = new Set<string>(SUPPORTED_TTS_JOB_LANGUAGE_CODES);
const SUPPORTED_TTS_JOB_LANGUAGES = SUPPORTED_LANGUAGES.filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language.code));
const LANGUAGE_ORDER = new Map<string, number>(SUPPORTED_TTS_JOB_LANGUAGE_CODES.map((code, index) => [code, index]));
const AUDIO_GENERATION_RECOVERY_MAX_ATTEMPTS = 40;
const AUDIO_GENERATION_RECOVERY_INTERVAL_MS = 3000;
const AUDIO_GENERATION_RECOVERY_FRESHNESS_GRACE_MS = 10000;

function readTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return Number((value as { toMillis: () => number }).toMillis());
  }
  return 0;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readLanguageCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return sortLanguageCodes(
    value
      .map((item) => String(item))
      .filter((item) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(item)),
  );
}

function resolveGuideCoreLanguage(value: unknown, languages: string[]): string {
  const candidate = readText(value);
  if (candidate && languages.includes(candidate)) return candidate;
  if (languages.includes('en')) return 'en';
  return languages[0] ?? 'en';
}

function sortLanguageCodes(codes: string[]): string[] {
  return [...codes].sort((left, right) => {
    const leftRank = LANGUAGE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = LANGUAGE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
}

function sortLanguageCodesWithPrimary(codes: string[], primaryLanguage: string): string[] {
  return [...codes].sort((left, right) => {
    if (left === primaryLanguage && right !== primaryLanguage) return -1;
    if (right === primaryLanguage && left !== primaryLanguage) return 1;

    const leftRank = LANGUAGE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = LANGUAGE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
}

function createJobId(spotId: string, language: string): string {
  return `${spotId}::${language}`;
}

function createTtsJob(spotId: string, spotTitle: string, language: string): TtsJob {
  return {
    id: createJobId(spotId, language),
    spotId,
    spotTitle,
    language,
    inputScript: '',
    promptText: '',
    outputAudio: '',
    voiceId: '',
    voiceName: '',
    characterId: '',
    characterName: '',
    performanceHint: {
      scene: '',
      detailedSceneParagraph: '',
      style: '',
      pacing: '',
      tone: '',
      generatedPerformanceGuidelines: '',
    },
  };
}

function promptContainsTranscript(compiledPrompt: string): boolean {
  return compiledPrompt.split('\n').some((line) => line.trim() === '#### TRANSCRIPT');
}

function syncPromptTranscript(compiledPrompt: string, transcript: string): string {
  const trimmedPrompt = compiledPrompt.trim();
  const trimmedTranscript = transcript.trim();

  if (!trimmedPrompt || !trimmedTranscript) return trimmedPrompt;
  if (!promptContainsTranscript(trimmedPrompt)) return trimmedPrompt;

  return trimmedPrompt.replace(/\n#### TRANSCRIPT[\s\S]*$/, `\n#### TRANSCRIPT\n${trimmedTranscript}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRecoveredVersionFresh(args: {
  requestStartedAt: number;
  summaryGeneratedAt: number;
  versionGeneratedAt: number;
  previousVersionId?: string;
  candidateVersionId: string;
}): boolean {
  const {
    requestStartedAt,
    summaryGeneratedAt,
    versionGeneratedAt,
    previousVersionId,
    candidateVersionId,
  } = args;

  if (previousVersionId && candidateVersionId !== previousVersionId) {
    return true;
  }

  const freshnessCutoff = requestStartedAt - AUDIO_GENERATION_RECOVERY_FRESHNESS_GRACE_MS;
  if (versionGeneratedAt > 0 && versionGeneratedAt >= freshnessCutoff) {
    return true;
  }
  if (summaryGeneratedAt > 0 && summaryGeneratedAt >= freshnessCutoff) {
    return true;
  }

  return false;
}

function createTtsAudioSessionId(job: TtsJob): string {
  return `tts-${job.spotId}-${job.language}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function voiceNameForId(voiceId: string): string {
  return AUDIO_MVP_VOICES.find((voice) => voice.id === voiceId)?.name ?? voiceId;
}

function buildStoredAudioDirectorConfig(job: TtsJob): StoredAudioDirectorConfig | null {
  const voiceId = job.voiceId.trim();
  const characterId = job.characterId.trim();
  const characterName = job.characterName.trim();
  const scene = job.performanceHint.scene.trim();
  const detailedSceneParagraph = job.performanceHint.detailedSceneParagraph.trim();
  const style = job.performanceHint.style.trim();
  const pacing = job.performanceHint.pacing.trim();
  const tone = job.performanceHint.tone.trim();
  const generatedPerformanceGuidelines = job.performanceHint.generatedPerformanceGuidelines.trim();

  if (
    !voiceId
    && !characterId
    && !characterName
    && !scene
    && !detailedSceneParagraph
    && !style
    && !pacing
    && !tone
    && !generatedPerformanceGuidelines
  ) {
    return null;
  }

  return {
    voiceId: voiceId || undefined,
    characterId: characterId || undefined,
    characterName: characterName || undefined,
    scene: scene || undefined,
    detailedSceneParagraph: detailedSceneParagraph || undefined,
    style: style || undefined,
    pacing: pacing || undefined,
    tone: tone || undefined,
    generatedPerformanceGuidelines: generatedPerformanceGuidelines || undefined,
  };
}

function buildStoredTtsPromptSnapshot(job: TtsJob): StoredTtsPromptSnapshot | null {
  const compiledPrompt = job.promptText.trim();
  if (!compiledPrompt) return null;
  return { compiledPrompt };
}

function buildStoredTtsInputSnapshot(job: TtsJob): StoredTtsInputSnapshot | null {
  const inputScript = job.inputScript.trim();
  if (!inputScript) return null;
  return { inputScript };
}

function compactFirestoreRecord<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function applyStoredAudioDirectorConfig(job: TtsJob, storedConfig?: StoredAudioDirectorConfig): TtsJob {
  if (!storedConfig) return job;
  const nextVoiceId = job.voiceId || storedConfig.voiceId || '';
  return {
    ...job,
    voiceId: nextVoiceId,
    voiceName: job.voiceName || (nextVoiceId ? voiceNameForId(nextVoiceId) : ''),
    characterId: job.characterId || storedConfig.characterId || '',
    characterName: job.characterName || storedConfig.characterName || '',
    performanceHint: {
      scene: job.performanceHint.scene || storedConfig.scene || '',
      detailedSceneParagraph:
        job.performanceHint.detailedSceneParagraph
        || storedConfig.detailedSceneParagraph
        || '',
      style: job.performanceHint.style || storedConfig.style || '',
      pacing: job.performanceHint.pacing || storedConfig.pacing || '',
      tone: job.performanceHint.tone || storedConfig.tone || '',
      generatedPerformanceGuidelines:
        job.performanceHint.generatedPerformanceGuidelines
        || storedConfig.generatedPerformanceGuidelines
        || '',
    },
  };
}

function applyStoredTtsPromptSnapshot(job: TtsJob, storedSnapshot?: StoredTtsPromptSnapshot): TtsJob {
  if (!storedSnapshot) return job;
  return {
    ...job,
    promptText: job.promptText || storedSnapshot.compiledPrompt || '',
  };
}

function applyStoredTtsInputSnapshot(job: TtsJob, storedSnapshot?: StoredTtsInputSnapshot): TtsJob {
  if (!storedSnapshot) return job;
  return {
    ...job,
    inputScript: job.inputScript || storedSnapshot.inputScript || '',
  };
}

function buildDefaultQuickCreateGuideTitle(): string {
  return `TTS Draft ${new Date().toLocaleDateString()}`;
}

function createQuickCreateSpotId(): string {
  return `spot-${crypto.randomUUID().slice(0, 8)}`;
}

function withOptionalTenantId<T extends Record<string, unknown>>(payload: T, tenantId: string): T & { tenantId?: string } {
  if (!tenantId) return payload;
  return {
    ...payload,
    tenantId,
  };
}

function buildHistoryTarget(guide: SharedGuideTarget | null, job: TtsJob): AudioHistoryTarget | null {
  if (!guide) return null;
  return {
    tenantId: guide.tenantId,
    guideId: guide.guideId,
    guideTitle: guide.title,
    spotId: job.spotId,
    spotTitle: job.spotTitle,
    lang: job.language,
  };
}

function OutputAudioPreviewPlayer(props: { audioUrl: string }) {
  const { audioUrl } = props;
  const trimmedAudioUrl = audioUrl.trim();

  if (!trimmedAudioUrl) return null;

  return (
    <Box
      component="audio"
      controls
      preload="none"
      src={trimmedAudioUrl}
      sx={{ width: '100%' }}
    />
  );
}

export default function TTSPage() {
  const user = useAuthStore((state) => state.user);
  const authLoading = useAuthStore((state) => state.loading);
  const [jobs, setJobs] = useState<TtsJob[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState('');
  const [tenantId, setTenantId] = useState<string>('');
  const [sharedGuideTarget, setSharedGuideTarget] = useState<SharedGuideTarget | null>(null);
  const [guidePickerOpen, setGuidePickerOpen] = useState(true);
  const [guidePickerLoading, setGuidePickerLoading] = useState(false);
  const [guidePickerError, setGuidePickerError] = useState<string | null>(null);
  const [guidePickerGuides, setGuidePickerGuides] = useState<GuidePickerOption[]>([]);
  const [guidePickerSelectionId, setGuidePickerSelectionId] = useState('');
  const [trackSummaries, setTrackSummaries] = useState<AudioTrackSummaryRecord[]>([]);
  const [trackSummariesLoading, setTrackSummariesLoading] = useState(false);
  const [trackSummariesError, setTrackSummariesError] = useState<string | null>(null);
  const [persistedJobSelections, setPersistedJobSelections] = useState<Record<string, PersistedJobSelection>>({});
  const [quickCreateExpanded, setQuickCreateExpanded] = useState(false);
  const [quickCreateGuideTitle, setQuickCreateGuideTitle] = useState(buildDefaultQuickCreateGuideTitle());
  const [quickCreateLanguages, setQuickCreateLanguages] = useState<string[]>(['en']);
  const [quickCreateCoreLanguage, setQuickCreateCoreLanguage] = useState<string>('en');
  const [quickCreateCreating, setQuickCreateCreating] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [deleteGuideDialog, setDeleteGuideDialog] = useState<DeleteGuideDialogState>({ open: false, guide: null });
  const [deleteGuideConfirmText, setDeleteGuideConfirmText] = useState('');
  const [deleteGuideLoading, setDeleteGuideLoading] = useState(false);
  const [deleteGuideError, setDeleteGuideError] = useState<string | null>(null);
  const [copyConfigDialog, setCopyConfigDialog] = useState<CopyConfigDialogState>({
    open: false,
    targetJobId: null,
    sourceJobId: '',
  });
  const [spotManagerTitle, setSpotManagerTitle] = useState('');
  const [spotComposerOpen, setSpotComposerOpen] = useState(false);
  const [spotManagerCreating, setSpotManagerCreating] = useState(false);
  const [spotManagerDeletingId, setSpotManagerDeletingId] = useState<string | null>(null);
  const [spotManagerError, setSpotManagerError] = useState<string | null>(null);
  const [translationPendingByJob, setTranslationPendingByJob] = useState<Record<string, boolean>>({});
  const [translationErrorByJob, setTranslationErrorByJob] = useState<Record<string, string>>({});
  const [audioPendingByJob, setAudioPendingByJob] = useState<Record<string, boolean>>({});
  const [audioErrorByJob, setAudioErrorByJob] = useState<Record<string, string>>({});
  const [openAudioDirectorRevision, setOpenAudioDirectorRevision] = useState(0);
  const audioDirectorLaunchesRef = useRef<Record<string, AudioDirectorLaunchRecord>>({});
  const promptPersistTimeoutsRef = useRef<Record<string, number>>({});

  const spotOptions = useMemo<SpotOption[]>(() => {
    const grouped = trackSummaries.reduce<Map<string, SpotOption>>((acc, summary) => {
      const existing = acc.get(summary.spotId);
      if (existing) {
        if (!existing.languages.includes(summary.lang)) {
          existing.languages.push(summary.lang);
          existing.languages = sortLanguageCodes(existing.languages);
        }
        existing.hasGeneratedAudio = existing.hasGeneratedAudio || Boolean(summary.hasGeneratedAudio);
        return acc;
      }
      acc.set(summary.spotId, {
        spotId: summary.spotId,
        spotTitle: summary.spotTitle,
        languages: [summary.lang],
        hasGeneratedAudio: Boolean(summary.hasGeneratedAudio),
      });
      return acc;
    }, new Map<string, SpotOption>());
    return Array.from(grouped.values()).sort((left, right) => left.spotTitle.localeCompare(right.spotTitle));
  }, [trackSummaries]);

  const selectedGuideOption = guidePickerGuides.find((guide) => guide.id === guidePickerSelectionId) ?? null;
  const selectedSpot = spotOptions.find((spot) => spot.spotId === selectedSpotId) ?? null;
  const effectiveGuideLanguages = useMemo(() => {
    const explicit = sharedGuideTarget?.languages ?? [];
    if (explicit.length > 0) return sortLanguageCodes(explicit);
    const derived = Array.from(new Set(trackSummaries.map((summary) => summary.lang).filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language))));
    return sortLanguageCodes(derived);
  }, [sharedGuideTarget?.languages, trackSummaries]);
  const effectiveCoreLanguage = sharedGuideTarget?.coreLanguage ?? resolveGuideCoreLanguage('en', effectiveGuideLanguages);
  const visibleJobs = useMemo(
    () => {
      const sortedLanguages = sortLanguageCodesWithPrimary(
        jobs
          .filter((job) => job.spotId === selectedSpotId)
          .map((job) => job.language),
        effectiveCoreLanguage,
      );
      const languageRank = new Map(sortedLanguages.map((language, index) => [language, index]));

      return jobs
        .filter((job) => job.spotId === selectedSpotId)
        .sort((left, right) => {
          const leftRank = languageRank.get(left.language) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = languageRank.get(right.language) ?? Number.MAX_SAFE_INTEGER;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return left.language.localeCompare(right.language);
        });
    },
    [effectiveCoreLanguage, jobs, selectedSpotId],
  );
  const primaryLanguageJobBySpotId = useMemo(() => new Map(
    jobs
      .filter((job) => job.language === effectiveCoreLanguage)
      .map((job) => [job.spotId, job] as const),
  ), [effectiveCoreLanguage, jobs]);
  const copyConfigTargetJob = useMemo(
    () => jobs.find((job) => job.id === copyConfigDialog.targetJobId) ?? null,
    [copyConfigDialog.targetJobId, jobs],
  );
  const copyConfigCandidates = useMemo(
    () => jobs.filter((job) => (
      job.id !== copyConfigDialog.targetJobId
      && Boolean(buildStoredAudioDirectorConfig(job))
    )),
    [copyConfigDialog.targetJobId, jobs],
  );

  const updateJob = (jobId: string, updater: (job: TtsJob) => TtsJob) => {
    setJobs((currentJobs) => currentJobs.map((job) => (job.id === jobId ? updater(job) : job)));
  };

  const persistJobStoredState = async (job: TtsJob, options: {
    audioDirectorConfigMode: PersistFieldMode;
    ttsInputSnapshotMode: PersistFieldMode;
    ttsPromptSnapshotMode: PersistFieldMode;
  }) => {
    if (!sharedGuideTarget) return;
    const audioDirectorConfig = buildStoredAudioDirectorConfig(job);
    const ttsInputSnapshot = buildStoredTtsInputSnapshot(job);
    const ttsPromptSnapshot = buildStoredTtsPromptSnapshot(job);

    const payload: Record<string, unknown> = {
      guideId: sharedGuideTarget.guideId,
      tenantId: sharedGuideTarget.tenantId ?? tenantId ?? undefined,
      spotId: job.spotId,
      spotTitle: job.spotTitle,
      lang: job.language,
      updatedAt: Date.now(),
      ttsPromptConfig: deleteField(),
    };

    if (options.audioDirectorConfigMode === 'write') {
      payload.audioDirectorConfig = audioDirectorConfig ? compactFirestoreRecord(audioDirectorConfig) : deleteField();
    } else if (options.audioDirectorConfigMode === 'delete') {
      payload.audioDirectorConfig = deleteField();
    }

    if (options.ttsInputSnapshotMode === 'write') {
      payload.ttsInputSnapshot = ttsInputSnapshot ? compactFirestoreRecord(ttsInputSnapshot) : deleteField();
    } else if (options.ttsInputSnapshotMode === 'delete') {
      payload.ttsInputSnapshot = deleteField();
    }

    if (options.ttsPromptSnapshotMode === 'write') {
      payload.ttsPromptSnapshot = ttsPromptSnapshot ? compactFirestoreRecord(ttsPromptSnapshot) : deleteField();
    } else if (options.ttsPromptSnapshotMode === 'delete') {
      payload.ttsPromptSnapshot = deleteField();
    }

    const { db } = initFirebase();
    const audioTrackRef = doc(db, 'guides', sharedGuideTarget.guideId, 'audioTracks', buildAudioTrackDocId(job.spotId, job.language));
    await setDoc(audioTrackRef, compactFirestoreRecord(payload), { merge: true });
  };

  const queuePersistJobStoredState = (job: TtsJob, options: {
    audioDirectorConfigMode: PersistFieldMode;
    ttsInputSnapshotMode: PersistFieldMode;
    ttsPromptSnapshotMode: PersistFieldMode;
  }) => {
    const existingTimeoutId = promptPersistTimeoutsRef.current[job.id];
    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
    }
    promptPersistTimeoutsRef.current[job.id] = window.setTimeout(() => {
      delete promptPersistTimeoutsRef.current[job.id];
      void persistJobStoredState(job, options).catch((error) => {
        console.error('Failed to persist Audio Director row state', error);
      });
    }, 350);
  };

  const bumpOpenAudioDirectorRevision = () => {
    setOpenAudioDirectorRevision((current) => current + 1);
  };

  const findOpenAudioDirectorLaunch = (jobId: string): [string, AudioDirectorLaunchRecord] | null => {
    const entry = Object.entries(audioDirectorLaunchesRef.current).find(([, record]) => (
      record.jobId === jobId && record.windowRef && !record.windowRef.closed
    ));
    return entry ? [entry[0], entry[1]] : null;
  };

  const cleanupAudioDirectorLaunch = (launchId: string) => {
    if (!audioDirectorLaunchesRef.current[launchId]) return;
    delete audioDirectorLaunchesRef.current[launchId];
    bumpOpenAudioDirectorRevision();
  };

  const cleanupClosedAudioDirectorLaunches = () => {
    let removed = false;
    Object.entries(audioDirectorLaunchesRef.current).forEach(([launchId, record]) => {
      if (record.windowRef && !record.windowRef.closed) return;
      delete audioDirectorLaunchesRef.current[launchId];
      removed = true;
    });
    if (removed) {
      bumpOpenAudioDirectorRevision();
    }
  };

  useEffect(() => () => {
    Object.values(promptPersistTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    promptPersistTimeoutsRef.current = {};
  }, []);

  const sendScriptToAudioDirector = (targetWindow: Window | null, job: TtsJob, launchId: string) => {
    if (!targetWindow || targetWindow.closed) return;
    const compiledPromptForAudioDirector = syncPromptTranscript(job.promptText, job.inputScript);
    targetWindow.postMessage(
      {
        type: 'laxy:script',
        launchId,
        text: job.inputScript,
        language: job.language,
        compiledPrompt: compiledPromptForAudioDirector,
        voiceId: job.voiceId,
        characterId: job.characterId,
        scene: job.performanceHint.scene,
        detailedSceneParagraph: job.performanceHint.detailedSceneParagraph,
        style: job.performanceHint.style,
        pacing: job.performanceHint.pacing,
        tone: job.performanceHint.tone,
        generatedPerformanceGuidelines: job.performanceHint.generatedPerformanceGuidelines,
      },
      AUDIO_DIRECTOR_ORIGIN,
    );
  };

  useEffect(() => {
    if (!user) {
      setTenantId('');
      return;
    }

    let cancelled = false;
    void getCustomClaims(user).then((claims) => {
      if (cancelled) return;
      setTenantId(claims.tenantId ?? '');
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    setJobs([]);
    setSelectedSpotId('');
    setTranslationPendingByJob({});
    setTranslationErrorByJob({});
    setAudioPendingByJob({});
    setAudioErrorByJob({});
    Object.values(promptPersistTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    promptPersistTimeoutsRef.current = {};
  }, [sharedGuideTarget?.guideId]);

  useEffect(() => {
    if (!sharedGuideTarget) {
      setGuidePickerOpen(true);
      return;
    }
    setGuidePickerOpen(false);
  }, [sharedGuideTarget]);

  useEffect(() => {
    if (!sharedGuideTarget) {
      setTrackSummaries([]);
      setPersistedJobSelections({});
      setTrackSummariesError(null);
      return;
    }

    let cancelled = false;

    const loadTrackSummaries = async () => {
      setTrackSummariesLoading(true);
      setTrackSummariesError(null);
      try {
        const { db } = initFirebase();
        const snapshot = await getDocs(collection(db, 'guides', sharedGuideTarget.guideId, 'audioTracks'));
        if (cancelled) return;
        const summaries = snapshot.docs
          .map((trackDoc) => mapAudioTrackSummary({
            guideId: sharedGuideTarget.guideId,
            docId: trackDoc.id,
            data: trackDoc.data() as Record<string, unknown>,
          }))
          .filter((summary): summary is AudioTrackSummaryRecord => Boolean(summary))
          .filter((summary) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(summary.lang))
          .sort((left, right) => right.latestGeneratedAt - left.latestGeneratedAt);
        setTrackSummaries(summaries);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setTrackSummariesError(`Unable to load guide targets: ${message}`);
      } finally {
        if (!cancelled) {
          setTrackSummariesLoading(false);
        }
      }
    };

    void loadTrackSummaries();

    return () => {
      cancelled = true;
    };
  }, [sharedGuideTarget]);

  useEffect(() => {
    if (!sharedGuideTarget || trackSummaries.length === 0) {
      setPersistedJobSelections({});
      return;
    }

    let cancelled = false;

    const loadPersistedSelections = async () => {
      try {
        const { db } = initFirebase();
        const entries = await Promise.all(
          trackSummaries.map(async (summary) => {
            const versionId = summary.activeVersionId || summary.latestVersionId;
            if (!versionId) return null;

            const versionDoc = await getDoc(
              doc(db, 'guides', sharedGuideTarget.guideId, 'audioTracks', summary.id, 'versions', versionId),
            );
            if (!versionDoc.exists()) return null;

            const versionRecord = mapAudioHistoryVersion({
              guideId: sharedGuideTarget.guideId,
              target: {
                guideId: sharedGuideTarget.guideId,
                spotId: summary.spotId,
                spotTitle: summary.spotTitle,
                lang: summary.lang,
                tenantId: sharedGuideTarget.tenantId,
              },
              summary,
              docId: versionDoc.id,
              data: versionDoc.data() as Record<string, unknown>,
            });
            if (!versionRecord) return null;

            return [
              createJobId(summary.spotId, summary.lang),
              {
                outputAudio: versionRecord.audioUrl,
                selectedHistoryVersion: {
                  versionId: versionRecord.versionId,
                  storagePath: versionRecord.storagePath,
                  guideId: versionRecord.guideId,
                  spotId: versionRecord.spotId,
                  lang: versionRecord.lang,
                },
              } satisfies PersistedJobSelection,
            ] as const;
          }),
        );

        if (cancelled) return;

        const nextSelections: Record<string, PersistedJobSelection> = {};
        entries.forEach((entry) => {
          if (!entry) return;
          nextSelections[entry[0]] = entry[1];
        });
        setPersistedJobSelections(nextSelections);
      } catch {
        if (!cancelled) {
          setPersistedJobSelections({});
        }
      }
    };

    void loadPersistedSelections();

    return () => {
      cancelled = true;
    };
  }, [sharedGuideTarget, trackSummaries]);

  useEffect(() => {
    setJobs((currentJobs) => {
      const currentMap = new Map(currentJobs.map((job) => [job.id, job]));
      const nextJobs: TtsJob[] = [];

      for (const spot of spotOptions) {
        const sortedLanguages = sortLanguageCodes(spot.languages.filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language)));
        for (const language of sortedLanguages) {
          const jobId = createJobId(spot.spotId, language);
          const existingJob = currentMap.get(jobId);
          const persistedSelection = persistedJobSelections[jobId];
          const persistedSummary = trackSummaries.find((summary) => summary.spotId === spot.spotId && summary.lang === language);
          if (existingJob) {
            const hydratedExistingJob = applyStoredTtsPromptSnapshot(
              applyStoredTtsInputSnapshot(
                applyStoredAudioDirectorConfig({
                  ...existingJob,
                  spotTitle: spot.spotTitle,
                  language,
                  outputAudio: existingJob.outputAudio || persistedSelection?.outputAudio || '',
                  selectedHistoryVersion: existingJob.selectedHistoryVersion ?? persistedSelection?.selectedHistoryVersion,
                }, persistedSummary?.audioDirectorConfig),
                persistedSummary?.ttsInputSnapshot,
              ),
              persistedSummary?.ttsPromptSnapshot,
            );
            nextJobs.push(hydratedExistingJob);
            continue;
          }
          const hydratedJob = applyStoredTtsPromptSnapshot(
            applyStoredTtsInputSnapshot(
              applyStoredAudioDirectorConfig({
                ...createTtsJob(spot.spotId, spot.spotTitle, language),
                outputAudio: persistedSelection?.outputAudio || '',
                selectedHistoryVersion: persistedSelection?.selectedHistoryVersion,
              }, persistedSummary?.audioDirectorConfig),
              persistedSummary?.ttsInputSnapshot,
            ),
            persistedSummary?.ttsPromptSnapshot,
          );
          nextJobs.push(hydratedJob);
        }
      }

      return nextJobs;
    });
  }, [persistedJobSelections, spotOptions, trackSummaries]);

  useEffect(() => {
    if (!spotOptions.length) {
      if (selectedSpotId) setSelectedSpotId('');
      return;
    }
    if (spotOptions.some((spot) => spot.spotId === selectedSpotId)) return;
    setSelectedSpotId(spotOptions[0]?.spotId ?? '');
  }, [selectedSpotId, spotOptions]);

  useEffect(() => {
    if (!guidePickerOpen || sharedGuideTarget || authLoading) return;
    void loadGuides();
  }, [authLoading, guidePickerOpen, sharedGuideTarget, tenantId, user]);

  useEffect(() => {
    cleanupClosedAudioDirectorLaunches();

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== AUDIO_DIRECTOR_ORIGIN) return;
      const launchId = typeof event.data?.launchId === 'string' ? event.data.launchId : '';
      if (!launchId) return;
      const launchRecord = audioDirectorLaunchesRef.current[launchId];
      if (!launchRecord) return;

      if (event.data?.type === 'laxy:ready') {
        const targetWindow = (event.source as Window | null) ?? launchRecord.windowRef;
        if (targetWindow) {
          launchRecord.windowRef = targetWindow;
        }
        const activeJob = jobs.find((job) => job.id === launchRecord.jobId);
        if (!activeJob) return;
        sendScriptToAudioDirector(targetWindow ?? launchRecord.windowRef, activeJob, launchId);
        return;
      }

      if (event.data?.type === 'laxy:prompt-selected') {
        const voiceId = typeof event.data.voiceId === 'string' ? event.data.voiceId : '';
        const existingJob = jobs.find((job) => job.id === launchRecord.jobId);
        if (!existingJob) return;
        const updatedJob: TtsJob = {
          ...existingJob,
          promptText: typeof event.data.compiledPrompt === 'string' ? event.data.compiledPrompt : existingJob.promptText,
          voiceId,
          voiceName: voiceNameForId(voiceId),
          characterId: typeof event.data.characterId === 'string' ? event.data.characterId : existingJob.characterId,
          characterName: typeof event.data.characterName === 'string' ? event.data.characterName : existingJob.characterName,
          performanceHint: {
            scene: typeof event.data.scene === 'string' ? event.data.scene : existingJob.performanceHint.scene,
            detailedSceneParagraph:
              typeof event.data.detailedSceneParagraph === 'string'
                ? event.data.detailedSceneParagraph
                : existingJob.performanceHint.detailedSceneParagraph,
            style: typeof event.data.style === 'string' ? event.data.style : existingJob.performanceHint.style,
            pacing: typeof event.data.pacing === 'string' ? event.data.pacing : existingJob.performanceHint.pacing,
            tone: typeof event.data.tone === 'string' ? event.data.tone : existingJob.performanceHint.tone,
            generatedPerformanceGuidelines:
              typeof event.data.generatedPerformanceGuidelines === 'string'
                ? event.data.generatedPerformanceGuidelines
                : existingJob.performanceHint.generatedPerformanceGuidelines,
          },
          outputAudio: '',
          selectedHistoryVersion: undefined,
        };
        updateJob(launchRecord.jobId, () => updatedJob);
        queuePersistJobStoredState(updatedJob, {
          audioDirectorConfigMode: 'write',
          ttsInputSnapshotMode: 'write',
          ttsPromptSnapshotMode: 'write',
        });
        setAudioErrorByJob((previous) => ({
          ...previous,
          [launchRecord.jobId]: '',
        }));
        cleanupAudioDirectorLaunch(launchId);
      }
    };

    const intervalId = window.setInterval(() => {
      cleanupClosedAudioDirectorLaunches();
    }, 1000);

    window.addEventListener('message', handleMessage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('message', handleMessage);
    };
  }, [jobs, sharedGuideTarget, tenantId]);

  const loadGuides = async () => {
    if (!user) {
      setGuidePickerGuides([]);
      setGuidePickerError('Sign in to browse guides.');
      return;
    }

    setGuidePickerLoading(true);
    setGuidePickerError(null);
    try {
      const { db } = initFirebase();
      const snapshot = await getDocs(collection(db, 'guides'));
      const guides = snapshot.docs
        .map((guideDoc) => {
          const data = guideDoc.data() as Record<string, unknown>;
          return {
            id: guideDoc.id,
            title: readText(data.title) || readText(data.venueName) || readText(data.name) || guideDoc.id,
            tenantId: readText(data.tenantId) || undefined,
            coreLanguage: resolveGuideCoreLanguage(
              data.coreLanguage,
              readLanguageCodes(data.ttsLanguages),
            ),
            languages: readLanguageCodes(data.ttsLanguages),
            updatedAt: readTimestampMs(data.updatedAt) || readTimestampMs(data.createdAt),
            status: readText(data.status) || undefined,
            createdFrom: readText(data.createdFrom) || undefined,
          } satisfies GuidePickerOption;
        })
        .filter((guide) => !tenantId || !guide.tenantId || guide.tenantId === tenantId)
        .sort((left, right) => right.updatedAt - left.updatedAt);
      setGuidePickerGuides(guides);
      if (!guides.length) {
        setGuidePickerSelectionId('');
        setQuickCreateExpanded(true);
        setGuidePickerError(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGuidePickerError(`Unable to load guides: ${message}`);
    } finally {
      setGuidePickerLoading(false);
    }
  };

  const applySharedGuideSelection = (guide: GuidePickerOption) => {
    setQuickCreateError(null);
    setSharedGuideTarget({
      guideId: guide.id,
      title: guide.title,
      tenantId: guide.tenantId,
      coreLanguage: guide.coreLanguage,
      languages: guide.languages,
      status: guide.createdFrom === 'tts' && guide.status === 'draft' ? 'minimal-draft' : 'existing',
    });
    setGuidePickerSelectionId(guide.id);
    setGuidePickerOpen(false);
  };

  const handleConfirmGuidePicker = () => {
    if (!selectedGuideOption) return;
    applySharedGuideSelection(selectedGuideOption);
  };

  const handleToggleQuickCreateLanguage = (language: string) => {
    setQuickCreateLanguages((current) => {
      const next = current.includes(language)
        ? current.filter((item) => item !== language)
        : [...current, language];
      const normalized = sortLanguageCodes(next.filter((item) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(item)));
      setQuickCreateCoreLanguage((currentCoreLanguage) => (
        normalized.includes(currentCoreLanguage)
          ? currentCoreLanguage
          : normalized[0] ?? ''
      ));
      return normalized;
    });
  };

  const jobHasSavedHistory = (job: TtsJob): boolean => (
    trackSummaries.some((summary) => summary.spotId === job.spotId && summary.lang === job.language && Boolean(summary.hasGeneratedAudio))
  );

  const handleOpenDeleteGuideDialog = () => {
    if (!selectedGuideOption || deleteGuideLoading) return;
    setDeleteGuideError(null);
    setDeleteGuideConfirmText('');
    setDeleteGuideDialog({
      open: true,
      guide: selectedGuideOption,
    });
  };

  const handleCloseDeleteGuideDialog = () => {
    if (deleteGuideLoading) return;
    setDeleteGuideDialog({ open: false, guide: null });
    setDeleteGuideConfirmText('');
    setDeleteGuideError(null);
  };

  const handleOpenCopyConfigDialog = (targetJobId: string) => {
    const candidates = jobs.filter((job) => job.id !== targetJobId && Boolean(buildStoredAudioDirectorConfig(job)));
    setCopyConfigDialog({
      open: true,
      targetJobId,
      sourceJobId: candidates[0]?.id ?? '',
    });
  };

  const handleCloseCopyConfigDialog = () => {
    setCopyConfigDialog({
      open: false,
      targetJobId: null,
      sourceJobId: '',
    });
  };

  const handleApplyCopiedConfig = () => {
    const targetJobId = copyConfigDialog.targetJobId;
    if (!targetJobId) {
      handleCloseCopyConfigDialog();
      return;
    }
    const sourceJob = jobs.find((job) => job.id === copyConfigDialog.sourceJobId);
    const targetJob = jobs.find((job) => job.id === targetJobId);
    if (!sourceJob || !targetJob) {
      handleCloseCopyConfigDialog();
      return;
    }

    const copiedJob: TtsJob = {
      ...targetJob,
      promptText: '',
      outputAudio: '',
      selectedHistoryVersion: undefined,
      voiceId: sourceJob.voiceId,
      voiceName: sourceJob.voiceId ? voiceNameForId(sourceJob.voiceId) : '',
      characterId: sourceJob.characterId,
      characterName: sourceJob.characterName,
      performanceHint: {
        ...sourceJob.performanceHint,
      },
    };

    updateJob(targetJobId, () => copiedJob);
    queuePersistJobStoredState(copiedJob, {
      audioDirectorConfigMode: 'write',
      ttsInputSnapshotMode: 'write',
      ttsPromptSnapshotMode: 'delete',
    });
    setAudioErrorByJob((previous) => ({
      ...previous,
      [targetJobId]: '',
    }));
    handleCloseCopyConfigDialog();
  };

  const handleCreateMinimalGuide = async () => {
    const guideTitle = quickCreateGuideTitle.trim();
    const seededLanguages = sortLanguageCodes(quickCreateLanguages.filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language)));
    const seededCoreLanguage = seededLanguages.includes(quickCreateCoreLanguage)
      ? quickCreateCoreLanguage
      : seededLanguages[0] ?? '';
    if (!guideTitle) return;
    if (seededLanguages.length === 0) return;
    if (!seededCoreLanguage) return;

    setQuickCreateCreating(true);
    setQuickCreateError(null);

    try {
      const guideId = crypto.randomUUID();
      const { db } = initFirebase();
      const batch = writeBatch(db);
      const guideRef = doc(db, 'guides', guideId);

      batch.set(guideRef, {
        ...withOptionalTenantId({
          title: guideTitle,
          status: 'draft',
          coreLanguage: seededCoreLanguage,
          supportedLanguages: seededLanguages,
          ttsLanguages: seededLanguages,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdFrom: 'tts',
        }, tenantId),
      });

      await batch.commit();

      const nextGuideOption: GuidePickerOption = {
        id: guideId,
        title: guideTitle,
        tenantId: tenantId || undefined,
        coreLanguage: seededCoreLanguage,
        languages: seededLanguages,
        updatedAt: Date.now(),
        status: 'draft',
        createdFrom: 'tts',
      };
      setGuidePickerGuides((previous) => [nextGuideOption, ...previous].sort((left, right) => right.updatedAt - left.updatedAt));
      setSharedGuideTarget({
        guideId,
        title: guideTitle,
        tenantId: tenantId || undefined,
        coreLanguage: seededCoreLanguage,
        languages: seededLanguages,
        status: 'minimal-draft',
      });
      setTrackSummaries([]);
      setTrackSummariesError(null);
      setSelectedSpotId('');
      setQuickCreateExpanded(false);
      setQuickCreateGuideTitle(buildDefaultQuickCreateGuideTitle());
      setQuickCreateLanguages(['en']);
      setQuickCreateCoreLanguage('en');
      setQuickCreateError(null);
      setGuidePickerSelectionId(guideId);
      setSpotComposerOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setQuickCreateError(`Unable to create a minimal guide: ${message}`);
    } finally {
      setQuickCreateCreating(false);
    }
  };

  const handleDeleteGuide = async () => {
    const guide = deleteGuideDialog.guide;
    if (!guide) return;
    if (deleteGuideConfirmText.trim() !== guide.title) return;

    setDeleteGuideLoading(true);
    setDeleteGuideError(null);

    try {
      const { db } = initFirebase();
      const trackSnapshot = await getDocs(collection(db, 'guides', guide.id, 'audioTracks'));
      let batch = writeBatch(db);
      let operationCount = 0;

      const flushBatch = async () => {
        if (operationCount === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      };

      for (const trackDoc of trackSnapshot.docs) {
        const versionsSnapshot = await getDocs(collection(
          db,
          'guides',
          guide.id,
          'audioTracks',
          trackDoc.id,
          'versions',
        ));

        for (const versionDoc of versionsSnapshot.docs) {
          batch.delete(versionDoc.ref);
          operationCount += 1;
          if (operationCount >= 400) {
            await flushBatch();
          }
        }

        batch.delete(trackDoc.ref);
        operationCount += 1;
        if (operationCount >= 400) {
          await flushBatch();
        }
      }

      batch.delete(doc(db, 'guides', guide.id));
      operationCount += 1;
      await flushBatch();

      setGuidePickerGuides((previous) => previous.filter((item) => item.id !== guide.id));
      setGuidePickerSelectionId((current) => (current === guide.id ? '' : current));
      if (sharedGuideTarget?.guideId === guide.id) {
        setSharedGuideTarget(null);
        setJobs([]);
        setSelectedSpotId('');
      }
      handleCloseDeleteGuideDialog();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeleteGuideError(`Unable to delete the guide: ${message}`);
    } finally {
      setDeleteGuideLoading(false);
    }
  };

  const handleCreateSpot = async () => {
    if (!sharedGuideTarget) return;

    const spotTitle = spotManagerTitle.trim();
    const languages = effectiveGuideLanguages;
    if (!spotTitle || languages.length === 0) return;

    setSpotManagerCreating(true);
    setSpotManagerError(null);

    try {
      const spotId = createQuickCreateSpotId();
      const summaries = languages.map((language) => ({
        id: buildAudioTrackDocId(spotId, language),
        guideId: sharedGuideTarget.guideId,
        spotId,
        lang: language,
        spotTitle,
        latestGeneratedAt: 0,
        hasGeneratedAudio: false,
      }));
      const { db } = initFirebase();
      const batch = writeBatch(db);

      summaries.forEach((summary) => {
        const audioTrackRef = doc(db, 'guides', sharedGuideTarget.guideId, 'audioTracks', summary.id);
        batch.set(audioTrackRef, {
          ...withOptionalTenantId({
            guideId: sharedGuideTarget.guideId,
            spotId,
            spotTitle,
            lang: summary.lang,
            activeVersionId: '',
            latestVersionId: '',
            latestGeneratedAt: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            hasGeneratedAudio: false,
          }, tenantId),
        });
      });

      await batch.commit();

      setTrackSummaries((previous) => [...summaries, ...previous.filter((summary) => summary.spotId !== spotId)]);
      setSelectedSpotId(spotId);
      setSpotManagerTitle('');
      setSpotComposerOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSpotManagerError(`Unable to create the spot: ${message}`);
    } finally {
      setSpotManagerCreating(false);
    }
  };

  const handleDeleteSpot = async (spot: SpotOption) => {
    if (!sharedGuideTarget) return;
    if (!window.confirm(`Remove ${spot.spotTitle} and all saved audio versions under it?`)) return;

    setSpotManagerDeletingId(spot.spotId);
    setSpotManagerError(null);

    try {
      const matchingSummaries = trackSummaries.filter((summary) => summary.spotId === spot.spotId);
      const { db } = initFirebase();
      const batch = writeBatch(db);

      for (const summary of matchingSummaries) {
        const versionsSnapshot = await getDocs(collection(
          db,
          'guides',
          sharedGuideTarget.guideId,
          'audioTracks',
          summary.id,
          'versions',
        ));
        versionsSnapshot.docs.forEach((versionDoc) => {
          batch.delete(versionDoc.ref);
        });
        batch.delete(doc(db, 'guides', sharedGuideTarget.guideId, 'audioTracks', summary.id));
      }

      await batch.commit();

      setTrackSummaries((previous) => previous.filter((summary) => summary.spotId !== spot.spotId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSpotManagerError(`Unable to remove the spot: ${message}`);
    } finally {
      setSpotManagerDeletingId(null);
    }
  };

  const handleOpenJob = (jobId: string) => {
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job) return;

    const target = buildHistoryTarget(sharedGuideTarget, job);
    if (!target) return;

    const existingLaunch = findOpenAudioDirectorLaunch(jobId);
    if (existingLaunch) {
      const [launchId, launchRecord] = existingLaunch;
      launchRecord.windowRef?.focus();
      sendScriptToAudioDirector(launchRecord.windowRef, job, launchId);
      return;
    }

    const launchId = crypto.randomUUID();
    const popupWindow = window.open(
      'about:blank',
      '_blank',
    );
    if (!popupWindow) {
      window.alert('Audio Director could not be opened in a new tab. Please allow new tabs for this site and try again.');
      return;
    }

    audioDirectorLaunchesRef.current[launchId] = {
      jobId,
      windowRef: popupWindow,
    };
    bumpOpenAudioDirectorRevision();
    popupWindow.document.title = `${job.spotTitle} · ${langLabel(job.language)} · Audio Director`;

    popupWindow.location.href = buildAudioDirectorHistoryUrl({
      basePath: ROUTES.audioDirector,
      target: {
        ...target,
        launchId,
      },
      cacheBust: Date.now(),
    });
    popupWindow.focus();
  };

  const handleTranslateFromEnglish = async (jobId: string) => {
    const targetJob = jobs.find((job) => job.id === jobId);
    if (!targetJob || targetJob.language === effectiveCoreLanguage) return;

    const primarySourceJob = primaryLanguageJobBySpotId.get(targetJob.spotId);
    const primarySourceScript = primarySourceJob?.inputScript.trim() ?? '';
    if (!primarySourceJob || !primarySourceScript) {
      setTranslationErrorByJob((previous) => ({
        ...previous,
        [jobId]: `Enter the ${langLabel(effectiveCoreLanguage)} script in the primary language row first.`,
      }));
      return;
    }

    if (
      targetJob.inputScript.trim()
      && targetJob.inputScript.trim() !== primarySourceScript
      && !window.confirm(`Replace the current ${langLabel(targetJob.language)} input script with an AI translation from ${langLabel(effectiveCoreLanguage)}?`)
    ) {
      return;
    }

    setTranslationPendingByJob((previous) => ({
      ...previous,
      [jobId]: true,
    }));
    setTranslationErrorByJob((previous) => ({
      ...previous,
      [jobId]: '',
    }));

    try {
      const result = await translateLanguage({
        scripts: [{
          spotId: targetJob.spotId,
          spotNumber: 1,
          title: targetJob.spotTitle,
          scriptText: primarySourceScript,
        }],
        targetLanguage: targetJob.language,
        coreLanguage: effectiveCoreLanguage,
      });

      const translatedText = result.spots[0]?.translatedText?.trim() ?? '';
      if (!translatedText) {
        throw new Error('No translated text was returned.');
      }

      updateJob(jobId, (job) => ({
        ...job,
        inputScript: translatedText,
      }));
      setTranslationErrorByJob((previous) => ({
        ...previous,
        [jobId]: '',
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTranslationErrorByJob((previous) => ({
        ...previous,
        [jobId]: message,
      }));
    } finally {
      setTranslationPendingByJob((previous) => ({
        ...previous,
        [jobId]: false,
      }));
    }
  };

  const handleGenerateAudio = async (jobId: string) => {
    const job = jobs.find((entry) => entry.id === jobId);
    const historyTarget = job ? buildHistoryTarget(sharedGuideTarget, job) : null;
    if (!job || !historyTarget) return;

    const promptText = job.promptText.trim();
    if (!promptText) {
      setAudioErrorByJob((previous) => ({
        ...previous,
        [jobId]: 'Open Audio Director and return a TTS prompt first.',
      }));
      return;
    }
    if (!promptContainsTranscript(promptText)) {
      setAudioErrorByJob((previous) => ({
        ...previous,
        [jobId]: 'The TTS prompt is missing the transcript section. Reopen Audio Director and return the prompt again.',
      }));
      return;
    }
    if (!job.voiceId) {
      setAudioErrorByJob((previous) => ({
        ...previous,
        [jobId]: 'Select a voice in Audio Director before generating audio.',
      }));
      return;
    }

    const sessionId = createTtsAudioSessionId(job);
    const requestStartedAt = Date.now();
    const previousVersionId = job.selectedHistoryVersion?.versionId;
    setAudioPendingByJob((previous) => ({
      ...previous,
      [jobId]: true,
    }));
    setAudioErrorByJob((previous) => ({
      ...previous,
      [jobId]: '',
    }));

    try {
      await bootstrapAudioSession({
        sessionId,
        context: {
          flow: 'tts-page',
          guideId: historyTarget.guideId,
          spotId: historyTarget.spotId,
          lang: historyTarget.lang,
        },
      });

      const response = await generateAudioForLanguage({
        sessionId,
        scripts: [{
          spotId: job.spotId,
          spotNumber: 1,
          title: job.spotTitle,
        }],
        voiceId: job.voiceId,
        language: job.language,
        historyTarget: {
          tenantId: historyTarget.tenantId,
          guideId: historyTarget.guideId,
          spotId: historyTarget.spotId,
          spotTitle: historyTarget.spotTitle,
          lang: historyTarget.lang,
        },
        directorNote: {
          scene: job.performanceHint.scene,
          style: job.performanceHint.style,
          pacing: job.performanceHint.pacing,
          compiledPrompt: promptText,
        },
      });

      const audioFile = response.audioFiles[0];
      if (!audioFile?.audioUrl) {
        throw new Error(audioFile?.error?.trim() || 'The backend did not return a playable audio file.');
      }

      updateJob(jobId, (currentJob) => ({
        ...currentJob,
        outputAudio: audioFile.audioUrl,
        selectedHistoryVersion: {
          versionId: audioFile.versionId,
          storagePath: audioFile.storagePath,
          guideId: audioFile.guideId,
          spotId: audioFile.spotId,
          lang: audioFile.lang ?? currentJob.language,
        },
      }));
      setTrackSummaries((previous) => {
        const docId = buildAudioTrackDocId(job.spotId, job.language);
        const generatedAt = audioFile.generatedAtMs ?? Date.now();
        const nextSummary: AudioTrackSummaryRecord = {
          id: docId,
          guideId: historyTarget.guideId,
          spotId: job.spotId,
          lang: job.language,
          spotTitle: job.spotTitle,
          activeVersionId: audioFile.versionId,
          latestVersionId: audioFile.versionId,
          latestGeneratedAt: generatedAt,
          hasGeneratedAudio: true,
          audioDirectorConfig: buildStoredAudioDirectorConfig(job) ?? undefined,
          ttsPromptSnapshot: buildStoredTtsPromptSnapshot(job) ?? undefined,
          ttsInputSnapshot: buildStoredTtsInputSnapshot(job) ?? undefined,
        };
        const existingIndex = previous.findIndex((summary) => summary.id === docId);
        if (existingIndex < 0) {
          return [nextSummary, ...previous];
        }
        const next = [...previous];
        next[existingIndex] = {
          ...next[existingIndex],
          ...nextSummary,
        };
        return next;
      });
    } catch (error) {
      const shouldAttemptRecovery = (
        (error instanceof ApiRequestError && (error.status === 502 || error.status === 504 || error.retryable))
        || error instanceof TypeError
      );

      const recoverFromPersistedAudio = async (): Promise<boolean> => {
        const { db } = initFirebase();
        const trackDocId = buildAudioTrackDocId(job.spotId, job.language);

        for (let attempt = 0; attempt < AUDIO_GENERATION_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
          const summaryDoc = await getDoc(
            doc(db, 'guides', historyTarget.guideId, 'audioTracks', trackDocId),
          );
          if (!summaryDoc.exists()) {
            if (attempt < AUDIO_GENERATION_RECOVERY_MAX_ATTEMPTS - 1) {
              await sleep(AUDIO_GENERATION_RECOVERY_INTERVAL_MS);
            }
            continue;
          }

          const summary = mapAudioTrackSummary({
            guideId: historyTarget.guideId,
            docId: summaryDoc.id,
            data: summaryDoc.data() as Record<string, unknown>,
          });
          const versionId = summary?.activeVersionId || summary?.latestVersionId;
          if (!summary || !versionId) {
            if (attempt < AUDIO_GENERATION_RECOVERY_MAX_ATTEMPTS - 1) {
              await sleep(AUDIO_GENERATION_RECOVERY_INTERVAL_MS);
            }
            continue;
          }

          const versionDoc = await getDoc(
            doc(db, 'guides', historyTarget.guideId, 'audioTracks', trackDocId, 'versions', versionId),
          );
          if (!versionDoc.exists()) {
            if (attempt < AUDIO_GENERATION_RECOVERY_MAX_ATTEMPTS - 1) {
              await sleep(AUDIO_GENERATION_RECOVERY_INTERVAL_MS);
            }
            continue;
          }

          const versionRecord = mapAudioHistoryVersion({
            guideId: historyTarget.guideId,
            target: {
              guideId: historyTarget.guideId,
              spotId: historyTarget.spotId,
              spotTitle: historyTarget.spotTitle,
              lang: historyTarget.lang,
              tenantId: historyTarget.tenantId,
            },
            summary,
            docId: versionDoc.id,
            data: versionDoc.data() as Record<string, unknown>,
          });
          if (!versionRecord?.audioUrl) {
            if (attempt < AUDIO_GENERATION_RECOVERY_MAX_ATTEMPTS - 1) {
              await sleep(AUDIO_GENERATION_RECOVERY_INTERVAL_MS);
            }
            continue;
          }
          if (!isRecoveredVersionFresh({
            requestStartedAt,
            summaryGeneratedAt: summary.latestGeneratedAt,
            versionGeneratedAt: versionRecord.generatedAt,
            previousVersionId,
            candidateVersionId: versionRecord.versionId,
          })) {
            if (attempt < AUDIO_GENERATION_RECOVERY_MAX_ATTEMPTS - 1) {
              await sleep(AUDIO_GENERATION_RECOVERY_INTERVAL_MS);
            }
            continue;
          }

          updateJob(jobId, (currentJob) => ({
            ...currentJob,
            outputAudio: versionRecord.audioUrl,
            selectedHistoryVersion: {
              versionId: versionRecord.versionId,
              storagePath: versionRecord.storagePath,
              guideId: versionRecord.guideId,
              spotId: versionRecord.spotId,
              lang: versionRecord.lang,
            },
          }));
          setTrackSummaries((previous) => {
            const existingIndex = previous.findIndex((entry) => entry.id === trackDocId);
            if (existingIndex < 0) {
              return [summary, ...previous];
            }
            const next = [...previous];
            next[existingIndex] = summary;
            return next;
          });
          return true;
        }

        return false;
      };

      if (shouldAttemptRecovery && await recoverFromPersistedAudio()) {
        setAudioErrorByJob((previous) => ({
          ...previous,
          [jobId]: '',
        }));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setAudioErrorByJob((previous) => ({
          ...previous,
          [jobId]: message,
        }));
      }
    } finally {
      setAudioPendingByJob((previous) => ({
        ...previous,
        [jobId]: false,
      }));
    }
  };

  const jobHasOpenWindow = (jobId: string): boolean => {
    void openAudioDirectorRevision;
    return findOpenAudioDirectorLaunch(jobId) !== null;
  };

  return (
    <Container maxWidth={false} sx={{ py: 6, px: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Text to Speech
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage one guide at a time, define guide-wide languages once, and let each spot-language pair become its own TTS job row.
          </Typography>
        </Box>

        <Paper
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <Stack spacing={2} sx={{ p: 2.5 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                TTS Jobs
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Each tab is a spot. Inside each tab, every selected language becomes one job row.
              </Typography>
            </Box>

            {sharedGuideTarget ? (
              <Stack spacing={2}>
                {trackSummariesLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography variant="body2" color="text.secondary">
                      Loading guide spots…
                    </Typography>
                  </Stack>
                ) : null}

                {spotOptions.length > 0 ? (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Tabs
                        value={selectedSpotId}
                        onChange={(_, nextValue: string) => setSelectedSpotId(nextValue)}
                        variant="scrollable"
                        scrollButtons="auto"
                      >
                        {spotOptions.map((spot) => (
                          <Tab
                            key={spot.spotId}
                            value={spot.spotId}
                            label={`${spot.spotTitle} (${spot.languages.length})`}
                          />
                        ))}
                      </Tabs>
                    </Box>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <IconButton
                        color="primary"
                        aria-label="add spot"
                        disabled={spotManagerCreating || spotManagerDeletingId !== null || effectiveGuideLanguages.length === 0}
                        onClick={() => {
                          setSpotComposerOpen((previous) => !previous);
                          setSpotManagerError(null);
                        }}
                      >
                        <AddCircleOutlineIcon />
                      </IconButton>
                      <IconButton
                        color="inherit"
                        aria-label="remove selected spot"
                        disabled={!selectedSpot || spotManagerCreating || spotManagerDeletingId === selectedSpot?.spotId}
                        onClick={() => {
                          if (!selectedSpot) return;
                          void handleDeleteSpot(selectedSpot);
                        }}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Stack>
                  </Stack>
                ) : (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                    <Alert severity="info" sx={{ flex: 1 }}>
                      Create a spot to start generating TTS jobs for the guide languages.
                    </Alert>
                    <Button
                      variant="outlined"
                      startIcon={<AddCircleOutlineIcon />}
                      disabled={spotManagerCreating || effectiveGuideLanguages.length === 0}
                      onClick={() => {
                        setSpotComposerOpen(true);
                        setSpotManagerError(null);
                      }}
                    >
                      Create Spot
                    </Button>
                  </Stack>
                )}

                {spotComposerOpen ? (
                  <Paper
                    elevation={0}
                    sx={{
                      border: '1px dashed',
                      borderColor: 'divider',
                      borderRadius: 3,
                      p: 2,
                    }}
                  >
                    <Stack spacing={1.5}>
                      <TextField
                        label="Spot Title"
                        value={spotManagerTitle}
                        onChange={(event) => setSpotManagerTitle(event.target.value)}
                        disabled={spotManagerCreating || spotManagerDeletingId !== null}
                        fullWidth
                      />
                      <Typography variant="caption" color="text.secondary">
                        This spot will create rows for: {effectiveGuideLanguages.length > 0
                          ? effectiveGuideLanguages.map((language) => langLabel(language)).join(', ')
                          : 'no languages yet'}
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button
                          variant="contained"
                          startIcon={<AddCircleOutlineIcon />}
                          disabled={spotManagerCreating || spotManagerDeletingId !== null || !spotManagerTitle.trim() || effectiveGuideLanguages.length === 0}
                          onClick={() => {
                            void handleCreateSpot();
                          }}
                        >
                          {spotManagerCreating ? 'Creating…' : 'Create Spot'}
                        </Button>
                        <Button
                          variant="text"
                          color="inherit"
                          disabled={spotManagerCreating}
                          onClick={() => {
                            setSpotComposerOpen(false);
                            setSpotManagerTitle('');
                            setSpotManagerError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ) : null}

                {selectedSpot ? (
                  <Paper
                    elevation={0}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        {selectedSpot.spotTitle}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedSpot.hasGeneratedAudio
                          ? 'Open Audio Director to refine the prompt, then generate audio directly from the row.'
                          : 'Use Audio Director to prepare the prompt, then generate the first audio version from this row.'}
                      </Typography>
                    </Box>

                    <Box sx={{ overflowX: 'auto' }}>
                      <Table sx={{ minWidth: 1560 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Language</TableCell>
                            <TableCell sx={{ fontWeight: 700, minWidth: 360 }}>Input Script</TableCell>
                            <TableCell sx={{ fontWeight: 700, minWidth: 240 }}>Actions</TableCell>
                            <TableCell sx={{ fontWeight: 700, minWidth: 420 }}>TTS Prompt</TableCell>
                            <TableCell sx={{ fontWeight: 700, minWidth: 280 }}>Output Audio</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {visibleJobs.map((job) => {
                            const savedHistory = jobHasSavedHistory(job);
                            const openDisabled = !job.inputScript.trim() && !savedHistory;
                            const hasOpenWindow = jobHasOpenWindow(job.id);
                            const hasCopyConfigCandidates = jobs.some((candidate) => (
                              candidate.id !== job.id
                              && Boolean(buildStoredAudioDirectorConfig(candidate))
                            ));
                            const primarySourceJob = primaryLanguageJobBySpotId.get(job.spotId);
                            const canTranslateFromPrimary = job.language !== effectiveCoreLanguage && Boolean(primarySourceJob);
                            const translateDisabled = translationPendingByJob[job.id] || !(primarySourceJob?.inputScript.trim());
                            const translateError = translationErrorByJob[job.id];
                            const audioPending = audioPendingByJob[job.id] === true;
                            const audioError = audioErrorByJob[job.id];

                            return (
                              <TableRow
                                key={job.id}
                                hover
                                sx={{ verticalAlign: 'top' }}
                              >
                                <TableCell>
                                  <Stack spacing={1}>
                                    <Chip label={langLabel(job.language)} color="primary" size="small" sx={{ width: 'fit-content' }} />
                                    <Typography variant="caption" color="text.secondary">
                                      {savedHistory ? 'Saved history exists for this language.' : 'No saved history yet for this language.'}
                                    </Typography>
                                    {job.voiceName ? (
                                      <Typography variant="caption" color="text.secondary">
                                        Voice: {job.voiceName}{job.characterName ? ` · ${job.characterName}` : ''}
                                      </Typography>
                                    ) : null}
                                  </Stack>
                                </TableCell>
                                <TableCell>
                                  <Stack spacing={1}>
                                    <TextField
                                      multiline
                                      minRows={6}
                                      maxRows={14}
                                      fullWidth
                                      placeholder={`Paste or type the ${langLabel(job.language)} script`}
                                      value={job.inputScript}
                                      onChange={(event) => {
                                        const nextValue = event.target.value;
                                        updateJob(job.id, (currentJob) => ({
                                          ...currentJob,
                                          inputScript: nextValue,
                                        }));
                                        queuePersistJobStoredState({
                                          ...job,
                                          inputScript: nextValue,
                                        }, {
                                          audioDirectorConfigMode: 'ignore',
                                          ttsInputSnapshotMode: 'write',
                                          ttsPromptSnapshotMode: 'ignore',
                                        });
                                        setTranslationErrorByJob((previous) => ({
                                          ...previous,
                                          [job.id]: '',
                                        }));
                                      }}
                                      inputProps={{ 'aria-label': `Input Script ${selectedSpot.spotTitle} ${langLabel(job.language)}` }}
                                    />
                                    {canTranslateFromPrimary ? (
                                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                                        <Button
                                          variant="outlined"
                                          size="small"
                                          disabled={translateDisabled}
                                          onClick={() => {
                                            void handleTranslateFromEnglish(job.id);
                                          }}
                                        >
                                          {translationPendingByJob[job.id] ? 'Translating…' : `Translate from ${langLabel(effectiveCoreLanguage)}`}
                                        </Button>
                                        <Typography variant="caption" color="text.secondary">
                                          {primarySourceJob?.inputScript.trim()
                                            ? `Use the ${langLabel(effectiveCoreLanguage)} row as the source for ${langLabel(job.language)}.`
                                            : `Enter the ${langLabel(effectiveCoreLanguage)} row script first to enable AI translation.`}
                                        </Typography>
                                      </Stack>
                                    ) : null}
                                    {translateError ? (
                                      <Typography variant="caption" color="error.main">
                                        {translateError}
                                      </Typography>
                                    ) : null}
                                    <Typography variant="caption" color="text.secondary">
                                      This row is fixed to {langLabel(job.language)}.
                                    </Typography>
                                  </Stack>
                                </TableCell>
                                <TableCell>
                                  <Stack spacing={1}>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      disabled={!hasCopyConfigCandidates}
                                      onClick={() => handleOpenCopyConfigDialog(job.id)}
                                    >
                                      Copy Config
                                    </Button>
                                    <Button
                                      variant="contained"
                                      size="small"
                                      startIcon={<HeadphonesIcon />}
                                      disabled={openDisabled}
                                      onClick={() => handleOpenJob(job.id)}
                                    >
                                      {hasOpenWindow ? 'Focus Audio Director' : 'Open Audio Director'}
                                    </Button>
                                    <Typography variant="caption" color="text.secondary">
                                      {hasOpenWindow
                                        ? 'This row already has an Audio Director window open.'
                                        : job.promptText.trim()
                                          ? 'Reopen Audio Director to refine the current prompt and voice.'
                                          : 'Open Audio Director to build the prompt and choose the voice.'}
                                    </Typography>
                                    {!hasCopyConfigCandidates ? (
                                      <Typography variant="caption" color="text.secondary">
                                        Save an Audio Director config in another row first to reuse it here.
                                      </Typography>
                                    ) : null}
                                    {job.selectedHistoryVersion?.versionId ? (
                                      <Typography variant="caption" color="text.secondary">
                                        Selected version: {job.selectedHistoryVersion.versionId}
                                      </Typography>
                                    ) : null}
                                  </Stack>
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    multiline
                                    minRows={6}
                                    maxRows={14}
                                    fullWidth
                                    placeholder="Return a prompt from Audio Director, then fine-tune it here if needed."
                                    value={job.promptText}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      const nextJob = {
                                        ...job,
                                        promptText: nextValue,
                                      };
                                      updateJob(job.id, (currentJob) => ({
                                        ...currentJob,
                                        promptText: nextValue,
                                      }));
                                      queuePersistJobStoredState(nextJob, {
                                        audioDirectorConfigMode: 'ignore',
                                        ttsInputSnapshotMode: 'ignore',
                                        ttsPromptSnapshotMode: 'write',
                                      });
                                      setAudioErrorByJob((previous) => ({
                                        ...previous,
                                        [job.id]: '',
                                      }));
                                    }}
                                    inputProps={{ 'aria-label': `TTS Prompt ${selectedSpot.spotTitle} ${langLabel(job.language)}` }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Stack spacing={1}>
                                    <Button
                                      variant="contained"
                                      size="small"
                                      startIcon={audioPending ? <CircularProgress color="inherit" size={16} /> : <HeadphonesIcon />}
                                      disabled={audioPending || !job.promptText.trim() || !job.voiceId}
                                      onClick={() => {
                                        void handleGenerateAudio(job.id);
                                      }}
                                    >
                                      {audioPending ? 'Generating…' : 'Generate Audio'}
                                    </Button>
                                    {audioError ? (
                                      <Typography variant="caption" color="error.main">
                                        {audioError}
                                      </Typography>
                                    ) : null}
                                    <OutputAudioPreviewPlayer audioUrl={job.outputAudio} />
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </Box>
                  </Paper>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </Paper>

        <DeployVersionFooter />
      </Stack>

      <Dialog
        open={copyConfigDialog.open}
        onClose={handleCloseCopyConfigDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Copy Audio Director Config</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Reuse voice, character, and performance hints from another row. The target row will keep its own script and require a fresh prompt.
            </Typography>
            {copyConfigTargetJob ? (
              <Typography variant="body2">
                Target: <strong>{copyConfigTargetJob.spotTitle}</strong> · {langLabel(copyConfigTargetJob.language)}
              </Typography>
            ) : null}
            <FormControl fullWidth disabled={copyConfigCandidates.length === 0}>
              <InputLabel id="copy-config-source-label">Source Row</InputLabel>
              <Select
                labelId="copy-config-source-label"
                value={copyConfigDialog.sourceJobId}
                label="Source Row"
                onChange={(event) => {
                  setCopyConfigDialog((current) => ({
                    ...current,
                    sourceJobId: event.target.value,
                  }));
                }}
              >
                {copyConfigCandidates.map((job) => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.spotTitle} · {langLabel(job.language)}
                    {job.characterName ? ` · ${job.characterName}` : ''}
                    {job.voiceName ? ` · ${job.voiceName}` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {copyConfigCandidates.length === 0 ? (
              <Alert severity="info">
                Save an Audio Director config in another row first, then you can reuse it here.
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCopyConfigDialog}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleApplyCopiedConfig}
            disabled={!copyConfigDialog.sourceJobId}
          >
            Copy Config
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={guidePickerOpen}
        onClose={(_, reason) => {
          if (!sharedGuideTarget && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
            return;
          }
          setGuidePickerOpen(false);
        }}
        maxWidth="md"
        fullWidth
        disableEscapeKeyDown={!sharedGuideTarget}
      >
        <DialogTitle>Select A Guide To Start</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Choose an existing guide or create a minimal guide before working with TTS jobs.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Button
                variant={quickCreateExpanded ? 'outlined' : 'contained'}
                startIcon={<HistoryOutlinedIcon />}
                onClick={() => {
                  setQuickCreateExpanded(false);
                  setQuickCreateError(null);
                  void loadGuides();
                }}
              >
                Browse Guides
              </Button>
              <Button
                variant={quickCreateExpanded ? 'contained' : 'outlined'}
                startIcon={<AddCircleOutlineIcon />}
                onClick={() => {
                  setQuickCreateExpanded(true);
                  setQuickCreateError(null);
                }}
              >
                Create Minimal Guide
              </Button>
            </Stack>

            {quickCreateExpanded ? (
              <Paper
                elevation={0}
                sx={{
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 3,
                  p: 2,
                }}
              >
                <Stack spacing={2}>
                  {quickCreateError ? <Alert severity="error">{quickCreateError}</Alert> : null}
                  {!tenantId && !authLoading ? (
                    <Typography variant="caption" color="text.secondary">
                      No tenant claim was found on the current user. New guides created here will be stored without tenant scoping metadata.
                    </Typography>
                  ) : null}
                  <TextField
                    label="Guide Title"
                    value={quickCreateGuideTitle}
                    onChange={(event) => setQuickCreateGuideTitle(event.target.value)}
                    disabled={quickCreateCreating}
                  />
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                      Guide Languages
                    </Typography>
                    <FormGroup row>
                      {SUPPORTED_TTS_JOB_LANGUAGES.map((language) => (
                        <FormControlLabel
                          key={language.code}
                          control={(
                            <Checkbox
                              checked={quickCreateLanguages.includes(language.code)}
                              onChange={() => handleToggleQuickCreateLanguage(language.code)}
                              disabled={quickCreateCreating}
                            />
                          )}
                          label={language.label}
                        />
                      ))}
                    </FormGroup>
                  </Box>
                  <FormControl fullWidth disabled={quickCreateCreating || quickCreateLanguages.length === 0}>
                    <InputLabel id="primary-language-label">Primary Language</InputLabel>
                    <Select
                      labelId="primary-language-label"
                      value={quickCreateCoreLanguage}
                      label="Primary Language"
                      onChange={(event) => setQuickCreateCoreLanguage(event.target.value)}
                    >
                      {quickCreateLanguages.map((languageCode) => (
                        <MenuItem key={languageCode} value={languageCode}>
                          {langLabel(languageCode)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Paper>
            ) : (
              <Stack spacing={2}>
                {guidePickerError ? <Alert severity="info">{guidePickerError}</Alert> : null}
                <FormControl fullWidth disabled={guidePickerLoading || guidePickerGuides.length === 0}>
                  <InputLabel id="guide-picker-label">Guide</InputLabel>
                  <Select
                    labelId="guide-picker-label"
                    value={guidePickerSelectionId}
                    label="Guide"
                    onChange={(event) => setGuidePickerSelectionId(event.target.value)}
                  >
                    {guidePickerGuides.map((guide) => (
                      <MenuItem key={guide.id} value={guide.id}>
                        {guide.title}
                        {guide.createdFrom === 'tts' && guide.status === 'draft' ? ' (minimal draft)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {guidePickerLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography variant="body2" color="text.secondary">
                      Loading guides…
                    </Typography>
                  </Stack>
                ) : null}
                {selectedGuideOption ? (
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                  >
                    <Typography variant="caption" color="text.secondary">
                      Selected: {selectedGuideOption.title}
                    </Typography>
                    <Button
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={handleOpenDeleteGuideDialog}
                      disabled={deleteGuideLoading}
                    >
                      Remove Guide
                    </Button>
                  </Stack>
                ) : null}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {quickCreateExpanded ? (
            <>
              <Button
                onClick={() => {
                  setQuickCreateExpanded(false);
                  setQuickCreateError(null);
                }}
                disabled={quickCreateCreating}
              >
                Back To Guides
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  void handleCreateMinimalGuide();
                }}
                disabled={quickCreateCreating || !quickCreateGuideTitle.trim() || quickCreateLanguages.length === 0}
              >
                {quickCreateCreating ? 'Creating…' : 'Create Minimal Guide'}
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={handleConfirmGuidePicker} disabled={!selectedGuideOption}>
              Use Guide
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteGuideDialog.open}
        onClose={handleCloseDeleteGuideDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Guide</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {deleteGuideError ? <Alert severity="error">{deleteGuideError}</Alert> : null}
            <Typography variant="body2" color="text.secondary">
              This will permanently delete the guide and all saved audio history under it.
            </Typography>
            <Typography variant="body2">
              Type <strong>{deleteGuideDialog.guide?.title ?? ''}</strong> to confirm.
            </Typography>
            <TextField
              label="Guide Title Confirmation"
              value={deleteGuideConfirmText}
              onChange={(event) => setDeleteGuideConfirmText(event.target.value)}
              disabled={deleteGuideLoading}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteGuideDialog} disabled={deleteGuideLoading}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => {
              void handleDeleteGuide();
            }}
            disabled={deleteGuideLoading || deleteGuideConfirmText.trim() !== (deleteGuideDialog.guide?.title ?? '')}
          >
            {deleteGuideLoading ? 'Deleting…' : 'Delete Guide'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
