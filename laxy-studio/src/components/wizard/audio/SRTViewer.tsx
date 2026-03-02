// ---------------------------------------------------------------------------
// SRTViewer — preview and download SRT subtitle files
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import type { LanguageSRT } from '../../../types/entity';

interface SRTViewerProps {
  srtFiles: LanguageSRT[];
}

export default function SRTViewer({ srtFiles }: SRTViewerProps) {
  const [currentTab, setCurrentTab] = useState(0);

  if (srtFiles.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <SubtitlesIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.disabled">
          No SRT files generated yet. SRT files will appear after audio generation.
        </Typography>
      </Paper>
    );
  }

  const currentSrt = srtFiles[currentTab];

  const handleDownload = () => {
    if (!currentSrt) return;
    const blob = new Blob([currentSrt.rawSrt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitles_${currentSrt.lang}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        SRT Subtitles
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Auto-generated subtitle files synced to audio timing.
      </Typography>

      {/* Language tabs */}
      <Paper sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs
          value={currentTab}
          onChange={(_, v) => setCurrentTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {srtFiles.map((srt, idx) => (
            <Tab key={srt.lang} value={idx} label={srt.label} />
          ))}
        </Tabs>
      </Paper>

      {/* SRT table */}
      {currentSrt && (
        <>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 50, fontWeight: 700 }}>#</TableCell>
                  <TableCell sx={{ width: 200, fontWeight: 700 }}>Timing</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Text</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {currentSrt.entries.map((entry) => (
                  <TableRow key={entry.index} hover>
                    <TableCell>
                      <Chip label={entry.index} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {entry.startTime} → {entry.endTime}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{entry.text}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
          >
            Download SRT ({currentSrt.label})
          </Button>
        </>
      )}
    </Box>
  );
}
