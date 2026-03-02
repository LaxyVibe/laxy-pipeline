// ---------------------------------------------------------------------------
// AssetLibrary — browse, search, preview, delete/replace assets (PW-4)
// ---------------------------------------------------------------------------
import { useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import SearchIcon from '@mui/icons-material/Search';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useGuidesStore } from '../../guidesStore';
import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE,
  type AssetFile,
  type AssetFileType,
  type AssetSourceType,
} from '../../types/entity';

// ── Helpers ──────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateId(): string {
  return `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Simulated quota — replace with real value from Firebase when integrated */
const STORAGE_QUOTA = 500 * 1024 * 1024; // 500 MB

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | AssetFileType | 'text';
type SortField = 'name' | 'date' | 'size';

// ── Storage usage bar ────────────────────────────────────────────────────

function StorageUsageBar({ usedBytes }: { usedBytes: number }) {
  const pct = Math.min((usedBytes / STORAGE_QUOTA) * 100, 100);
  const color = pct > 90 ? 'error' : pct > 70 ? 'warning' : 'primary';

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Storage used
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatFileSize(usedBytes)} / {formatFileSize(STORAGE_QUOTA)}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={color}
        sx={{ height: 8, borderRadius: 4 }}
      />
      {pct > 90 && (
        <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <WarningAmberIcon sx={{ fontSize: 14 }} />
          Storage almost full
        </Typography>
      )}
    </Box>
  );
}

// ── Asset icon helper ────────────────────────────────────────────────────

function AssetIcon({ asset, size = 40 }: { asset: AssetFile; size?: number }) {
  if (asset.source === 'text') {
    return <TextSnippetIcon sx={{ fontSize: size, color: '#ffd740' }} />;
  }
  if (asset.fileType === 'pdf') {
    return <PictureAsPdfIcon sx={{ fontSize: size, color: '#ff5252' }} />;
  }
  return <ImageIcon sx={{ fontSize: size, color: '#69f0ae' }} />;
}

// ── Preview dialog ───────────────────────────────────────────────────────

interface PreviewDialogProps {
  asset: AssetFile | null;
  open: boolean;
  onClose: () => void;
}

function PreviewDialog({ asset, open, onClose }: PreviewDialogProps) {
  if (!asset) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AssetIcon asset={asset} size={24} />
        <Typography variant="h6" component="span" noWrap sx={{ flex: 1 }}>
          {asset.name}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {asset.previewUrl && asset.fileType === 'image' ? (
          <Box sx={{ textAlign: 'center' }}>
            <img
              src={asset.previewUrl}
              alt={asset.name}
              style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 8, objectFit: 'contain' }}
            />
          </Box>
        ) : asset.source === 'text' && asset.textContent ? (
          <Box
            sx={{
              p: 2,
              bgcolor: 'rgba(255,255,255,0.03)',
              borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.08)',
              maxHeight: 400,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: 13,
            }}
          >
            {asset.textContent}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <AssetIcon asset={asset} size={80} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Preview not available for this file type
            </Typography>
          </Box>
        )}

        {/* Metadata */}
        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={asset.mimeType} size="small" variant="outlined" />
          {asset.size > 0 && <Chip label={formatFileSize(asset.size)} size="small" variant="outlined" />}
          <Chip
            label={asset.source === 'file' ? 'Uploaded' : asset.source === 'url' ? 'URL import' : 'Text input'}
            size="small"
            variant="outlined"
          />
          <Chip
            label={new Date(asset.addedAt).toLocaleDateString()}
            size="small"
            variant="outlined"
          />
          {asset.status === 'done' && (
            <Chip label="Uploaded" size="small" color="success" icon={<CheckCircleIcon />} />
          )}
        </Box>

        {asset.sourceUrl && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', wordBreak: 'break-all' }}>
            Source: {asset.sourceUrl}
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirmation dialog ───────────────────────────────────────────

interface DeleteDialogProps {
  asset: AssetFile | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteConfirmDialog({ asset, open, onClose, onConfirm }: DeleteDialogProps) {
  if (!asset) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Asset</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          Are you sure you want to delete <strong>{asset.name}</strong>? This action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Grid card ────────────────────────────────────────────────────────────

interface AssetGridCardProps {
  asset: AssetFile;
  onPreview: () => void;
  onDelete: () => void;
  onReplace: () => void;
}

function AssetGridCard({ asset, onPreview, onDelete, onReplace }: AssetGridCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.2s, transform 0.15s',
        '&:hover': {
          borderColor: 'primary.main',
          transform: 'translateY(-2px)',
          '& .asset-actions': { opacity: 1 },
        },
      }}
    >
      <CardActionArea onClick={onPreview} sx={{ flex: 1 }}>
        {/* Thumbnail area */}
        <Box
          sx={{
            height: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(255,255,255,0.02)',
            overflow: 'hidden',
          }}
        >
          {asset.previewUrl && asset.fileType === 'image' ? (
            <CardMedia
              component="img"
              image={asset.previewUrl}
              alt={asset.name}
              sx={{ height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <AssetIcon asset={asset} size={56} />
          )}
        </Box>

        <CardContent sx={{ py: 1, px: 1.5, pb: '4px !important' }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {asset.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {asset.size > 0 ? formatFileSize(asset.size) : asset.source === 'url' ? 'URL' : 'Text'}
          </Typography>
        </CardContent>
      </CardActionArea>

      {/* Action row */}
      <Box
        className="asset-actions"
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 0.5,
          px: 1,
          pb: 0.5,
          opacity: 0,
          transition: 'opacity 0.15s',
        }}
      >
        <Tooltip title="Preview">
          <IconButton size="small" onClick={onPreview}>
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Replace">
          <IconButton size="small" onClick={onReplace}>
            <SwapHorizIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={onDelete} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Card>
  );
}

// ── List row ─────────────────────────────────────────────────────────────

interface AssetListRowProps {
  asset: AssetFile;
  onPreview: () => void;
  onDelete: () => void;
  onReplace: () => void;
}

function AssetListRow({ asset, onPreview, onDelete, onReplace }: AssetListRowProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 1.5,
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      {/* Thumbnail */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 1.5,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(255,255,255,0.04)',
          flexShrink: 0,
          cursor: 'pointer',
        }}
        onClick={onPreview}
      >
        {asset.previewUrl && asset.fileType === 'image' ? (
          <img src={asset.previewUrl} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <AssetIcon asset={asset} size={28} />
        )}
      </Box>

      {/* Info */}
      <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onPreview}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {asset.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            {asset.size > 0 ? formatFileSize(asset.size) : '—'}
          </Typography>
          <Typography variant="caption" color="text.disabled">·</Typography>
          <Typography variant="caption" color="text.secondary">
            {asset.source === 'file' ? 'Upload' : asset.source === 'url' ? 'URL' : 'Text'}
          </Typography>
          <Typography variant="caption" color="text.disabled">·</Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(asset.addedAt).toLocaleDateString()}
          </Typography>
        </Box>
      </Box>

      {/* Status */}
      {asset.status === 'done' && (
        <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main', flexShrink: 0 }} />
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
        <Tooltip title="Preview">
          <IconButton size="small" onClick={onPreview}>
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Replace">
          <IconButton size="small" onClick={onReplace}>
            <SwapHorizIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={onDelete} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function AssetLibrary() {
  const assets = useGuidesStore((s) => s.assets);
  const removeAsset = useGuidesStore((s) => s.removeAsset);
  const addAssets = useGuidesStore((s) => s.addAssets);
  const updateAsset = useGuidesStore((s) => s.updateAsset);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<SortField>('date');

  // Dialogs
  const [previewAsset, setPreviewAsset] = useState<AssetFile | null>(null);
  const [deleteAsset, setDeleteAsset] = useState<AssetFile | null>(null);

  // Replace file input ref
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  // ── Filter & sort ──
  const filtered = useMemo(() => {
    let list = [...assets];

    // Text search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }

    // Type filter
    if (filterType !== 'all') {
      if (filterType === 'text') {
        list = list.filter((a) => a.source === 'text');
      } else {
        list = list.filter((a) => a.fileType === filterType && a.source !== 'text');
      }
    }

    // Sort
    list.sort((a, b) => {
      switch (sortField) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.size - a.size;
        case 'date':
        default:
          return b.addedAt - a.addedAt;
      }
    });

    return list;
  }, [assets, search, filterType, sortField]);

  // ── Storage ──
  const totalBytes = assets.reduce((acc, a) => acc + a.size, 0);

  // ── Replace handler ──
  const handleReplace = (assetId: string) => {
    setReplaceTargetId(assetId);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replaceTargetId) return;

    const old = assets.find((a) => a.id === replaceTargetId);
    if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl);

    const isImage = file.type.startsWith('image/');
    updateAsset(replaceTargetId, {
      name: file.name,
      mimeType: file.type,
      fileType: file.type === 'application/pdf' ? 'pdf' : 'image',
      size: file.size,
      source: 'file',
      previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      file,
      status: 'done',
      progress: 100,
    });

    setReplaceTargetId(null);
    e.target.value = '';
  };

  // ── Delete handler ──
  const handleDeleteConfirm = () => {
    if (deleteAsset) {
      removeAsset(deleteAsset.id);
      setDeleteAsset(null);
    }
  };

  // ── Type counts for filter chips ──
  const imageCt = assets.filter((a) => a.fileType === 'image' && a.source !== 'text').length;
  const pdfCt = assets.filter((a) => a.fileType === 'pdf' && a.source !== 'text').length;
  const textCt = assets.filter((a) => a.source === 'text').length;

  // ── Empty state ──
  if (assets.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <FolderOpenIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No assets yet
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Upload files, add URLs, or paste text in the Upload tab to get started.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Storage usage */}
      <StorageUsageBar usedBytes={totalBytes} />

      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'center',
          mb: 2,
        }}
      >
        {/* Search */}
        <TextField
          size="small"
          placeholder="Search assets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220, flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 20 }} />
                </InputAdornment>
              ),
            },
          }}
        />

        {/* Filter chips */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Chip
            label={`All (${assets.length})`}
            size="small"
            variant={filterType === 'all' ? 'filled' : 'outlined'}
            onClick={() => setFilterType('all')}
            color={filterType === 'all' ? 'primary' : 'default'}
          />
          {imageCt > 0 && (
            <Chip
              label={`Images (${imageCt})`}
              size="small"
              variant={filterType === 'image' ? 'filled' : 'outlined'}
              onClick={() => setFilterType('image')}
              color={filterType === 'image' ? 'primary' : 'default'}
              icon={<ImageIcon />}
            />
          )}
          {pdfCt > 0 && (
            <Chip
              label={`PDFs (${pdfCt})`}
              size="small"
              variant={filterType === 'pdf' ? 'filled' : 'outlined'}
              onClick={() => setFilterType('pdf')}
              color={filterType === 'pdf' ? 'primary' : 'default'}
              icon={<PictureAsPdfIcon />}
            />
          )}
          {textCt > 0 && (
            <Chip
              label={`Text (${textCt})`}
              size="small"
              variant={filterType === 'text' ? 'filled' : 'outlined'}
              onClick={() => setFilterType('text')}
              color={filterType === 'text' ? 'primary' : 'default'}
              icon={<TextSnippetIcon />}
            />
          )}
        </Box>

        {/* Sort */}
        <Select
          size="small"
          value={sortField}
          onChange={(e) => setSortField(e.target.value as SortField)}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="date">Newest</MenuItem>
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="size">Size</MenuItem>
        </Select>

        {/* View toggle */}
        <ToggleButtonGroup
          size="small"
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v as ViewMode)}
        >
          <ToggleButton value="grid">
            <ViewModuleIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="list">
            <ViewListIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Results count */}
      {search.trim() && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search.trim()}"
        </Typography>
      )}

      {/* Asset grid / list */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <SearchIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No assets match your search or filter.
          </Typography>
        </Box>
      ) : viewMode === 'grid' ? (
        <Grid container spacing={2}>
          {filtered.map((asset) => (
            <Grid key={asset.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
              <AssetGridCard
                asset={asset}
                onPreview={() => setPreviewAsset(asset)}
                onDelete={() => setDeleteAsset(asset)}
                onReplace={() => handleReplace(asset.id)}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((asset) => (
            <AssetListRow
              key={asset.id}
              asset={asset}
              onPreview={() => setPreviewAsset(asset)}
              onDelete={() => setDeleteAsset(asset)}
              onReplace={() => handleReplace(asset.id)}
            />
          ))}
        </Box>
      )}

      {/* Hidden replace file input */}
      <input
        ref={replaceInputRef}
        type="file"
        accept={Object.keys(ACCEPTED_MIME_TYPES).join(',')}
        onChange={handleReplaceFile}
        style={{ display: 'none' }}
      />

      {/* Dialogs */}
      <PreviewDialog
        asset={previewAsset}
        open={!!previewAsset}
        onClose={() => setPreviewAsset(null)}
      />
      <DeleteConfirmDialog
        asset={deleteAsset}
        open={!!deleteAsset}
        onClose={() => setDeleteAsset(null)}
        onConfirm={handleDeleteConfirm}
      />
    </Box>
  );
}
