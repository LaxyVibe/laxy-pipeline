import { Box, Typography } from '@mui/material';
import { audioDirectorStyles } from '../theme';

export default function AudioDirectorHero() {
  return (
    <Box
      sx={{
        ...audioDirectorStyles.hero,
        px: { xs: 3, md: 4 },
        py: { xs: 3.5, md: 4.5 },
      }}
    >
      <Typography variant="h3" sx={{ color: 'inherit' }}>
        Audio Director
      </Typography>
    </Box>
  );
}
