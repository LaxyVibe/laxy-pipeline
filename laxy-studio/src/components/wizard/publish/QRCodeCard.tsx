// ---------------------------------------------------------------------------
// QRCodeCard — QR code generation + shortlink display + download
// ---------------------------------------------------------------------------
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  IconButton,
  Chip,
  Tooltip,
  InputAdornment,
  Fade,
  Alert,
  alpha,
} from '@mui/material';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import CheckIcon from '@mui/icons-material/Check';
import LinkIcon from '@mui/icons-material/Link';
import type { PublishedGuide } from '../../../types/entity';

interface QRCodeCardProps {
  publishedGuide: PublishedGuide | null;
  customSlug: string;
  onSlugChange: (slug: string) => void;
}

/**
 * Simple QR Code generator using Canvas API.
 * Phase 1A stub — generates a placeholder QR-like pattern.
 * In production, use `qrcode.react` or similar library.
 */
function generateQRPlaceholder(text: string, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Generate deterministic pattern from text
  const cellCount = 25;
  const cellSize = size / cellCount;
  const hash = Array.from(text).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);

  ctx.fillStyle = '#000000';

  // Finder patterns (standard QR code corners)
  const drawFinder = (x: number, y: number) => {
    // Outer
    ctx.fillRect(x * cellSize, y * cellSize, 7 * cellSize, 7 * cellSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((x + 1) * cellSize, (y + 1) * cellSize, 5 * cellSize, 5 * cellSize);
    ctx.fillStyle = '#000000';
    ctx.fillRect((x + 2) * cellSize, (y + 2) * cellSize, 3 * cellSize, 3 * cellSize);
  };

  drawFinder(0, 0);
  drawFinder(cellCount - 7, 0);
  drawFinder(0, cellCount - 7);

  // Data pattern (deterministic from hash)
  for (let row = 0; row < cellCount; row++) {
    for (let col = 0; col < cellCount; col++) {
      // Skip finder areas
      if (
        (row < 8 && col < 8) ||
        (row < 8 && col > cellCount - 9) ||
        (row > cellCount - 9 && col < 8)
      )
        continue;

      const seed = (hash + row * 37 + col * 53) & 0xffffffff;
      if (seed % 3 === 0) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

export default function QRCodeCard({
  publishedGuide,
  customSlug,
  onSlugChange,
}: QRCodeCardProps) {
  const [copied, setCopied] = useState<'url' | 'short' | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const guideUrl = publishedGuide?.guideUrl ?? '';
  const shortUrl = publishedGuide?.shortUrl ?? '';

  // Generate QR code when guide is published
  useEffect(() => {
    if (guideUrl) {
      const dataUrl = generateQRPlaceholder(guideUrl, 300);
      setQrDataUrl(dataUrl);
    }
  }, [guideUrl]);

  const handleCopy = useCallback(
    async (text: string, type: 'url' | 'short') => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
      } catch {
        // Fallback
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
      }
    },
    [],
  );

  const handleDownloadQR = useCallback(() => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `guide-qr-${customSlug || 'code'}.png`;
    a.click();
  }, [qrDataUrl, customSlug]);

  // Pre-publish state: slug configuration
  if (!publishedGuide) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <LinkIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={700}>
            URL & Shortlink
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Configure a custom slug for your guide's short URL. The QR code will be generated
          after publishing.
        </Typography>

        <TextField
          label="Custom Slug"
          placeholder="e.g. tokyo-national-museum"
          value={customSlug}
          onChange={(e) => onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
          fullWidth
          size="small"
          variant="outlined"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Typography variant="caption" color="text.secondary">
                  laxy.click/
                </Typography>
              </InputAdornment>
            ),
          }}
          helperText="Letters, numbers, and hyphens only. Leave empty for auto-generated slug."
          sx={{ mb: 2 }}
        />

        <Paper
          variant="outlined"
          sx={{ p: 3, textAlign: 'center', bgcolor: 'action.hover' }}
        >
          <QrCode2Icon sx={{ fontSize: 64, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.disabled">
            QR code will appear here after publishing
          </Typography>
        </Paper>
      </Box>
    );
  }

  // Post-publish state: show QR code and URLs
  return (
    <Fade in>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <QrCode2Icon color="success" />
          <Typography variant="subtitle1" fontWeight={700}>
            Published — QR Code & Links
          </Typography>
        </Box>

        {/* QR Code */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          {qrDataUrl ? (
            <Box
              component="img"
              src={qrDataUrl}
              alt="Guide QR Code"
              sx={{
                width: 200,
                height: 200,
                border: '2px solid',
                borderColor: 'divider',
                borderRadius: 2,
                mb: 1,
              }}
            />
          ) : (
            <Paper
              variant="outlined"
              sx={{ width: 200, height: 200, mx: 'auto', mb: 1 }}
            />
          )}
          <Box>
            <Button
              size="small"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadQR}
              disabled={!qrDataUrl}
            >
              Download PNG
            </Button>
          </Box>
        </Box>

        {/* Guide URL */}
        <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Guide URL
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1, wordBreak: 'break-all' }}>
              {guideUrl}
            </Typography>
            <Tooltip title={copied === 'url' ? 'Copied!' : 'Copy URL'}>
              <IconButton
                size="small"
                onClick={() => handleCopy(guideUrl, 'url')}
              >
                {copied === 'url' ? (
                  <CheckIcon color="success" fontSize="small" />
                ) : (
                  <ContentCopyIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Paper>

        {/* Short URL */}
        <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Short URL
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LinkIcon color="primary" sx={{ fontSize: 18 }} />
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
              {shortUrl}
            </Typography>
            <Tooltip title={copied === 'short' ? 'Copied!' : 'Copy Short URL'}>
              <IconButton
                size="small"
                onClick={() => handleCopy(shortUrl, 'short')}
              >
                {copied === 'short' ? (
                  <CheckIcon color="success" fontSize="small" />
                ) : (
                  <ContentCopyIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Paper>

        <Alert severity="info" sx={{ mt: 2 }}>
          Published at {new Date(publishedGuide.publishedAt).toLocaleString()}.
          In production, this will be deployed to Firebase CDN.
        </Alert>
      </Box>
    </Fade>
  );
}
