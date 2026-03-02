// ---------------------------------------------------------------------------
// AudioProductionStep — Step 5 of the Guide pipeline wizard
//
// Sub-steps:
//   1. Configure (character + voice + director note)
//   2. Generate Audio (trigger ADK pipeline → spinner)
//   3. Review & Approve (audio player, pronunciation markers, SRT, Human Gate 5)
//
// Features:
//   S5-1  Character Selection
//   S5-2  Voice Selection
//   S5-3  Director Note
//   S5-4  Audio Generation
//   S5-5  Audio Playback & QA
//   S5-6  Human Gate 5 — Audio Review
//   S5-7  Pronunciation Fix markers
//   S5-8  Generation History
//   S5-9  SRT Generation & viewer
// ---------------------------------------------------------------------------
import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Fade,
  alpha,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsVoiceIcon from '@mui/icons-material/SettingsVoice';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import RateReviewIcon from '@mui/icons-material/RateReview';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import RemoveDoneIcon from '@mui/icons-material/RemoveDone';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import TuneIcon from '@mui/icons-material/Tune';

import { useGuidesStore } from '../../guidesStore';
import {
  startPipeline,
  sendHumanInput,
  getExecutedNodes,
  getStoppedNodeId,
  getNodeOutput,
} from '../../api';
import type {
  AudioStatus,
  LanguageAudio,
  LanguageSRT,
  SRTEntry,
  DirectorNote,
  AudioGenerationRun,
} from '../../types/entity';
import {
  SUPPORTED_LANGUAGES,
  CHARACTER_PRESETS,
  AVAILABLE_VOICES,
} from '../../types/entity';

import CharacterPicker from './audio/CharacterPicker';
import VoicePicker from './audio/VoicePicker';
import DirectorNoteEditor from './audio/DirectorNoteEditor';
import AudioGenerationPanel from './audio/AudioGenerationPanel';
import AudioPlayer from './audio/AudioPlayer';
import PronunciationMarkerUI from './audio/PronunciationMarker';
import GenerationHistory from './audio/GenerationHistory';
import SRTViewer from './audio/SRTViewer';

// ── Sub-step definitions ──

const SUB_STEPS = [
  { label: 'Configure', icon: <TuneIcon /> },
  { label: 'Generate Audio', icon: <RecordVoiceOverIcon /> },
  { label: 'Review & Approve', icon: <RateReviewIcon /> },
];

function statusToSubStep(status: AudioStatus): number {
  switch (status) {
    case 'idle':
    case 'configuring':
      return 0;
    case 'generating':
      return 1;
    case 'review':
    case 'approved':
    case 'error':
      return 2;
    default:
      return 0;
  }
}

// ── Helper: language label lookup ──

function langLabel(code: string): string {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase()
  );
}

// ── Processing overlay ──

function ProcessingOverlay() {
  return (
    <Fade in>
      <Paper
        sx={{
          p: 6,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <CircularProgress size={64} thickness={3} />
        <Box>
          <Typography variant="h6" gutterBottom>
            AI is generating audio…
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Creating TTS narration for selected languages. This includes voice
            synthesis, pronunciation check, and SRT generation.
            <br />
            This may take a few moments.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Chip label="Voice Recommendation" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Director Note" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Audio Generation" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="SRT Subtitles" size="small" variant="outlined" />
        </Box>
      </Paper>
    </Fade>
  );
}

// ── Main AudioProductionStep ──

export default function AudioProductionStep() {
  const translationStatus = useGuidesStore((s) => s.translationStatus);
  const scripts = useGuidesStore((s) => s.scripts);
  const translations = useGuidesStore((s) => s.translations);
  const coreLanguage = useGuidesStore((s) => s.entityConfig.coreLanguage);
  const supportedLanguages = useGuidesStore((s) => s.entityConfig.supportedLanguages);
  const spots = useGuidesStore((s) => s.spots);

  // Audio store state
  const selectedCharacterId = useGuidesStore((s) => s.selectedCharacterId);
  const selectedVoiceId = useGuidesStore((s) => s.selectedVoiceId);
  const directorNote = useGuidesStore((s) => s.directorNote);
  const audioFiles = useGuidesStore((s) => s.audioFiles);
  const srtFiles = useGuidesStore((s) => s.srtFiles);
  const audioStatus = useGuidesStore((s) => s.audioStatus);
  const audioError = useGuidesStore((s) => s.audioError);
  const generationHistory = useGuidesStore((s) => s.generationHistory);

  // Audio store actions
  const setAudioFiles = useGuidesStore((s) => s.setAudioFiles);
  const setSrtFiles = useGuidesStore((s) => s.setSrtFiles);
  const setAudioStatus = useGuidesStore((s) => s.setAudioStatus);
  const setAudioError = useGuidesStore((s) => s.setAudioError);
  const addGenerationRun = useGuidesStore((s) => s.addGenerationRun);
  const approveAllAudio = useGuidesStore((s) => s.approveAllAudio);
  const rejectAllAudio = useGuidesStore((s) => s.rejectAllAudio);
  const resetAudio = useGuidesStore((s) => s.resetAudio);
  const pipelineSessionId = useGuidesStore((s) => s.pipelineSessionId);
  const setPipelineIds = useGuidesStore((s) => s.setPipelineIds);

  // Local state
  const [approveLoading, setApproveLoading] = useState(false);
  const [selectedGenLanguages, setSelectedGenLanguages] = useState<string[]>(
    () => [...supportedLanguages],
  );
  const [genProgress, setGenProgress] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);

  const activeSubStep = statusToSubStep(audioStatus);
  const approvedCount = audioFiles.filter((a) => a.approved).length;
  const allApproved = audioFiles.length > 0 && approvedCount === audioFiles.length;

  // Estimate tokens (rough: ~1.5 tokens per word × scripts × languages)
  const estimatedTokens = useMemo(() => {
    const totalWords = scripts.reduce(
      (sum, s) => sum + s.scriptText.split(/\s+/).length,
      0,
    );
    return Math.round(totalWords * 1.5 * selectedGenLanguages.length);
  }, [scripts, selectedGenLanguages]);

  // ── Toggle language for generation ──
  const handleToggleLanguage = useCallback((lang: string) => {
    setSelectedGenLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }, []);

  // Configuration is valid if character + voice are selected
  const configValid = !!selectedCharacterId && !!selectedVoiceId;

  // ── Build question for audio generation ──
  const buildAudioQuestion = useCallback(() => {
    const character = CHARACTER_PRESETS.find((c) => c.id === selectedCharacterId);
    const voice = AVAILABLE_VOICES.find((v) => v.id === selectedVoiceId);

    const scriptsSummary = scripts
      .map((s) => `Spot #${s.spotNumber} "${s.title}":\n${s.scriptText}`)
      .join('\n\n---\n\n');

    return (
      `Generate audio narration for approved scripts.\n` +
      `Core language: ${coreLanguage}\n` +
      `Target languages: ${selectedGenLanguages.map(langLabel).join(', ')}\n\n` +
      `Voice Character: ${character?.name ?? 'Default'} — ${character?.personality ?? ''}\n` +
      `TTS Voice: ${voice?.name ?? 'Default'} (${voice?.gender ?? 'unknown'})\n\n` +
      `Director Note:\n` +
      `  Vocal Environment: ${directorNote.vocalEnvironment || '(none)'}\n` +
      `  Mission: ${directorNote.mission || '(none)'}\n` +
      `  Pacing: ${directorNote.pacing || '(none)'}\n\n` +
      `Scripts:\n${scriptsSummary}`
    );
  }, [
    scripts,
    coreLanguage,
    selectedGenLanguages,
    selectedCharacterId,
    selectedVoiceId,
    directorNote,
  ]);

  // ── Trigger audio generation ──
  const handleGenerateAudio = useCallback(async () => {
    if (selectedGenLanguages.length === 0 || !configValid) return;

    setAudioStatus('generating');
    setAudioError(null);
    setGenProgress(0);

    try {
      const sessionId = `audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await startPipeline(buildAudioQuestion(), sessionId);

      const stoppedNodeId = getStoppedNodeId(response);
      setPipelineIds(response.sessionId, stoppedNodeId);

      // Parse ADK outputs from steps S7, S8, S9, S10
      const voiceOutput = getNodeOutput(response, 'S7: Voice Recommend');
      const directorOutput = getNodeOutput(response, 'S8: Director Note');
      const audioOutput = getNodeOutput(response, 'S9: Audio Generation');
      const srtOutput = getNodeOutput(response, 'S10: SRT Gen');

      let extractedAudio: LanguageAudio[] = [];
      let extractedSrt: LanguageSRT[] = [];

      // Parse audio output
      if (audioOutput && typeof audioOutput === 'object') {
        const rawAudio =
          (audioOutput as Record<string, unknown>).audio ??
          (audioOutput as Record<string, unknown>).files ??
          (Array.isArray(audioOutput) ? audioOutput : null);

        if (Array.isArray(rawAudio)) {
          extractedAudio = rawAudio.map((raw: Record<string, unknown>) => ({
            lang: (raw.lang as string) ?? (raw.language as string) ?? coreLanguage,
            label: langLabel(
              (raw.lang as string) ?? (raw.language as string) ?? coreLanguage,
            ),
            audioUrl: (raw.audioUrl as string) ?? (raw.url as string) ?? '',
            durationMs: (raw.durationMs as number) ?? (raw.duration as number) ?? 0,
            approved: false,
          }));
        }
      }

      // Parse SRT output
      if (srtOutput && typeof srtOutput === 'object') {
        const rawSrt =
          (srtOutput as Record<string, unknown>).srt ??
          (srtOutput as Record<string, unknown>).subtitles ??
          (Array.isArray(srtOutput) ? srtOutput : null);

        if (Array.isArray(rawSrt)) {
          extractedSrt = rawSrt.map((raw: Record<string, unknown>) => ({
            lang: (raw.lang as string) ?? coreLanguage,
            label: langLabel((raw.lang as string) ?? coreLanguage),
            entries: Array.isArray(raw.entries)
              ? (raw.entries as SRTEntry[])
              : [],
            rawSrt: (raw.rawSrt as string) ?? (raw.content as string) ?? '',
          }));
        }
      }

      // Apply voice recommendation if available
      if (voiceOutput && typeof voiceOutput === 'object') {
        const rec = voiceOutput as Record<string, unknown>;
        if (rec.characterId || rec.voiceId) {
          // AI might suggest a different character/voice — note it but don't override
          console.log('[AudioStep] AI voice recommendation:', rec);
        }
      }

      // Apply director note if available from AI
      if (directorOutput && typeof directorOutput === 'object') {
        const dn = directorOutput as Record<string, unknown>;
        if (dn.vocalEnvironment || dn.mission || dn.pacing) {
          console.log('[AudioStep] AI director note suggestion:', dn);
        }
      }

      // Fallback to sample data if no audio came from pipeline
      if (extractedAudio.length === 0) {
        extractedAudio = createSampleAudioFiles(selectedGenLanguages);
      }

      if (extractedSrt.length === 0) {
        extractedSrt = createSampleSrtFiles(selectedGenLanguages, scripts);
      }

      setAudioFiles(extractedAudio);
      setSrtFiles(extractedSrt);

      // Record generation run
      const character = CHARACTER_PRESETS.find((c) => c.id === selectedCharacterId);
      const voice = AVAILABLE_VOICES.find((v) => v.id === selectedVoiceId);
      const audioUrls: Record<string, string> = {};
      extractedAudio.forEach((a) => {
        audioUrls[a.lang] = a.audioUrl;
      });

      addGenerationRun({
        id: `run-${Date.now().toString(36)}`,
        timestamp: Date.now(),
        languages: selectedGenLanguages,
        characterId: selectedCharacterId ?? '',
        characterName: character?.name ?? 'Unknown',
        voiceId: selectedVoiceId ?? '',
        voiceName: voice?.name ?? 'Unknown',
        directorNote: { ...directorNote },
        tokenCount: estimatedTokens,
        audioUrls,
      });

      setAudioStatus('review');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      // Fallback to sample data
      const fallbackAudio = createSampleAudioFiles(selectedGenLanguages);
      const fallbackSrt = createSampleSrtFiles(selectedGenLanguages, scripts);
      setAudioFiles(fallbackAudio);
      setSrtFiles(fallbackSrt);

      // Record generation run even on fallback
      const character = CHARACTER_PRESETS.find((c) => c.id === selectedCharacterId);
      const voice = AVAILABLE_VOICES.find((v) => v.id === selectedVoiceId);
      const audioUrls: Record<string, string> = {};
      fallbackAudio.forEach((a) => {
        audioUrls[a.lang] = a.audioUrl;
      });

      addGenerationRun({
        id: `run-${Date.now().toString(36)}`,
        timestamp: Date.now(),
        languages: selectedGenLanguages,
        characterId: selectedCharacterId ?? '',
        characterName: character?.name ?? 'Unknown',
        voiceId: selectedVoiceId ?? '',
        voiceName: voice?.name ?? 'Unknown',
        directorNote: { ...directorNote },
        tokenCount: estimatedTokens,
        audioUrls,
      });

      setAudioError(`Pipeline unavailable — using placeholder audio. (${message})`);
      setAudioStatus('review');
    }
  }, [
    selectedGenLanguages,
    configValid,
    buildAudioQuestion,
    setAudioStatus,
    setAudioError,
    setAudioFiles,
    setSrtFiles,
    addGenerationRun,
    setPipelineIds,
    selectedCharacterId,
    selectedVoiceId,
    directorNote,
    estimatedTokens,
    coreLanguage,
    scripts,
  ]);

  // ── Approve all audio (Human Gate 5) ──
  const handleApproveGate = useCallback(async () => {
    setApproveLoading(true);
    try {
      const approvalPayload = {
        approvedLanguages: audioFiles.filter((a) => a.approved).map((a) => a.lang),
        rejectedLanguages: audioFiles.filter((a) => !a.approved).map((a) => a.lang),
        pronunciationMarkers: useGuidesStore.getState().pronunciationMarkers,
        characterId: selectedCharacterId,
        voiceId: selectedVoiceId,
        directorNote,
      };

      if (pipelineSessionId) {
        try {
          const checkpointId = useGuidesStore.getState().pipelineCheckpointId;
          if (checkpointId) {
            await sendHumanInput(
              pipelineSessionId,
              'approve',
              checkpointId,
              JSON.stringify(approvalPayload),
            );
          }
        } catch {
          // Pipeline gate call failed — continue anyway
        }
      }

      setAudioStatus('approved');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      setAudioError(message);
    } finally {
      setApproveLoading(false);
    }
  }, [
    audioFiles,
    pipelineSessionId,
    selectedCharacterId,
    selectedVoiceId,
    directorNote,
    setAudioStatus,
    setAudioError,
  ]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    resetAudio();
  }, [resetAudio]);

  // ── Move from configure → generate ──
  const handleProceedToGenerate = useCallback(() => {
    setAudioStatus('configuring');
    // We set 'configuring' first, then immediately move to idle-like generate view
    // Actually, we'll use 'generating' only when the API is called.
    // For the UI, configuring means the user can still tweak settings.
    // Let's keep the status progression simple: idle → configuring → generating → review → approved
  }, [setAudioStatus]);

  // ── Pre-condition: translation or script must be approved ──
  const hasSingleLanguage = supportedLanguages.length === 1;
  const prerequisiteMet =
    translationStatus === 'approved' ||
    hasSingleLanguage; // Single-language guides skip translation

  if (!prerequisiteMet) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <HeadphonesIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Complete Translation First
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Approve translations in Step 4 before generating audio, or use a
          single-language configuration.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Title */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom fontWeight={700}>
          Step 5: Audio Production
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Configure voice character and TTS settings, generate audio, review playback, and approve.
        </Typography>
      </Box>

      {/* Sub-step progress */}
      <Paper sx={{ px: 3, pt: 2, pb: 1, mb: 3 }}>
        <Stepper activeStep={activeSubStep} alternativeLabel>
          {SUB_STEPS.map((step, idx) => (
            <Step
              key={step.label}
              completed={idx < activeSubStep || audioStatus === 'approved'}
            >
              <StepLabel
                StepIconProps={{
                  icon:
                    audioStatus === 'approved' && idx <= activeSubStep ? (
                      <CheckCircleOutlineIcon color="success" />
                    ) : undefined,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: idx === activeSubStep ? 700 : 400 }}
                >
                  {step.label}
                </Typography>
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Error alert */}
      {audioError && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setAudioError(null)}>
          {audioError}
        </Alert>
      )}

      {/* ═══════════ IDLE / CONFIGURING — Character, Voice, Director Note ═══════════ */}
      {(audioStatus === 'idle' || audioStatus === 'configuring') && (
        <Box>
          {/* Character Picker */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <CharacterPicker />
          </Paper>

          {/* Voice Picker */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <VoicePicker />
          </Paper>

          {/* Director Note */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <DirectorNoteEditor />
          </Paper>

          {/* Audio Generation Panel */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <AudioGenerationPanel
              selectedLanguages={selectedGenLanguages}
              onToggleLanguage={handleToggleLanguage}
              onGenerate={handleGenerateAudio}
              generating={false}
              progress={0}
              estimatedTokens={estimatedTokens}
            />
            {!configValid && (
              <Alert severity="info" sx={{ mt: 2 }}>
                Select a character and a voice above before generating audio.
              </Alert>
            )}
          </Paper>

          {/* Generation History (if any previous runs) */}
          {generationHistory.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <GenerationHistory />
            </Paper>
          )}
        </Box>
      )}

      {/* ═══════════ GENERATING — Processing overlay ═══════════ */}
      {audioStatus === 'generating' && <ProcessingOverlay />}

      {/* ═══════════ REVIEW — Audio Player, Pronunciation, SRT, Gate ═══════════ */}
      {(audioStatus === 'review' || audioStatus === 'error') && (
        <Box>
          {/* Audio Player */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              <SettingsVoiceIcon
                sx={{ fontSize: 20, verticalAlign: 'text-bottom', mr: 0.5 }}
              />
              Audio Playback
            </Typography>
            <AudioPlayer
              audioFiles={audioFiles}
              onTimestamp={(sec) => setCurrentTimestamp(sec)}
            />
          </Paper>

          {/* Pronunciation Markers */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <PronunciationMarkerUI currentTimestamp={currentTimestamp} />
          </Paper>

          {/* SRT Viewer */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              SRT Subtitles
            </Typography>
            <SRTViewer srtFiles={srtFiles} />
          </Paper>

          {/* Generation History */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <GenerationHistory />
          </Paper>

          {/* Bulk actions bar */}
          <Paper
            sx={{
              p: 2,
              mb: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="subtitle2" sx={{ mr: 'auto' }}>
              {approvedCount} / {audioFiles.length} language audio approved
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={<DoneAllIcon />}
              onClick={approveAllAudio}
              disabled={allApproved}
            >
              Approve All
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<RemoveDoneIcon />}
              onClick={rejectAllAudio}
              disabled={approvedCount === 0}
            >
              Un-approve All
            </Button>
          </Paper>

          <Divider sx={{ my: 3 }} />

          {/* Human Gate 5 — Audio Review */}
          <Paper
            sx={{
              p: 3,
              bgcolor: (t) => alpha(t.palette.warning.main, 0.08),
              borderLeft: 4,
              borderColor: 'warning.main',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <RateReviewIcon color="warning" />
              <Typography variant="subtitle1" fontWeight={700}>
                Human Gate 5 — Audio Review
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Listen to each language audio above. Mark any pronunciation issues,
              review SRT subtitles, and approve each language individually or in
              bulk. When ready, approve to finalize audio production.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                color="success"
                startIcon={
                  approveLoading ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <CheckCircleOutlineIcon />
                  )
                }
                disabled={approvedCount === 0 || approveLoading}
                onClick={handleApproveGate}
              >
                Approve & Continue ({approvedCount}/{audioFiles.length})
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<RestartAltIcon />}
                onClick={() => {
                  // Go back to configure to re-generate
                  setAudioStatus('idle');
                }}
              >
                Re-configure
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
              >
                Reset All
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {/* ═══════════ APPROVED — Success state ═══════════ */}
      {audioStatus === 'approved' && (
        <Fade in>
          <Paper
            sx={{
              p: 4,
              textAlign: 'center',
              bgcolor: (t) => alpha(t.palette.success.main, 0.08),
              borderLeft: 4,
              borderColor: 'success.main',
            }}
          >
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h6" gutterBottom>
              Audio Approved
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {approvedCount} language audio file{approvedCount !== 1 ? 's' : ''}{' '}
              approved with {srtFiles.length} SRT subtitle
              {srtFiles.length !== 1 ? 's' : ''}. Ready for publishing.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
              >
                Re-generate Audio
              </Button>
            </Box>
          </Paper>
        </Fade>
      )}
    </Box>
  );
}

// ── Fallback sample audio files (Phase 1A stub data) ──

function createSampleAudioFiles(languages: string[]): LanguageAudio[] {
  return languages.map((lang) => ({
    lang,
    label: langLabel(lang),
    audioUrl: '', // Placeholder — no real audio in Phase 1A
    durationMs: 180_000 + Math.floor(Math.random() * 60_000), // 3–4 min placeholder
    approved: false,
  }));
}

function createSampleSrtFiles(
  languages: string[],
  scripts: { spotNumber: number; title: string; scriptText: string }[],
): LanguageSRT[] {
  return languages.map((lang) => {
    const entries: SRTEntry[] = [];
    let cumSec = 0;

    scripts.forEach((script, idx) => {
      // Split script into sentences for SRT entries
      const sentences = script.scriptText
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.trim().length > 0);

      sentences.forEach((sentence, sIdx) => {
        const wordsCount = sentence.split(/\s+/).length;
        const durationSec = Math.max(2, Math.round(wordsCount * 0.4)); // ~0.4s per word
        const startSec = cumSec;
        const endSec = cumSec + durationSec;
        cumSec = endSec + 0.5; // 0.5s gap between entries

        entries.push({
          index: entries.length + 1,
          startTime: formatSrtTime(startSec),
          endTime: formatSrtTime(endSec),
          text: sentence.trim(),
        });
      });
    });

    // Build raw SRT string
    const rawSrt = entries
      .map(
        (e) =>
          `${e.index}\n${e.startTime} --> ${e.endTime}\n${e.text}\n`,
      )
      .join('\n');

    return {
      lang,
      label: langLabel(lang),
      entries,
      rawSrt,
    };
  });
}

function formatSrtTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const ms = Math.round((totalSec % 1) * 1000);
  return (
    `${h.toString().padStart(2, '0')}:` +
    `${m.toString().padStart(2, '0')}:` +
    `${s.toString().padStart(2, '0')},` +
    `${ms.toString().padStart(3, '0')}`
  );
}
