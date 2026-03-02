// ---------------------------------------------------------------------------
// AudioPlayer — HTML5 audio player with custom MUI controls per language
// ---------------------------------------------------------------------------
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Slider,
  Tabs,
  Tab,
  Button,
  Chip,
  Paper,
  Tooltip,
  alpha,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import Forward10Icon from '@mui/icons-material/Forward10';
import Replay10Icon from '@mui/icons-material/Replay10';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import type { LanguageAudio } from '../../../types/entity';
import { useGuidesStore } from '../../../guidesStore';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface AudioPlayerProps {
  audioFiles: LanguageAudio[];
  /** Current timestamp callback for pronunciation marker */
  onTimestamp?: (sec: number) => void;
}

export default function AudioPlayer({ audioFiles, onTimestamp }: AudioPlayerProps) {
  const approveAudioLang = useGuidesStore((s) => s.approveAudioLang);
  const rejectAudioLang = useGuidesStore((s) => s.rejectAudioLang);

  const [currentTab, setCurrentTab] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);

  const currentAudio = audioFiles[currentTab];

  // Update time display
  const updateTime = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (onTimestamp) onTimestamp(audioRef.current.currentTime);
    }
    if (isPlaying) {
      animRef.current = requestAnimationFrame(updateTime);
    }
  }, [isPlaying, onTimestamp]);

  useEffect(() => {
    if (isPlaying) {
      animRef.current = requestAnimationFrame(updateTime);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, updateTime]);

  const handlePlayPause = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSkip = useCallback((delta: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(
      0,
      Math.min(audioRef.current.currentTime + delta, audioRef.current.duration || 0),
    );
    setCurrentTime(audioRef.current.currentTime);
  }, []);

  const handleSeek = useCallback((_: Event, value: number | number[]) => {
    const sec = value as number;
    if (audioRef.current) {
      audioRef.current.currentTime = sec;
      setCurrentTime(sec);
    }
  }, []);

  const handleTabChange = useCallback((_: React.SyntheticEvent, v: number) => {
    setCurrentTab(v);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  if (audioFiles.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.disabled">
          No audio files generated yet.
        </Typography>
      </Paper>
    );
  }

  // For placeholder audio (Phase 1A), show simulated player
  const hasRealAudio = currentAudio?.audioUrl && currentAudio.audioUrl.length > 0;
  const displayDuration = hasRealAudio ? duration : (currentAudio?.durationMs ?? 30000) / 1000;

  return (
    <Box>
      {/* Language tabs */}
      <Paper sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {audioFiles.map((af, idx) => (
            <Tab
              key={af.lang}
              value={idx}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {af.label}
                  {af.approved && (
                    <CheckCircleOutlineIcon
                      color="success"
                      sx={{ fontSize: 16 }}
                    />
                  )}
                </Box>
              }
            />
          ))}
        </Tabs>
      </Paper>

      {/* Hidden audio element */}
      {hasRealAudio && (
        <audio
          ref={audioRef}
          src={currentAudio.audioUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
      )}

      {/* Player controls */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.02),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <Tooltip title="Rewind 15s">
            <IconButton onClick={() => handleSkip(-15)} size="small">
              <Replay10Icon />
            </IconButton>
          </Tooltip>

          <IconButton
            onClick={handlePlayPause}
            color="primary"
            sx={{
              bgcolor: 'primary.main',
              color: 'white',
              '&:hover': { bgcolor: 'primary.dark' },
              width: 48,
              height: 48,
            }}
          >
            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>

          <Tooltip title="Forward 15s">
            <IconButton onClick={() => handleSkip(15)} size="small">
              <Forward10Icon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Progress slider */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'right' }}>
            {formatTime(currentTime)}
          </Typography>
          <Slider
            value={currentTime}
            max={displayDuration || 1}
            onChange={handleSeek}
            size="small"
            sx={{ flex: 1 }}
          />
          <Typography variant="caption" sx={{ minWidth: 40 }}>
            {formatTime(displayDuration)}
          </Typography>
        </Box>

        {/* Status & actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip
              label={currentAudio?.label}
              size="small"
              color="primary"
              variant="outlined"
            />
            {!hasRealAudio && (
              <Chip
                label="Placeholder audio (Phase 1A)"
                size="small"
                variant="outlined"
                color="warning"
              />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            {currentAudio?.approved ? (
              <Button
                size="small"
                color="warning"
                onClick={() => rejectAudioLang(currentAudio.lang)}
              >
                Un-approve
              </Button>
            ) : (
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={<CheckCircleOutlineIcon />}
                onClick={() => approveAudioLang(currentAudio.lang)}
              >
                Approve
              </Button>
            )}
            <Tooltip title="Download .mp3">
              <span>
                <IconButton
                  size="small"
                  disabled={!hasRealAudio}
                  component="a"
                  href={currentAudio?.audioUrl || '#'}
                  download
                >
                  <DownloadIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
