import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { langLabel } from '../../../../types/entity';
import {
  describeScriptEnhancementLimit,
  SCRIPT_ENHANCEMENT_OPTIONS,
  type AudioGuideSettings,
  type AudioPoiDraft,
  type ScriptEnhancementLimit,
} from '../../../audioMvp/model';
import { audioDirectorStyles } from '../../theme';
import type { EnhancementEntry } from '../../types';
import { createEmptyValidation } from '../../utils';
import AudioDirectorSectionHeader from '../AudioDirectorSectionHeader';

type Props = {
  items: AudioPoiDraft[];
  coreLanguage: string;
  scriptEnhancementEnabled: boolean;
  scriptEnhancementLimit: ScriptEnhancementLimit;
  activeEnhancementEntries: Record<string, EnhancementEntry>;
  isGenerating: boolean;
  isEnhancing: boolean;
  generationError: string | null;
  getItemSettings: (item: AudioPoiDraft) => AudioGuideSettings;
  onCueDensityChange: (limit: ScriptEnhancementLimit) => void;
  onEnhanceAll: (forceRegenerate?: boolean) => void;
  onChangeEnhancedScript: (language: string, item: AudioPoiDraft, nextText: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

export default function ScriptPolishScreen(props: Props) {
  const {
    items,
    coreLanguage,
    scriptEnhancementEnabled,
    scriptEnhancementLimit,
    activeEnhancementEntries,
    isGenerating,
    isEnhancing,
    generationError,
    getItemSettings,
    onCueDensityChange,
    onEnhanceAll,
    onChangeEnhancedScript,
    onBack,
    onContinue,
  } = props;

  const hasEnhancement = Object.keys(activeEnhancementEntries).length > 0;

  return (
    <Stack spacing={3}>
      <Card sx={audioDirectorStyles.sectionCard}>
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack spacing={2.5}>
            <AudioDirectorSectionHeader
              icon={<AutoAwesomeIcon />}
              title="Polish the performance script"
              body="Generate performance cues, review the result, and edit anything before audio generation."
              eyebrow="Script Tuning"
            />

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip label={`Language: ${langLabel(coreLanguage)}`} variant="outlined" />
            </Stack>

            {generationError ? (
              <Alert severity="error">
                {generationError}
              </Alert>
            ) : null}

            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }}>
              <FormControl fullWidth sx={{ maxWidth: { lg: 320 } }}>
                <InputLabel id="script-polish-screen-cue-density-label">Performance cue density</InputLabel>
                <Select
                  labelId="script-polish-screen-cue-density-label"
                  label="Performance cue density"
                  value={scriptEnhancementLimit}
                  onChange={(event) => onCueDensityChange(event.target.value as ScriptEnhancementLimit)}
                >
                  {SCRIPT_ENHANCEMENT_OPTIONS.map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                variant="outlined"
                startIcon={isEnhancing ? <RefreshIcon /> : hasEnhancement ? <RefreshIcon /> : <AutoAwesomeIcon />}
                onClick={() => onEnhanceAll(hasEnhancement)}
                disabled={!scriptEnhancementEnabled || isGenerating || isEnhancing}
              >                {isEnhancing
                  ? 'Enhancing…'
                  : hasEnhancement
                    ? 'Regenerate'
                    : 'Enhance Script'}
              </Button>
            </Stack>

            <Alert severity={scriptEnhancementEnabled ? 'info' : 'warning'}>
              {!scriptEnhancementEnabled
                ? 'Cue density is off. Audio generation will use the original script directly.'
                : hasEnhancement
                  ? 'Cue density is active and any polished-script edits below will be used during audio generation.'
                  : 'Cue density is active, but you still need to run the cue pass before audio generation can use a polished script.'}
            </Alert>

            {items.length === 0 ? (
              <Alert severity="info">
                Add guide text first to prepare and polish your script.
              </Alert>
            ) : (
              <Stack spacing={1.5}>
                {items.map((item) => {
                  const settings = getItemSettings(item);
                  const entry = activeEnhancementEntries[item.spotId];
                  const displayText = entry?.enhancedText ?? item.scriptText ?? '';
                  const validation = entry?.validation ?? createEmptyValidation();

                  return (
                    <Paper
                      key={`${coreLanguage}-${item.spotId}`}
                      elevation={0}
                      sx={audioDirectorStyles.nestedPanel}
                    >
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {item.spotNumber}. {item.title}
                          </Typography>

                          {scriptEnhancementEnabled && (entry?.enhancedText || !validation.isValid) ? (
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {validation.totalTags > 0 ? (
                                <Chip label={`${validation.totalTags} cue tag${validation.totalTags === 1 ? '' : 's'}`} variant="outlined" size="small" />
                              ) : null}
                              {!validation.isValid ? (
                                <Chip label="Needs tag cleanup" color="warning" size="small" />
                              ) : null}
                              {entry?.isEdited ? (
                                <Chip label="Edited" color="primary" size="small" />
                              ) : null}
                            </Stack>
                          ) : null}
                        </Stack>

                        {items.length > 1 ? (
                          <TextField
                            label="Original Script"
                            multiline
                            minRows={3}
                            value={item.scriptText ?? ''}
                            InputProps={{ readOnly: true }}
                          />
                        ) : null}

                        <TextField
                          label="Performance Script"
                          multiline
                          minRows={5}
                          value={displayText}
                          onChange={(event) => onChangeEnhancedScript(coreLanguage, item, event.target.value)}
                          disabled={!scriptEnhancementEnabled}
                          helperText={scriptEnhancementEnabled
                            ? describeScriptEnhancementLimit(settings.scriptEnhancementLimit)
                            : 'Set cue density above to Light or Expressive to edit this field.'}
                        />

                        {!validation.isValid ? (
                          <Alert severity="warning">
                            {validation.issues.map((issue) => (
                              <Typography key={`${item.spotId}-${issue.index}`} variant="body2">
                                {issue.message} {issue.excerpt}
                              </Typography>
                            ))}
                          </Alert>
                        ) : null}

                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}>
          Back to Guide Settings
        </Button>
        <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={onContinue}>
          Jump to Audio Production
        </Button>
      </Stack>
    </Stack>
  );
}
