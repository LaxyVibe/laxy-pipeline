import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RadioButtonCheckedOutlinedIcon from '@mui/icons-material/RadioButtonCheckedOutlined';
import RedoOutlinedIcon from '@mui/icons-material/RedoOutlined';
import StopIcon from '@mui/icons-material/Stop';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import TranslateOutlinedIcon from '@mui/icons-material/TranslateOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  SCRIPT_ENHANCEMENT_OPTIONS,
  type AudioMvpCharacter,
  type AudioMvpVoice,
  type ScriptEnhancementLimit,
} from '../../../audioMvp/model';
import { genderLabelForCharacter } from '../../characterLibrary';
import { audioDirectorStyles, createSelectableCardSx } from '../../theme';

type VoiceTab = 'all' | 'female' | 'male';
type WizardStep = 'voice' | 'character' | 'script' | 'performance' | 'prompt';
type CharacterTab = 'preset' | 'custom';

const WIZARD_STEPS: readonly WizardStep[] = ['voice', 'character', 'performance', 'script', 'prompt'] as const;

type Props = {
  scriptText: string;
  compiledPrompt: string;
  characterAvatar: string;
  characterName: string;
  characterSelected?: boolean;
  selectedCharacterId: string;
  presetCharacters: AudioMvpCharacter[];
  customCharacters: AudioMvpCharacter[];
  characterLibraryTab: CharacterTab;
  customCharactersLoading: boolean;
  customCharactersError: string | null;
  canManageCustomCharacters: boolean;
  pendingDeleteCharacterId: string | null;
  voiceId: string;
  voiceName: string;
  femaleVoices: AudioMvpVoice[];
  maleVoices: AudioMvpVoice[];
  recommendedVoiceId: string;
  playingVoiceId: string | null;
  isGenerating: boolean;
  isGeneratingJapaneseReading?: boolean;
  generateDisabled?: boolean;
  finalActionLabel?: string;
  japaneseReadingStale?: boolean;
  japaneseReadingText?: string;
  generationError?: string | null;
  onChangeScript: (nextText: string) => void;
  onChangeJapaneseReading?: (nextText: string) => void;
  onChangeCompiledPrompt: (nextText: string) => void;
  onGenerate: () => void;
  onGenerateJapaneseReading?: () => void;
  onPreviewVoice: (voiceId: string) => void;
  onChangeVoice: (voiceId: string) => void;
  onChangeCharacter: (characterId: string) => void;
  onChangeCharacterLibraryTab: (tab: CharacterTab) => void;
  onCreateCustomCharacter: () => void;
  onEditCustomCharacter: (character: AudioMvpCharacter) => void;
  onDeleteCustomCharacter: (character: AudioMvpCharacter) => void;
  scriptEnhancementLimit: ScriptEnhancementLimit;
  scriptEnhancementEnabled: boolean;
  hasScriptEnhancement: boolean;
  isEnhancing: boolean;
  onCueDensityChange: (limit: ScriptEnhancementLimit) => void;
  onEnhanceScript: (forceRegenerate?: boolean) => void;
  onGeneratePerformanceGuidelines: () => Promise<boolean>;
  onChangePerformanceHintField: (field: 'scene' | 'style' | 'pacing' | 'tone', value: string) => void;
  onChangePerformanceGuidelines: (value: string) => void;
  performanceHint: {
    where: string;
    who: string;
    what: string;
    how: string;
    generatedGuidelines: string;
  };
  showJapaneseReading?: boolean;
};

function buildSpectrum(voiceId: string): number[] {
  let seed = 0;
  for (const char of voiceId) {
    seed += char.charCodeAt(0);
  }
  return Array.from({ length: 24 }, (_, index) => {
    const base = (Math.sin((seed + index * 13) * 0.15) + 1) / 2;
    return 18 + Math.round(base * 68);
  });
}

function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

function shortStepLabel(step: WizardStep): string {
  switch (step) {
    case 'voice':
      return 'Voice';
    case 'character':
      return 'Character';
    case 'script':
      return 'Script';
    case 'performance':
      return 'Hint';
    case 'prompt':
      return 'Prompt';
  }
}

export default function TtsScriptSection(props: Props) {
  const {
    scriptText,
    compiledPrompt,
    characterAvatar,
    characterName,
    characterSelected = true,
    selectedCharacterId,
    presetCharacters,
    customCharacters,
    characterLibraryTab,
    customCharactersLoading,
    customCharactersError,
    canManageCustomCharacters,
    pendingDeleteCharacterId,
    voiceId,
    voiceName,
    femaleVoices,
    maleVoices,
    recommendedVoiceId,
    playingVoiceId,
    isGenerating,
    isGeneratingJapaneseReading = false,
    generateDisabled = false,
    finalActionLabel = 'Done',
    japaneseReadingStale = false,
    japaneseReadingText = '',
    generationError = null,
    onChangeScript,
    onChangeJapaneseReading,
    onChangeCompiledPrompt,
    onGenerate,
    onGenerateJapaneseReading,
    onPreviewVoice,
    onChangeVoice,
    onChangeCharacter,
    onChangeCharacterLibraryTab,
    onCreateCustomCharacter,
    onEditCustomCharacter,
    onDeleteCustomCharacter,
    scriptEnhancementLimit,
    scriptEnhancementEnabled,
    hasScriptEnhancement,
    isEnhancing,
    onCueDensityChange,
    onEnhanceScript,
    onGeneratePerformanceGuidelines,
    onChangePerformanceHintField,
    onChangePerformanceGuidelines,
    performanceHint,
    showJapaneseReading = false,
  } = props;

  const [voiceTab, setVoiceTab] = useState<VoiceTab>('all');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isGeneratingPerformanceGuidelines, setIsGeneratingPerformanceGuidelines] = useState(false);
  const [, setScriptHistoryVersion] = useState(0);
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const pendingHistoryActionRef = useRef<'undo' | 'redo' | null>(null);
  const lastScriptTextRef = useRef(scriptText);
  const [, setGuidelinesHistoryVersion] = useState(0);
  const guidelineUndoStackRef = useRef<string[]>([]);
  const guidelineRedoStackRef = useRef<string[]>([]);
  const pendingGuidelineHistoryActionRef = useRef<'undo' | 'redo' | null>(null);
  const lastGuidelinesTextRef = useRef(performanceHint.generatedGuidelines);

  const editorHeight = { xs: 320, md: 360, xl: 400 };
  const primaryEditorHeight = showJapaneseReading
    ? { xs: 180, md: 205, xl: 230 }
    : editorHeight;
  const readingEditorHeight = { xs: 110, md: 125, xl: 140 };
  const activeStep = WIZARD_STEPS[activeStepIndex] ?? null;
  const activeCharacters = characterLibraryTab === 'preset' ? presetCharacters : customCharacters;
  const visibleVoiceGroups = useMemo(() => {
    if (voiceTab === 'female') {
      return [{ key: 'female', title: 'Female Voices', voices: femaleVoices }];
    }
    if (voiceTab === 'male') {
      return [{ key: 'male', title: 'Male Voices', voices: maleVoices }];
    }
    return [
      { key: 'female', title: 'Female Voices', voices: femaleVoices },
      { key: 'male', title: 'Male Voices', voices: maleVoices },
    ];
  }, [femaleVoices, maleVoices, voiceTab]);
  const scrollingTextFieldSx = {
    flex: 1,
    minHeight: 0,
    '& .MuiInputBase-root': {
      height: '100%',
      alignItems: 'stretch',
    },
    '& .MuiInputBase-inputMultiline': {
      height: '100% !important',
      overflow: 'auto !important',
    },
  } as const;
  const performanceHintValues = [
    { key: 'scene', label: 'Where', value: performanceHint.where },
    { key: 'style', label: 'Who', value: performanceHint.who },
    { key: 'pacing', label: 'What', value: performanceHint.what },
    { key: 'tone', label: 'How', value: performanceHint.how },
  ] as const;
  const hasAnyPerformanceHint = performanceHintValues.some((item) => item.value.trim());
  const transcriptVisible = activeStepIndex >= stepIndex('script');
  const previewPrompt = useMemo(
    () => applyTranscriptVisibilityToPrompt(compiledPrompt, transcriptVisible),
    [compiledPrompt, transcriptVisible],
  );
  const canUndoScript = undoStackRef.current.length > 0;
  const canRedoScript = redoStackRef.current.length > 0;
  const canUndoGuidelines = guidelineUndoStackRef.current.length > 0;
  const canRedoGuidelines = guidelineRedoStackRef.current.length > 0;

  useEffect(() => {
    const previous = lastScriptTextRef.current;
    if (scriptText === previous) return;

    if (pendingHistoryActionRef.current === 'undo') {
      redoStackRef.current = [...redoStackRef.current, previous];
    } else if (pendingHistoryActionRef.current === 'redo') {
      undoStackRef.current = [...undoStackRef.current, previous];
    } else {
      undoStackRef.current = [...undoStackRef.current, previous].slice(-100);
      redoStackRef.current = [];
    }

    pendingHistoryActionRef.current = null;
    lastScriptTextRef.current = scriptText;
    setScriptHistoryVersion((value) => value + 1);
  }, [scriptText]);

  useEffect(() => {
    const previous = lastGuidelinesTextRef.current;
    const nextValue = performanceHint.generatedGuidelines;
    if (nextValue === previous) return;

    if (pendingGuidelineHistoryActionRef.current === 'undo') {
      guidelineRedoStackRef.current = [...guidelineRedoStackRef.current, previous];
    } else if (pendingGuidelineHistoryActionRef.current === 'redo') {
      guidelineUndoStackRef.current = [...guidelineUndoStackRef.current, previous];
    } else {
      guidelineUndoStackRef.current = [...guidelineUndoStackRef.current, previous].slice(-100);
      guidelineRedoStackRef.current = [];
    }

    pendingGuidelineHistoryActionRef.current = null;
    lastGuidelinesTextRef.current = nextValue;
    setGuidelinesHistoryVersion((value) => value + 1);
  }, [performanceHint.generatedGuidelines]);

  const handleScriptChange = (nextText: string) => {
    pendingHistoryActionRef.current = null;
    onChangeScript(nextText);
  };

  const handleUndoScript = () => {
    const nextText = undoStackRef.current[undoStackRef.current.length - 1];
    if (nextText === undefined) return;

    undoStackRef.current = undoStackRef.current.slice(0, -1);
    pendingHistoryActionRef.current = 'undo';
    onChangeScript(nextText);
    setScriptHistoryVersion((value) => value + 1);
  };

  const handleRedoScript = () => {
    const nextText = redoStackRef.current[redoStackRef.current.length - 1];
    if (nextText === undefined) return;

    redoStackRef.current = redoStackRef.current.slice(0, -1);
    pendingHistoryActionRef.current = 'redo';
    onChangeScript(nextText);
    setScriptHistoryVersion((value) => value + 1);
  };

  const handleGuidelinesChange = (nextText: string) => {
    pendingGuidelineHistoryActionRef.current = null;
    onChangePerformanceGuidelines(nextText);
  };

  const handleUndoGuidelines = () => {
    const nextText = guidelineUndoStackRef.current[guidelineUndoStackRef.current.length - 1];
    if (nextText === undefined) return;

    guidelineUndoStackRef.current = guidelineUndoStackRef.current.slice(0, -1);
    pendingGuidelineHistoryActionRef.current = 'undo';
    onChangePerformanceGuidelines(nextText);
    setGuidelinesHistoryVersion((value) => value + 1);
  };

  const handleRedoGuidelines = () => {
    const nextText = guidelineRedoStackRef.current[guidelineRedoStackRef.current.length - 1];
    if (nextText === undefined) return;

    guidelineRedoStackRef.current = guidelineRedoStackRef.current.slice(0, -1);
    pendingGuidelineHistoryActionRef.current = 'redo';
    onChangePerformanceGuidelines(nextText);
    setGuidelinesHistoryVersion((value) => value + 1);
  };

  const handleGenerateGuidelines = async () => {
    setIsGeneratingPerformanceGuidelines(true);
    try {
      await onGeneratePerformanceGuidelines();
    } finally {
      setIsGeneratingPerformanceGuidelines(false);
    }
  };

  const goToStep = (index: number) => {
    setActiveStepIndex(Math.max(0, Math.min(index, WIZARD_STEPS.length - 1)));
  };

  const handleNextStep = async () => {
    if (!activeStep) return;
    if (activeStep === 'voice') {
      goToStep(stepIndex('character'));
      return;
    }
    if (activeStep === 'character') {
      if (!characterSelected) return;
      goToStep(stepIndex('performance'));
      return;
    }
    if (activeStep === 'performance') {
      goToStep(stepIndex('script'));
      return;
    }
    if (activeStep === 'script') {
      if (!scriptText.trim()) return;
      goToStep(stepIndex('prompt'));
      return;
    }

    onGenerate();
  };

  const renderStepContent = (step: WizardStep) => {
    if (step === 'voice') {
      return (
        <Stack spacing={2}>
          <Tabs value={voiceTab} onChange={(_event, value: VoiceTab) => setVoiceTab(value)}>
            <Tab value="all" label="All" />
            <Tab value="female" label="Female" />
            <Tab value="male" label="Male" />
          </Tabs>

          <Stack spacing={1.5} sx={{ maxHeight: { md: 430 }, overflow: 'auto', pr: { md: 0.5 } }}>
            {visibleVoiceGroups.map((group) => (
              <VoiceGroupSection
                key={group.key}
                title={group.title}
                voices={group.voices}
                selectedVoiceId={voiceId}
                recommendedVoiceId={recommendedVoiceId}
                playingVoiceId={playingVoiceId}
                onSelect={onChangeVoice}
                onPreview={onPreviewVoice}
              />
            ))}
          </Stack>
        </Stack>
      );
    }

    if (step === 'character') {
      return (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2}>
            <Tabs
              value={characterLibraryTab}
              onChange={(_event, value: CharacterTab) => onChangeCharacterLibraryTab(value)}
              sx={{ minHeight: 40 }}
            >
              <Tab label="Presets" value="preset" />
              <Tab label={`Custom Characters (${customCharacters.length})`} value="custom" />
            </Tabs>

            {characterLibraryTab === 'custom' ? (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={onCreateCustomCharacter}
                disabled={!canManageCustomCharacters}
              >
                New Character
              </Button>
            ) : null}
          </Stack>

          {customCharactersError ? <Alert severity="error">{customCharactersError}</Alert> : null}

          {customCharactersLoading ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 3, justifyContent: 'center' }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Loading tenant characters…
              </Typography>
            </Stack>
          ) : null}

          {!customCharactersLoading && activeCharacters.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, backgroundColor: '#faf7f0' }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {characterLibraryTab === 'preset' ? 'No preset characters available.' : 'No custom characters yet.'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {characterLibraryTab === 'preset'
                  ? 'The built-in presets could not be loaded.'
                  : 'Create a character in Character Designer to add reusable narration personas.'}
              </Typography>
            </Paper>
          ) : null}

          <Stack spacing={1.5} sx={{ maxHeight: { md: 430 }, overflow: 'auto', pr: { md: 0.5 } }}>
            {activeCharacters.map((character) => (
              <CharacterLibraryCard
                key={character.id}
                character={character}
                isSelected={selectedCharacterId === character.id}
                isDeleting={pendingDeleteCharacterId === character.id}
                canManage={character.source === 'custom' && canManageCustomCharacters}
                onSelect={onChangeCharacter}
                onEdit={onEditCustomCharacter}
                onDelete={onDeleteCustomCharacter}
              />
            ))}
          </Stack>
        </Stack>
      );
    }

    if (step === 'script') {
      return (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Stack direction="row" spacing={1}>
              <Tooltip title="Undo">
                <span>
                  <IconButton
                    aria-label="Undo script change"
                    onClick={handleUndoScript}
                    disabled={!canUndoScript || isGenerating || isEnhancing}
                    sx={{ border: '1px solid', borderColor: 'divider' }}
                  >
                    <UndoOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Redo">
                <span>
                  <IconButton
                    aria-label="Redo script change"
                    onClick={handleRedoScript}
                    disabled={!canRedoScript || isGenerating || isEnhancing}
                    sx={{ border: '1px solid', borderColor: 'divider' }}
                  >
                    <RedoOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>

            {showJapaneseReading ? (
              <Tooltip title={isGeneratingJapaneseReading ? 'Generating Hiragana reading…' : 'Generate Hiragana reading'}>
                <span>
                  <Button
                    variant="outlined"
                    startIcon={isGeneratingJapaneseReading ? <CircularProgress color="inherit" size={16} /> : <TranslateOutlinedIcon />}
                    onClick={onGenerateJapaneseReading}
                    disabled={!scriptText.trim() || isGeneratingJapaneseReading || !onGenerateJapaneseReading}
                  >
                    Hiragana reading
                  </Button>
                </span>
              </Tooltip>
            ) : null}
          </Stack>

          <Box sx={{ height: primaryEditorHeight, minHeight: primaryEditorHeight, display: 'flex' }}>
            <TextField
              multiline
              minRows={1}
              fullWidth
              value={scriptText}
              onChange={(event) => handleScriptChange(event.target.value)}
              placeholder="Paste or refine the spoken script here."
              sx={scrollingTextFieldSx}
            />
          </Box>

          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 3,
              bgcolor: alpha('#fffaf3', 0.92),
            }}
          >
            <Stack spacing={1.5}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={scriptEnhancementEnabled}
                    onChange={(_event, checked) => onCueDensityChange(checked
                      ? (scriptEnhancementLimit === 'none' ? 'light' : scriptEnhancementLimit)
                      : 'none')}
                  />
                )}
                label="Enable performance cues"
              />

              {scriptEnhancementEnabled ? (
                <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }}>
                  <FormControl fullWidth sx={{ maxWidth: { lg: 280 } }}>
                    <InputLabel id="tts-script-step-cue-density-label">Cue density</InputLabel>
                    <Select
                      labelId="tts-script-step-cue-density-label"
                      label="Cue density"
                      value={scriptEnhancementLimit}
                      onChange={(event) => onCueDensityChange(event.target.value as ScriptEnhancementLimit)}
                    >
                      {SCRIPT_ENHANCEMENT_OPTIONS.filter((option) => option.id !== 'none').map((option) => (
                        <MenuItem key={option.id} value={option.id}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Button
                    variant="outlined"
                    startIcon={isEnhancing ? <CircularProgress color="inherit" size={16} /> : <AutoAwesomeIcon />}
                    onClick={() => onEnhanceScript(hasScriptEnhancement)}
                    disabled={!characterSelected || !hasAnyPerformanceHint || !scriptText.trim() || isGenerating || isEnhancing}
                  >
                    {isEnhancing ? 'Enhancing…' : hasScriptEnhancement ? 'Re-run enhance script' : 'Run enhance script'}
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </Paper>

          {showJapaneseReading ? (
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>
                  Japanese narration reading
                </Typography>
                <Chip
                  size="small"
                  color={japaneseReadingStale ? 'warning' : japaneseReadingText.trim() ? 'primary' : 'default'}
                  variant="outlined"
                  label={
                    japaneseReadingStale
                      ? 'Needs refresh'
                      : japaneseReadingText.trim()
                        ? 'Ready for TTS'
                        : 'Not generated yet'
                  }
                />
              </Stack>

              <Box sx={{ height: readingEditorHeight, minHeight: readingEditorHeight, display: 'flex' }}>
                <TextField
                  multiline
                  minRows={1}
                  fullWidth
                  value={japaneseReadingText}
                  onChange={(event) => onChangeJapaneseReading?.(event.target.value)}
                  placeholder="Generate Hiragana reading, then adjust pronunciation here if needed."
                  sx={scrollingTextFieldSx}
                />
              </Box>
            </Stack>
          ) : null}
        </Stack>
      );
    }

    if (step === 'performance') {
      return (
        <Stack spacing={2}>
          {generationError ? <Alert severity="error">{generationError}</Alert> : null}

          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
            {performanceHintValues.map((item) => (
              <TextField
                key={item.key}
                label={item.label}
                multiline
                minRows={4}
                value={item.value}
                onChange={(event) => onChangePerformanceHintField(item.key, event.target.value)}
                fullWidth
              />
            ))}
          </Box>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <Button
              variant="outlined"
              startIcon={isGeneratingPerformanceGuidelines ? <CircularProgress color="inherit" size={16} /> : <AutoAwesomeIcon />}
              onClick={() => {
                void handleGenerateGuidelines();
              }}
              disabled={!characterSelected || !hasAnyPerformanceHint || isGeneratingPerformanceGuidelines}
            >
              {isGeneratingPerformanceGuidelines ? 'Generating…' : 'Generate guideline'}
            </Button>

            <Stack direction="row" spacing={1}>
              <Tooltip title="Undo">
                <span>
                  <IconButton
                    aria-label="Undo guideline change"
                    onClick={handleUndoGuidelines}
                    disabled={!canUndoGuidelines || isGeneratingPerformanceGuidelines}
                    sx={{ border: '1px solid', borderColor: 'divider' }}
                  >
                    <UndoOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="Redo">
                <span>
                  <IconButton
                    aria-label="Redo guideline change"
                    onClick={handleRedoGuidelines}
                    disabled={!canRedoGuidelines || isGeneratingPerformanceGuidelines}
                    sx={{ border: '1px solid', borderColor: 'divider' }}
                  >
                    <RedoOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>

          <TextField
            label="Detailed performance guideline"
            multiline
            minRows={8}
            fullWidth
            value={performanceHint.generatedGuidelines}
            onChange={(event) => handleGuidelinesChange(event.target.value)}
          />
        </Stack>
      );
    }

    return (
      <Stack spacing={2}>
        <Box
          sx={{
            height: { xs: 420, md: 'calc(100vh - 340px)' },
            minHeight: { xs: 420, md: 520 },
            display: 'flex',
          }}
        >
          <TextField
            label="TTS Prompt"
            multiline
            minRows={1}
            fullWidth
            value={previewPrompt}
            onChange={(event) => onChangeCompiledPrompt(event.target.value)}
            sx={scrollingTextFieldSx}
          />
        </Box>
      </Stack>
    );
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gap: { xs: 1.5, md: 2.5 },
        gridTemplateColumns: {
          xs: '1fr',
          md: 'minmax(0, 1.3fr) minmax(320px, 0.88fr)',
          xl: 'minmax(0, 1.55fr) minmax(360px, 0.92fr)',
        },
        alignItems: 'start',
        minHeight: 0,
      }}
    >
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Card sx={{ ...audioDirectorStyles.sectionCard, overflow: 'hidden' }}>
          <CardContent sx={{ p: { xs: 2.25, md: 2.75 } }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {WIZARD_STEPS.map((step, index) => {
                  const isActive = activeStep === step;
                  const isComplete = activeStepIndex > index;
                  return (
                    <Box
                      key={step}
                      sx={{
                        px: 1.25,
                        py: 0.8,
                        borderRadius: '999px',
                        border: '1px solid rgba(31, 92, 79, 0.10)',
                        bgcolor: isActive
                          ? alpha('#ffffff', 0.95)
                          : isComplete
                            ? alpha('#f5fbf8', 0.95)
                            : alpha('#f4eee2', 0.72),
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '999px',
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: isActive || isComplete ? 'primary.main' : 'rgba(31, 92, 79, 0.10)',
                            color: isActive || isComplete ? 'primary.contrastText' : 'text.secondary',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          {index + 1}
                        </Box>
                        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>
                          {shortStepLabel(step)}
                        </Typography>
                      </Stack>
                    </Box>
                  );
                })}
                <Chip
                  color="primary"
                  variant="outlined"
                  icon={<RadioButtonCheckedOutlinedIcon />}
                  label={`Step ${Math.min(activeStepIndex + 1, WIZARD_STEPS.length)}/${WIZARD_STEPS.length}`}
                />
              </Stack>

              {generationError && activeStep !== 'performance' ? <Alert severity="error">{generationError}</Alert> : null}

              {activeStep ? (
                <StepCard
                  step={activeStepIndex + 1}
                  title={stepTitle(activeStep)}
                  description=""
                  completeLabel={
                    activeStep === 'voice'
                      ? voiceName
                      : activeStep === 'character'
                        ? characterSelected
                          ? characterName
                          : undefined
                        : activeStep === 'script'
                          ? scriptText.trim()
                            ? 'Ready'
                            : undefined
                          : activeStep === 'prompt'
                            ? 'Manual tune'
                            : undefined
                  }
                  accentColor={stepAccent(activeStep)}
                >
                  {renderStepContent(activeStep)}

                  <Stack direction="row" justifyContent="space-between" sx={{ pt: 1.5 }}>
                    <Button
                      variant="text"
                      onClick={() => goToStep(activeStepIndex - 1)}
                      disabled={activeStepIndex === 0 || isGeneratingPerformanceGuidelines}
                    >
                      Back
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => {
                        void handleNextStep();
                      }}
                      disabled={
                        isGenerating
                        || isGeneratingPerformanceGuidelines
                        || (activeStep === 'performance' && isEnhancing)
                        || (activeStep === 'character' && !characterSelected)
                        || (activeStep === 'script' && !scriptText.trim())
                        || (activeStep === 'prompt' && generateDisabled)
                      }
                    >
                      {activeStep === 'prompt' ? finalActionLabel : 'Next'}
                    </Button>
                  </Stack>
                </StepCard>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Box
        sx={{
          minWidth: 0,
          position: { md: 'sticky' },
          top: { md: 24 },
          alignSelf: 'start',
        }}
      >
        <Card sx={{ ...audioDirectorStyles.sectionCard, overflow: 'hidden' }}>
          <CardContent sx={{ p: { xs: 2.25, md: 2.5 }, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack spacing={1.25}>
              <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.14em' }}>
                TTS Prompt Preview
              </Typography>

              <Box
                sx={{
                  height: { xs: 340, md: 'calc(100vh - 250px)' },
                  minHeight: 340,
                  overflow: 'auto',
                  borderRadius: '18px',
                  border: '1px solid rgba(31, 92, 79, 0.10)',
                  bgcolor: '#fffaf3',
                  p: 2,
                }}
              >
                <MarkdownPreview markdown={previewPrompt} />
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function stepTitle(step: WizardStep): string {
  switch (step) {
    case 'voice':
      return 'Voice';
    case 'character':
      return 'Character';
    case 'script':
      return 'Script';
    case 'performance':
      return 'Performance Hint';
    case 'prompt':
      return 'Prompt';
  }
}

function stepAccent(step: WizardStep): string {
  switch (step) {
    case 'voice':
      return 'rgba(31, 92, 79, 0.16)';
    case 'character':
      return 'rgba(201, 139, 44, 0.18)';
    case 'script':
      return 'rgba(31, 92, 79, 0.12)';
    case 'performance':
      return 'rgba(201, 139, 44, 0.14)';
    case 'prompt':
      return 'rgba(31, 92, 79, 0.16)';
  }
}

type VoiceGroupSectionProps = {
  title: string;
  voices: AudioMvpVoice[];
  selectedVoiceId: string;
  recommendedVoiceId: string;
  playingVoiceId: string | null;
  onSelect: (voiceId: string) => void;
  onPreview: (voiceId: string) => void;
};

function VoiceGroupSection(props: VoiceGroupSectionProps) {
  const {
    title,
    voices,
    selectedVoiceId,
    recommendedVoiceId,
    playingVoiceId,
    onSelect,
    onPreview,
  } = props;

  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {title}
      </Typography>
      <Stack spacing={1}>
        {voices.map((voice) => {
          const isSelected = selectedVoiceId === voice.id;
          const isRecommended = recommendedVoiceId === voice.id;
          const isPlaying = playingVoiceId === voice.id;

          return (
            <Paper
              key={voice.id}
              elevation={0}
              onClick={() => onSelect(voice.id)}
              sx={createSelectableCardSx({
                selected: isSelected,
                recommended: isRecommended,
              })}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPreview(voice.id);
                  }}
                  sx={{ border: '1px solid', borderColor: 'divider', width: 36, height: 36, flexShrink: 0 }}
                >
                  {isPlaying ? <StopIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                </IconButton>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="subtitle2" fontWeight={700}>{voice.name}</Typography>
                    {isRecommended ? (
                      <Chip size="small" label="Recommended" color="warning" sx={{ height: 20, fontSize: '0.7rem' }} />
                    ) : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {voice.summary}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Tone: {voice.tone}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Best for: {voice.bestFor}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 1, height: 26, alignItems: 'end' }}>
                    {buildSpectrum(voice.id).map((height, idx) => (
                      <Box
                        key={`${voice.id}-spec-${idx}`}
                        sx={{
                          width: 4,
                          height,
                          borderRadius: 2,
                          bgcolor: isSelected ? 'primary.main' : 'rgba(31, 92, 79, 0.25)',
                        }}
                      />
                    ))}
                  </Stack>
                </Box>

                {isSelected ? (
                  <CheckCircleOutlineIcon sx={{ color: 'primary.main', fontSize: 24, flexShrink: 0 }} />
                ) : null}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}

type CharacterLibraryCardProps = {
  character: AudioMvpCharacter;
  isSelected: boolean;
  isDeleting: boolean;
  canManage: boolean;
  onSelect: (characterId: string) => void;
  onEdit: (character: AudioMvpCharacter) => void;
  onDelete: (character: AudioMvpCharacter) => void;
};

function CharacterLibraryCard(props: CharacterLibraryCardProps) {
  const {
    character,
    isSelected,
    isDeleting,
    canManage,
    onSelect,
    onEdit,
    onDelete,
  } = props;

  return (
    <Paper
      elevation={0}
      onClick={() => onSelect(character.id)}
      sx={createSelectableCardSx({
        selected: isSelected,
        backgroundColor: '#faf7f0',
      })}
    >
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Typography variant="h4">{character.avatar}</Typography>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="subtitle1" fontWeight={700}>{character.name}</Typography>
            <Chip label={character.role} size="small" />
            <Chip label={genderLabelForCharacter(character)} size="small" variant="outlined" />
            <Chip
              label={character.source === 'preset' ? 'Preset' : 'Custom'}
              size="small"
              color={character.source === 'preset' ? 'default' : 'primary'}
              variant={character.source === 'preset' ? 'outlined' : 'filled'}
            />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            <strong>Context:</strong> {character.context || character.personalityDNA}
          </Typography>
          {character.coreTimbre ? (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              <strong>Voice:</strong> {character.coreTimbre}
            </Typography>
          ) : null}
          {character.staticInstruction ? (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              sx={{
                mt: 1,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              <strong>Sample context:</strong> {character.staticInstruction}
            </Typography>
          ) : null}
        </Box>

        <Stack direction="row" spacing={0.5} alignItems="center">
          {canManage ? (
            <>
              <Tooltip title="Edit character">
                <span>
                  <IconButton
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(character);
                    }}
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Delete character">
                <span>
                  <IconButton
                    size="small"
                    disabled={isDeleting}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(character);
                    }}
                  >
                    {isDeleting ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
            </>
          ) : null}
          {isSelected ? (
            <CheckCircleOutlineIcon sx={{ color: 'primary.main', fontSize: 24, flexShrink: 0 }} />
          ) : null}
        </Stack>
      </Stack>
    </Paper>
  );
}

function StepCard(props: {
  step: number;
  title: string;
  description: string;
  completeLabel?: string;
  accentColor: string;
  children: ReactNode;
}) {
  const { step, title, description, completeLabel, accentColor, children } = props;

  return (
    <Box
      sx={{
        position: 'relative',
        p: { xs: 1.5, md: 1.75 },
        borderRadius: '22px',
        border: '1px solid rgba(31, 92, 79, 0.10)',
        bgcolor: 'rgba(255,255,255,0.72)',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${accentColor} 0%, transparent 42%)`,
          pointerEvents: 'none',
        }}
      />

      <Stack spacing={1.5} sx={{ position: 'relative' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'flex-start' }}>
          <Stack direction="row" spacing={1.25} alignItems="flex-start">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '14px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(31, 92, 79, 0.10)',
                color: 'primary.dark',
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {step}
            </Box>
            <Stack spacing={0.35}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {title}
              </Typography>
              {description ? (
                <Typography variant="body2" color="text.secondary">
                  {description}
                </Typography>
              ) : null}
            </Stack>
          </Stack>

          {completeLabel ? (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              icon={<RadioButtonCheckedOutlinedIcon />}
              label={completeLabel}
            />
          ) : null}
        </Stack>

        {children}
      </Stack>
    </Box>
  );
}

function applyTranscriptVisibilityToPrompt(prompt: string, transcriptVisible: boolean): string {
  const transcriptPattern = /\n#### TRANSCRIPT[\s\S]*$/;

  if (!transcriptPattern.test(prompt)) {
    return prompt;
  }

  if (!transcriptVisible) {
    return prompt.replace(transcriptPattern, '');
  }

  return prompt;
}

function MarkdownPreview(props: { markdown: string }) {
  const { markdown } = props;
  const lines = markdown.split('\n');

  return (
    <Stack spacing={1}>
      {lines.map((line, index) => {
        const key = `${index}-${line}`;
        const trimmed = line.trim();

        if (!trimmed) {
          return <Box key={key} sx={{ height: 8 }} />;
        }

        if (trimmed.startsWith('#### ')) {
          return (
            <Typography key={key} variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: '0.06em' }}>
              {trimmed.slice(5)}
            </Typography>
          );
        }

        if (trimmed.startsWith('### ')) {
          return (
            <Typography key={key} variant="subtitle1" sx={{ fontWeight: 800 }}>
              {trimmed.slice(4)}
            </Typography>
          );
        }

        if (trimmed.startsWith('## ')) {
          return (
            <Typography key={key} variant="h6" sx={{ fontWeight: 800 }}>
              {trimmed.slice(3)}
            </Typography>
          );
        }

        if (trimmed.startsWith('# ')) {
          return (
            <Typography key={key} variant="h5" sx={{ fontWeight: 800 }}>
              {trimmed.slice(2)}
            </Typography>
          );
        }

        return (
          <Typography key={key} variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {line}
          </Typography>
        );
      })}
    </Stack>
  );
}
