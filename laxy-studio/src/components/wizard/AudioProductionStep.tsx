// ---------------------------------------------------------------------------
// AudioProductionStep — Step 5 of the Guide pipeline wizard
//
// Sub-steps:
//   1. Configure (character + voice + director note)
//   2. Generate Audio (calls /pipeline/audio-generate → Gemini TTS)
//   3. Review & Approve (audio player, pronunciation markers, SRT, Human Gate 5)
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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsVoiceIcon from '@mui/icons-material/SettingsVoice';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import RateReviewIcon from '@mui/icons-material/RateReview';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import RemoveDoneIcon from '@mui/icons-material/RemoveDone';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import TuneIcon from '@mui/icons-material/Tune';
import SyncIcon from '@mui/icons-material/Sync';

import { useGuidesStore } from '../../guidesStore';
import {
  generateAudioForLanguage,
  sendHumanInput,
} from '../../api';
import type {
  AudioStatus,
  LanguageAudio,
  LanguageSRT,
  SRTEntry,
} from '../../types/entity';
import {
  SUPPORTED_LANGUAGES,
  langLabel,
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
import { usePipelineSync } from '../../hooks/usePipelineSync';

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

// ── Processing overlay ──

type LangProgressStatus = 'pending' | 'generating' | 'done' | 'error';

interface ProcessingOverlayProps {
  languages: string[];
  perLangProgress: Record<string, { status: LangProgressStatus; error?: string }>;
}

function ProcessingOverlay({ languages, perLangProgress }: ProcessingOverlayProps) {
  const doneCount = Object.values(perLangProgress).filter((p) => p.status === 'done').length;
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
        <Box>
          <Typography variant="h6" gutterBottom>
            AI is generating audio…
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Generating TTS narration for {languages.length} language{languages.length !== 1 ? 's' : ''} in parallel.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          {languages.map((lang) => {
            const prog = perLangProgress[lang];
            return (
              <Chip
                key={lang}
                label={langLabel(lang)}
                icon={
                  prog?.status === 'done' ? <CheckCircleOutlineIcon color="success" fontSize="small" /> :
                  prog?.status === 'error' ? <RemoveDoneIcon color="error" fontSize="small" /> :
                  <CircularProgress size={16} thickness={5} color="inherit" />
                }
                color={
                  prog?.status === 'done' ? 'success' :
                  prog?.status === 'error' ? 'error' : 'default'
                }
                variant={prog?.status === 'done' ? 'filled' : 'outlined'}
                sx={{ minWidth: 120, fontWeight: 600 }}
              />
            );
          })}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {doneCount} / {languages.length} complete
        </Typography>
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
  const resetDownstreamFrom = useGuidesStore((s) => s.resetDownstreamFrom);
  const setPipelineIds = useGuidesStore((s) => s.setPipelineIds);

  const { applyResponse } = usePipelineSync();

  // Local state
  const [approveLoading, setApproveLoading] = useState(false);
  const [gateSyncFailed, setGateSyncFailed] = useState(false);
  const [selectedGenLanguages, setSelectedGenLanguages] = useState<string[]>(
    () => [...supportedLanguages],
  );
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [perLangProgress, setPerLangProgress] = useState<Record<string, { status: LangProgressStatus; error?: string }>>({});

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

  // ── Trigger audio generation (parallel per-language) ──
  const handleGenerateAudio = useCallback(async () => {
    if (selectedGenLanguages.length === 0 || !configValid) return;

    setAudioStatus('generating');
    setAudioError(null);

    const sessionId = `audio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Initialise per-language progress
    const initialProgress: Record<string, { status: LangProgressStatus; error?: string }> = {};
    selectedGenLanguages.forEach((lang) => { initialProgress[lang] = { status: 'pending' }; });
    setPerLangProgress(initialProgress);

    // Build translation lookup per language
    const translationsByLang: Record<string, Array<{ spotId: string; translatedText: string }>> = {};
    translations.filter((t) => t.lang !== coreLanguage).forEach((t) => {
      translationsByLang[t.lang] = t.spots.map((sp) => ({
        spotId: sp.spotId,
        translatedText: sp.translatedText,
      }));
    });

    const scriptPayload = scripts.map((s) => ({
      spotId: s.spotId,
      spotNumber: s.spotNumber,
      title: s.title,
      scriptText: s.scriptText,
    }));

    const directorNotePayload = {
      vocalEnvironment: directorNote.vocalEnvironment || '',
      mission: directorNote.mission || '',
      pacing: directorNote.pacing || '',
    };

    try {
      const allAudio: LanguageAudio[] = [];
      const allSrt: LanguageSRT[] = [];

      await Promise.all(
        selectedGenLanguages.map(async (lang) => {
          setPerLangProgress((prev) => ({ ...prev, [lang]: { status: 'generating' } }));
          try {
            const res = await generateAudioForLanguage({
              sessionId,
              scripts: scriptPayload,
              voiceId: selectedVoiceId!,
              language: lang,
              directorNote: directorNotePayload,
              translations: translationsByLang[lang],
            });

            // Aggregate audio files for this language — keep ALL per-spot audio
            const spotAudios: import('../../types/entity').SpotAudioFile[] = [];
            let firstUrl = '';
            let totalDuration = 0;
            for (const af of res.audioFiles) {
              if (af.audioUrl) {
                if (!firstUrl) firstUrl = af.audioUrl;
                spotAudios.push({
                  spotId: af.spotId,
                  spotNumber: af.spotNumber,
                  title: af.title,
                  audioUrl: af.audioUrl,
                  durationMs: af.durationMs,
                });
              }
              totalDuration += af.durationMs;
            }
            if (firstUrl) {
              allAudio.push({
                lang,
                label: langLabel(lang),
                audioUrl: firstUrl,
                durationMs: totalDuration,
                approved: false,
                spots: spotAudios,
              });
            }

            // Aggregate SRT files
            const entries: SRTEntry[] = [];
            let rawSrt = '';
            for (const sf of res.srtFiles) {
              const offset = entries.length;
              for (const e of sf.entries) {
                entries.push({ index: e.index + offset, startTime: e.startTime, endTime: e.endTime, text: e.text });
              }
              rawSrt += (rawSrt ? '\n' : '') + sf.rawSrt;
            }
            if (entries.length > 0) {
              allSrt.push({ lang, label: langLabel(lang), entries, rawSrt });
            }

            setPerLangProgress((prev) => ({ ...prev, [lang]: { status: 'done' } }));
          } catch (err: any) {
            setPerLangProgress((prev) => ({ ...prev, [lang]: { status: 'error', error: err?.message || 'Error' } }));
          }
        }),
      );

      if (allAudio.length === 0) {
        setAudioError('No audio was generated for any language.');
        setAudioStatus('error');
        return;
      }

      setPipelineIds(sessionId, null);
      setAudioFiles(allAudio);
      setSrtFiles(allSrt);

      // Record generation run
      const character = CHARACTER_PRESETS.find((c) => c.id === selectedCharacterId);
      const voice = AVAILABLE_VOICES.find((v) => v.id === selectedVoiceId);
      const audioUrls: Record<string, string> = {};
      allAudio.forEach((a) => { audioUrls[a.lang] = a.audioUrl; });

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
      setAudioError(`Audio generation failed: ${message}`);
      setAudioStatus('error');
    }
  }, [
    selectedGenLanguages,
    configValid,
    scripts,
    translations,
    coreLanguage,
    selectedVoiceId,
    directorNote,
    setAudioStatus,
    setAudioError,
    setAudioFiles,
    setSrtFiles,
    addGenerationRun,
    setPipelineIds,
    selectedCharacterId,
    estimatedTokens,
  ]);

  // ── Approve all audio (Human Gate 5) ──
  const handleApproveGate = useCallback(async () => {
    setApproveLoading(true);
    setGateSyncFailed(false);
    try {
      const approvalPayload = {
        approvedLanguages: audioFiles.filter((a) => a.approved).map((a) => a.lang),
        rejectedLanguages: audioFiles.filter((a) => !a.approved).map((a) => a.lang),
        pronunciationMarkers: useGuidesStore.getState().pronunciationMarkers,
        characterId: selectedCharacterId,
        voiceId: selectedVoiceId,
        directorNote,
      };

      // Read pipeline IDs directly from the store to avoid stale closures
      const { pipelineSessionId: sid, pipelineCheckpointId: cpId } = useGuidesStore.getState();
      console.log('[AudioProductionStep] Approve clicked — sessionId:', sid, 'checkpointId:', cpId);

      if (sid && cpId) {
        try {
          const response = await sendHumanInput(
            sid,
            'approve',
            cpId,
            JSON.stringify(approvalPayload),
          );
          // Apply the response so downstream steps (publish, etc.) are pre-populated
          applyResponse(response);

          // Surface any downstream step errors as a warning
          const stepErrors = (response.steps ?? [])
            .filter((s) => s.status === 'ERROR' && s.output)
            .map((s) => {
              const out = s.output as Record<string, unknown>;
              return `[${s.label}] ${(out.error as string) ?? (out.message as string) ?? 'Unknown error'}`;
            });
          if (stepErrors.length > 0) {
            setAudioError(
              'Audio approved, but downstream pipeline steps encountered errors:\n' +
              stepErrors.join('\n'),
            );
          }
        } catch (gateErr: unknown) {
          const gateMsg = gateErr instanceof Error ? gateErr.message : 'Pipeline sync failed';
          console.warn('[AudioProductionStep] Gate approval failed:', gateMsg);
          setAudioError(`Pipeline sync failed — you can retry from the approved view. (${gateMsg})`);
          setGateSyncFailed(true);
        }
      } else {
        console.warn('[AudioProductionStep] No pipeline session/checkpoint — approval saved locally only');
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
    selectedCharacterId,
    selectedVoiceId,
    directorNote,
    setAudioStatus,
    setAudioError,
    applyResponse,
  ]);

  // ── Reset (cascades to downstream: audio + publish) ──
  const handleReset = useCallback(() => {
    resetDownstreamFrom('audio');
  }, [resetDownstreamFrom]);

  // ── Pre-condition: scripts must be approved, and translation must be approved (unless single-language) ──
  const scriptStatus = useGuidesStore((s) => s.scriptStatus);
  const hasSingleLanguage = supportedLanguages.length === 1;
  const prerequisiteMet =
    scriptStatus === 'approved' &&
    (translationStatus === 'approved' || hasSingleLanguage);

  if (!prerequisiteMet) {
    const missingScript = scriptStatus !== 'approved';
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <HeadphonesIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {missingScript ? 'Complete Script Review First' : 'Complete Translation First'}
        </Typography>
        <Typography variant="body2" color="text.disabled">
          {missingScript
            ? 'Approve the scripts in Step 3 (Script Generation) before generating audio.'
            : 'Approve translations in Step 4 before generating audio, or use a single-language configuration.'}
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
                    ) : step.icon,
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
              availableLanguages={supportedLanguages}
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
      {audioStatus === 'generating' && <ProcessingOverlay languages={selectedGenLanguages} perLangProgress={perLangProgress} />}

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
                  // Go back to configure — clear stale audio/SRT so state is consistent
                  setAudioFiles([]);
                  setSrtFiles([]);
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
              {gateSyncFailed && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={approveLoading ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
                  disabled={approveLoading}
                  onClick={handleApproveGate}
                >
                  Retry Sync
                </Button>
              )}
              <Button
                variant="outlined"
                color="warning"
                startIcon={<RateReviewIcon />}
                onClick={() => setAudioStatus('review')}
              >
                Redo Review
              </Button>
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
