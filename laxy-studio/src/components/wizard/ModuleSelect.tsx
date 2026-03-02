// ---------------------------------------------------------------------------
// ModuleSelect — function/module selection with rich cards (PW-5)
// ---------------------------------------------------------------------------
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import { useGuidesStore } from '../../guidesStore';
import { AVAILABLE_MODULES, type ModuleId } from '../../types/entity';

// ── Module card ──────────────────────────────────────────────────────────

interface ModuleCardProps {
  mod: (typeof AVAILABLE_MODULES)[number];
  enabled: boolean;
  onToggle: () => void;
}

function ModuleCard({ mod, enabled, onToggle }: ModuleCardProps) {
  const isAvailable = mod.available;

  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        height: '100%',
        borderColor: enabled ? 'primary.main' : isAvailable ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        borderWidth: enabled ? 2 : 1,
        opacity: isAvailable ? 1 : 0.55,
        transition: 'all 0.2s ease',
        '&:hover': isAvailable
          ? {
              borderColor: 'primary.main',
              transform: 'translateY(-2px)',
              boxShadow: enabled
                ? '0 0 24px rgba(124, 77, 255, 0.2)'
                : '0 4px 20px rgba(0,0,0,0.3)',
            }
          : {},
      }}
    >
      {/* Selected badge */}
      {enabled && (
        <CheckCircleIcon
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            color: 'primary.main',
            bgcolor: 'background.paper',
            borderRadius: '50%',
            fontSize: 28,
            zIndex: 2,
          }}
        />
      )}

      {/* Lock icon for unavailable */}
      {!isAvailable && (
        <LockIcon
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            color: 'text.disabled',
            fontSize: 22,
            zIndex: 2,
          }}
        />
      )}

      <CardActionArea
        onClick={isAvailable ? onToggle : undefined}
        disabled={!isAvailable}
        sx={{
          p: 3,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          cursor: isAvailable ? 'pointer' : 'not-allowed',
        }}
      >
        {/* Icon */}
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 3,
            bgcolor: enabled ? 'rgba(124, 77, 255, 0.12)' : 'rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            mb: 2,
            transition: 'background-color 0.2s',
          }}
        >
          {mod.icon}
        </Box>

        <CardContent sx={{ p: 0, pb: '0 !important', width: '100%' }}>
          {/* Title row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {mod.label}
            </Typography>
          </Box>

          {/* Description */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
            {mod.description}
          </Typography>

          {/* Phase badge */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {isAvailable ? (
              <Chip
                label={enabled ? 'Enabled' : 'Available'}
                size="small"
                color={enabled ? 'primary' : 'default'}
                variant={enabled ? 'filled' : 'outlined'}
              />
            ) : (
              <Chip
                label={`Phase ${mod.phase}`}
                size="small"
                variant="outlined"
                sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'text.disabled' }}
              />
            )}
            {isAvailable && (
              <Chip
                label="Phase 1"
                size="small"
                variant="outlined"
                sx={{ borderColor: 'success.main', color: 'success.main' }}
              />
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function ModuleSelect() {
  const enabled = useGuidesStore((s) => s.entityConfig.enabledModules);
  const setField = useGuidesStore((s) => s.setEntityField);

  const toggle = (id: ModuleId) => {
    const next = enabled.includes(id)
      ? enabled.filter((m) => m !== id)
      : [...enabled, id];
    setField('enabledModules', next);
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
        Select Modules
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Choose which features to enable for your venue. Additional modules will be unlocked in future phases.
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ mb: 3, display: 'block' }}>
        At least one module must be enabled. In Phase 1, only Audio Guide is available.
      </Typography>

      <Grid container spacing={3}>
        {AVAILABLE_MODULES.map((mod) => (
          <Grid key={mod.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <ModuleCard
              mod={mod}
              enabled={enabled.includes(mod.id)}
              onToggle={() => toggle(mod.id)}
            />
          </Grid>
        ))}
      </Grid>

      {/* Summary */}
      <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Typography variant="subtitle2" gutterBottom>
          Enabled modules
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {enabled.length === 0 ? (
            <Typography variant="body2" color="error.main">
              No modules selected — please enable at least one module to proceed.
            </Typography>
          ) : (
            enabled.map((id) => {
              const mod = AVAILABLE_MODULES.find((m) => m.id === id);
              return (
                <Chip
                  key={id}
                  label={`${mod?.icon ?? ''} ${mod?.label ?? id}`}
                  color="primary"
                  variant="outlined"
                  size="small"
                />
              );
            })
          )}
        </Box>
      </Box>
    </Box>
  );
}
