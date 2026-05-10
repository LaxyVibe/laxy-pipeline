import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { audioDirectorStyles } from '../theme';

type Props = {
  icon: ReactNode;
  title: string;
  body: string;
  eyebrow?: string;
};

export default function AudioDirectorSectionHeader(props: Props) {
  const { icon, title, body, eyebrow } = props;

  return (
    <Stack spacing={1}>
      {eyebrow ? (
        <Typography variant="overline" sx={{ letterSpacing: '0.18em', color: 'text.secondary' }}>
          {eyebrow}
        </Typography>
      ) : null}

      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={audioDirectorStyles.iconBadge}>
          {icon}
        </Box>
        <Box>
          <Typography variant="h6">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {body}
          </Typography>
        </Box>
      </Stack>
    </Stack>
  );
}
