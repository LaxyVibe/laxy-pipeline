import type { ReactElement } from 'react';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import TuneIcon from '@mui/icons-material/Tune';
import { Box, Button, Paper } from '@mui/material';
import { audioDirectorStyles } from '../theme';
import type { WizardScreen } from '../types';
import { AUDIO_DIRECTOR_WIZARD_LABELS, AUDIO_DIRECTOR_WIZARD_STEPS } from '../wizard';

type Props = {
  current: WizardScreen;
  onNavigate: (screen: WizardScreen) => void;
  canAdvance: boolean;
};

const STEP_ICONS: Record<WizardScreen, ReactElement> = {
  'guide-settings': <TuneIcon fontSize="small" />,
  'script-polish': <AutoAwesomeIcon fontSize="small" />,
  'audio-production': <PlayCircleOutlineIcon fontSize="small" />,
};

export default function AudioDirectorWizardNav(props: Props) {
  const { current, onNavigate, canAdvance } = props;
  const currentIndex = AUDIO_DIRECTOR_WIZARD_STEPS.indexOf(current);

  return (
    <Paper elevation={0} sx={audioDirectorStyles.floatingNav}>
      {AUDIO_DIRECTOR_WIZARD_STEPS.map((step, index) => {
        const isActive = step === current;
        const isPast = currentIndex > index;
        const disabled = index > 0 && !canAdvance;

        return (
          <Box key={step} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {index > 0 && (
              <Box
                sx={{
                  width: 24,
                  height: 2,
                  borderRadius: 1,
                  bgcolor: isPast || isActive ? 'primary.main' : 'rgba(31, 43, 38, 0.16)',
                  mx: 0.5,
                }}
              />
            )}
            <Button
              size="small"
              variant={isActive ? 'contained' : 'text'}
              disabled={disabled}
              onClick={() => onNavigate(step)}
              startIcon={isPast ? <CheckCircleOutlineIcon fontSize="small" /> : STEP_ICONS[step]}
              sx={{
                borderRadius: 999,
                px: 2.5,
                py: 0.75,
                fontWeight: isActive ? 700 : 600,
                fontSize: '0.82rem',
                color: isActive ? undefined : isPast ? 'primary.main' : 'text.secondary',
                bgcolor: isActive ? undefined : 'transparent',
                boxShadow: isActive ? undefined : 'none',
                '&:hover': { bgcolor: isActive ? undefined : 'rgba(31, 92, 79, 0.08)' },
              }}
            >
              {AUDIO_DIRECTOR_WIZARD_LABELS[step]}
            </Button>
          </Box>
        );
      })}
    </Paper>
  );
}
