// ---------------------------------------------------------------------------
// GuidePreview — embedded preview with device frame toggle
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  alpha,
} from '@mui/material';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import TabletIcon from '@mui/icons-material/Tablet';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import PreviewIcon from '@mui/icons-material/Preview';
import { useGuidesStore } from '../../../guidesStore';
import { LAYOUT_TEMPLATES, type PreviewDevice } from '../../../types/entity';

const DEVICE_SIZES: Record<PreviewDevice, { width: number; height: number; label: string }> = {
  mobile: { width: 375, height: 667, label: 'Mobile (375×667)' },
  tablet: { width: 768, height: 1024, label: 'Tablet (768×1024)' },
  desktop: { width: 1280, height: 800, label: 'Desktop (1280×800)' },
};

export default function GuidePreview() {
  const previewDevice = useGuidesStore((s) => s.previewDevice);
  const setPreviewDevice = useGuidesStore((s) => s.setPreviewDevice);
  const selectedLayout = useGuidesStore((s) => s.entityConfig.selectedLayout);
  const venueName = useGuidesStore((s) => s.entityConfig.venueName);
  const spots = useGuidesStore((s) => s.spots);
  const scripts = useGuidesStore((s) => s.scripts);
  const audioFiles = useGuidesStore((s) => s.audioFiles);

  const [selectedTemplate, setSelectedTemplate] = useState(selectedLayout);

  const device = DEVICE_SIZES[previewDevice];
  const template = LAYOUT_TEMPLATES.find((t) => t.id === selectedTemplate);

  // Scale factor to fit preview in available space
  const maxWidth = 600;
  const scale = Math.min(1, maxWidth / device.width);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <PreviewIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={700}>
          Guide Preview
        </Typography>
      </Box>

      {/* Controls */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 3,
          flexWrap: 'wrap',
        }}
      >
        <ToggleButtonGroup
          value={previewDevice}
          exclusive
          onChange={(_, val) => val && setPreviewDevice(val as PreviewDevice)}
          size="small"
        >
          <ToggleButton value="mobile">
            <PhoneIphoneIcon sx={{ mr: 0.5, fontSize: 18 }} />
            Mobile
          </ToggleButton>
          <ToggleButton value="tablet">
            <TabletIcon sx={{ mr: 0.5, fontSize: 18 }} />
            Tablet
          </ToggleButton>
          <ToggleButton value="desktop">
            <DesktopWindowsIcon sx={{ mr: 0.5, fontSize: 18 }} />
            Desktop
          </ToggleButton>
        </ToggleButtonGroup>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Template</InputLabel>
          <Select
            value={selectedTemplate}
            label="Template"
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            {LAYOUT_TEMPLATES.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Chip
          label={device.label}
          size="small"
          variant="outlined"
          color="info"
        />
      </Box>

      {/* Device frame */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mb: 2,
        }}
      >
        <Box
          sx={{
            width: device.width * scale,
            height: device.height * scale,
            border: previewDevice === 'mobile' ? '8px solid #333' : '4px solid #555',
            borderRadius: previewDevice === 'mobile' ? '24px' : previewDevice === 'tablet' ? '16px' : '8px',
            overflow: 'hidden',
            bgcolor: 'background.default',
            boxShadow: 6,
            position: 'relative',
          }}
        >
          {/* Mock preview content */}
          <Box
            sx={{
              width: '100%',
              height: '100%',
              overflow: 'auto',
              bgcolor: '#fafafa',
            }}
          >
            {/* Mock header */}
            <Box
              sx={{
                height: 48,
                bgcolor: template?.accentColor ?? '#7c4dff',
                display: 'flex',
                alignItems: 'center',
                px: 2,
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: '#fff', fontWeight: 700, fontSize: '0.75rem' }}
              >
                {venueName || 'Guide Preview'}
              </Typography>
            </Box>

            {/* Mock spot list */}
            <Box sx={{ p: 1 }}>
              {spots.length === 0 ? (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.disabled">
                    No spots to preview
                  </Typography>
                </Box>
              ) : (
                spots.map((spot, idx) => {
                  const script = scripts.find((s) => s.spotId === spot.id);
                  const audio = audioFiles.find((a) => a.lang === 'en');
                  return (
                    <Paper
                      key={spot.id}
                      variant="outlined"
                      sx={{ p: 1, mb: 0.5, borderRadius: 1 }}
                    >
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            bgcolor: template?.accentColor ?? '#7c4dff',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {spot.spotNumber}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            fontWeight={700}
                            noWrap
                            sx={{ display: 'block', fontSize: '0.7rem' }}
                          >
                            {spot.title}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            sx={{ fontSize: '0.6rem' }}
                          >
                            {script
                              ? `${script.scriptText.slice(0, 60)}…`
                              : 'No script'}
                          </Typography>
                        </Box>
                        {audio && (
                          <Chip
                            label="▶"
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.6rem',
                              bgcolor: template?.accentColor ?? '#7c4dff',
                              color: '#fff',
                            }}
                          />
                        )}
                      </Box>
                    </Paper>
                  );
                })
              )}
            </Box>

            {/* Mock bottom nav */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 40,
                bgcolor: '#fff',
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                px: 1,
              }}
            >
              {['Guide', 'Map', 'Info'].map((tab) => (
                <Typography
                  key={tab}
                  variant="caption"
                  sx={{
                    fontSize: '0.6rem',
                    color: tab === 'Guide' ? template?.accentColor : 'text.disabled',
                    fontWeight: tab === 'Guide' ? 700 : 400,
                  }}
                >
                  {tab}
                </Typography>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center' }}>
        Mock preview — actual Player app preview will be available after Firebase integration.
        Template: {template?.name ?? 'Unknown'}
      </Typography>
    </Box>
  );
}
