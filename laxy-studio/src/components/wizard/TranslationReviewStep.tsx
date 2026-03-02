// ---------------------------------------------------------------------------
// TranslationReviewStep — Step 4 of the Guide pipeline wizard
//
// Sub-steps:
//   1. Generate Translations (trigger ADK pipeline → spinner)
//   2. Review Translations per language (tabbed + side-by-side + Human Gate 4)
//
// Features:
//   S4-1  Translation display — language tabs with side-by-side original + translation
//   S4-2  Human Gate 4 — per-language approve/reject + bulk approve
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
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  alpha,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import TranslateIcon from '@mui/icons-material/Translate';
import RateReviewIcon from '@mui/icons-material/RateReview';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import RemoveDoneIcon from '@mui/icons-material/RemoveDone';
import DescriptionIcon from '@mui/icons-material/Description';
import GTranslateIcon from '@mui/icons-material/GTranslate';

import { useGuidesStore } from '../../guidesStore';
import {
  startPipeline,
  sendHumanInput,
  getExecutedNodes,
  getStoppedNodeId,
  getNodeOutput,
} from '../../api';
import type {
  LanguageTranslation,
  SpotTranslation,
  TranslationStatus,
} from '../../types/entity';
import { SUPPORTED_LANGUAGES } from '../../types/entity';

// ── Sub-step definitions ──

const SUB_STEPS = [
  { label: 'Generate Translations', icon: <TranslateIcon /> },
  { label: 'Review & Approve', icon: <RateReviewIcon /> },
];

function statusToSubStep(status: TranslationStatus): number {
  switch (status) {
    case 'idle':
    case 'translating':
      return 0;
    case 'review':
    case 'approved':
    case 'error':
      return 1;
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
            AI is translating scripts…
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Translating approved scripts into all configured languages.
            <br />
            This may take a moment.
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <Chip label="Translation" size="small" variant="outlined" />
          <Chip label="→" size="small" sx={{ bgcolor: 'transparent' }} />
          <Chip label="Human Gate 4" size="small" variant="outlined" />
        </Box>
      </Paper>
    </Fade>
  );
}

// ── Single language translation table ──

interface LanguageTabContentProps {
  langTranslation: LanguageTranslation;
}

function LanguageTabContent({ langTranslation }: LanguageTabContentProps) {
  const updateTranslation = useGuidesStore((s) => s.updateTranslation);

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 60, fontWeight: 700 }}>Spot #</TableCell>
            <TableCell sx={{ fontWeight: 700, width: '45%' }}>
              Original Script
            </TableCell>
            <TableCell sx={{ fontWeight: 700, width: '45%' }}>
              Translated Script ({langTranslation.label})
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {langTranslation.spots.map((spot) => (
            <TableRow key={spot.spotId} hover>
              <TableCell>
                <Chip
                  label={`#${spot.spotNumber}`}
                  size="small"
                  color="primary"
                  sx={{ fontWeight: 700, minWidth: 36 }}
                />
              </TableCell>
              <TableCell>
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    fontWeight={600}
                    sx={{ mb: 0.5, display: 'block' }}
                  >
                    {spot.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.7,
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      maxHeight: 200,
                      overflow: 'auto',
                    }}
                  >
                    {spot.originalText}
                  </Typography>
                </Box>
              </TableCell>
              <TableCell>
                <TextField
                  multiline
                  fullWidth
                  minRows={3}
                  maxRows={10}
                  value={spot.translatedText}
                  onChange={(e) =>
                    updateTranslation(
                      langTranslation.lang,
                      spot.spotId,
                      e.target.value,
                    )
                  }
                  variant="outlined"
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      fontFamily: '"Inter", sans-serif',
                      fontSize: '0.875rem',
                      lineHeight: 1.7,
                    },
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── Main TranslationReviewStep ──

export default function TranslationReviewStep() {
  const scripts = useGuidesStore((s) => s.scripts);
  const scriptStatus = useGuidesStore((s) => s.scriptStatus);
  const coreLanguage = useGuidesStore((s) => s.entityConfig.coreLanguage);
  const supportedLanguages = useGuidesStore(
    (s) => s.entityConfig.supportedLanguages,
  );

  const translations = useGuidesStore((s) => s.translations);
  const translationStatus = useGuidesStore((s) => s.translationStatus);
  const translationError = useGuidesStore((s) => s.translationError);
  const setTranslations = useGuidesStore((s) => s.setTranslations);
  const setTranslationStatus = useGuidesStore((s) => s.setTranslationStatus);
  const setTranslationError = useGuidesStore((s) => s.setTranslationError);
  const approveLanguage = useGuidesStore((s) => s.approveLanguage);
  const rejectLanguage = useGuidesStore((s) => s.rejectLanguage);
  const approveAllLanguages = useGuidesStore((s) => s.approveAllLanguages);
  const rejectAllLanguages = useGuidesStore((s) => s.rejectAllLanguages);
  const resetTranslations = useGuidesStore((s) => s.resetTranslations);
  const pipelineSessionId = useGuidesStore((s) => s.pipelineSessionId);
  const setPipelineIds = useGuidesStore((s) => s.setPipelineIds);

  const [currentTab, setCurrentTab] = useState(0);
  const [approveLoading, setApproveLoading] = useState(false);

  const activeSubStep = statusToSubStep(translationStatus);
  const approvedCount = translations.filter((t) => t.approved).length;
  const allApproved =
    translations.length > 0 && approvedCount === translations.length;

  // Languages to translate into (all supported except core language)
  const targetLanguages = useMemo(
    () => supportedLanguages.filter((l) => l !== coreLanguage),
    [supportedLanguages, coreLanguage],
  );

  // ── Build question for translation ──
  const buildTranslationQuestion = useCallback(() => {
    const approvedScripts = scripts.filter((s) => s.approved);
    const scriptsSummary = approvedScripts
      .map(
        (s) =>
          `Spot #${s.spotNumber} "${s.title}":\n${s.scriptText}`,
      )
      .join('\n\n---\n\n');

    const targetLangLabels = targetLanguages
      .map((l) => `${l} (${langLabel(l)})`)
      .join(', ');

    return (
      `Translate the following ${approvedScripts.length} approved scripts.\n` +
      `Core language: ${coreLanguage} (${langLabel(coreLanguage)})\n` +
      `Target languages: ${targetLangLabels}\n\n` +
      `Scripts:\n${scriptsSummary}`
    );
  }, [scripts, coreLanguage, targetLanguages]);

  // ── Trigger translation ──
  const handleGenerateTranslations = useCallback(async () => {
    if (targetLanguages.length === 0) {
      setTranslationError(
        'No target languages configured. Add additional languages in Entity Setup.',
      );
      return;
    }

    const approvedScripts = scripts.filter((s) => s.approved);
    if (approvedScripts.length === 0) {
      setTranslationError('No approved scripts to translate.');
      return;
    }

    setTranslationStatus('translating');
    setTranslationError(null);

    try {
      const sessionId = `translation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await startPipeline(
        buildTranslationQuestion(),
        sessionId,
      );

      const stoppedNodeId = getStoppedNodeId(response);
      setPipelineIds(response.sessionId, stoppedNodeId);

      // Try to parse translation output (S6: Translation)
      const translationOutput = getNodeOutput(response, 'S6: Translation');

      let extractedTranslations: LanguageTranslation[] = [];

      if (translationOutput && typeof translationOutput === 'object') {
        const rawTranslations =
          (translationOutput as Record<string, unknown>).translations ??
          (translationOutput as Record<string, unknown>).languages ??
          (Array.isArray(translationOutput) ? translationOutput : null);

        if (Array.isArray(rawTranslations)) {
          extractedTranslations = rawTranslations.map(
            (raw: Record<string, unknown>) => {
              const lang = (raw.lang as string) ?? (raw.language as string) ?? '';
              const rawSpots =
                (raw.spots as Record<string, unknown>[]) ??
                (raw.translations as Record<string, unknown>[]) ??
                [];

              const spots: SpotTranslation[] = Array.isArray(rawSpots)
                ? rawSpots.map(
                    (sp: Record<string, unknown>, idx: number) => ({
                      spotId:
                        (sp.spotId as string) ??
                        (sp.id as string) ??
                        approvedScripts[idx]?.spotId ??
                        `spot-${idx}`,
                      spotNumber:
                        (sp.spotNumber as number) ??
                        approvedScripts[idx]?.spotNumber ??
                        idx + 1,
                      title:
                        (sp.title as string) ??
                        approvedScripts[idx]?.title ??
                        `Spot ${idx + 1}`,
                      originalText:
                        (sp.original as string) ??
                        (sp.originalText as string) ??
                        approvedScripts[idx]?.scriptText ??
                        '',
                      translatedText:
                        (sp.translated as string) ??
                        (sp.translatedText as string) ??
                        '',
                    }),
                  )
                : [];

              return {
                lang,
                label: langLabel(lang),
                spots,
                approved: false,
              };
            },
          );
        }
      }

      // Fallback: create stub translations (copy base text to all languages)
      if (extractedTranslations.length === 0) {
        extractedTranslations = createStubTranslations(
          approvedScripts,
          targetLanguages,
        );
      }

      setTranslations(extractedTranslations);
      setTranslationStatus('review');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      // Fallback to stub data
      const approvedScripts = scripts.filter((s) => s.approved);
      const fallbackTranslations = createStubTranslations(
        approvedScripts,
        targetLanguages,
      );
      setTranslations(fallbackTranslations);
      setTranslationError(
        `Pipeline unavailable — using stub translations. (${message})`,
      );
      setTranslationStatus('review');
    }
  }, [
    scripts,
    targetLanguages,
    buildTranslationQuestion,
    setTranslations,
    setTranslationStatus,
    setTranslationError,
    setPipelineIds,
  ]);

  // ── Approve all translations (Human Gate 4) ──
  const handleApproveGate = useCallback(async () => {
    setApproveLoading(true);
    try {
      const approvalPayload = {
        approvedLanguages: translations
          .filter((t) => t.approved)
          .map((t) => t.lang),
        rejectedLanguages: translations
          .filter((t) => !t.approved)
          .map((t) => t.lang),
        editedTranslations: translations.map((lt) => ({
          lang: lt.lang,
          spots: lt.spots.map((sp) => ({
            spotId: sp.spotId,
            translatedText: sp.translatedText,
          })),
        })),
      };

      // Try to send human input through ADK pipeline gate
      if (pipelineSessionId) {
        try {
          const checkpointId =
            useGuidesStore.getState().pipelineCheckpointId;
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

      setTranslationStatus('approved');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to approve';
      setTranslationError(message);
    } finally {
      setApproveLoading(false);
    }
  }, [translations, pipelineSessionId, setTranslationStatus, setTranslationError]);

  // ── Reset ──
  const handleReset = useCallback(() => {
    resetTranslations();
    setCurrentTab(0);
  }, [resetTranslations]);

  // ── Pre-condition: scripts must be approved ──
  if (scriptStatus !== 'approved') {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <DescriptionIcon
          sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
        />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          Complete Script Review First
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Approve the scripts in Step 3 (Script Generation) before generating
          translations.
        </Typography>
      </Paper>
    );
  }

  // Only one language configured — skip translation
  if (targetLanguages.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <TranslateIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Additional Languages
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
          Only the core language ({langLabel(coreLanguage)}) is configured.
          Add more languages in Entity Setup to enable translation.
        </Typography>
        <Chip label="Translation skipped" variant="outlined" />
      </Paper>
    );
  }

  return (
    <Box>
      {/* Title */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" gutterBottom fontWeight={700}>
          Step 4: Translation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          AI translates approved scripts into all configured languages. Review
          side-by-side, edit inline, then approve per language.
        </Typography>
      </Box>

      {/* Sub-step progress */}
      <Paper sx={{ px: 3, pt: 2, pb: 1, mb: 3 }}>
        <Stepper activeStep={activeSubStep} alternativeLabel>
          {SUB_STEPS.map((step, idx) => (
            <Step
              key={step.label}
              completed={
                idx < activeSubStep || translationStatus === 'approved'
              }
            >
              <StepLabel
                StepIconProps={{
                  icon:
                    translationStatus === 'approved' &&
                    idx <= activeSubStep ? (
                      <CheckCircleOutlineIcon color="success" />
                    ) : undefined,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: idx === activeSubStep ? 700 : 400,
                  }}
                >
                  {step.label}
                </Typography>
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Error alert */}
      {translationError && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          onClose={() => setTranslationError(null)}
        >
          {translationError}
        </Alert>
      )}

      {/* Idle — ready to translate */}
      {translationStatus === 'idle' && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <GTranslateIcon
            sx={{ fontSize: 48, color: 'primary.main', mb: 1 }}
          />
          <Typography variant="h6" gutterBottom>
            Ready to Translate
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {scripts.filter((s) => s.approved).length} approved script
            {scripts.filter((s) => s.approved).length !== 1 ? 's' : ''} will
            be translated into {targetLanguages.length} language
            {targetLanguages.length !== 1 ? 's' : ''}.
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: 'center',
              mb: 3,
            }}
          >
            {targetLanguages.map((l) => (
              <Chip
                key={l}
                label={langLabel(l)}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<PlayArrowIcon />}
            onClick={handleGenerateTranslations}
          >
            Generate Translations
          </Button>
        </Paper>
      )}

      {/* Translating */}
      {translationStatus === 'translating' && <ProcessingOverlay />}

      {/* Review */}
      {(translationStatus === 'review' || translationStatus === 'error') && (
        <Box>
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
              {approvedCount} / {translations.length} languages approved
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={<DoneAllIcon />}
              onClick={approveAllLanguages}
              disabled={allApproved}
            >
              Approve All Languages
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<RemoveDoneIcon />}
              onClick={rejectAllLanguages}
              disabled={approvedCount === 0}
            >
              Un-approve All
            </Button>
          </Paper>

          {/* Language tabs */}
          <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={currentTab}
              onChange={(_, v) => setCurrentTab(v)}
              variant="scrollable"
              scrollButtons="auto"
            >
              {translations.map((lt, idx) => (
                <Tab
                  key={lt.lang}
                  label={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      {lt.label}
                      {lt.approved && (
                        <CheckCircleOutlineIcon
                          color="success"
                          sx={{ fontSize: 16, ml: 0.5 }}
                        />
                      )}
                    </Box>
                  }
                  value={idx}
                />
              ))}
            </Tabs>
          </Paper>

          {/* Active language content */}
          {translations[currentTab] && (
            <Box sx={{ mt: 1 }}>
              {/* Per-language approval header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  mb: 1,
                  mt: 2,
                }}
              >
                <Typography variant="subtitle1" fontWeight={600}>
                  {translations[currentTab].label}
                </Typography>
                <Chip
                  label={`${translations[currentTab].spots.length} spots`}
                  size="small"
                  variant="outlined"
                />
                {translations[currentTab].approved ? (
                  <Tooltip title="Un-approve this language">
                    <Button
                      size="small"
                      color="warning"
                      variant="outlined"
                      onClick={() =>
                        rejectLanguage(translations[currentTab].lang)
                      }
                    >
                      Un-approve
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip title="Approve this language translation">
                    <Button
                      size="small"
                      color="success"
                      variant="contained"
                      startIcon={<CheckCircleOutlineIcon />}
                      onClick={() =>
                        approveLanguage(translations[currentTab].lang)
                      }
                    >
                      Approve Language
                    </Button>
                  </Tooltip>
                )}
              </Box>

              <LanguageTabContent langTranslation={translations[currentTab]} />
            </Box>
          )}

          <Divider sx={{ my: 3 }} />

          {/* Human Gate 4 — Translation Review actions */}
          <Paper
            sx={{
              p: 3,
              bgcolor: (t) => alpha(t.palette.warning.main, 0.08),
              borderLeft: 4,
              borderColor: 'warning.main',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1,
              }}
            >
              <RateReviewIcon color="warning" />
              <Typography variant="subtitle1" fontWeight={700}>
                Human Gate 4 — Translation Review
              </Typography>
            </Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2 }}
            >
              Review each language tab above. Edit translated text inline and
              approve per language. When all required languages are approved,
              proceed to audio production.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
                Approve & Continue ({approvedCount}/{translations.length})
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
              >
                Re-translate
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {/* Approved */}
      {translationStatus === 'approved' && (
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
            <CheckCircleOutlineIcon
              color="success"
              sx={{ fontSize: 48, mb: 1 }}
            />
            <Typography variant="h6" gutterBottom>
              Translations Approved
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2 }}
            >
              {approvedCount} language{approvedCount !== 1 ? 's' : ''}{' '}
              approved. Ready for audio production.
            </Typography>
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                flexWrap: 'wrap',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              {translations.map((lt) => (
                <Chip
                  key={lt.lang}
                  icon={
                    lt.approved ? (
                      <CheckCircleOutlineIcon />
                    ) : undefined
                  }
                  label={lt.label}
                  size="small"
                  color={lt.approved ? 'success' : 'default'}
                  variant="outlined"
                />
              ))}
            </Box>
            <Button
              variant="outlined"
              startIcon={<RestartAltIcon />}
              onClick={handleReset}
            >
              Re-translate
            </Button>
          </Paper>
        </Fade>
      )}
    </Box>
  );
}

// ── Stub translations (Phase 1A — copies base text to all languages) ──

function createStubTranslations(
  approvedScripts: {
    spotId: string;
    spotNumber: number;
    title: string;
    scriptText: string;
  }[],
  targetLanguages: string[],
): LanguageTranslation[] {
  return targetLanguages.map((lang) => ({
    lang,
    label: langLabel(lang),
    spots: approvedScripts.map((s) => ({
      spotId: s.spotId,
      spotNumber: s.spotNumber,
      title: s.title,
      originalText: s.scriptText,
      translatedText: `[${lang.toUpperCase()}] ${s.scriptText}`,
    })),
    approved: false,
  }));
}
