// ---------------------------------------------------------------------------
// AssetUploader — drag & drop + URL + raw text asset upload (PW-3)
// ---------------------------------------------------------------------------
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  LinearProgress,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import LinkIcon from '@mui/icons-material/Link';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useGuidesStore } from '../../guidesStore';
import { uploadAssetToStorage } from '../../api';
import {
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE,
  type AssetFile,
  type AssetFileType,
} from '../../types/entity';

// ── Helpers ──────────────────────────────────────────────────────────────

function generateId(): string {
  return `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveFileType(mimeType: string): AssetFileType {
  return mimeType === 'application/pdf' ? 'pdf' : 'image';
}

const ACCEPTED_EXTENSIONS = Object.values(ACCEPTED_MIME_TYPES).flat().join(', ');
const ACCEPTED_TYPES = Object.keys(ACCEPTED_MIME_TYPES).join(', ');

// ── Firebase Storage upload ──────────────────────────────────────────────

/**
 * Uploads an asset file to Firebase Storage, tracking progress via the store.
 * On success, patches the asset with downloadUrl and storagePath.
 */
function firebaseUpload(
  asset: AssetFile,
  updateAsset: (id: string, patch: Partial<AssetFile>) => void,
): void {
  if (!asset.file) {
    // URL or text assets don't need file upload — mark done immediately
    updateAsset(asset.id, { status: 'done', progress: 100 });
    return;
  }

  updateAsset(asset.id, { status: 'uploading', progress: 0 });

  uploadAssetToStorage(asset.file, asset.id, (progress) => {
    updateAsset(asset.id, { progress });
  })
    .then(({ downloadUrl, storagePath }) => {
      updateAsset(asset.id, {
        status: 'done',
        progress: 100,
        downloadUrl,
        storagePath,
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Upload failed';
      updateAsset(asset.id, { status: 'error', error: message });
    });
}

// ── Drop zone ────────────────────────────────────────────────────────────

function DropZone() {
  const addAssets = useGuidesStore((s) => s.addAssets);
  const updateAsset = useGuidesStore((s) => s.updateAsset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const newErrors: string[] = [];
      const validAssets: AssetFile[] = [];

      for (const file of files) {
        // Validate type
        if (!Object.keys(ACCEPTED_MIME_TYPES).includes(file.type)) {
          newErrors.push(`"${file.name}" — unsupported file type (${file.type || 'unknown'})`);
          continue;
        }
        // Validate size
        if (file.size > MAX_FILE_SIZE) {
          newErrors.push(`"${file.name}" — exceeds 100 MB limit (${formatFileSize(file.size)})`);
          continue;
        }

        const isImage = file.type.startsWith('image/');
        const asset: AssetFile = {
          id: generateId(),
          name: file.name,
          mimeType: file.type,
          fileType: resolveFileType(file.type),
          size: file.size,
          source: 'file',
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
          file,
          status: 'pending',
          addedAt: Date.now(),
        };
        validAssets.push(asset);
      }

      setErrors(newErrors);

      if (validAssets.length > 0) {
        addAssets(validAssets);
        // Start Firebase uploads
        for (const a of validAssets) {
          firebaseUpload(a, updateAsset);
        }
      }
    },
    [addAssets, updateAsset],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
        // Reset so the same file can be re-selected
        e.target.value = '';
      }
    },
    [processFiles],
  );

  return (
    <Box>
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        sx={{
          border: '2px dashed',
          borderColor: dragOver ? 'primary.main' : 'rgba(255,255,255,0.15)',
          borderRadius: 3,
          p: 5,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          bgcolor: dragOver ? 'rgba(124, 77, 255, 0.06)' : 'transparent',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'rgba(124, 77, 255, 0.04)',
          },
        }}
      >
        <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
        <Typography variant="h6" gutterBottom>
          Drag & drop files here
        </Typography>
        <Typography variant="body2" color="text.secondary">
          or click to browse — PDF, JPG, PNG, WebP (max 100 MB each)
        </Typography>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </Box>

      {errors.length > 0 && (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {errors.map((err, i) => (
            <Alert key={i} severity="error" variant="outlined" onClose={() => setErrors((prev) => prev.filter((_, j) => j !== i))}>
              {err}
            </Alert>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── URL input ────────────────────────────────────────────────────────────

function UrlInput() {
  const addAssets = useGuidesStore((s) => s.addAssets);
  const updateAsset = useGuidesStore((s) => s.updateAsset);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    // Infer type from extension
    const lower = trimmed.toLowerCase();
    const isPdf = lower.endsWith('.pdf');
    const isImg = /\.(jpe?g|png|webp)(\?.*)?$/i.test(lower);

    const asset: AssetFile = {
      id: generateId(),
      name: trimmed.split('/').pop()?.split('?')[0] || 'url-asset',
      mimeType: isPdf ? 'application/pdf' : isImg ? 'image/jpeg' : 'application/octet-stream',
      fileType: isPdf ? 'pdf' : 'image',
      size: 0,
      source: 'url',
      sourceUrl: trimmed,
      previewUrl: isImg ? trimmed : undefined,
      status: 'pending',
      addedAt: Date.now(),
    };

    addAssets([asset]);
    firebaseUpload(asset, updateAsset);
    setUrl('');
    setError('');
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <TextField
        label="Asset URL"
        placeholder="https://example.com/brochure.pdf"
        fullWidth
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          if (error) setError('');
        }}
        error={!!error}
        helperText={error || 'Enter a URL to an image or PDF file'}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd();
        }}
        slotProps={{
          input: {
            startAdornment: <LinkIcon sx={{ mr: 1, color: 'text.disabled' }} />,
          },
        }}
      />
      <Button variant="contained" onClick={handleAdd} disabled={!url.trim()} sx={{ mt: 0.5, whiteSpace: 'nowrap' }}>
        Add URL
      </Button>
    </Box>
  );
}

// ── Raw text input ───────────────────────────────────────────────────────

function TextInput() {
  const addAssets = useGuidesStore((s) => s.addAssets);
  const updateAsset = useGuidesStore((s) => s.updateAsset);
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const asset: AssetFile = {
      id: generateId(),
      name: label.trim() || `text-${Date.now().toString(36)}`,
      mimeType: 'text/plain',
      fileType: 'pdf', // treated as document
      size: new Blob([trimmed]).size,
      source: 'text',
      textContent: trimmed,
      status: 'pending',
      addedAt: Date.now(),
    };

    addAssets([asset]);
    firebaseUpload(asset, updateAsset);
    setText('');
    setLabel('');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TextField
        label="Label (optional)"
        placeholder="e.g. Exhibition room 1 description"
        fullWidth
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        size="small"
      />
      <TextField
        label="Raw Text Content"
        placeholder="Paste or type the text content here..."
        fullWidth
        multiline
        minRows={5}
        maxRows={15}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={!text.trim()}
          startIcon={<TextSnippetIcon />}
        >
          Add Text Asset
        </Button>
      </Box>
    </Box>
  );
}

// ── File list ────────────────────────────────────────────────────────────

function FileCard({ asset }: { asset: AssetFile }) {
  const removeAsset = useGuidesStore((s) => s.removeAsset);

  const icon =
    asset.fileType === 'pdf' ? (
      <PictureAsPdfIcon sx={{ fontSize: 40, color: '#ff5252' }} />
    ) : asset.source === 'text' ? (
      <TextSnippetIcon sx={{ fontSize: 40, color: '#ffd740' }} />
    ) : (
      <ImageIcon sx={{ fontSize: 40, color: '#69f0ae' }} />
    );

  const statusChip = (() => {
    switch (asset.status) {
      case 'pending':
        return <Chip label="Pending" size="small" variant="outlined" />;
      case 'uploading':
        return <Chip label={`${asset.progress ?? 0}%`} size="small" color="primary" variant="outlined" />;
      case 'done':
        return <Chip label="Done" size="small" color="success" icon={<CheckCircleIcon />} />;
      case 'error':
        return (
          <Tooltip title={asset.error ?? 'Upload failed'}>
            <Chip label="Error" size="small" color="error" icon={<ErrorIcon />} />
          </Tooltip>
        );
    }
  })();

  return (
    <Card
      variant="outlined"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 1.5,
        pr: 1,
        transition: 'border-color 0.2s',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      {/* Thumbnail / icon */}
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: 1.5,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'rgba(255,255,255,0.04)',
          flexShrink: 0,
        }}
      >
        {asset.previewUrl && asset.fileType === 'image' ? (
          <img
            src={asset.previewUrl}
            alt={asset.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          icon
        )}
      </Box>

      {/* Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {asset.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {asset.source === 'text'
            ? `${formatFileSize(asset.size)} · text`
            : asset.source === 'url'
              ? 'URL import'
              : formatFileSize(asset.size)}
        </Typography>

        {/* Progress bar */}
        {asset.status === 'uploading' && (
          <LinearProgress
            variant="determinate"
            value={asset.progress ?? 0}
            sx={{ mt: 0.5, borderRadius: 1, height: 4 }}
          />
        )}
      </Box>

      {/* Status + remove */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        {statusChip}
        <IconButton size="small" onClick={() => removeAsset(asset.id)} aria-label="Remove asset">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    </Card>
  );
}

function AssetFileList() {
  const assets = useGuidesStore((s) => s.assets);
  const clearAssets = useGuidesStore((s) => s.clearAssets);

  if (assets.length === 0) return null;

  const totalSize = assets.reduce((acc, a) => acc + a.size, 0);
  const doneCount = assets.filter((a) => a.status === 'done').length;

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2">
          {assets.length} file{assets.length !== 1 ? 's' : ''} · {formatFileSize(totalSize)}
          {doneCount > 0 && (
            <Typography component="span" variant="caption" color="success.main" sx={{ ml: 1 }}>
              ({doneCount} uploaded)
            </Typography>
          )}
        </Typography>
        <Button size="small" color="error" onClick={clearAssets}>
          Clear all
        </Button>
      </Box>

      <Grid container spacing={1.5}>
        {assets.map((asset) => (
          <Grid key={asset.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <FileCard asset={asset} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function AssetUploader() {
  const [tab, setTab] = useState(0);

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
        Upload Assets
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Add source material for your guide — PDFs, images, URLs, or raw text.
        These will be used during the Ingestion step to extract metadata.
      </Typography>

      {/* Input mode tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<CloudUploadIcon />} iconPosition="start" label="File Upload" />
        <Tab icon={<LinkIcon />} iconPosition="start" label="URL" />
        <Tab icon={<TextSnippetIcon />} iconPosition="start" label="Raw Text" />
      </Tabs>

      {/* Tab panels */}
      {tab === 0 && <DropZone />}
      {tab === 1 && <UrlInput />}
      {tab === 2 && <TextInput />}

      {/* File list */}
      <AssetFileList />
    </Box>
  );
}
