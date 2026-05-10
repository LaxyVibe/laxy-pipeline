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
import SyncIcon from '@mui/icons-material/Sync';

import { useGuidesStore } from '../../guidesStore';
import {
  translateLanguage,
  sendHumanInput,
} from '../../api';
import { usePipelineSync } from '../../hooks/usePipelineSync';
import type {
  LanguageTranslation,
  SpotTranslation,
  TranslationStatus,
} from '../../types/entity';
import { langLabel } from '../../types/entity';
import {
  buildTranslationGateApprovalPayload,
  createInitialTranslationProgress,
  generateTranslationsInParallel,
  getTargetLanguages,
  validateTranslationGenerationInput,
} from '../../workflows/translationWorkflow';

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

// ── Helper: parse markdown translation content from S2 OCR ──
// When the pipeline returns translations as markdown in _content (not structured
// JSON), this parser extracts per-spot, per-language description text.
// Expected format: Spot blocks separated by `---`, with lines like:
//   **Description (ja):** <translated text>

function parseMarkdownTranslations(
  content: string,
  approvedScripts: { spotId: string; spotNumber: number; title: string; scriptText: string }[],
  coreLang: string,
): LanguageTranslation[] {
  // Split into spot blocks (divided by --- or **Spot #N**)
  const spotBlocks = content.split(/---|\*\*Spot\s*#\d+\*\*/).filter((b) => b.trim());

  const langMap = new Map<string, SpotTranslation[]>();

  spotBlocks.forEach((block, idx) => {
    const script = approvedScripts[idx];
    if (!script) return;

    // Extract description lines: **Description (LANG):** TEXT
    // Also match: **Description (LANG_CODE):** TEXT
    const descRegex = /\*\*Description\s*\(([^)]+)\):\*\*\s*([\s\S]*?)(?=\*\*|$)/gi;
    let match;
    while ((match = descRegex.exec(block)) !== null) {
      const langRaw = match[1].trim();
      const text = match[2].trim();
      if (!text) continue;

      // Resolve language code — the markdown may use full name or code
      const langCode = resolveLangCode(langRaw);
      if (langCode === coreLang) continue; // skip core language

      if (!langMap.has(langCode)) langMap.set(langCode, []);
      langMap.get(langCode)!.push({
        spotId: script.spotId,
        spotNumber: script.spotNumber,
        title: script.title,
        originalText: script.scriptText,
        translatedText: text,
      });
    }
  });

  return Array.from(langMap.entries()).map(([lang, spots]) => ({
    lang,
    label: langLabel(lang),
    spots,
    approved: false,
  }));
}

/** Map a language name/code from markdown to our normalized code */
function resolveLangCode(raw: string): string {
  const lower = raw.toLowerCase();
  // Direct code match
  if (/^[a-z]{2}(-[a-z]{2,4})?$/i.test(raw)) return lower;
  // Common name → code lookups
  // Map common language names to ISO codes (must stay in sync with SUPPORTED_LANGUAGES)
  const nameMap: Record<string, string> = {
    english: 'en',
    japanese: 'ja',
    korean: 'ko',
    french: 'fr',
    german: 'de',
    spanish: 'es',
    italian: 'it',
    portuguese: 'pt',
    thai: 'th',
    vietnamese: 'vi',
    indonesian: 'id',
    malay: 'ms',
    arabic: 'ar',
    russian: 'ru',
    'traditional chinese': 'zh-TW',
    'simplified chinese': 'zh-CN',
    chinese: 'zh-CN',
  };
  return nameMap[lower] ?? raw;
}

// ── Processing overlay ──

type LangProgressStatus = 'pending' | 'translating' | 'done' | 'error';

interface ProcessingOverlayProps {
  targetLanguages: string[];
  perLangProgress: Record<string, { status: LangProgressStatus; error?: string }>;
}

function ProcessingOverlay({ targetLanguages, perLangProgress }: ProcessingOverlayProps) {
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
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            AI is translating scripts…
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Translating approved scripts into {targetLanguages.length} language{targetLanguages.length !== 1 ? 's' : ''} in parallel.
          </Typography>
        </Box>
        <Box sx={{ width: '100%', mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {targetLanguages.map((lang) => {
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
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {doneCount} / {targetLanguages.length} complete
            </Typography>
          </Box>
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
  const resetDownstreamFrom = useGuidesStore((s) => s.resetDownstreamFrom);

  const { applyResponse } = usePipelineSync();

  const [currentTab, setCurrentTab] = useState(0);
  const [approveLoading, setApproveLoading] = useState(false);
  const [gateSyncFailed, setGateSyncFailed] = useState(false);
  const [perLangProgress, setPerLangProgress] = useState<Record<string, { status: 'pending' | 'translating' | 'done' | 'error'; error?: string }>>({});

  const activeSubStep = statusToSubStep(translationStatus);

  // Languages to translate into (all supported except core language)
  const targetLanguages = useMemo(
    () => getTargetLanguages(supportedLanguages, coreLanguage),
    [supportedLanguages, coreLanguage],
  );

  // Filter translations to only include languages currently in targetLanguages.
  // This handles the case where the user changes supportedLanguages after
  // translations were already generated for a previous set of languages.
  const filteredTranslations = useMemo(
    () => translations.filter((t) => (targetLanguages as string[]).includes(t.lang)),
    [translations, targetLanguages],
  );

  const approvedCount = filteredTranslations.filter((t) => t.approved).length;
  const allApproved =
    filteredTranslations.length > 0 && approvedCount === filteredTranslations.length;

  // ── Parallel per-language translation generation ──
  const handleGenerateTranslations = useCallback(async () => {
    const approvedScripts = scripts.filter((s) => s.approved);
    const validationError = validateTranslationGenerationInput({
      targetLanguages,
      approvedScripts,
    });

    if (validationError) {
      setTranslationError(validationError);
      return;
    }

    setTranslationStatus('translating');
    setTranslationError(null);

    setPerLangProgress(createInitialTranslationProgress(targetLanguages));

    try {
      const result = await generateTranslationsInParallel({
        targetLanguages,
        coreLanguage,
        approvedScripts,
        translate: translateLanguage,
        onProgress: (language, update) => {
          setPerLangProgress((prev) => ({
            ...prev,
            [language]: {
              status: update.status,
              ...(update.error ? { error: update.error } : {}),
            },
          }));
        },
      });

      if (result.translations.length === 0) {
        setTranslationError('No translations returned.');
        setTranslationStatus('error');
        return;
      }

      setTranslations(result.translations);
      setTranslationStatus('review');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setTranslationError(message);
      setTranslationStatus('error');
    }
  }, [
    scripts,
    targetLanguages,
    coreLanguage,
    setTranslations,
    setTranslationStatus,
    setTranslationError,
  ]);

  // ── Approve all translations (Human Gate 4) ──
  const handleApproveGate = useCallback(async () => {
    setApproveLoading(true);
    setGateSyncFailed(false);
    try {
      const approvalPayload = buildTranslationGateApprovalPayload(filteredTranslations);

      // Read pipeline IDs directly from the store to avoid stale closures
      const { pipelineSessionId: sid, pipelineCheckpointId: cpId } = useGuidesStore.getState();
      console.log('[TranslationReviewStep] Approve clicked — sessionId:', sid, 'checkpointId:', cpId);

      // Try to send human input through ADK pipeline gate
      let syncOk = false;
      if (sid && cpId) {
        try {
          const response = await sendHumanInput(
            sid,
            'approve',
            cpId,
            JSON.stringify(approvalPayload),
          );
          // Apply the response so downstream steps (audio, etc.) are pre-populated
          applyResponse(response);
          syncOk = true;

          // Surface any downstream step errors as a warning
          const stepErrors = (response.steps ?? [])
            .filter((s) => s.status === 'ERROR' && s.output)
            .map((s) => {
              const out = s.output as Record<string, unknown>;
              return `[${s.label}] ${(out.error as string) ?? (out.message as string) ?? 'Unknown error'}`;
            });
          if (stepErrors.length > 0) {
            setTranslationError(
              'Translations approved, but downstream pipeline steps encountered errors:\n' +
              stepErrors.join('\n'),
            );
          }
        } catch (gateErr: unknown) {
          const gateMsg = gateErr instanceof Error ? gateErr.message : 'Pipeline sync failed';
          console.warn('[TranslationReviewStep] Gate approval failed:', gateMsg);
          setTranslationError(`Pipeline sync failed — you can retry from the approved view. (${gateMsg})`);
          setGateSyncFailed(true);
        }
      } else {
        console.warn('[TranslationReviewStep] No pipeline session/checkpoint — approval saved locally only');
        setGateSyncFailed(true);
      }

      setTranslationStatus('approved');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to approve';
      setTranslationError(message);
    } finally {
      setApproveLoading(false);
    }
  }, [filteredTranslations, setTranslationStatus, setTranslationError, applyResponse]);

  // ── Reset (cascades to all downstream steps) ──
  const handleReset = useCallback(() => {
    resetDownstreamFrom('translation');
    setCurrentTab(0);
  }, [resetDownstreamFrom]);

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
                    ) : step.icon,
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
      {translationStatus === 'translating' && <ProcessingOverlay targetLanguages={targetLanguages} perLangProgress={perLangProgress} />}

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
              {approvedCount} / {filteredTranslations.length} languages approved
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
              {filteredTranslations.map((lt, idx) => (
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
          {filteredTranslations[currentTab] && (
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
                  {filteredTranslations[currentTab].label}
                </Typography>
                <Chip
                  label={`${filteredTranslations[currentTab].spots.length} spots`}
                  size="small"
                  variant="outlined"
                />
                {filteredTranslations[currentTab].approved ? (
                  <Tooltip title="Un-approve this language">
                    <Button
                      size="small"
                      color="warning"
                      variant="outlined"
                      onClick={() =>
                        rejectLanguage(filteredTranslations[currentTab].lang)
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
                        approveLanguage(filteredTranslations[currentTab].lang)
                      }
                    >
                      Approve Language
                    </Button>
                  </Tooltip>
                )}
              </Box>

              <LanguageTabContent langTranslation={filteredTranslations[currentTab]} />
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
                Approve & Continue ({approvedCount}/{filteredTranslations.length})
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
              bgcolor: (t) => alpha(
                gateSyncFailed ? t.palette.warning.main : t.palette.success.main,
                0.08,
              ),
              borderLeft: 4,
              borderColor: gateSyncFailed ? 'warning.main' : 'success.main',
            }}
          >
            {gateSyncFailed ? (
              <SyncIcon color="warning" sx={{ fontSize: 48, mb: 1 }} />
            ) : (
              <CheckCircleOutlineIcon
                color="success"
                sx={{ fontSize: 48, mb: 1 }}
              />
            )}
            <Typography variant="h6" gutterBottom>
              {gateSyncFailed ? 'Translations Saved Locally' : 'Translations Approved'}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2 }}
            >
              {gateSyncFailed
                ? `${approvedCount} language${approvedCount !== 1 ? 's' : ''} saved. Pipeline sync failed — please retry.`
                : `${approvedCount} language${approvedCount !== 1 ? 's' : ''} approved. Ready for audio production.`}
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
              {filteredTranslations.map((lt) => (
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
                onClick={() => setTranslationStatus('review')}
              >
                Redo Review
              </Button>
              <Button
                variant="outlined"
                startIcon={<RestartAltIcon />}
                onClick={handleReset}
              >
                Re-translate
              </Button>
            </Box>
          </Paper>
        </Fade>
      )}
    </Box>
  );
}
