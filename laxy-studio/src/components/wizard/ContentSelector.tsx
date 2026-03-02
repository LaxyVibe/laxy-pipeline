// ---------------------------------------------------------------------------
// ContentSelector — select assets from library for ingestion
// ---------------------------------------------------------------------------
import { useMemo } from 'react';
import {
  Box,
  Typography,
  Checkbox,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Button,
  Alert,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import LinkIcon from '@mui/icons-material/Link';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import DeselectIcon from '@mui/icons-material/Deselect';
import { useGuidesStore } from '../../guidesStore';
import { SUPPORTED_LANGUAGES, type AssetFile } from '../../types/entity';

function getAssetIcon(asset: AssetFile) {
  if (asset.source === 'text') return <TextSnippetIcon />;
  if (asset.source === 'url') return <LinkIcon />;
  if (asset.fileType === 'pdf') return <PictureAsPdfIcon />;
  return <ImageIcon />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContentSelector() {
  const assets = useGuidesStore((s) => s.assets);
  const selectedAssetIds = useGuidesStore((s) => s.selectedAssetIds);
  const setSelectedAssetIds = useGuidesStore((s) => s.setSelectedAssetIds);
  const coreLanguage = useGuidesStore((s) => s.entityConfig.coreLanguage);

  const coreLabel = useMemo(
    () => SUPPORTED_LANGUAGES.find((l) => l.code === coreLanguage)?.label ?? coreLanguage,
    [coreLanguage],
  );

  const readyAssets = useMemo(
    () => assets.filter((a) => a.status === 'done' || a.source === 'text'),
    [assets],
  );

  const handleToggle = (id: string) => {
    const next = selectedAssetIds.includes(id)
      ? selectedAssetIds.filter((x) => x !== id)
      : [...selectedAssetIds, id];
    setSelectedAssetIds(next);
  };

  const handleSelectAll = () => {
    setSelectedAssetIds(readyAssets.map((a) => a.id));
  };

  const handleDeselectAll = () => {
    setSelectedAssetIds([]);
  };

  if (readyAssets.length === 0) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        No assets available. Please go back to the <strong>Assets</strong> step and upload files first.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h6">Select Content for Ingestion</Typography>
          <Typography variant="body2" color="text.secondary">
            Choose which assets to process. AI will extract metadata from the selected files.
          </Typography>
        </Box>
        <Chip
          label={`Core language: ${coreLabel}`}
          color="primary"
          variant="outlined"
          size="small"
        />
      </Box>

      {/* Select / Deselect all */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <Button
          size="small"
          startIcon={<SelectAllIcon />}
          onClick={handleSelectAll}
          disabled={selectedAssetIds.length === readyAssets.length}
        >
          Select All
        </Button>
        <Button
          size="small"
          startIcon={<DeselectIcon />}
          onClick={handleDeselectAll}
          disabled={selectedAssetIds.length === 0}
        >
          Deselect All
        </Button>
        <Chip
          label={`${selectedAssetIds.length} / ${readyAssets.length} selected`}
          size="small"
          variant="outlined"
        />
      </Box>

      {/* Asset list */}
      <Paper variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
        <List dense disablePadding>
          {readyAssets.map((asset) => {
            const checked = selectedAssetIds.includes(asset.id);
            return (
              <ListItem key={asset.id} disablePadding divider>
                <ListItemButton onClick={() => handleToggle(asset.id)} dense>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      edge="start"
                      checked={checked}
                      tabIndex={-1}
                      disableRipple
                      size="small"
                    />
                  </ListItemIcon>
                  <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                    {getAssetIcon(asset)}
                  </ListItemIcon>
                  <ListItemText
                    primary={asset.name}
                    secondary={
                      asset.source === 'text'
                        ? 'Text input'
                        : `${asset.mimeType} · ${formatSize(asset.size)}`
                    }
                  />
                  <Chip
                    label={asset.source}
                    size="small"
                    variant="outlined"
                    sx={{ ml: 1, textTransform: 'capitalize' }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Paper>
    </Box>
  );
}
