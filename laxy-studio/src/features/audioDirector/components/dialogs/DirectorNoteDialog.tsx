import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CONTENT_VERSION_OPTIONS,
  SCRIPT_ENHANCEMENT_OPTIONS,
  SCRIPT_TAG_WHITELIST,
  type AudioGuideSettings,
  type ContentVersion,
  type ScriptEnhancementLimit,
} from '../../../audioMvp/model';

type Props = {
  open: boolean;
  settings: AudioGuideSettings;
  compiledPrompt: string;
  directorNotePrompt: string;
  hasScript: boolean;
  isGenerating: boolean;
  onClose: () => void;
  onContentVersionChange: (contentVersion: ContentVersion) => void;
  onScriptEnhancementLimitChange: (limit: ScriptEnhancementLimit) => void;
  onDirectorNotePromptChange: (value: string) => void;
  onGenerate: () => void;
  onSceneChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onPacingChange: (value: string) => void;
  onCompiledPromptChange: (value: string) => void;
};

export default function DirectorNoteDialog(props: Props) {
  const {
    open,
    settings,
    compiledPrompt,
    directorNotePrompt,
    hasScript,
    isGenerating,
    onClose,
    onContentVersionChange,
    onScriptEnhancementLimitChange,
    onDirectorNotePromptChange,
    onGenerate,
    onSceneChange,
    onStyleChange,
    onPacingChange,
    onCompiledPromptChange,
  } = props;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack>
          <Typography variant="h6">Director Note</Typography>
          <Typography variant="body2" color="text.secondary">
            Shape the scene, delivery style, and pacing that guide the narration pass.
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              select
              label="Content Version"
              value={settings.contentVersion}
              onChange={(event) => onContentVersionChange(event.target.value as ContentVersion)}
              fullWidth
            >
              {CONTENT_VERSION_OPTIONS.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.label} - {option.summary}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Script Enhancement Limit"
              value={settings.scriptEnhancementLimit}
              onChange={(event) => onScriptEnhancementLimitChange(event.target.value as ScriptEnhancementLimit)}
              fullWidth
            >
              {SCRIPT_ENHANCEMENT_OPTIONS.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.label} - {option.summary}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" gutterBottom>
              Generate with AI
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
              <TextField
                placeholder="Describe the venue, occasion, or mood. Example: quiet Buddhist temple in Kyoto, serene morning atmosphere."
                value={directorNotePrompt}
                onChange={(event) => onDirectorNotePromptChange(event.target.value)}
                multiline
                minRows={2}
                maxRows={4}
                fullWidth
                size="small"
                helperText="AudioDirector will generate scene, style, and pacing from this context."
                disabled={isGenerating}
              />
              <Button
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                onClick={onGenerate}
                disabled={isGenerating || !hasScript}
                sx={{ minWidth: 140, whiteSpace: 'nowrap' }}
              >
                {isGenerating ? 'Generating…' : 'Generate'}
              </Button>
            </Stack>
          </Box>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {SCRIPT_TAG_WHITELIST.map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Scene"
              helperText="Physical and emotional setting for the narration."
              multiline
              minRows={4}
              value={settings.directorNote.scene}
              onChange={(event) => onSceneChange(event.target.value)}
              fullWidth
            />
            <TextField
              label="Style"
              helperText="What should the narration achieve and feel like?"
              multiline
              minRows={4}
              value={settings.directorNote.style}
              onChange={(event) => onStyleChange(event.target.value)}
              fullWidth
            />
            <TextField
              label="Pacing & Energy"
              helperText="Speed, rhythm, and energy level."
              multiline
              minRows={4}
              value={settings.directorNote.pacing}
              onChange={(event) => onPacingChange(event.target.value)}
              fullWidth
            />
          </Stack>

          <TextField
            label="Narration Direction"
            multiline
            minRows={12}
            value={compiledPrompt}
            onChange={(event) => onCompiledPromptChange(event.target.value)}
            helperText="Refine the final narration direction that will guide the generated performance."
            fullWidth
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
