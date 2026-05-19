// ---------------------------------------------------------------------------
// TTSPage — Table-driven script hub that launches Audio Director in an iframe
// ---------------------------------------------------------------------------
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import type { TransitionProps } from '@mui/material/transitions';
import AddIcon from '@mui/icons-material/Add';
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

type TtsRow = {
  id: string;
  inputScript: string;
  inputLanguage: string;
  targetSpotId?: string;
  targetSpotTitle?: string;
  targetLang: string;
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
const TTS_INPUT_LANGUAGE_CODES = new Set(['en', 'ja', 'ko', 'zh-TW', 'zh-CN', 'fr']);
const TTS_INPUT_LANGUAGES = SUPPORTED_LANGUAGES.filter((language) => TTS_INPUT_LANGUAGE_CODES.has(language.code));

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

function createTtsRow(id: string): TtsRow {
  return {
    id,
    inputScript: '',
    inputLanguage: 'en',
    targetLang: 'en',
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

function buildHistoryTarget(guide: SharedGuideTarget | null, row: TtsRow): AudioHistoryTarget | null {
  if (!guide || !row.targetSpotId || !row.targetLang) return null;
  return {
    tenantId: guide.tenantId,
    guideId: guide.guideId,
    guideTitle: guide.title,
    spotId: row.targetSpotId,
    spotTitle: row.targetSpotTitle,
    lang: row.targetLang,
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
  const [rows, setRows] = useState<TtsRow[]>(() => [createTtsRow('row-1')]);
  const [selectedJobRowId, setSelectedJobRowId] = useState<string>('row-1');
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
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
  const [resultsPickerOpen, setResultsPickerOpen] = useState(false);
  const [resultsPickerRowId, setResultsPickerRowId] = useState<string | null>(null);
  const [resultsPickerSpotId, setResultsPickerSpotId] = useState('');
  const [resultsPickerLang, setResultsPickerLang] = useState('');
  const [quickCreateExpanded, setQuickCreateExpanded] = useState(false);
  const [quickCreateGuideTitle, setQuickCreateGuideTitle] = useState(buildDefaultQuickCreateGuideTitle());
  const [quickCreateSpotTitle, setQuickCreateSpotTitle] = useState('');
  const [quickCreateCreating, setQuickCreateCreating] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const nextRowIdRef = useRef(2);

  const selectedJobRow = rows.find((row) => row.id === selectedJobRowId) ?? rows[0] ?? null;
  const resultsPickerRow = rows.find((row) => row.id === resultsPickerRowId) ?? null;

  const spotOptions = useMemo<SpotOption[]>(() => (
    trackSummaries.reduce<SpotOption[]>((acc, summary) => {
      const existing = acc.find((spot) => spot.spotId === summary.spotId);
      if (existing) {
        if (!existing.languages.includes(summary.lang)) {
          existing.languages.push(summary.lang);
          existing.languages.sort((left, right) => left.localeCompare(right));
        }
        existing.hasGeneratedAudio = existing.hasGeneratedAudio || Boolean(summary.hasGeneratedAudio);
        return acc;
      }
      return [
        ...acc,
        {
          spotId: summary.spotId,
          spotTitle: summary.spotTitle,
          languages: [summary.lang],
          hasGeneratedAudio: Boolean(summary.hasGeneratedAudio),
        },
      ];
    }, []).sort((left, right) => left.spotTitle.localeCompare(right.spotTitle))
  ), [trackSummaries]);

  const selectedGuideOption = guidePickerGuides.find((guide) => guide.id === guidePickerSelectionId) ?? null;
  const resultsPickerSpot = spotOptions.find((spot) => spot.spotId === resultsPickerSpotId) ?? null;

  const updateRow = (rowId: string, updater: (row: TtsRow) => TtsRow) => {
    setRows((currentRows) => currentRows.map((row) => (row.id === rowId ? updater(row) : row)));
  };

  const markRowSelected = (rowId: string) => {
    setSelectedJobRowId(rowId);
  };

  useEffect(() => {
    if (!rows.some((row) => row.id === selectedJobRowId)) {
      setSelectedJobRowId(rows[0]?.id ?? 'row-1');
    }
  }, [rows, selectedJobRowId]);

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
    if (!resultsPickerSpot) {
      if (resultsPickerLang) {
        setResultsPickerLang('');
      }
      return;
    }
    if (resultsPickerLang && resultsPickerSpot.languages.includes(resultsPickerLang)) return;
    setResultsPickerLang(resultsPickerSpot.languages[0] ?? resultsPickerLang);
  }, [resultsPickerLang, resultsPickerSpot]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== AUDIO_DIRECTOR_ORIGIN) return;

      if (event.data?.type === 'laxy:ready') {
        setIframeLoading(false);

        const activeRow = rows.find((row) => row.id === activeRowId);
        if (!activeRow) return;

        iframeRef.current?.contentWindow?.postMessage(
          {
            type: 'laxy:script',
            text: activeRow.inputScript,
            language: activeRow.inputLanguage,
          },
          AUDIO_DIRECTOR_ORIGIN,
        );
        return;
      }

      if (event.data?.type === 'laxy:result-selected' && activeRowId) {
        updateRow(activeRowId, (row) => ({
          ...row,
          outputScript: typeof event.data.outputScript === 'string' ? event.data.outputScript : row.outputScript,
          outputAudio: typeof event.data.outputAudio === 'string' ? event.data.outputAudio : row.outputAudio,
          targetSpotId: typeof event.data.spotId === 'string' ? event.data.spotId : row.targetSpotId,
          targetLang: typeof event.data.lang === 'string' ? event.data.lang : row.targetLang,
          selectedHistoryVersion: {
            versionId: typeof event.data.versionId === 'string' ? event.data.versionId : row.selectedHistoryVersion?.versionId,
            storagePath: typeof event.data.storagePath === 'string' ? event.data.storagePath : row.selectedHistoryVersion?.storagePath,
            guideId: typeof event.data.guideId === 'string' ? event.data.guideId : row.selectedHistoryVersion?.guideId,
            spotId: typeof event.data.spotId === 'string' ? event.data.spotId : row.selectedHistoryVersion?.spotId,
            lang: typeof event.data.lang === 'string' ? event.data.lang : row.selectedHistoryVersion?.lang,
          },
        }));
        closeAudioDirector();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeRowId, rows]);

  const closeAudioDirector = () => {
    setOpen(false);
    setActiveRowId(null);
    setIframeLoading(true);
  };

  const closeGuidePicker = () => {
    setGuidePickerOpen(false);
    setGuidePickerError(null);
    setGuidePickerSelectionId(sharedGuideTarget?.guideId ?? '');
  };

  const closeResultsPicker = () => {
    setResultsPickerOpen(false);
    setResultsPickerRowId(null);
    setResultsPickerSpotId('');
    setResultsPickerLang('');
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

  const handleAddRow = () => {
    const nextRowId = `row-${nextRowIdRef.current}`;
    nextRowIdRef.current += 1;
    setRows((currentRows) => [...currentRows, createTtsRow(nextRowId)]);
    setSelectedJobRowId(nextRowId);
  };

  const handleRemoveRow = (rowId: string) => {
    if (rows.length === 1) return;
    if (!window.confirm('Remove this row?')) return;

    setRows((currentRows) => currentRows.filter((row) => row.id !== rowId));

    if (activeRowId === rowId) {
      closeAudioDirector();
    }
  };

  const handleAutoDetectLanguage = (rowId: string) => {
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) return;

    const detected = detectLanguageCode(row.inputScript.trim());
    if (!detected) {
      updateRow(rowId, (currentRow) => ({
        ...currentRow,
        rowMessage: 'Could not confidently detect the script language. Please choose it manually.',
        rowMessageTone: 'warning',
      }));
      return;
    }

    if (!TTS_INPUT_LANGUAGE_CODES.has(detected.code)) {
      updateRow(rowId, (currentRow) => ({
        ...currentRow,
        rowMessage: `Detected ${langLabel(detected.code)}, which is not available in this table. Please choose one of the supported languages manually.`,
        rowMessageTone: 'warning',
      }));
      return;
    }

    updateRow(rowId, (currentRow) => ({
      ...currentRow,
      inputLanguage: detected.code,
      rowMessage: `Detected ${langLabel(detected.code)} and applied it to the input language.`,
      rowMessageTone: 'info',
    }));
  };

  const getSpotOption = (spotId: string | undefined) => (
    spotId ? spotOptions.find((spot) => spot.spotId === spotId) ?? null : null
  );

  const getRowTargetWarning = (row: TtsRow): string | null => {
    if (!sharedGuideTarget) return 'Choose a guide target before routing this job.';
    if (row.targetSpotId && !getSpotOption(row.targetSpotId)) {
      return `This row still points to ${row.targetSpotTitle || row.targetSpotId} from a different guide. Choose a spot again.`;
    }
    if (!row.targetSpotId) return 'Choose a spot or create one under the selected guide.';
    return null;
  };

  const getRowTargetLanguageOptions = (row: TtsRow): string[] => {
    const spot = getSpotOption(row.targetSpotId);
    const values = [row.targetLang, row.inputLanguage, ...(spot?.languages ?? [])].filter(Boolean);
    return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
  };

  const rowHasSavedHistory = (row: TtsRow): boolean => {
    const spot = getSpotOption(row.targetSpotId);
    return Boolean(spot && spot.languages.includes(row.targetLang));
  };

  const handleOpenResultsPicker = (rowId: string) => {
    const row = rows.find((entry) => entry.id === rowId);
    if (!row || !sharedGuideTarget) return;
    setResultsPickerRowId(rowId);
    setResultsPickerSpotId(row.targetSpotId ?? '');
    setResultsPickerLang(row.targetLang);
    setResultsPickerOpen(true);
  };

  const handleConfirmResultsPicker = () => {
    if (!resultsPickerRowId || !resultsPickerSpot) return;

    updateRow(resultsPickerRowId, (row) => ({
      ...row,
      targetSpotId: resultsPickerSpot.spotId,
      targetSpotTitle: resultsPickerSpot.spotTitle,
      targetLang: resultsPickerLang || row.targetLang,
      selectedHistoryVersion: undefined,
      rowMessage: `Targeted ${resultsPickerSpot.spotTitle} / ${langLabel(resultsPickerLang || row.targetLang)} under ${sharedGuideTarget?.title ?? 'the selected guide'}.`,
      rowMessageTone: 'info',
    }));

    closeResultsPicker();
  };

  const handleCreateMinimalGuide = async () => {
    const guideTitle = quickCreateGuideTitle.trim();
    const seededSpotTitle = quickCreateSpotTitle.trim();
    if (!guideTitle) return;

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

      let seededSpotSummary: SpotOption | null = null;
      if (seededSpotTitle && selectedJobRow) {
        const spotId = createQuickCreateSpotId();
        const seedLanguage = selectedJobRow.targetLang || selectedJobRow.inputLanguage || 'en';
        const docId = buildAudioTrackDocId(spotId, seedLanguage);
        const audioTrackRef = doc(db, 'guides', guideId, 'audioTracks', docId);

        batch.set(audioTrackRef, {
          ...withOptionalTenantId({
            guideId,
            spotId,
            spotTitle: seededSpotTitle,
            lang: seedLanguage,
            activeVersionId: '',
            latestVersionId: '',
            latestGeneratedAt: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            hasGeneratedAudio: false,
          }, tenantId),
        });

        seededSpotSummary = {
          spotId,
          spotTitle: seededSpotTitle,
          languages: [seedLanguage],
          hasGeneratedAudio: false,
        };
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
      setTrackSummaries(seededSpotSummary
        ? [{
          id: buildAudioTrackDocId(seededSpotSummary.spotId, seededSpotSummary.languages[0]),
          guideId,
          spotId: seededSpotSummary.spotId,
          lang: seededSpotSummary.languages[0],
          spotTitle: seededSpotSummary.spotTitle,
          latestGeneratedAt: 0,
          hasGeneratedAudio: false,
        }]
        : [],
      );
      setTrackSummariesError(null);

      if (seededSpotSummary && selectedJobRow) {
        updateRow(selectedJobRow.id, (row) => ({
          ...row,
          targetSpotId: seededSpotSummary?.spotId,
          targetSpotTitle: seededSpotSummary?.spotTitle,
          targetLang: seededSpotSummary?.languages[0] ?? row.targetLang,
          selectedHistoryVersion: undefined,
          rowMessage: `Seeded ${seededSpotSummary.spotTitle} / ${langLabel(seededSpotSummary.languages[0])} inside ${guideTitle}.`,
          rowMessageTone: 'info',
        }));
      }

      setQuickCreateExpanded(false);
      setQuickCreateGuideTitle(buildDefaultQuickCreateGuideTitle());
      setQuickCreateSpotTitle('');
      setQuickCreateError(null);
      setGuidePickerSelectionId(guideId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setQuickCreateError(`Unable to create a minimal guide: ${message}`);
    } finally {
      setQuickCreateCreating(false);
    }
  };

  const handleCreateSpotForRow = async (rowId: string) => {
    const row = rows.find((entry) => entry.id === rowId);
    if (!row || !sharedGuideTarget) return;

    const suggestedTitle = row.targetSpotTitle?.trim() || `Spot ${rows.findIndex((entry) => entry.id === rowId) + 1}`;
    const spotTitle = window.prompt('New spot title', suggestedTitle)?.trim();
    if (!spotTitle) return;

    try {
      const spotId = createQuickCreateSpotId();
      const lang = row.targetLang || row.inputLanguage || 'en';
      const docId = buildAudioTrackDocId(spotId, lang);
      const { db } = initFirebase();
      const batch = writeBatch(db);
      const audioTrackRef = doc(db, 'guides', sharedGuideTarget.guideId, 'audioTracks', docId);

      batch.set(audioTrackRef, {
        ...withOptionalTenantId({
          guideId: sharedGuideTarget.guideId,
          spotId,
          spotTitle,
          lang,
          activeVersionId: '',
          latestVersionId: '',
          latestGeneratedAt: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          hasGeneratedAudio: false,
        }, tenantId),
      });
      await batch.commit();

      setTrackSummaries((previous) => [
        {
          id: docId,
          guideId: sharedGuideTarget.guideId,
          spotId,
          lang,
          spotTitle,
          latestGeneratedAt: 0,
          hasGeneratedAudio: false,
        },
        ...previous.filter((summary) => summary.id !== docId),
      ]);

      updateRow(rowId, (currentRow) => ({
        ...currentRow,
        targetSpotId: spotId,
        targetSpotTitle: spotTitle,
        selectedHistoryVersion: undefined,
        rowMessage: `Created ${spotTitle} / ${langLabel(lang)} under ${sharedGuideTarget.title}.`,
        rowMessageTone: 'info',
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateRow(rowId, (currentRow) => ({
        ...currentRow,
        rowMessage: `Unable to create the spot target: ${message}`,
        rowMessageTone: 'warning',
      }));
    }
  };

  const handleOpenRow = (rowId: string) => {
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) return;

    const target = buildHistoryTarget(sharedGuideTarget, row);
    if (!target) return;

    setActiveRowId(rowId);
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
            Route TTS jobs into a shared guide, target each job to a visible spot and output language,
            and capture the chosen script and audio back into the matching result.
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
                  Choose one guide for this page, then assign each TTS job to a spot and target language inside it.
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
                No guide selected yet. Choose an existing guide or create a minimal guide to start routing jobs.
              </Alert>
            )}

            {!tenantId && !authLoading ? (
              <Alert severity="warning">
                No tenant claim was found on the current user. New guide targets will be created without tenant scoping metadata.
              </Alert>
            ) : null}

            {trackSummariesError ? <Alert severity="warning">{trackSummariesError}</Alert> : null}

            {sharedGuideTarget ? (
              <Typography variant="body2" color="text.secondary">
                {trackSummariesLoading
                  ? 'Loading guide spots…'
                  : `${spotOptions.length} spot target${spotOptions.length === 1 ? '' : 's'} available in this guide.`}
              </Typography>
            ) : null}

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
                    Create a lightweight draft guide directly from `/tts`. Optionally seed the currently selected job with its first spot target.
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
                    helperText={selectedJobRow ? `If filled, this seeds ${selectedJobRow.id.replace('row-', 'Row ')} using its current target language.` : undefined}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                    <Button
                      variant="contained"
                      disabled={quickCreateCreating || !quickCreateGuideTitle.trim()}
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
          </Stack>
        </Paper>

        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
          <Typography variant="subtitle1" fontWeight={600}>
            TTS Jobs
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddRow}>
            Add Row
          </Button>
        </Stack>

        <Paper
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <Box sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: 1720 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, minWidth: 320 }}>Input Script</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Input Language</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 260 }}>Target Spot</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Target Language</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Actions</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 320 }}>Output Script</TableCell>
                  <TableCell sx={{ fontWeight: 700, minWidth: 280 }}>Output Audio</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => {
                  const rowWarning = getRowTargetWarning(row);
                  const rowHasHistory = rowHasSavedHistory(row);
                  const rowLanguageOptions = getRowTargetLanguageOptions(row);
                  const openDisabled = !sharedGuideTarget || !row.targetSpotId || !row.targetLang || (!row.inputScript.trim() && !rowHasHistory);
                  const rowSpot = getSpotOption(row.targetSpotId);

                  return (
                    <TableRow
                      key={row.id}
                      hover
                      selected={selectedJobRowId === row.id || (activeRowId === row.id && open)}
                      sx={{ verticalAlign: 'top' }}
                      onClick={() => markRowSelected(row.id)}
                      onFocusCapture={() => markRowSelected(row.id)}
                    >
                      <TableCell>
                        <Stack spacing={1}>
                          <Typography variant="caption" color="text.secondary">
                            Row {index + 1}
                          </Typography>
                          <TextField
                            multiline
                            minRows={6}
                            maxRows={14}
                            fullWidth
                            placeholder="Paste or type the source script"
                            value={row.inputScript}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              updateRow(row.id, (currentRow) => ({
                                ...currentRow,
                                inputScript: nextValue,
                                rowMessage: currentRow.rowMessageTone === 'warning' ? null : currentRow.rowMessage,
                              }));
                            }}
                            inputProps={{ 'aria-label': `Input Script row ${index + 1}` }}
                          />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1.5}>
                          <FormControl fullWidth>
                            <InputLabel id={`tts-language-label-${row.id}`}>Input Language</InputLabel>
                            <Select
                              labelId={`tts-language-label-${row.id}`}
                              value={row.inputLanguage}
                              label="Input Language"
                              onChange={(event) => {
                                updateRow(row.id, (currentRow) => ({
                                  ...currentRow,
                                  inputLanguage: event.target.value,
                                  rowMessage: `Input language set to ${langLabel(event.target.value)}.`,
                                  rowMessageTone: 'info',
                                }));
                              }}
                            >
                              {TTS_INPUT_LANGUAGES.map((option) => (
                                <MenuItem key={option.code} value={option.code}>
                                  {option.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<LanguageOutlinedIcon />}
                            disabled={!row.inputScript.trim()}
                            onClick={() => handleAutoDetectLanguage(row.id)}
                          >
                            Auto-detect
                          </Button>
                          <Typography
                            variant="caption"
                            sx={{
                              minHeight: 36,
                              color: row.rowMessageTone === 'warning' ? 'warning.main' : 'text.secondary',
                            }}
                          >
                            {row.rowMessage ?? 'Detect the script language automatically or choose it manually.'}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1.25}>
                          <FormControl fullWidth disabled={!sharedGuideTarget || trackSummariesLoading}>
                            <InputLabel id={`tts-target-spot-label-${row.id}`}>Spot</InputLabel>
                            <Select
                              labelId={`tts-target-spot-label-${row.id}`}
                              value={row.targetSpotId ?? ''}
                              label="Spot"
                              onChange={(event) => {
                                const nextSpotId = event.target.value;
                                const nextSpot = spotOptions.find((spot) => spot.spotId === nextSpotId) ?? null;
                                updateRow(row.id, (currentRow) => ({
                                  ...currentRow,
                                  targetSpotId: nextSpotId || undefined,
                                  targetSpotTitle: nextSpot?.spotTitle ?? currentRow.targetSpotTitle,
                                  selectedHistoryVersion: undefined,
                                  rowMessage: nextSpot
                                    ? `Spot target set to ${nextSpot.spotTitle}.`
                                    : 'Spot target cleared.',
                                  rowMessageTone: 'info',
                                }));
                              }}
                            >
                              <MenuItem value="">No spot selected</MenuItem>
                              {spotOptions.map((spot) => (
                                <MenuItem key={spot.spotId} value={spot.spotId}>
                                  {spot.spotTitle}
                                  {spot.hasGeneratedAudio ? '' : ' (new target)'}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          {rowWarning ? (
                            <Alert severity="warning" sx={{ py: 0 }}>
                              {rowWarning}
                            </Alert>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              {rowSpot?.hasGeneratedAudio
                                ? 'This spot already has saved audio history.'
                                : row.targetSpotId
                                  ? 'This spot can generate its first audio version in the selected language.'
                                  : 'Choose an existing spot or create one under the selected guide.'}
                            </Typography>
                          )}
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<HistoryOutlinedIcon />}
                              disabled={!sharedGuideTarget || trackSummariesLoading || spotOptions.length === 0}
                              onClick={() => handleOpenResultsPicker(row.id)}
                            >
                              Browse Saved Results
                            </Button>
                            <Button
                              variant="text"
                              size="small"
                              color="inherit"
                              disabled={!sharedGuideTarget}
                              onClick={() => {
                                void handleCreateSpotForRow(row.id);
                              }}
                            >
                              Create Spot
                            </Button>
                          </Stack>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1.25}>
                          <FormControl fullWidth disabled={!sharedGuideTarget}>
                            <InputLabel id={`tts-target-language-label-${row.id}`}>Target Language</InputLabel>
                            <Select
                              labelId={`tts-target-language-label-${row.id}`}
                              value={row.targetLang}
                              label="Target Language"
                              onChange={(event) => {
                                updateRow(row.id, (currentRow) => ({
                                  ...currentRow,
                                  targetLang: event.target.value,
                                  selectedHistoryVersion: undefined,
                                  rowMessage: `Target language set to ${langLabel(event.target.value)}.`,
                                  rowMessageTone: 'info',
                                }));
                              }}
                            >
                              {rowLanguageOptions.map((language) => (
                                <MenuItem key={language} value={language}>
                                  {langLabel(language)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <Typography variant="caption" color="text.secondary">
                            {rowHasHistory
                              ? 'Saved audio already exists for this spot and language.'
                              : 'No saved audio yet for this spot and language. Audio Director will open in generation mode.'}
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
                            onClick={() => handleOpenRow(row.id)}
                          >
                            Open Audio Director
                          </Button>
                          <Button
                            variant="text"
                            size="small"
                            color="inherit"
                            startIcon={<DeleteOutlineIcon />}
                            disabled={rows.length === 1}
                            onClick={() => handleRemoveRow(row.id)}
                          >
                            Remove
                          </Button>
                          {row.selectedHistoryVersion?.versionId ? (
                            <Typography variant="caption" color="text.secondary">
                              Selected version: {row.selectedHistoryVersion.versionId}
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
                          value={row.outputScript}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            updateRow(row.id, (currentRow) => ({
                              ...currentRow,
                              outputScript: nextValue,
                            }));
                          }}
                          inputProps={{ 'aria-label': `Output Script row ${index + 1}` }}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          <TextField
                            fullWidth
                            placeholder="Choose a result in Audio Director to fill this output audio URL"
                            value={row.outputAudio}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              updateRow(row.id, (currentRow) => ({
                                ...currentRow,
                                outputAudio: nextValue,
                              }));
                            }}
                            inputProps={{ 'aria-label': `Output Audio row ${index + 1}` }}
                          />
                          <OutputAudioPreviewButton audioUrl={row.outputAudio} />
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
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

      <Dialog open={resultsPickerOpen} onClose={closeResultsPicker} maxWidth="sm" fullWidth>
        <DialogTitle>Browse Saved Results</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {!sharedGuideTarget ? (
              <Alert severity="info">Choose a guide target first.</Alert>
            ) : null}
            {sharedGuideTarget && spotOptions.length === 0 ? (
              <Alert severity="info">
                This guide has no spot targets yet. Use the row-level `Create Spot` action to reserve one.
              </Alert>
            ) : null}
            {sharedGuideTarget ? (
              <Typography variant="body2" color="text.secondary">
                Populating row targets from <strong>{sharedGuideTarget.title}</strong>.
              </Typography>
            ) : null}
            <FormControl fullWidth disabled={!sharedGuideTarget || spotOptions.length === 0}>
              <InputLabel id="results-picker-spot-label">Spot</InputLabel>
              <Select
                labelId="results-picker-spot-label"
                value={resultsPickerSpotId}
                label="Spot"
                onChange={(event) => {
                  setResultsPickerSpotId(event.target.value);
                  setResultsPickerLang('');
                }}
              >
                {spotOptions.map((spot) => (
                  <MenuItem key={spot.spotId} value={spot.spotId}>
                    {spot.spotTitle}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth disabled={!resultsPickerSpot || (resultsPickerSpot.languages.length ?? 0) === 0}>
              <InputLabel id="results-picker-lang-label">Language</InputLabel>
              <Select
                labelId="results-picker-lang-label"
                value={resultsPickerLang}
                label="Language"
                onChange={(event) => setResultsPickerLang(event.target.value)}
              >
                {(resultsPickerSpot?.languages ?? []).map((language) => (
                  <MenuItem key={language} value={language}>
                    {langLabel(language)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {resultsPickerRow ? (
              <Typography variant="caption" color="text.secondary">
                Applying to {resultsPickerRow.id.replace('row-', 'Row ')}.
              </Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResultsPicker}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmResultsPicker} disabled={!resultsPickerSpot || !resultsPickerLang}>
            Apply Target
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
