// ---------------------------------------------------------------------------
// LayoutPicker — select a Player UI template with live preview (PW-2)
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import { useGuidesStore } from '../../guidesStore';
import {
  LAYOUT_TEMPLATES,
  type LayoutTemplate,
  type LayoutTemplateId,
} from '../../types/entity';

// ── Phone‑frame preview mock ──────────────────────────────────────────────

interface PhonePreviewProps {
  template: LayoutTemplate;
  /** Scale factor for the phone frame (1 = full size used in preview dialog) */
  scale?: number;
}

/**
 * Stylised phone frame rendering a representative mock of the template.
 * Each template gets a unique layout sketch (header, cards, nav, etc.)
 * to give the user a meaningful visual distinction.
 */
function PhonePreview({ template, scale = 1 }: PhonePreviewProps) {
  const w = 180 * scale;
  const h = 360 * scale;
  const p = 8 * scale;
  const r = 16 * scale;

  return (
    <Box
      sx={{
        width: w,
        height: h,
        borderRadius: `${r}px`,
        border: '2px solid rgba(255,255,255,0.15)',
        bgcolor: '#0d1117',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        mx: 'auto',
      }}
    >
      {template.id === 'classic' && <ClassicMock accent={template.accentColor} scale={scale} />}
      {template.id === 'modern-card' && <ModernCardMock accent={template.accentColor} scale={scale} />}
      {template.id === 'storyteller' && <StorytellerMock accent={template.accentColor} scale={scale} />}
      {template.id === 'compact' && <CompactMock accent={template.accentColor} scale={scale} />}
    </Box>
  );
}

/* ── Per‑template mock layouts ── */

function ClassicMock({ accent, scale = 1 }: { accent: string; scale?: number }) {
  const s = (v: number) => v * scale;
  return (
    <>
      {/* Top nav bar */}
      <Box sx={{ height: s(28), bgcolor: accent, display: 'flex', alignItems: 'center', px: s(8) }}>
        <Box sx={{ width: s(50), height: s(6), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.7)' }} />
      </Box>
      {/* Hero image area */}
      <Box sx={{ height: s(100), bgcolor: 'rgba(255,255,255,0.05)', m: s(6), borderRadius: s(4) }} />
      {/* Text lines */}
      <Box sx={{ px: s(10), display: 'flex', flexDirection: 'column', gap: s(5) }}>
        <Box sx={{ width: '80%', height: s(6), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.25)' }} />
        <Box sx={{ width: '60%', height: s(5), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.12)' }} />
        <Box sx={{ width: '90%', height: s(5), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.12)' }} />
        <Box sx={{ width: '70%', height: s(5), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.12)' }} />
      </Box>
      {/* Play button */}
      <Box sx={{ mt: 'auto', mb: s(10), display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ width: s(36), height: s(36), borderRadius: '50%', bgcolor: accent, opacity: 0.9 }} />
      </Box>
    </>
  );
}

function ModernCardMock({ accent, scale = 1 }: { accent: string; scale?: number }) {
  const s = (v: number) => v * scale;
  return (
    <>
      {/* Full-bleed hero */}
      <Box sx={{ height: s(140), bgcolor: accent, opacity: 0.35 }} />
      {/* Floating card */}
      <Box
        sx={{
          mx: s(10),
          mt: s(-30),
          p: s(8),
          borderRadius: s(8),
          bgcolor: '#1a1f2e',
          border: `1px solid ${accent}40`,
        }}
      >
        <Box sx={{ width: '70%', height: s(6), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.3)', mb: s(4) }} />
        <Box sx={{ width: '90%', height: s(4), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.1)', mb: s(3) }} />
        <Box sx={{ width: '50%', height: s(4), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.1)' }} />
      </Box>
      {/* Second card */}
      <Box
        sx={{
          mx: s(10),
          mt: s(8),
          p: s(8),
          borderRadius: s(8),
          bgcolor: '#1a1f2e',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Box sx={{ width: '60%', height: s(5), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.2)', mb: s(4) }} />
        <Box sx={{ width: '80%', height: s(4), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.08)' }} />
      </Box>
      {/* Bottom bar */}
      <Box
        sx={{
          mt: 'auto',
          height: s(32),
          bgcolor: accent + '15',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(16),
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{ width: s(10), height: s(10), borderRadius: '50%', bgcolor: `rgba(255,255,255,${i === 1 ? 0.5 : 0.15})` }} />
        ))}
      </Box>
    </>
  );
}

function StorytellerMock({ accent, scale = 1 }: { accent: string; scale?: number }) {
  const s = (v: number) => v * scale;
  return (
    <Box sx={{ p: s(10), display: 'flex', flexDirection: 'column', gap: s(6), height: '100%' }}>
      {/* Large title */}
      <Box sx={{ width: '90%', height: s(10), borderRadius: 1, bgcolor: accent, opacity: 0.6, mt: s(8) }} />
      <Box sx={{ width: '50%', height: s(6), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.15)' }} />
      {/* Paragraph lines */}
      {[95, 85, 90, 70, 80].map((w, i) => (
        <Box key={i} sx={{ width: `${w}%`, height: s(4), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.1)' }} />
      ))}
      {/* Inline media */}
      <Box sx={{ height: s(60), borderRadius: s(6), bgcolor: 'rgba(255,255,255,0.04)', border: `1px dashed ${accent}60` }} />
      {/* More text */}
      {[80, 90, 60].map((w, i) => (
        <Box key={i} sx={{ width: `${w}%`, height: s(4), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.08)' }} />
      ))}
      {/* Scroll indicator */}
      <Box sx={{ mt: 'auto', display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ width: s(24), height: s(3), borderRadius: 2, bgcolor: 'rgba(255,255,255,0.2)' }} />
      </Box>
    </Box>
  );
}

function CompactMock({ accent, scale = 1 }: { accent: string; scale?: number }) {
  const s = (v: number) => v * scale;
  return (
    <>
      {/* Status area */}
      <Box sx={{ height: s(14) }} />
      {/* Compact content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: s(5), px: s(8) }}>
        {/* Small image + text row */}
        <Box sx={{ display: 'flex', gap: s(6), alignItems: 'center' }}>
          <Box sx={{ width: s(40), height: s(40), borderRadius: s(4), bgcolor: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: s(3) }}>
            <Box sx={{ width: '80%', height: s(5), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.25)' }} />
            <Box sx={{ width: '60%', height: s(4), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.1)' }} />
          </Box>
        </Box>
        {/* Mini player bar */}
        <Box
          sx={{
            height: s(28),
            borderRadius: s(6),
            bgcolor: accent + '20',
            display: 'flex',
            alignItems: 'center',
            px: s(8),
            gap: s(6),
          }}
        >
          <Box sx={{ width: s(16), height: s(16), borderRadius: '50%', bgcolor: accent, opacity: 0.8 }} />
          <Box sx={{ flex: 1, height: s(3), borderRadius: 2, bgcolor: 'rgba(255,255,255,0.15)' }} />
        </Box>
        {/* List items */}
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{ display: 'flex', gap: s(6), alignItems: 'center' }}>
            <Box
              sx={{
                width: s(18),
                height: s(18),
                borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: s(8),
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              {i + 1}
            </Box>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: s(2) }}>
              <Box sx={{ width: `${70 - i * 10}%`, height: s(4), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.18)' }} />
              <Box sx={{ width: `${50 - i * 5}%`, height: s(3), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.08)' }} />
            </Box>
          </Box>
        ))}
      </Box>
      {/* Bottom tab bar */}
      <Box
        sx={{
          height: s(36),
          bgcolor: '#161b2a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s(2) }}>
            <Box sx={{ width: s(10), height: s(10), borderRadius: s(2), bgcolor: i === 0 ? accent : 'rgba(255,255,255,0.12)' }} />
            <Box sx={{ width: s(14), height: s(2), borderRadius: 1, bgcolor: 'rgba(255,255,255,0.1)' }} />
          </Box>
        ))}
      </Box>
    </>
  );
}

// ── Template card ─────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: LayoutTemplate;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}

function TemplateCard({ template, selected, onSelect, onPreview }: TemplateCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        borderColor: selected ? template.accentColor : 'rgba(255,255,255,0.08)',
        borderWidth: selected ? 2 : 1,
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: selected ? template.accentColor : 'rgba(255,255,255,0.2)',
          transform: 'translateY(-2px)',
          boxShadow: selected
            ? `0 0 24px ${template.accentColor}30`
            : '0 4px 20px rgba(0,0,0,0.3)',
        },
      }}
    >
      {/* Selected badge */}
      {selected && (
        <CheckCircleIcon
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            color: template.accentColor,
            bgcolor: 'background.paper',
            borderRadius: '50%',
            fontSize: 28,
          }}
        />
      )}

      <CardActionArea onClick={onSelect} sx={{ p: 2 }}>
        {/* Phone mock preview */}
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <PhonePreview template={template} scale={0.7} />
        </Box>

        <CardContent sx={{ textAlign: 'center', pb: '8px !important' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {template.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5, minHeight: 40 }}>
            {template.description}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            {template.tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: '0.7rem',
                  height: 22,
                  borderColor: `${template.accentColor}50`,
                  color: template.accentColor,
                }}
              />
            ))}
          </Box>
        </CardContent>
      </CardActionArea>

      {/* Preview button */}
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        sx={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          bgcolor: 'rgba(0,0,0,0.4)',
          '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
        }}
      >
        <FullscreenIcon fontSize="small" />
      </IconButton>
    </Card>
  );
}

// ── Preview dialog ────────────────────────────────────────────────────────

interface PreviewDialogProps {
  template: LayoutTemplate | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: LayoutTemplateId) => void;
  selected: boolean;
}

function PreviewDialog({ template, open, onClose, onSelect, selected }: PreviewDialogProps) {
  if (!template) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" component="span">
            {template.name}
          </Typography>
          {selected && (
            <Chip
              label="Selected"
              size="small"
              icon={<CheckCircleIcon />}
              sx={{ ml: 1.5, bgcolor: `${template.accentColor}20`, color: template.accentColor }}
            />
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center', pb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <PhonePreview template={template} scale={1.4} />
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2, maxWidth: 400, mx: 'auto' }}>
          {template.description}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5, flexWrap: 'wrap', mt: 2 }}>
          {template.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              variant="outlined"
              sx={{
                borderColor: `${template.accentColor}50`,
                color: template.accentColor,
              }}
            />
          ))}
        </Box>
        {!selected && (
          <Box sx={{ mt: 3 }}>
            <Chip
              label="Select this template"
              clickable
              onClick={() => {
                onSelect(template.id as LayoutTemplateId);
                onClose();
              }}
              sx={{
                bgcolor: template.accentColor,
                color: '#fff',
                fontWeight: 600,
                px: 2,
                '&:hover': { bgcolor: template.accentColor, filter: 'brightness(1.2)' },
              }}
            />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function LayoutPicker() {
  const selectedLayout = useGuidesStore((s) => s.entityConfig.selectedLayout);
  const setField = useGuidesStore((s) => s.setEntityField);
  const [previewTemplate, setPreviewTemplate] = useState<LayoutTemplate | null>(null);

  const handleSelect = (id: LayoutTemplateId) => {
    setField('selectedLayout', id);
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
        Choose a Player Layout
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select a pre-designed template for your guide's Player UI.
        You can change this at any time before publishing.
      </Typography>

      <Grid container spacing={3}>
        {LAYOUT_TEMPLATES.map((tpl) => (
          <Grid key={tpl.id} size={{ xs: 12, sm: 6, lg: 3 }}>
            <TemplateCard
              template={tpl}
              selected={selectedLayout === tpl.id}
              onSelect={() => handleSelect(tpl.id as LayoutTemplateId)}
              onPreview={() => setPreviewTemplate(tpl)}
            />
          </Grid>
        ))}
      </Grid>

      <PreviewDialog
        template={previewTemplate}
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        onSelect={handleSelect}
        selected={previewTemplate ? selectedLayout === previewTemplate.id : false}
      />
    </Box>
  );
}
