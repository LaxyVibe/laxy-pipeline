import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

type PromptPreviewRequest = {
  spotId?: string;
  spotNumber?: number;
  title?: string;
  geminiRequestSource?: {
    contents?: string;
  };
};

type PromptPreviewPayload = {
  requests?: PromptPreviewRequest[];
};

type Props = {
  open: boolean;
  payload: unknown;
  onClose: () => void;
  onDownload: () => void;
};

function getPromptRequests(payload: unknown): PromptPreviewRequest[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const requests = (payload as PromptPreviewPayload).requests;
  if (!Array.isArray(requests)) {
    return [];
  }

  return requests.filter(
    (request) => typeof request?.geminiRequestSource?.contents === 'string' && request.geminiRequestSource.contents.trim(),
  );
}

export default function ConfigPreviewDialog(props: Props) {
  const { open, payload, onClose, onDownload } = props;
  const promptRequests = getPromptRequests(payload);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack>
          <Typography variant="h6">Gemini Prompt Preview</Typography>
          <Typography variant="body2" color="text.secondary">
            Review the exact prompt string sent to Gemini TTS. Download still includes the full request bundle.
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {promptRequests.map((request, index) => {
            const title = request.title?.trim() || 'Script';
            const label = request.spotNumber
              ? `${request.spotNumber}. ${title}`
              : title;

            return (
              <TextField
                key={request.spotId ?? `${label}-${index}`}
                label={label}
                multiline
                minRows={12}
                fullWidth
                value={request.geminiRequestSource?.contents ?? ''}
                InputProps={{ readOnly: true }}
              />
            );
          })}

          {promptRequests.length === 0 ? (
            <TextField
              label="Gemini Request Source"
              multiline
              minRows={24}
              fullWidth
              value={JSON.stringify(payload, null, 2)}
              InputProps={{ readOnly: true }}
            />
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={onDownload}>
          Download JSON
        </Button>
      </DialogActions>
    </Dialog>
  );
}
