// ---------------------------------------------------------------------------
// HistoryDrawer — timeline of all API interactions
// ---------------------------------------------------------------------------
import {
  Box,
  Drawer,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  IconButton,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import CloseIcon from '@mui/icons-material/Close';
import { usePipelineStore } from '../store';
import { getExecutedNodes, getLastStatus } from '../api';

interface Props {
  open: boolean;
  onClose: () => void;
}

function actionIcon(action: string) {
  switch (action) {
    case 'start':
      return <PlayArrowIcon color="primary" />;
    case 'approve':
      return <ThumbUpIcon color="success" />;
    case 'reject':
      return <ThumbDownIcon color="error" />;
    default:
      return <PlayArrowIcon />;
  }
}

export default function HistoryDrawer({ open, onClose }: Props) {
  const history = usePipelineStore((s) => s.history);

  return (
    <Drawer anchor="right" open={open} onClose={onClose} sx={{ '& .MuiDrawer-paper': { width: 420, p: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">Interaction History</Typography>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </Box>
      {history.length === 0 ? (
        <Typography color="text.secondary">No interactions yet.</Typography>
      ) : (
        <List dense>
          {history.map((entry, i) => {
            const nodes = getExecutedNodes(entry.response);
            const status = getLastStatus(entry.response);
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return (
              <ListItem key={i} sx={{ alignItems: 'flex-start', mb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <ListItemIcon sx={{ mt: 0.5 }}>{actionIcon(entry.action)}</ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
                        {entry.action}
                      </Typography>
                      <Chip
                        label={status}
                        size="small"
                        color={status === 'FINISHED' ? 'success' : status === 'STOPPED' ? 'warning' : 'info'}
                        variant="outlined"
                      />
                      <Typography variant="caption" color="text.disabled">{time}</Typography>
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {nodes.join(' → ')}
                    </Typography>
                  }
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </Drawer>
  );
}
