// ---------------------------------------------------------------------------
// TTSPage — Guide-scoped spot tabs with one row per spot-language job
// ---------------------------------------------------------------------------
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slide,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getCustomClaims } from '../admin/auth/authenticator';
import { useAuthStore } from '../authStore';
import DeployVersionFooter from '../components/DeployVersionFooter';
import { initFirebase } from '../firebase';
import {
  buildAudioDirectorHistoryUrl,
  buildAudioTrackDocId,
  mapAudioTrackSummary,
  type AudioHistorySelection,
  type AudioHistoryTarget,
  type AudioTrackSummaryRecord,
} from '../features/audioDirector/history';
import { detectLanguageCode } from '../features/audioDirector/utils';
import { ROUTES } from '../routes';
import { SUPPORTED_LANGUAGES, langLabel } from '../types/entity';

type RowMessageTone = 'info' | 'warning';

type SharedGuideTarget = {
  guideId: string;
  title: string;
  tenantId?: string;
  status: 'existing' | 'minimal-draft';
};

type TtsJob = {
  id: string;
  spotId: string;
  spotTitle: string;
  language: string;
  inputScript: string;
  outputScript: string;
  outputAudio: string;
  rowMessage: string | null;
  rowMessageTone: RowMessageTone;
  selectedHistoryVersion?: AudioHistorySelection;
};

type GuidePickerOption = {
  id: string;
  title: string;
  tenantId?: string;
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

const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

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

function normalizeMultiSelectValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
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
    outputScript: '',
    outputAudio: '',
    rowMessage: null,
    rowMessageTone: 'info',
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

function buildGuideStatusLabel(guide: SharedGuideTarget | null): string {
  if (!guide) return 'No guide selected';
  return guide.status === 'minimal-draft' ? 'Minimal guide draft' : 'Existing guide';
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
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState('');
  const [open, setOpen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeSrc, setIframeSrc] = useState<string>(ROUTES.audioDirector);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string>('');
  const [sharedGuideTarget, setSharedGuideTarget] = useState<SharedGuideTarget | null>(null);
  const [guidePickerOpen, setGuidePickerOpen] = useState(false);
  const [guidePickerLoading, setGuidePickerLoading] = useState(false);
  const [guidePickerError, setGuidePickerError] = useState<string | null>(null);
  const [guidePickerGuides, setGuidePickerGuides] = useState<GuidePickerOption[]>([]);
  const [guidePickerSelectionId, setGuidePickerSelectionId] = useState('');
  const [trackSummaries, setTrackSummaries] = useState<AudioTrackSummaryRecord[]>([]);
  const [trackSummariesLoading, setTrackSummariesLoading] = useState(false);
  const [trackSummariesError, setTrackSummariesError] = useState<string | null>(null);
  const [quickCreateExpanded, setQuickCreateExpanded] = useState(false);
  const [quickCreateGuideTitle, setQuickCreateGuideTitle] = useState(buildDefaultQuickCreateGuideTitle());
  const [quickCreateSpotTitle, setQuickCreateSpotTitle] = useState('');
  const [quickCreateLanguages, setQuickCreateLanguages] = useState<string[]>(['en']);
  const [quickCreateCreating, setQuickCreateCreating] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [spotManagerTitle, setSpotManagerTitle] = useState('');
  const [spotManagerLanguages, setSpotManagerLanguages] = useState<string[]>(['en']);
  const [spotManagerCreating, setSpotManagerCreating] = useState(false);
  const [spotManagerDeletingId, setSpotManagerDeletingId] = useState<string | null>(null);
  const [spotManagerError, setSpotManagerError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
  const visibleJobs = useMemo(
    () => jobs.filter((job) => job.spotId === selectedSpotId).sort((left, right) => {
      const leftRank = LANGUAGE_ORDER.get(left.language) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = LANGUAGE_ORDER.get(right.language) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.language.localeCompare(right.language);
    }),
    [jobs, selectedSpotId],
  );

  const updateJob = (jobId: string, updater: (job: TtsJob) => TtsJob) => {
    setJobs((currentJobs) => currentJobs.map((job) => (job.id === jobId ? updater(job) : job)));
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
  }, [sharedGuideTarget?.guideId]);

  useEffect(() => {
    if (!sharedGuideTarget) {
      setTrackSummaries([]);
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
    setJobs((currentJobs) => {
      const currentMap = new Map(currentJobs.map((job) => [job.id, job]));
      const nextJobs: TtsJob[] = [];

      for (const spot of spotOptions) {
        const sortedLanguages = sortLanguageCodes(spot.languages.filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language)));
        for (const language of sortedLanguages) {
          const jobId = createJobId(spot.spotId, language);
          const existingJob = currentMap.get(jobId);
          if (existingJob) {
            nextJobs.push({
              ...existingJob,
              spotTitle: spot.spotTitle,
              language,
            });
            continue;
          }
          nextJobs.push(createTtsJob(spot.spotId, spot.spotTitle, language));
        }
      }

      return nextJobs;
    });
  }, [spotOptions]);

  useEffect(() => {
    if (!spotOptions.length) {
      if (selectedSpotId) setSelectedSpotId('');
      return;
    }
    if (spotOptions.some((spot) => spot.spotId === selectedSpotId)) return;
    setSelectedSpotId(spotOptions[0]?.spotId ?? '');
  }, [selectedSpotId, spotOptions]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== AUDIO_DIRECTOR_ORIGIN) return;

      if (event.data?.type === 'laxy:ready') {
        setIframeLoading(false);

        const activeJob = jobs.find((job) => job.id === activeJobId);
        if (!activeJob) return;

        iframeRef.current?.contentWindow?.postMessage(
          {
            type: 'laxy:script',
            text: activeJob.inputScript,
            language: activeJob.language,
          },
          AUDIO_DIRECTOR_ORIGIN,
        );
        return;
      }

      if (event.data?.type === 'laxy:result-selected' && activeJobId) {
        updateJob(activeJobId, (job) => ({
          ...job,
          outputScript: typeof event.data.outputScript === 'string' ? event.data.outputScript : job.outputScript,
          outputAudio: typeof event.data.outputAudio === 'string' ? event.data.outputAudio : job.outputAudio,
          selectedHistoryVersion: {
            versionId: typeof event.data.versionId === 'string' ? event.data.versionId : job.selectedHistoryVersion?.versionId,
            storagePath: typeof event.data.storagePath === 'string' ? event.data.storagePath : job.selectedHistoryVersion?.storagePath,
            guideId: typeof event.data.guideId === 'string' ? event.data.guideId : job.selectedHistoryVersion?.guideId,
            spotId: typeof event.data.spotId === 'string' ? event.data.spotId : job.selectedHistoryVersion?.spotId,
            lang: typeof event.data.lang === 'string' ? event.data.lang : job.selectedHistoryVersion?.lang,
          },
        }));
        closeAudioDirector();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeJobId, jobs]);

  const closeAudioDirector = () => {
    setOpen(false);
    setActiveJobId(null);
    setIframeLoading(true);
  };

  const closeGuidePicker = () => {
    setGuidePickerOpen(false);
    setGuidePickerError(null);
    setGuidePickerSelectionId(sharedGuideTarget?.guideId ?? '');
  };

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
            updatedAt: readTimestampMs(data.updatedAt) || readTimestampMs(data.createdAt),
            status: readText(data.status) || undefined,
            createdFrom: readText(data.createdFrom) || undefined,
          } satisfies GuidePickerOption;
        })
        .filter((guide) => !tenantId || !guide.tenantId || guide.tenantId === tenantId)
        .sort((left, right) => right.updatedAt - left.updatedAt);
      setGuidePickerGuides(guides);
      if (!guides.length) {
        setGuidePickerError('No guides are available for this tenant yet.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGuidePickerError(`Unable to load guides: ${message}`);
    } finally {
      setGuidePickerLoading(false);
    }
  };

  const applySharedGuideSelection = (guide: GuidePickerOption) => {
    setSharedGuideTarget({
      guideId: guide.id,
      title: guide.title,
      tenantId: guide.tenantId,
      status: guide.createdFrom === 'tts' && guide.status === 'draft' ? 'minimal-draft' : 'existing',
    });
    setGuidePickerSelectionId(guide.id);
    setGuidePickerOpen(false);
  };

  const handleOpenGuidePicker = () => {
    setGuidePickerSelectionId(sharedGuideTarget?.guideId ?? '');
    setGuidePickerOpen(true);
    void loadGuides();
  };

  const handleConfirmGuidePicker = () => {
    if (!selectedGuideOption) return;
    applySharedGuideSelection(selectedGuideOption);
  };

  const handleAutoDetectLanguage = (jobId: string) => {
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job) return;

    const detected = detectLanguageCode(job.inputScript.trim());
    if (!detected) {
      updateJob(jobId, (currentJob) => ({
        ...currentJob,
        rowMessage: 'Could not confidently detect the script language.',
        rowMessageTone: 'warning',
      }));
      return;
    }

    if (!SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(detected.code)) {
      updateJob(jobId, (currentJob) => ({
        ...currentJob,
        rowMessage: `Detected ${langLabel(detected.code)}, which is outside the supported TTS job languages.`,
        rowMessageTone: 'warning',
      }));
      return;
    }

    updateJob(jobId, (currentJob) => ({
      ...currentJob,
      rowMessage: detected.code === currentJob.language
        ? `Detected ${langLabel(detected.code)} and it matches this row.`
        : `Detected ${langLabel(detected.code)}, but this row is fixed to ${langLabel(currentJob.language)}.`,
      rowMessageTone: detected.code === currentJob.language ? 'info' : 'warning',
    }));
  };

  const jobHasSavedHistory = (job: TtsJob): boolean => (
    trackSummaries.some((summary) => summary.spotId === job.spotId && summary.lang === job.language && Boolean(summary.hasGeneratedAudio))
  );

  const handleCreateMinimalGuide = async () => {
    const guideTitle = quickCreateGuideTitle.trim();
    const seededSpotTitle = quickCreateSpotTitle.trim();
    const seededLanguages = sortLanguageCodes(quickCreateLanguages.filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language)));
    if (!guideTitle) return;
    if (seededSpotTitle && seededLanguages.length === 0) return;

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
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdFrom: 'tts',
        }, tenantId),
      });

      let seededTrackSummaries: AudioTrackSummaryRecord[] = [];
      if (seededSpotTitle && seededLanguages.length > 0) {
        const spotId = createQuickCreateSpotId();
        seededTrackSummaries = seededLanguages.map((language) => ({
          id: buildAudioTrackDocId(spotId, language),
          guideId,
          spotId,
          lang: language,
          spotTitle: seededSpotTitle,
          latestGeneratedAt: 0,
          hasGeneratedAudio: false,
        }));

        seededTrackSummaries.forEach((summary) => {
          const audioTrackRef = doc(db, 'guides', guideId, 'audioTracks', summary.id);
          batch.set(audioTrackRef, {
            ...withOptionalTenantId({
              guideId,
              spotId: summary.spotId,
              spotTitle: summary.spotTitle,
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
      }

      await batch.commit();

      const nextGuideOption: GuidePickerOption = {
        id: guideId,
        title: guideTitle,
        tenantId: tenantId || undefined,
        updatedAt: Date.now(),
        status: 'draft',
        createdFrom: 'tts',
      };
      setGuidePickerGuides((previous) => [nextGuideOption, ...previous].sort((left, right) => right.updatedAt - left.updatedAt));
      setSharedGuideTarget({
        guideId,
        title: guideTitle,
        tenantId: tenantId || undefined,
        status: 'minimal-draft',
      });
      setTrackSummaries(seededTrackSummaries);
      setTrackSummariesError(null);
      setSelectedSpotId(seededTrackSummaries[0]?.spotId ?? '');
      setQuickCreateExpanded(false);
      setQuickCreateGuideTitle(buildDefaultQuickCreateGuideTitle());
      setQuickCreateSpotTitle('');
      setQuickCreateLanguages(['en']);
      setQuickCreateError(null);
      setGuidePickerSelectionId(guideId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setQuickCreateError(`Unable to create a minimal guide: ${message}`);
    } finally {
      setQuickCreateCreating(false);
    }
  };

  const handleCreateSpot = async () => {
    if (!sharedGuideTarget) return;

    const spotTitle = spotManagerTitle.trim();
    const languages = sortLanguageCodes(spotManagerLanguages.filter((language) => SUPPORTED_TTS_JOB_LANGUAGE_CODE_SET.has(language)));
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
      setSpotManagerLanguages(['en']);
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

    setActiveJobId(jobId);
    setIframeLoading(true);
    setIframeSrc(buildAudioDirectorHistoryUrl({
      basePath: ROUTES.audioDirector,
      target,
      cacheBust: Date.now(),
    }));
    setIframeKey((currentKey) => currentKey + 1);
    setOpen(true);
  };

  const handleRequestClose = () => {
    if (!window.confirm('Close Audio Director? Any unchosen result in this session will be lost.')) {
      return;
    }
    closeAudioDirector();
  };

  return (
    <Container maxWidth={false} sx={{ py: 6, px: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Text to Speech
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage one guide at a time, define spots with multiple languages, and let each spot-language pair become its own TTS job row.
          </Typography>
        </Box>

        <Paper
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 4,
            p: { xs: 2, md: 3 },
          }}
        >
          <Stack spacing={2.5}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
              <Stack spacing={0.75}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Guide Target
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Choose a guide once, then manage spots and language sets underneath it.
                </Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button variant="outlined" startIcon={<HistoryOutlinedIcon />} disabled={authLoading} onClick={handleOpenGuidePicker}>
                  Browse Guides
                </Button>
                <Button
                  variant={quickCreateExpanded ? 'contained' : 'outlined'}
                  onClick={() => {
                    setQuickCreateExpanded((previous) => !previous);
                    setQuickCreateError(null);
                  }}
                >
                  {quickCreateExpanded ? 'Hide Create Form' : 'Create Minimal Guide'}
                </Button>
              </Stack>
            </Stack>

            {sharedGuideTarget ? (
              <Alert severity="success">
                <strong>{sharedGuideTarget.title}</strong>
                {' — '}
                {buildGuideStatusLabel(sharedGuideTarget)}
              </Alert>
            ) : (
              <Alert severity="info">
                No guide selected yet. Choose an existing guide or create a minimal guide to start defining spot-language jobs.
              </Alert>
            )}

            {!tenantId && !authLoading ? (
              <Alert severity="warning">
                No tenant claim was found on the current user. New guide targets will be created without tenant scoping metadata.
              </Alert>
            ) : null}

            {trackSummariesError ? <Alert severity="warning">{trackSummariesError}</Alert> : null}
            {spotManagerError ? <Alert severity="warning">{spotManagerError}</Alert> : null}

            {quickCreateExpanded ? (
              <Paper
                elevation={0}
                sx={{
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 3,
                  p: 2,
                  bgcolor: 'background.default',
                }}
              >
                <Stack spacing={2}>
                  {quickCreateError ? <Alert severity="error">{quickCreateError}</Alert> : null}
                  <Typography variant="body2" color="text.secondary">
                    Create a lightweight draft guide directly from `/tts`. You can optionally seed the guide with its first spot and multiple language rows.
                  </Typography>
                  <TextField
                    label="Guide Title"
                    value={quickCreateGuideTitle}
                    onChange={(event) => setQuickCreateGuideTitle(event.target.value)}
                    disabled={quickCreateCreating}
                  />
                  <TextField
                    label="First Spot Title (Optional)"
                    value={quickCreateSpotTitle}
                    onChange={(event) => setQuickCreateSpotTitle(event.target.value)}
                    placeholder="Leave blank to create only the guide"
                    disabled={quickCreateCreating}
                  />
                  <FormControl fullWidth disabled={quickCreateCreating}>
                    <InputLabel id="quick-create-languages-label">Spot Languages</InputLabel>
                    <Select
                      labelId="quick-create-languages-label"
                      multiple
                      value={quickCreateLanguages}
                      label="Spot Languages"
                      onChange={(event) => setQuickCreateLanguages(sortLanguageCodes(normalizeMultiSelectValue(event.target.value)))}
                      renderValue={(selected) => sortLanguageCodes(normalizeMultiSelectValue(selected)).map((language) => langLabel(language)).join(', ')}
                    >
                      {SUPPORTED_TTS_JOB_LANGUAGES.map((language) => (
                        <MenuItem key={language.code} value={language.code}>
                          {language.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                    <Button
                      variant="contained"
                      disabled={quickCreateCreating || !quickCreateGuideTitle.trim() || (Boolean(quickCreateSpotTitle.trim()) && quickCreateLanguages.length === 0)}
                      onClick={() => {
                        void handleCreateMinimalGuide();
                      }}
                    >
                      {quickCreateCreating ? 'Creating…' : 'Create Minimal Guide'}
                    </Button>
                    <Button
                      variant="text"
                      color="inherit"
                      disabled={quickCreateCreating}
                      onClick={() => {
                        setQuickCreateExpanded(false);
                        setQuickCreateError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ) : null}

            {sharedGuideTarget ? (
              <Paper
                elevation={0}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 3,
                  p: 2,
                  bgcolor: 'background.default',
                }}
              >
                <Stack spacing={2}>
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      Spot Management
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Each spot owns a multi-language set. Every selected language becomes its own TTS job row automatically.
                    </Typography>
                  </Stack>

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
                    <TextField
                      label="Spot Title"
                      value={spotManagerTitle}
                      onChange={(event) => setSpotManagerTitle(event.target.value)}
                      disabled={spotManagerCreating || spotManagerDeletingId !== null}
                      fullWidth
                    />
                    <FormControl sx={{ minWidth: { xs: '100%', md: 300 } }}>
                      <InputLabel id="spot-manager-languages-label">Spot Languages</InputLabel>
                      <Select
                        labelId="spot-manager-languages-label"
                        multiple
                        value={spotManagerLanguages}
                        label="Spot Languages"
                        onChange={(event) => setSpotManagerLanguages(sortLanguageCodes(normalizeMultiSelectValue(event.target.value)))}
                        disabled={spotManagerCreating || spotManagerDeletingId !== null}
                        renderValue={(selected) => sortLanguageCodes(normalizeMultiSelectValue(selected)).map((language) => langLabel(language)).join(', ')}
                      >
                        {SUPPORTED_TTS_JOB_LANGUAGES.map((language) => (
                          <MenuItem key={language.code} value={language.code}>
                            {language.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Button
                      variant="contained"
                      disabled={spotManagerCreating || spotManagerDeletingId !== null || !spotManagerTitle.trim() || spotManagerLanguages.length === 0}
                      onClick={() => {
                        void handleCreateSpot();
                      }}
                    >
                      {spotManagerCreating ? 'Creating…' : 'Add Spot'}
                    </Button>
                  </Stack>

                  {trackSummariesLoading ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CircularProgress size={18} />
                      <Typography variant="body2" color="text.secondary">
                        Loading guide spots…
                      </Typography>
                    </Stack>
                  ) : null}

                  {spotOptions.length === 0 ? (
                    <Alert severity="info">No spots exist in this guide yet.</Alert>
                  ) : (
                    <Stack spacing={1}>
                      {spotOptions.map((spot) => (
                        <Paper
                          key={spot.spotId}
                          elevation={0}
                          sx={{
                            border: selectedSpotId === spot.spotId ? '1px solid rgba(31, 92, 79, 0.5)' : '1px solid',
                            borderColor: selectedSpotId === spot.spotId ? 'primary.main' : 'divider',
                            borderRadius: 2.5,
                            p: 1.5,
                          }}
                        >
                          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
                            <Stack spacing={0.75}>
                              <Typography variant="body2" fontWeight={700}>
                                {spot.spotTitle}
                              </Typography>
                              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                                {sortLanguageCodes(spot.languages).map((language) => (
                                  <Chip key={`${spot.spotId}-${language}`} size="small" label={langLabel(language)} />
                                ))}
                                <Chip
                                  size="small"
                                  color={spot.hasGeneratedAudio ? 'success' : 'default'}
                                  label={spot.hasGeneratedAudio ? 'Has history' : 'New target'}
                                />
                              </Stack>
                            </Stack>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                              <Button
                                variant={selectedSpotId === spot.spotId ? 'contained' : 'outlined'}
                                size="small"
                                onClick={() => setSelectedSpotId(spot.spotId)}
                              >
                                Open Jobs
                              </Button>
                              <Button
                                variant="text"
                                color="inherit"
                                size="small"
                                startIcon={<DeleteOutlineIcon />}
                                disabled={spotManagerCreating || spotManagerDeletingId === spot.spotId}
                                onClick={() => {
                                  void handleDeleteSpot(spot);
                                }}
                              >
                                {spotManagerDeletingId === spot.spotId ? 'Removing…' : 'Remove Spot'}
                              </Button>
                            </Stack>
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </Paper>
            ) : null}
          </Stack>
        </Paper>

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

            {!sharedGuideTarget ? (
              <Alert severity="info">Choose or create a guide target first.</Alert>
            ) : spotOptions.length === 0 ? (
              <Alert severity="info">Create a spot with one or more languages to start generating TTS jobs.</Alert>
            ) : (
              <Stack spacing={2}>
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
                          ? 'Opening a row will show its saved audio history in Audio Director.'
                          : 'Opening a row will start the first generation for that spot-language pair.'}
                      </Typography>
                    </Box>

                    <Box sx={{ overflowX: 'auto' }}>
                      <Table sx={{ minWidth: 1380 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Language</TableCell>
                            <TableCell sx={{ fontWeight: 700, minWidth: 360 }}>Input Script</TableCell>
                            <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Actions</TableCell>
                            <TableCell sx={{ fontWeight: 700, minWidth: 320 }}>Output Script</TableCell>
                            <TableCell sx={{ fontWeight: 700, minWidth: 280 }}>Output Audio</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {visibleJobs.map((job) => {
                            const savedHistory = jobHasSavedHistory(job);
                            const openDisabled = !job.inputScript.trim() && !savedHistory;

                            return (
                              <TableRow
                                key={job.id}
                                hover
                                selected={activeJobId === job.id && open}
                                sx={{ verticalAlign: 'top' }}
                              >
                                <TableCell>
                                  <Stack spacing={1}>
                                    <Chip label={langLabel(job.language)} color="primary" size="small" sx={{ width: 'fit-content' }} />
                                    <Typography variant="caption" color="text.secondary">
                                      {savedHistory ? 'Saved history exists for this language.' : 'No saved history yet for this language.'}
                                    </Typography>
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
                                          rowMessage: currentJob.rowMessageTone === 'warning' ? null : currentJob.rowMessage,
                                        }));
                                      }}
                                      inputProps={{ 'aria-label': `Input Script ${selectedSpot.spotTitle} ${langLabel(job.language)}` }}
                                    />
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                                      <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<LanguageOutlinedIcon />}
                                        disabled={!job.inputScript.trim()}
                                        onClick={() => handleAutoDetectLanguage(job.id)}
                                      >
                                        Check language
                                      </Button>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          color: job.rowMessageTone === 'warning' ? 'warning.main' : 'text.secondary',
                                        }}
                                      >
                                        {job.rowMessage ?? `This row is fixed to ${langLabel(job.language)}.`}
                                      </Typography>
                                    </Stack>
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
                                      Open Audio Director
                                    </Button>
                                    <Typography variant="caption" color="text.secondary">
                                      {savedHistory
                                        ? 'Stored results appear in the Audio Director Result rail.'
                                        : 'Use Audio Director to generate the first result for this row.'}
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
                                    placeholder="Choose a result in Audio Director to fill this output script"
                                    value={job.outputScript}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      updateJob(job.id, (currentJob) => ({
                                        ...currentJob,
                                        outputScript: nextValue,
                                      }));
                                    }}
                                    inputProps={{ 'aria-label': `Output Script ${selectedSpot.spotTitle} ${langLabel(job.language)}` }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Stack spacing={1}>
                                    <TextField
                                      fullWidth
                                      placeholder="Choose a result in Audio Director to fill this output audio URL"
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
            )}
          </Stack>
        </Paper>

        <DeployVersionFooter />
      </Stack>

      <Dialog open={guidePickerOpen} onClose={closeGuidePicker} maxWidth="sm" fullWidth>
        <DialogTitle>Browse Guides</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {guidePickerError ? <Alert severity="info">{guidePickerError}</Alert> : null}
            {!tenantId && !authLoading ? (
              <Alert severity="warning">
                No tenant claim was found on the current user. The picker will show any readable guides.
              </Alert>
            ) : null}
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeGuidePicker}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmGuidePicker} disabled={!selectedGuideOption}>
            Use Guide
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog fullScreen open={open} onClose={handleRequestClose} TransitionComponent={SlideUp}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Toolbar
            variant="dense"
            sx={{
              borderBottom: '1px solid',
              borderColor: 'divider',
              minHeight: 48,
              px: 2,
              flexShrink: 0,
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
              Audio Director
            </Typography>
            <IconButton edge="end" onClick={handleRequestClose} aria-label="close">
              <CloseIcon />
            </IconButton>
          </Toolbar>

          <Box sx={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
            {iframeLoading && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'background.default',
                  zIndex: 1,
                }}
              >
                <CircularProgress />
              </Box>
            )}
            {open && (
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={iframeSrc}
                title="Audio Director"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                }}
              />
            )}
          </Box>
        </Box>
      </Dialog>
    </Container>
  );
}
