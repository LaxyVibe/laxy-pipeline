// ---------------------------------------------------------------------------
// SlideshowBuilder — per-spot image timeline editor for publishing
// ---------------------------------------------------------------------------
import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Chip,
  IconButton,
  Button,
  Tooltip,
  Slider,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  alpha,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import { useGuidesStore } from '../../../guidesStore';
import type { SpotSlideshow, SlideshowImage } from '../../../types/entity';

// ── Single spot slideshow card ──

interface SpotSlideshowCardProps {
  slideshow: SpotSlideshow;
}

function SpotSlideshowCard({ slideshow }: SpotSlideshowCardProps) {
  const assets = useGuidesStore((s) => s.assets);
  const updateSlideshow = useGuidesStore((s) => s.updateSlideshow);

  const [expanded, setExpanded] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const imageAssets = useMemo(
    () => assets.filter((a) => a.fileType === 'image'),
    [assets],
  );

  const assignedAssetIds = useMemo(
    () => new Set(slideshow.images.map((img) => img.assetId)),
    [slideshow.images],
  );

  const handleAddImages = useCallback(() => {
    const audioDur = slideshow.audioDurationSec || 30;
    const existingCount = slideshow.images.length;
    const newImages: SlideshowImage[] = selectedAssetIds.map((assetId, idx) => {
      const order = existingCount + idx;
      const segmentDur = audioDur / (existingCount + selectedAssetIds.length);
      return {
        assetId,
        order,
        startSec: order * segmentDur,
        durationSec: segmentDur,
        caption: '',
      };
    });
    const all = [...slideshow.images, ...newImages];
    // Recalculate even timing
    const evenDur = audioDur / all.length;
    const recalculated = all.map((img, idx) => ({
      ...img,
      order: idx,
      startSec: idx * evenDur,
      durationSec: evenDur,
    }));
    updateSlideshow(slideshow.spotId, recalculated);
    setAddDialogOpen(false);
    setSelectedAssetIds([]);
  }, [slideshow, selectedAssetIds, updateSlideshow]);

  const handleRemoveImage = useCallback(
    (assetId: string) => {
      const filtered = slideshow.images.filter((img) => img.assetId !== assetId);
      const audioDur = slideshow.audioDurationSec || 30;
      const recalculated =
        filtered.length > 0
          ? filtered.map((img, idx) => ({
              ...img,
              order: idx,
              startSec: idx * (audioDur / filtered.length),
              durationSec: audioDur / filtered.length,
            }))
          : [];
      updateSlideshow(slideshow.spotId, recalculated);
    },
    [slideshow, updateSlideshow],
  );

  const handleMoveImage = useCallback(
    (assetId: string, direction: -1 | 1) => {
      const idx = slideshow.images.findIndex((img) => img.assetId === assetId);
      if (idx < 0) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= slideshow.images.length) return;
      const arr = [...slideshow.images];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      const audioDur = slideshow.audioDurationSec || 30;
      const recalculated = arr.map((img, i) => ({
        ...img,
        order: i,
        startSec: i * (audioDur / arr.length),
        durationSec: audioDur / arr.length,
      }));
      updateSlideshow(slideshow.spotId, recalculated);
    },
    [slideshow, updateSlideshow],
  );

  const handleTimingChange = useCallback(
    (assetId: string, durationSec: number) => {
      const updated = slideshow.images.map((img) =>
        img.assetId === assetId ? { ...img, durationSec } : img,
      );
      // Recalculate start times
      let cumStart = 0;
      const recalculated = updated.map((img) => {
        const result = { ...img, startSec: cumStart };
        cumStart += img.assetId === assetId ? durationSec : img.durationSec;
        return result;
      });
      updateSlideshow(slideshow.spotId, recalculated);
    },
    [slideshow, updateSlideshow],
  );

  const getAssetName = (assetId: string) =>
    assets.find((a) => a.id === assetId)?.name ?? assetId;

  const getAssetPreview = (assetId: string) =>
    assets.find((a) => a.id === assetId)?.previewUrl;

  return (
    <Card
      sx={{
        mb: 2,
        borderLeft: 4,
        borderColor: slideshow.images.length > 0 ? 'success.main' : 'warning.main',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          pt: 1.5,
          pb: 0.5,
          gap: 1,
        }}
      >
        <Chip
          label={`#${slideshow.spotNumber}`}
          size="small"
          color="primary"
          sx={{ fontWeight: 700, minWidth: 36 }}
        />
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          {slideshow.title}
        </Typography>
        <Chip
          label={`${slideshow.images.length} image${slideshow.images.length !== 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
        />
        <Chip
          label={`${Math.round(slideshow.audioDurationSec)}s audio`}
          size="small"
          variant="outlined"
          color="info"
        />
        <IconButton
          size="small"
          onClick={() => setExpanded(!expanded)}
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ExpandMoreIcon />
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <CardContent sx={{ pt: 1 }}>
          {/* Visual timeline */}
          {slideshow.images.length > 0 ? (
            <Box sx={{ mb: 2 }}>
              {/* Timeline bar */}
              <Box
                sx={{
                  display: 'flex',
                  borderRadius: 1,
                  overflow: 'hidden',
                  height: 60,
                  border: '1px solid',
                  borderColor: 'divider',
                  mb: 1,
                }}
              >
                {slideshow.images.map((img, idx) => {
                  const totalDur = slideshow.audioDurationSec || 1;
                  const widthPct = (img.durationSec / totalDur) * 100;
                  const preview = getAssetPreview(img.assetId);
                  return (
                    <Tooltip
                      key={img.assetId}
                      title={`${getAssetName(img.assetId)} — ${img.durationSec.toFixed(1)}s`}
                    >
                      <Box
                        sx={{
                          width: `${widthPct}%`,
                          minWidth: 24,
                          height: '100%',
                          bgcolor: preview
                            ? 'transparent'
                            : `hsl(${(idx * 60) % 360}, 60%, 80%)`,
                          backgroundImage: preview ? `url(${preview})` : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          borderRight:
                            idx < slideshow.images.length - 1
                              ? '1px solid'
                              : 'none',
                          borderColor: 'divider',
                          display: 'flex',
                          alignItems: 'end',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            bgcolor: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            px: 0.5,
                            borderRadius: '4px 4px 0 0',
                            fontSize: '0.65rem',
                            lineHeight: 1.4,
                          }}
                        >
                          {img.durationSec.toFixed(1)}s
                        </Typography>
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>

              {/* Image list with controls */}
              {slideshow.images.map((img, idx) => (
                <Box
                  key={img.assetId}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    px: 1,
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <DragIndicatorIcon
                    sx={{ fontSize: 16, color: 'text.disabled' }}
                  />
                  {getAssetPreview(img.assetId) ? (
                    <Box
                      component="img"
                      src={getAssetPreview(img.assetId)}
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 0.5,
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <ImageIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
                  )}
                  <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                    {getAssetName(img.assetId)}
                  </Typography>

                  {/* Duration slider */}
                  <Box sx={{ width: 120 }}>
                    <Slider
                      size="small"
                      min={1}
                      max={Math.max(slideshow.audioDurationSec, 10)}
                      step={0.5}
                      value={img.durationSec}
                      onChange={(_, val) =>
                        handleTimingChange(img.assetId, val as number)
                      }
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${v}s`}
                    />
                  </Box>

                  <IconButton
                    size="small"
                    onClick={() => handleMoveImage(img.assetId, -1)}
                    disabled={idx === 0}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleMoveImage(img.assetId, 1)}
                    disabled={idx === slideshow.images.length - 1}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemoveImage(img.assetId)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          ) : (
            <Paper
              variant="outlined"
              sx={{ p: 2, textAlign: 'center', mb: 1 }}
            >
              <ImageIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5 }} />
              <Typography variant="body2" color="text.disabled">
                No images assigned. Add images from the asset library.
              </Typography>
            </Paper>
          )}

          <Button
            size="small"
            variant="outlined"
            startIcon={<AddPhotoAlternateIcon />}
            onClick={() => setAddDialogOpen(true)}
          >
            Add Images
          </Button>
        </CardContent>
      </Collapse>

      {/* Add images dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Add Images to Spot #{slideshow.spotNumber}
        </DialogTitle>
        <DialogContent>
          {imageAssets.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No image assets available. Upload images in the Assets step.
            </Typography>
          ) : (
            <List dense>
              {imageAssets.map((asset) => {
                const alreadyAssigned = assignedAssetIds.has(asset.id);
                const isSelected = selectedAssetIds.includes(asset.id);
                return (
                  <ListItemButton
                    key={asset.id}
                    disabled={alreadyAssigned}
                    onClick={() => {
                      setSelectedAssetIds((prev) =>
                        isSelected
                          ? prev.filter((id) => id !== asset.id)
                          : [...prev, asset.id],
                      );
                    }}
                  >
                    <ListItemIcon>
                      <Checkbox
                        checked={isSelected || alreadyAssigned}
                        disabled={alreadyAssigned}
                        size="small"
                      />
                    </ListItemIcon>
                    {asset.previewUrl ? (
                      <Box
                        component="img"
                        src={asset.previewUrl}
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 0.5,
                          objectFit: 'cover',
                          mr: 1,
                        }}
                      />
                    ) : (
                      <ImageIcon
                        sx={{ fontSize: 40, color: 'text.disabled', mr: 1 }}
                      />
                    )}
                    <ListItemText
                      primary={asset.name}
                      secondary={alreadyAssigned ? 'Already assigned' : undefined}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={selectedAssetIds.length === 0}
            onClick={handleAddImages}
          >
            Add {selectedAssetIds.length} Image{selectedAssetIds.length !== 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

// ── Main SlideshowBuilder ──

export default function SlideshowBuilder() {
  const slideshows = useGuidesStore((s) => s.slideshows);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SlideshowIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={700}>
          Slideshow Builder
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Assign images to each spot and configure display timing synced to audio duration.
        Drag to reorder, adjust duration per image.
      </Typography>

      {slideshows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <SlideshowIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.disabled">
            No spots available. Complete previous steps first.
          </Typography>
        </Paper>
      ) : (
        slideshows.map((ss) => (
          <SpotSlideshowCard key={ss.spotId} slideshow={ss} />
        ))
      )}
    </Box>
  );
}
