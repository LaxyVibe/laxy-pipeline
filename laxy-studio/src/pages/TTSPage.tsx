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
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getCustomClaims } from '../admin/auth/authenticator';
import { bootstrapAudioSession, generateAudioForLanguage, translateLanguage } from '../api';
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
} from '../features/audioDirector/history';
import { ROUTES } from '../routes';
import { SUPPORTED_LANGUAGES, langLabel } from '../types/entity';

type SharedGuideTarget = {
  guideId: string;
  title: string;
  tenantId?: string;
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

type AudioDirectorLaunchRecord = {
  jobId: string;
  windowRef: Window | null;
};

type AudioDirectorPromptSelection = {
  compiledPrompt: string;
  voiceId: string;
  voiceName: string;
  characterId: string;
  characterName: string;
  scene: string;
  style: string;
  pacing: string;
  tone: string;
  generatedPerformanceGuidelines: string;
};

const AUDIO_DIRECTOR_ORIGIN = window.location.origin;
const SUPPORTED_TTS_JOB_LANGUAGE_CODES = ['en', 'ja', 'ko', 'zh-TW', 'zh-CN', 'fr'] as const;
const SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET = new Set<string>(SUPPORTED_TTS_JOB_LANGUAGE_CODES);
const SUPPORTED_TTS_JOB_LANGUAGES = SUPPORTED_LANGUAGES.filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language.code));
const LANGUAGE_ORDER = new Map<string, number>(SUPPORTED_TTS_JOB_LANGUAGE_CODES.map((code, index) => [code, index]));

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

function sortLanguageCodes(codes: string[]): string[] {
  return [...codes].sort((left, right) => {
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

function createTtsAudioSessionId(job: TtsJob): string {
  return `tts-${job.spotId}-${job.language}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
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

function OutputAudioPreviewButton(props: { audioUrl: string }) {
  const { audioUrl } = props;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenersAttachedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    listenersAttachedRef.current = false;
    setIsPlaying(false);
  }, [audioUrl]);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const handleTogglePlayback = async () => {
    const trimmedAudioUrl = audioUrl.trim();
    if (!trimmedAudioUrl) return;

    const audio = audioRef.current ?? new Audio(trimmedAudioUrl);
    if (!audioRef.current) {
      audioRef.current = audio;
    }

    if (!listenersAttachedRef.current) {
      audio.addEventListener('play', () => setIsPlaying(true));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('ended', () => setIsPlaying(false));
      listenersAttachedRef.current = true;
    }

    if (audio.paused) {
      await audio.play();
      return;
    }

    audio.pause();
  };

  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={isPlaying ? <PauseCircleOutlineIcon /> : <PlayCircleOutlineIcon />}
      disabled={!audioUrl.trim()}
      onClick={() => {
        void handleTogglePlayback();
      }}
    >
      {isPlaying ? 'Pause audio' : 'Play audio'}
    </Button>
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
  const [quickCreateCreating, setQuickCreateCreating] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [deleteGuideDialog, setDeleteGuideDialog] = useState<DeleteGuideDialogState>({ open: false, guide: null });
  const [deleteGuideConfirmText, setDeleteGuideConfirmText] = useState('');
  const [deleteGuideLoading, setDeleteGuideLoading] = useState(false);
  const [deleteGuideError, setDeleteGuideError] = useState<string | null>(null);
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
  const visibleJobs = useMemo(
    () => jobs.filter((job) => job.spotId === selectedSpotId).sort((left, right) => {
      const leftRank = LANGUAGE_ORDER.get(left.language) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = LANGUAGE_ORDER.get(right.language) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.language.localeCompare(right.language);
    }),
    [jobs, selectedSpotId],
  );
  const englishJobBySpotId = useMemo(() => new Map(
    jobs
      .filter((job) => job.language === 'en')
      .map((job) => [job.spotId, job] as const),
  ), [jobs]);

  const updateJob = (jobId: string, updater: (job: TtsJob) => TtsJob) => {
    setJobs((currentJobs) => currentJobs.map((job) => (job.id === jobId ? updater(job) : job)));
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

  const sendScriptToAudioDirector = (targetWindow: Window | null, job: TtsJob, launchId: string) => {
    if (!targetWindow || targetWindow.closed) return;
    targetWindow.postMessage(
      {
        type: 'laxy:script',
        launchId,
        text: job.inputScript,
        language: job.language,
        compiledPrompt: job.promptText,
        voiceId: job.voiceId,
        characterId: job.characterId,
        scene: job.performanceHint.scene,
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
          if (existingJob) {
            nextJobs.push({
              ...existingJob,
              spotTitle: spot.spotTitle,
              language,
              outputAudio: existingJob.outputAudio || persistedSelection?.outputAudio || '',
              selectedHistoryVersion: existingJob.selectedHistoryVersion ?? persistedSelection?.selectedHistoryVersion,
            });
            continue;
          }
          nextJobs.push({
            ...createTtsJob(spot.spotId, spot.spotTitle, language),
            outputAudio: persistedSelection?.outputAudio || '',
            selectedHistoryVersion: persistedSelection?.selectedHistoryVersion,
          });
        }
      }

      return nextJobs;
    });
  }, [persistedJobSelections, spotOptions]);

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
        const fallbackVoiceName = AUDIO_MVP_VOICES.find((voice) => voice.id === voiceId)?.name ?? voiceId;
        updateJob(launchRecord.jobId, (job) => ({
          ...job,
          promptText: typeof event.data.compiledPrompt === 'string' ? event.data.compiledPrompt : job.promptText,
          voiceId,
          voiceName: typeof event.data.voiceName === 'string' ? event.data.voiceName : (job.voiceName || fallbackVoiceName),
          characterId: typeof event.data.characterId === 'string' ? event.data.characterId : job.characterId,
          characterName: typeof event.data.characterName === 'string' ? event.data.characterName : job.characterName,
          performanceHint: {
            scene: typeof event.data.scene === 'string' ? event.data.scene : job.performanceHint.scene,
            style: typeof event.data.style === 'string' ? event.data.style : job.performanceHint.style,
            pacing: typeof event.data.pacing === 'string' ? event.data.pacing : job.performanceHint.pacing,
            tone: typeof event.data.tone === 'string' ? event.data.tone : job.performanceHint.tone,
            generatedPerformanceGuidelines:
              typeof event.data.generatedPerformanceGuidelines === 'string'
                ? event.data.generatedPerformanceGuidelines
                : job.performanceHint.generatedPerformanceGuidelines,
          },
          outputAudio: '',
          selectedHistoryVersion: undefined,
        }));
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
  }, [jobs]);

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
      return sortLanguageCodes(next.filter((item) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(item)));
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

  const handleCreateMinimalGuide = async () => {
    const guideTitle = quickCreateGuideTitle.trim();
    const seededLanguages = sortLanguageCodes(quickCreateLanguages.filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language)));
    if (!guideTitle) return;
    if (seededLanguages.length === 0) return;

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
        languages: seededLanguages,
        status: 'minimal-draft',
      });
      setTrackSummaries([]);
      setTrackSummariesError(null);
      setSelectedSpotId('');
      setQuickCreateExpanded(false);
      setQuickCreateGuideTitle(buildDefaultQuickCreateGuideTitle());
      setQuickCreateLanguages(['en']);
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
    if (!targetJob || targetJob.language === 'en') return;

    const englishJob = englishJobBySpotId.get(targetJob.spotId);
    const englishScript = englishJob?.inputScript.trim() ?? '';
    if (!englishJob || !englishScript) {
      setTranslationErrorByJob((previous) => ({
        ...previous,
        [jobId]: 'Enter the English script in the English row first.',
      }));
      return;
    }

    if (
      targetJob.inputScript.trim()
      && targetJob.inputScript.trim() !== englishScript
      && !window.confirm(`Replace the current ${langLabel(targetJob.language)} input script with an AI translation from English?`)
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
          scriptText: englishScript,
        }],
        targetLanguage: targetJob.language,
        coreLanguage: 'en',
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
      const message = error instanceof Error ? error.message : String(error);
      setAudioErrorByJob((previous) => ({
        ...previous,
        [jobId]: message,
      }));
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
                            const englishSourceJob = englishJobBySpotId.get(job.spotId);
                            const canTranslateFromEnglish = job.language !== 'en' && Boolean(englishSourceJob);
                            const translateDisabled = translationPendingByJob[job.id] || !(englishSourceJob?.inputScript.trim());
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
                                        setTranslationErrorByJob((previous) => ({
                                          ...previous,
                                          [job.id]: '',
                                        }));
                                      }}
                                      inputProps={{ 'aria-label': `Input Script ${selectedSpot.spotTitle} ${langLabel(job.language)}` }}
                                    />
                                    {canTranslateFromEnglish ? (
                                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                                        <Button
                                          variant="outlined"
                                          size="small"
                                          disabled={translateDisabled}
                                          onClick={() => {
                                            void handleTranslateFromEnglish(job.id);
                                          }}
                                        >
                                          {translationPendingByJob[job.id] ? 'Translating…' : 'Translate from English'}
                                        </Button>
                                        <Typography variant="caption" color="text.secondary">
                                          {englishSourceJob?.inputScript.trim()
                                            ? `Use the English row as the source for ${langLabel(job.language)}.`
                                            : 'Enter the English row script first to enable AI translation.'}
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
                                      updateJob(job.id, (currentJob) => ({
                                        ...currentJob,
                                        promptText: nextValue,
                                      }));
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
                                    <Button
                                      component="a"
                                      variant="outlined"
                                      size="small"
                                      startIcon={<DownloadOutlinedIcon />}
                                      href={job.outputAudio || undefined}
                                      download
                                      disabled={!job.outputAudio.trim()}
                                    >
                                      Download Audio
                                    </Button>
                                    <TextField
                                      fullWidth
                                      placeholder="Generate audio from this row to fill the audio URL"
                                      value={job.outputAudio}
                                      onChange={(event) => {
                                        const nextValue = event.target.value;
                                        updateJob(job.id, (currentJob) => ({
                                          ...currentJob,
                                          outputAudio: nextValue,
                                        }));
                                      }}
                                      inputProps={{ 'aria-label': `Output Audio ${selectedSpot.spotTitle} ${langLabel(job.language)}` }}
                                    />
                                    {audioError ? (
                                      <Typography variant="caption" color="error.main">
                                        {audioError}
                                      </Typography>
                                    ) : null}
                                    <OutputAudioPreviewButton audioUrl={job.outputAudio} />
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
