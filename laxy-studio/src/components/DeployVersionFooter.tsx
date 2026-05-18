import { Box, Typography } from '@mui/material';
import { appBuildVersion, formatBuildVersion } from '../buildInfo';

type Props = {
  align?: 'left' | 'center' | 'right';
  compact?: boolean;
};

export default function DeployVersionFooter({ align = 'right', compact = false }: Props) {
  const label = formatBuildVersion(appBuildVersion);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end',
        pt: compact ? 1.5 : 2,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          px: 1.5,
          py: 0.75,
          borderRadius: 999,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          fontFamily: 'monospace',
          letterSpacing: '0.02em',
        }}
      >
        Deploy version: {label}
      </Typography>
    </Box>
  );
}
