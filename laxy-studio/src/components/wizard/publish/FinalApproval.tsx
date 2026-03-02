// ---------------------------------------------------------------------------
// FinalApproval — summary page with spot overview + publish action
// ---------------------------------------------------------------------------
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Fade,
  alpha,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PublishIcon from '@mui/icons-material/Publish';
import GavelIcon from '@mui/icons-material/Gavel';
import { useGuidesStore } from '../../../guidesStore';

interface FinalApprovalProps {
  onPublish: () => void;
  publishing: boolean;
  allReady: boolean;
}

export default function FinalApproval({
  onPublish,
  publishing,
  allReady,
}: FinalApprovalProps) {
  const spots = useGuidesStore((s) => s.spots);
  const scripts = useGuidesStore((s) => s.scripts);
  const audioFiles = useGuidesStore((s) => s.audioFiles);
  const srtFiles = useGuidesStore((s) => s.srtFiles);
  const slideshows = useGuidesStore((s) => s.slideshows);
  const venueName = useGuidesStore((s) => s.entityConfig.venueName);
  const supportedLanguages = useGuidesStore((s) => s.entityConfig.supportedLanguages);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <GavelIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={700}>
          Final Approval
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Review the summary below. Once satisfied, approve and publish your guide.
      </Typography>

      {/* Summary stats */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          mb: 3,
        }}
      >
        <Paper
          sx={{
            p: 2,
            flex: '1 1 140px',
            textAlign: 'center',
            bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
          }}
        >
          <Typography variant="h4" fontWeight={700} color="primary">
            {spots.length}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Spots
          </Typography>
        </Paper>
        <Paper
          sx={{
            p: 2,
            flex: '1 1 140px',
            textAlign: 'center',
            bgcolor: (t) => alpha(t.palette.success.main, 0.06),
          }}
        >
          <Typography variant="h4" fontWeight={700} color="success.main">
            {supportedLanguages.length}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Languages
          </Typography>
        </Paper>
        <Paper
          sx={{
            p: 2,
            flex: '1 1 140px',
            textAlign: 'center',
            bgcolor: (t) => alpha(t.palette.info.main, 0.06),
          }}
        >
          <Typography variant="h4" fontWeight={700} color="info.main">
            {audioFiles.length}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Audio Files
          </Typography>
        </Paper>
        <Paper
          sx={{
            p: 2,
            flex: '1 1 140px',
            textAlign: 'center',
            bgcolor: (t) => alpha(t.palette.warning.main, 0.06),
          }}
        >
          <Typography variant="h4" fontWeight={700} color="warning.main">
            {srtFiles.length}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            SRT Files
          </Typography>
        </Paper>
      </Box>

      {/* Spot summary table */}
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Spot</TableCell>
              <TableCell>Script</TableCell>
              <TableCell align="center">Images</TableCell>
              <TableCell align="center">Audio</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {spots.map((spot) => {
              const script = scripts.find((s) => s.spotId === spot.id);
              const slideshow = slideshows.find((ss) => ss.spotId === spot.id);
              return (
                <TableRow key={spot.id}>
                  <TableCell>
                    <Chip
                      label={spot.spotNumber}
                      size="small"
                      color="primary"
                      sx={{ fontWeight: 700, minWidth: 28 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {spot.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {spot.artist}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                      {script
                        ? `${script.scriptText.slice(0, 80)}…`
                        : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={slideshow?.images.length ?? 0}
                      size="small"
                      variant="outlined"
                      color={
                        slideshow && slideshow.images.length > 0
                          ? 'success'
                          : 'default'
                      }
                    />
                  </TableCell>
                  <TableCell align="center">
                    {audioFiles.length > 0 ? (
                      <CheckCircleOutlineIcon
                        color="success"
                        sx={{ fontSize: 18 }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        —
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Publish action */}
      <Paper
        sx={{
          p: 3,
          bgcolor: (t) =>
            alpha(
              allReady ? t.palette.success.main : t.palette.warning.main,
              0.08,
            ),
          borderLeft: 4,
          borderColor: allReady ? 'success.main' : 'warning.main',
          textAlign: 'center',
        }}
      >
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          {venueName || 'Guide'} — Publish
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {allReady
            ? 'All checklist items are complete. Ready to publish!'
            : 'Some checklist items are incomplete. Resolve them before publishing.'}
        </Typography>
        <Button
          variant="contained"
          color="success"
          size="large"
          startIcon={
            publishing ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              <PublishIcon />
            )
          }
          disabled={!allReady || publishing}
          onClick={onPublish}
        >
          {publishing ? 'Publishing…' : 'Approve & Publish'}
        </Button>
      </Paper>
    </Box>
  );
}
