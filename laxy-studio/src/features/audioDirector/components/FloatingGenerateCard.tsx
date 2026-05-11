import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { Fab } from '@mui/material';

type Props = {
  isGenerating: boolean;
  disabled?: boolean;
  onGenerate: () => void;
};

export default function FloatingGenerateCard(props: Props) {
  const { isGenerating, disabled = false, onGenerate } = props;

  return (
    <Fab
      color="primary"
      variant="extended"
      onClick={onGenerate}
      disabled={disabled || isGenerating}
      sx={{
        position: 'fixed',
        right: { xs: 16, md: 24 },
        bottom: { xs: 16, md: 24 },
        zIndex: (theme) => theme.zIndex.speedDial,
      }}
    >
      <PlayCircleOutlineIcon sx={{ mr: 1 }} />
      {isGenerating ? 'Generating…' : 'Generate audio'}
    </Fab>
  );
}
