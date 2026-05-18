import { useMemo } from 'react';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CONTENT_VERSION_OPTIONS,
  SCRIPT_ENHANCEMENT_OPTIONS,
  describeScriptEnhancementLimit,
  type AudioGuideSettings,
  type AudioMvpCharacter,
  type AudioMvpVoice,
  type ContentVersion,
  type ScriptEnhancementLimit,
  type VoiceRecommendation,
} from '../../../audioMvp/model';
import type { SaveStatus } from '../../types';
import { audioDirectorStyles } from '../../theme';
import AudioDirectorSectionHeader from '../AudioDirectorSectionHeader';

type Props = {
  globalSettings: AudioGuideSettings;
  selectedCharacter: AudioMvpCharacter;
  selectedVoice: AudioMvpVoice;
  globalRecommendation: VoiceRecommendation;
  estimatedTokens: number;
  saveStatus: SaveStatus;
  saveMessage: string | null;
  onOpenConfigPreview: () => void;
  onDownloadConfig: () => void;
  onSaveDraft: () => void;
  onOpenAdvancedEditor: () => void;
  onContentVersionChange: (contentVersion: ContentVersion) => void;
  onScriptEnhancementLimitChange: (limit: ScriptEnhancementLimit) => void;
  onDirectorNoteFieldChange: (field: 'scene' | 'style' | 'pacing', value: string) => void;
};

export default function DirectorNoteSection(props: Props) {
  const {
    globalSettings,
    selectedCharacter,
    selectedVoice,
    globalRecommendation,
    estimatedTokens,
    saveStatus,
    saveMessage,
    onOpenConfigPreview,
    onDownloadConfig,
    onSaveDraft,
    onOpenAdvancedEditor,
    onContentVersionChange,
    onScriptEnhancementLimitChange,
    onDirectorNoteFieldChange,
  } = props;

  const contentVersionLabel = useMemo(
    () => CONTENT_VERSION_OPTIONS.find((option) => option.id === globalSettings.contentVersion)?.label ?? globalSettings.contentVersion,
    [globalSettings.contentVersion],
  );
  const enhancementLimitLabel = useMemo(
    () => SCRIPT_ENHANCEMENT_OPTIONS.find((option) => option.id === globalSettings.scriptEnhancementLimit)?.label ?? globalSettings.scriptEnhancementLimit,
    [globalSettings.scriptEnhancementLimit],
  );

  return (
    <Card sx={audioDirectorStyles.sectionCard}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-end' }}>
            <AudioDirectorSectionHeader
              icon={<TuneIcon />}
              title="Director note"
              body="Shape the scene, style, and pacing before the script goes to generation."
              eyebrow="Center column"
            />

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button variant="outlined" size="small" startIcon={<CodeOutlinedIcon />} onClick={onOpenConfigPreview}>
                Preview prompt
              </Button>
              <Button variant="outlined" size="small" startIcon={<DownloadOutlinedIcon />} onClick={onDownloadConfig}>
                Download prompt
              </Button>
              <Button variant="contained" size="small" startIcon={<SaveOutlinedIcon />} onClick={onSaveDraft} disabled={saveStatus === 'saving'}>
                {saveStatus === 'saving' ? 'Saving snapshot…' : 'Create snapshot'}
              </Button>
            </Stack>
          </Stack>

          {saveMessage ? (
            <Alert severity={saveStatus === 'error' ? 'error' : 'success'}>
              {saveMessage}
            </Alert>
          ) : null}

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
            <PaperSummary label="Character" value={selectedCharacter.name} detail={selectedCharacter.role} />
            <PaperSummary label="Voice" value={selectedVoice.name} detail={selectedVoice.summary} />
          </Box>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
            <FormControl fullWidth>
              <InputLabel id="content-version-label">Narration style</InputLabel>
              <Select
                labelId="content-version-label"
                label="Narration style"
                value={globalSettings.contentVersion}
                onChange={(event) => onContentVersionChange(event.target.value as ContentVersion)}
              >
                {CONTENT_VERSION_OPTIONS.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="enhancement-limit-label">Performance cue density</InputLabel>
              <Select
                labelId="enhancement-limit-label"
                label="Performance cue density"
                value={globalSettings.scriptEnhancementLimit}
                onChange={(event) => onScriptEnhancementLimitChange(event.target.value as ScriptEnhancementLimit)}
              >
                {SCRIPT_ENHANCEMENT_OPTIONS.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Stack spacing={2}>
            <TextField
              label="Scene"
              multiline
              minRows={3}
              value={globalSettings.directorNote.scene}
              onChange={(event) => onDirectorNoteFieldChange('scene', event.target.value)}
              helperText="Set the environment, context, or narrative frame."
            />
            <TextField
              label="Style"
              multiline
              minRows={3}
              value={globalSettings.directorNote.style}
              onChange={(event) => onDirectorNoteFieldChange('style', event.target.value)}
              helperText="Describe tone, pacing style, and delivery expectations."
            />
            <TextField
              label="Pacing"
              multiline
              minRows={3}
              value={globalSettings.directorNote.pacing}
              onChange={(event) => onDirectorNoteFieldChange('pacing', event.target.value)}
              helperText="Describe rhythm, pauses, energy, and emphasis."
            />
          </Stack>

          <PaperSummary
            label="Settings summary"
            value={`${contentVersionLabel} · ${enhancementLimitLabel}`}
            detail={describeScriptEnhancementLimit(globalSettings.scriptEnhancementLimit)}
          />

          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
            <Chip label={`Recommended voice: ${globalRecommendation.recommendedVoiceId}`} variant="outlined" />
            <Chip label={`${estimatedTokens.toLocaleString()} est. tokens`} color="secondary" />
            <Button variant="outlined" onClick={onOpenAdvancedEditor} startIcon={<EditOutlinedIcon />}>
              Open advanced editor
            </Button>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PaperSummary(props: { label: string; value: string; detail: string }) {
  const { label, value, detail } = props;

  return (
    <Box sx={audioDirectorStyles.nestedPanel}>
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>
          {label}
        </Typography>
        <Typography variant="subtitle2" fontWeight={700}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
      </Stack>
    </Box>
  );
}
