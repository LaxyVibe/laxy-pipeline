import { Box, Typography } from '@mui/material';
import { audioDirectorStyles } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
};

export default function AudioDirectorHero(props: Props) {
  const { title, subtitle } = props;

  return (
    <Box
      sx={{
        ...audioDirectorStyles.hero,
        px: { xs: 2, md: 2.5 },
        py: { xs: 1.5, md: 1.75 },
        borderRadius: '18px',
      }}
    >
      <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.72, letterSpacing: '0.14em', display: 'block' }}>
        Audio Director
      </Typography>
      <Typography variant="h6" sx={{ color: 'inherit', mt: 0.35, fontWeight: 700, lineHeight: 1.2 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.82, mt: 0.4, display: 'block' }}>
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}
