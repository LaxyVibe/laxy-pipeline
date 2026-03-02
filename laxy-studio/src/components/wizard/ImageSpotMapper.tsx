// ---------------------------------------------------------------------------
// ImageSpotMapper — assign images/videos to each spot from the asset library
//
// Features:
//  - Shows AI-suggested images with ⭐ badge
//  - Manual override via asset library dialog
//  - Remove / reorder images within a spot
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Tooltip,
  alpha,
} from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

import { useGuidesStore } from '../../guidesStore';
import type { SpotImageMapping } from '../../types/entity';

interface ImageSpotMapperProps {
  spotId: string;
  spotTitle: string;
}

export default function ImageSpotMapper({ spotId, spotTitle }: ImageSpotMapperProps) {
  const assets = useGuidesStore((s) => s.assets);
  const imageMappings = useGuidesStore((s) => s.imageMappings);
  const updateImageMapping = useGuidesStore((s) => s.updateImageMapping);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const mapping = imageMappings.find((m) => m.spotId === spotId);
  const assignedAssetIds = mapping?.assignedAssetIds ?? [];
  const isAiSuggested = mapping?.aiSuggested ?? false;
  const assignedAssets = assignedAssetIds
    .map((id) => assets.find((a) => a.id === id))
    .filter(Boolean);

  // Only show image assets in the picker
  const imageAssets = assets.filter((a) => a.fileType === 'image');

  const handleOpenDialog = () => {
    setSelectedIds([...assignedAssetIds]);
    setDialogOpen(true);
  };

  const handleToggleAsset = (assetId: string) => {
    setSelectedIds((prev) =>
      prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId]
    );
  };

  const handleConfirm = () => {
    updateImageMapping(spotId, selectedIds);
    setDialogOpen(false);
  };

  const handleRemoveImage = (assetId: string) => {
    updateImageMapping(
      spotId,
      assignedAssetIds.filter((id) => id !== assetId),
    );
  };

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          mt: 1,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <ImageIcon fontSize="small" color="action" />
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            Media
          </Typography>
          {isAiSuggested && (
            <Chip
              icon={<AutoAwesomeIcon />}
              label="AI Suggested"
              size="small"
              color="secondary"
              variant="outlined"
              sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' } }}
            />
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Change media">
            <IconButton size="small" onClick={handleOpenDialog}>
              {assignedAssets.length > 0 ? (
                <SwapHorizIcon fontSize="small" />
              ) : (
                <AddPhotoAlternateIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        {assignedAssets.length === 0 ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', textAlign: 'center', py: 1 }}
          >
            No images assigned. Click + to add.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {assignedAssets.map((asset) =>
              asset ? (
                <Box key={asset.id} sx={{ position: 'relative' }}>
                  {asset.fileType === 'image' && asset.previewUrl ? (
                    <Avatar
                      src={asset.previewUrl}
                      variant="rounded"
                      sx={{ width: 56, height: 56 }}
                    />
                  ) : (
                    <Avatar variant="rounded" sx={{ width: 56, height: 56, bgcolor: 'action.hover' }}>
                      <PictureAsPdfIcon />
                    </Avatar>
                  )}
                  <IconButton
                    size="small"
                    onClick={() => handleRemoveImage(asset.id)}
                    sx={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      width: 20,
                      height: 20,
                    }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 12 }} />
                  </IconButton>
                </Box>
              ) : null,
            )}
          </Box>
        )}
      </Paper>

      {/* Asset picker dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Assign Images — {spotTitle}
        </DialogTitle>
        <DialogContent dividers>
          {imageAssets.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No image assets available. Upload images in the Assets step.
            </Typography>
          ) : (
            <List dense>
              {imageAssets.map((asset) => (
                <ListItem key={asset.id} disablePadding>
                  <ListItemButton onClick={() => handleToggleAsset(asset.id)} dense>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        edge="start"
                        checked={selectedIds.includes(asset.id)}
                        disableRipple
                        size="small"
                      />
                    </ListItemIcon>
                    <ListItemAvatar>
                      {asset.previewUrl ? (
                        <Avatar src={asset.previewUrl} variant="rounded" sx={{ width: 40, height: 40 }} />
                      ) : (
                        <Avatar variant="rounded" sx={{ width: 40, height: 40 }}>
                          <ImageIcon />
                        </Avatar>
                      )}
                    </ListItemAvatar>
                    <ListItemText
                      primary={asset.name}
                      secondary={`${(asset.size / 1024).toFixed(0)} KB`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleConfirm} variant="contained">
            Confirm ({selectedIds.length} selected)
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
