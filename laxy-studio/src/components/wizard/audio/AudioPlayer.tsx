// ---------------------------------------------------------------------------
// AudioPlayer — HTML5 audio player with custom MUI controls per language
// Supports multiple spots (scripts) per language via a playlist.
// ---------------------------------------------------------------------------
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  alpha,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import Forward10Icon from '@mui/icons-material/Forward10';
import Replay10Icon from '@mui/icons-material/Replay10';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import type { LanguageAudio, SpotAudioFile } from '../../../types/entity';
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
  const [currentSpotIdx, setCurrentSpotIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);

  const currentAudio = audioFiles[currentTab];

  // Derive the spots list for the current language. Falls back to a single
  // entry built from the top-level audioUrl when no spots array is present.
  const spots: SpotAudioFile[] = useMemo(() => {
    if (!currentAudio) return [];
    if (currentAudio.spots && currentAudio.spots.length > 0) return currentAudio.spots;
    // Backwards compat: synthesize a single spot entry
    return [
      {
        spotId: '__single__',
        spotNumber: 1,
        title: currentAudio.label,
        audioUrl: currentAudio.audioUrl,
        durationMs: currentAudio.durationMs,
      },
    ];
  }, [currentAudio]);

  const hasMultipleSpots = spots.length > 1;
  const activeSpot = spots[currentSpotIdx] ?? spots[0];
  const activeSpotUrl = activeSpot?.audioUrl ?? '';
  const hasRealAudio = activeSpotUrl.length > 0;
  const spotDurationSec = hasRealAudio ? duration : (activeSpot?.durationMs ?? 30000) / 1000;

  // Reset spot index when language tab changes
  useEffect(() => {
    setCurrentSpotIdx(0);
  }, [currentTab]);

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

  const resetPlayback = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

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
    resetPlayback();
  }, [resetPlayback]);

  const handleSpotChange = useCallback((idx: number) => {
    setCurrentSpotIdx(idx);
    resetPlayback();
  }, [resetPlayback]);

  const handlePrevSpot = useCallback(() => {
    if (currentSpotIdx > 0) handleSpotChange(currentSpotIdx - 1);
  }, [currentSpotIdx, handleSpotChange]);

  const handleNextSpot = useCallback(() => {
    if (currentSpotIdx < spots.length - 1) handleSpotChange(currentSpotIdx + 1);
  }, [currentSpotIdx, spots.length, handleSpotChange]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    // Auto-advance to next spot
    if (currentSpotIdx < spots.length - 1) {
      setCurrentSpotIdx((prev) => prev + 1);
      setCurrentTime(0);
      setDuration(0);
      // The audio element will re-mount via key change, so we
      // start playback after a short tick.
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
        setIsPlaying(true);
      }, 100);
    }
  }, [currentSpotIdx, spots.length]);

  if (audioFiles.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.disabled">
          No audio files generated yet.
        </Typography>
      </Paper>
    );
  }

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

      {/* Spot playlist — shown when the language has multiple spots */}
      {hasMultipleSpots && (
        <Paper variant="outlined" sx={{ mb: 1, maxHeight: 200, overflow: 'auto' }}>
          <List dense disablePadding>
            {spots.map((spot, idx) => (
              <ListItemButton
                key={spot.spotId}
                selected={idx === currentSpotIdx}
                onClick={() => handleSpotChange(idx)}
                sx={{
                  py: 0.5,
                  ...(idx === currentSpotIdx && {
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
                  }),
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {idx === currentSpotIdx && isPlaying ? (
                    <GraphicEqIcon color="primary" sx={{ fontSize: 18 }} />
                  ) : (
                    <Chip
                      label={spot.spotNumber}
                      size="small"
                      sx={{ height: 20, minWidth: 20, fontSize: 11 }}
                    />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={spot.title || `Spot ${spot.spotNumber}`}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                  secondary={formatTime(spot.durationMs / 1000)}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {/* Hidden audio element — key forces re-mount when language/spot changes */}
      {hasRealAudio && (
        <audio
          key={`${currentAudio.lang}-${activeSpot?.spotId}`}
          ref={audioRef}
          src={activeSpotUrl}
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
          {/* Prev spot (only when multi-spot) */}
          {hasMultipleSpots && (
            <Tooltip title="Previous spot">
              <span>
                <IconButton onClick={handlePrevSpot} size="small" disabled={currentSpotIdx === 0}>
                  <SkipPreviousIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}

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

          {/* Next spot (only when multi-spot) */}
          {hasMultipleSpots && (
            <Tooltip title="Next spot">
              <span>
                <IconButton onClick={handleNextSpot} size="small" disabled={currentSpotIdx >= spots.length - 1}>
                  <SkipNextIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>

        {/* Progress slider */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'right' }}>
            {formatTime(currentTime)}
          </Typography>
          <Slider
            value={currentTime}
            max={spotDurationSec || 1}
            onChange={handleSeek}
            size="small"
            sx={{ flex: 1 }}
          />
          <Typography variant="caption" sx={{ minWidth: 40 }}>
            {formatTime(spotDurationSec)}
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
            {hasMultipleSpots && (
              <Chip
                label={`${currentSpotIdx + 1} / ${spots.length}`}
                size="small"
                variant="outlined"
              />
            )}
            {!hasRealAudio && (
              <Chip
                label="No audio URL"
                size="small"
                variant="outlined"
                color="error"
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
                  href={activeSpotUrl || '#'}
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
