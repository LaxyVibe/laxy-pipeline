// ---------------------------------------------------------------------------
// AudioGenerationPanel — language selector, token estimate, generate button
// ---------------------------------------------------------------------------
import { Box, Typography, Chip, Button, LinearProgress, Paper } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { SUPPORTED_LANGUAGES } from '../../../types/entity';

interface AudioGenerationPanelProps {
  selectedLanguages: string[];
  /** Language codes the user configured in entity setup */
  availableLanguages: string[];
  onToggleLanguage: (lang: string) => void;
  onGenerate: () => void;
  generating: boolean;
  progress: number; // 0-100
  estimatedTokens: number;
}

export default function AudioGenerationPanel({
  selectedLanguages,
  availableLanguages,
  onToggleLanguage,
  onGenerate,
  generating,
  progress,
  estimatedTokens,
}: AudioGenerationPanelProps) {
  // Only show languages the user configured in entity setup
  const languages = SUPPORTED_LANGUAGES.filter((l) =>
    availableLanguages.includes(l.code),
  );
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        Audio Generation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Select languages to generate audio for, then click Generate.
      </Typography>

      {/* Language chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {languages.map((lang) => {
          const isSelected = selectedLanguages.includes(lang.code);
          return (
            <Chip
              key={lang.code}
              label={lang.label}
              onClick={() => onToggleLanguage(lang.code)}
              color={isSelected ? 'primary' : 'default'}
              variant={isSelected ? 'filled' : 'outlined'}
              icon={
                isSelected ? (
                  <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
                ) : undefined
              }
              sx={{ cursor: 'pointer' }}
            />
          );
        })}
      </Box>

      {/* Token estimate */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Estimated tokens:
          </Typography>
          <Chip
            label={estimatedTokens > 0 ? estimatedTokens.toLocaleString() : '—'}
            size="small"
            variant="outlined"
          />
          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
            {selectedLanguages.length} language{selectedLanguages.length !== 1 ? 's' : ''} selected
          </Typography>
        </Box>
      </Paper>

      {/* Generate button & progress */}
      {generating ? (
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Generating audio… {Math.round(progress)}%
          </Typography>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
      ) : (
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={onGenerate}
          disabled={selectedLanguages.length === 0}
          fullWidth
        >
          Generate Audio ({selectedLanguages.length} language
          {selectedLanguages.length !== 1 ? 's' : ''})
        </Button>
      )}
    </Box>
  );
}
