// ---------------------------------------------------------------------------
// EntityConfigForm — full entity setup form (PW-1)
//
// Sections: Basic Info, Location, Media, Operating Hours, Languages,
//           Modules, Item Field Config
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useGuidesStore } from '../../guidesStore';
import {
  SUPPORTED_LANGUAGES,
  AVAILABLE_MODULES,
  DAY_LABELS,
  type OperatingHours,
  type ItemFieldDef,
  type LanguageCode,
  type ModuleId,
} from '../../types/entity';

// ── Helpers ──

function generateId(): string {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Sub-sections ──

function BasicInfoSection() {
  const venueName = useGuidesStore((s) => s.entityConfig.venueName);
  const address = useGuidesStore((s) => s.entityConfig.address);
  const website = useGuidesStore((s) => s.entityConfig.website);
  const phone = useGuidesStore((s) => s.entityConfig.phone);
  const set = useGuidesStore((s) => s.setEntityField);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <TextField
          label="Venue Name"
          required
          fullWidth
          value={venueName}
          onChange={(e) => set('venueName', e.target.value)}
          placeholder="e.g. Tokyo National Museum"
          helperText="The display name for this venue"
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <TextField
          label="Address"
          fullWidth
          value={address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="e.g. 13-9 Uenokoen, Taito City, Tokyo 110-8712, Japan"
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label="Website"
          fullWidth
          type="url"
          value={website}
          onChange={(e) => set('website', e.target.value)}
          placeholder="https://www.tnm.jp"
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label="Phone"
          fullWidth
          type="tel"
          value={phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="+81 3-3822-1111"
        />
      </Grid>
    </Grid>
  );
}

function LocationSection() {
  const gps = useGuidesStore((s) => s.entityConfig.gps);
  const set = useGuidesStore((s) => s.setEntityField);

  const lat = gps?.lat ?? '';
  const lng = gps?.lng ?? '';

  const handleChange = (field: 'lat' | 'lng', raw: string) => {
    const num = parseFloat(raw);
    const current = gps ?? { lat: 0, lng: 0 };
    if (raw === '' || raw === '-') {
      // allow clearing
      if (field === 'lat' && raw === '') set('gps', lng !== '' ? { ...current, lat: 0 } : null);
      else if (field === 'lng' && raw === '') set('gps', lat !== '' ? { ...current, lng: 0 } : null);
      return;
    }
    if (!isNaN(num)) {
      set('gps', { ...current, [field]: num });
    }
  };

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label="Latitude"
          fullWidth
          type="number"
          inputProps={{ step: 'any', min: -90, max: 90 }}
          value={lat}
          onChange={(e) => handleChange('lat', e.target.value)}
          placeholder="35.7189"
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label="Longitude"
          fullWidth
          type="number"
          inputProps={{ step: 'any', min: -180, max: 180 }}
          value={lng}
          onChange={(e) => handleChange('lng', e.target.value)}
          placeholder="139.7745"
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant="caption" color="text.secondary">
          GPS coordinates for the venue (used by the Player app for proximity features).
          A map picker will be available in a future update.
        </Typography>
      </Grid>
    </Grid>
  );
}

function MediaSection() {
  const mapImageUrl = useGuidesStore((s) => s.entityConfig.mapImageUrl);
  const coverImageUrl = useGuidesStore((s) => s.entityConfig.coverImageUrl);
  const set = useGuidesStore((s) => s.setEntityField);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label="Map Image URL"
          fullWidth
          value={mapImageUrl}
          onChange={(e) => set('mapImageUrl', e.target.value)}
          placeholder="https://storage.googleapis.com/... or upload later"
          helperText="URL to the venue floor plan or map image"
        />
        {mapImageUrl && (
          <Box sx={{ mt: 1, borderRadius: 1, overflow: 'hidden', maxHeight: 160 }}>
            <img src={mapImageUrl} alt="Map preview" style={{ width: '100%', objectFit: 'cover' }} />
          </Box>
        )}
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TextField
          label="Cover Image URL"
          fullWidth
          value={coverImageUrl}
          onChange={(e) => set('coverImageUrl', e.target.value)}
          placeholder="https://storage.googleapis.com/... or upload later"
          helperText="URL to the cover image shown in the Player app"
        />
        {coverImageUrl && (
          <Box sx={{ mt: 1, borderRadius: 1, overflow: 'hidden', maxHeight: 160 }}>
            <img src={coverImageUrl} alt="Cover preview" style={{ width: '100%', objectFit: 'cover' }} />
          </Box>
        )}
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant="caption" color="text.secondary">
          Image uploads will be supported via the Asset Library. For now, paste a direct URL.
        </Typography>
      </Grid>
    </Grid>
  );
}

function OperatingHoursSection() {
  const hours = useGuidesStore((s) => s.entityConfig.operatingHours);
  const set = useGuidesStore((s) => s.setEntityField);

  const updateDay = (idx: number, patch: Partial<OperatingHours>) => {
    const updated = hours.map((h, i) => (i === idx ? { ...h, ...patch } : h));
    set('operatingHours', updated);
  };

  return (
    <Box>
      {hours.map((h, idx) => (
        <Grid container spacing={1} key={h.day} sx={{ mb: 1, alignItems: 'center' }}>
          <Grid size={{ xs: 3, sm: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: h.closed ? 400 : 600, opacity: h.closed ? 0.5 : 1 }}>
              {DAY_LABELS[h.day]}
            </Typography>
          </Grid>
          <Grid size={{ xs: 3, sm: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={!h.closed}
                  onChange={(e) => updateDay(idx, { closed: !e.target.checked })}
                />
              }
              label={h.closed ? 'Closed' : 'Open'}
              slotProps={{ typography: { variant: 'caption' } }}
            />
          </Grid>
          {!h.closed && (
            <>
              <Grid size={{ xs: 3, sm: 3 }}>
                <TextField
                  type="time"
                  size="small"
                  fullWidth
                  value={h.open}
                  onChange={(e) => updateDay(idx, { open: e.target.value })}
                  label="Open"
                />
              </Grid>
              <Grid size={{ xs: 3, sm: 3 }}>
                <TextField
                  type="time"
                  size="small"
                  fullWidth
                  value={h.close}
                  onChange={(e) => updateDay(idx, { close: e.target.value })}
                  label="Close"
                />
              </Grid>
            </>
          )}
        </Grid>
      ))}
    </Box>
  );
}

function LanguagesSection() {
  const coreLanguage = useGuidesStore((s) => s.entityConfig.coreLanguage);
  const supported = useGuidesStore((s) => s.entityConfig.supportedLanguages);
  const set = useGuidesStore((s) => s.setEntityField);

  const toggleLanguage = (code: LanguageCode) => {
    if (code === coreLanguage) return; // can't remove core language
    const next = supported.includes(code)
      ? supported.filter((c) => c !== code)
      : [...supported, code];
    set('supportedLanguages', next);
  };

  const handleCoreChange = (code: LanguageCode) => {
    set('coreLanguage', code);
    // ensure core language is in supported list
    if (!supported.includes(code)) {
      set('supportedLanguages', [...supported, code]);
    }
  };

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}>
        <FormControl fullWidth required>
          <InputLabel>Core Language</InputLabel>
          <Select
            value={coreLanguage}
            label="Core Language"
            onChange={(e) => handleCoreChange(e.target.value as LanguageCode)}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <MenuItem key={l.code} value={l.code}>
                {l.label}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>The primary language for scripts and metadata</FormHelperText>
        </FormControl>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Supported Languages
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {SUPPORTED_LANGUAGES.map((l) => {
            const isCore = l.code === coreLanguage;
            const isSelected = supported.includes(l.code);
            return (
              <Chip
                key={l.code}
                label={l.label}
                clickable
                onClick={() => toggleLanguage(l.code)}
                color={isSelected ? 'primary' : 'default'}
                variant={isSelected ? 'filled' : 'outlined'}
                icon={isCore ? <CheckCircleIcon fontSize="small" /> : undefined}
                sx={{ opacity: isSelected ? 1 : 0.6 }}
              />
            );
          })}
        </Box>
        <FormHelperText>
          Click to toggle. The core language (✓) cannot be removed. Selected:{' '}
          {supported.length} language{supported.length !== 1 ? 's' : ''}.
        </FormHelperText>
      </Grid>
    </Grid>
  );
}

function ModulesSection() {
  const enabled = useGuidesStore((s) => s.entityConfig.enabledModules);
  const set = useGuidesStore((s) => s.setEntityField);

  const toggle = (id: ModuleId) => {
    const next = enabled.includes(id)
      ? enabled.filter((m) => m !== id)
      : [...enabled, id];
    set('enabledModules', next);
  };

  return (
    <Grid container spacing={2}>
      {AVAILABLE_MODULES.map((mod) => (
        <Grid size={{ xs: 12, sm: 4 }} key={mod.id}>
          <Box
            sx={{
              p: 2,
              border: '1px solid',
              borderColor: enabled.includes(mod.id) ? 'primary.main' : 'divider',
              borderRadius: 2,
              opacity: mod.available ? 1 : 0.4,
              cursor: mod.available ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              '&:hover': mod.available
                ? { borderColor: 'primary.main', bgcolor: 'rgba(124,77,255,0.04)' }
                : {},
            }}
            onClick={() => mod.available && toggle(mod.id)}
          >
            <FormControlLabel
              control={
                <Checkbox
                  checked={enabled.includes(mod.id)}
                  disabled={!mod.available}
                  onChange={() => mod.available && toggle(mod.id)}
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle2">{mod.label}</Typography>
                  {!mod.available && (
                    <Typography variant="caption" color="text.secondary">
                      Coming soon
                    </Typography>
                  )}
                </Box>
              }
            />
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

function ItemFieldsSection() {
  const fields = useGuidesStore((s) => s.entityConfig.itemFields);
  const set = useGuidesStore((s) => s.setEntityField);

  const updateField = (idx: number, patch: Partial<ItemFieldDef>) => {
    const updated = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    set('itemFields', updated);
  };

  const addField = () => {
    set('itemFields', [
      ...fields,
      { id: generateId(), label: '', type: 'text', required: false },
    ]);
  };

  const removeField = (idx: number) => {
    set('itemFields', fields.filter((_, i) => i !== idx));
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Define the metadata fields that will be extracted and editable for each exhibit item.
      </Typography>
      {fields.map((f, idx) => (
        <Grid container spacing={1} key={f.id} sx={{ mb: 1, alignItems: 'center' }}>
          <Grid size={{ xs: 5, sm: 4 }}>
            <TextField
              size="small"
              fullWidth
              value={f.label}
              onChange={(e) => updateField(idx, { label: e.target.value })}
              placeholder="Field label"
            />
          </Grid>
          <Grid size={{ xs: 3, sm: 2 }}>
            <FormControl size="small" fullWidth>
              <Select
                value={f.type}
                onChange={(e) => updateField(idx, { type: e.target.value as ItemFieldDef['type'] })}
              >
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="number">Number</MenuItem>
                <MenuItem value="date">Date</MenuItem>
                <MenuItem value="select">Select</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 2, sm: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={f.required}
                  onChange={(e) => updateField(idx, { required: e.target.checked })}
                />
              }
              label={<Typography variant="caption">Required</Typography>}
            />
          </Grid>
          <Grid size={{ xs: 2, sm: 1 }}>
            <IconButton size="small" color="error" onClick={() => removeField(idx)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Grid>
        </Grid>
      ))}
      <Button startIcon={<AddIcon />} size="small" onClick={addField} sx={{ mt: 1 }}>
        Add Field
      </Button>
    </Box>
  );
}

// ── Main Component ──

const SECTIONS = [
  { id: 'basic', title: 'Basic Information', icon: '🏛️', component: BasicInfoSection },
  { id: 'location', title: 'Location & GPS', icon: '📍', component: LocationSection },
  { id: 'media', title: 'Media', icon: '🖼️', component: MediaSection },
  { id: 'hours', title: 'Operating Hours', icon: '🕐', component: OperatingHoursSection },
  { id: 'languages', title: 'Languages', icon: '🌐', component: LanguagesSection },
  { id: 'modules', title: 'Modules', icon: '📦', component: ModulesSection },
  { id: 'fields', title: 'Item Field Configuration', icon: '📋', component: ItemFieldsSection },
];

export default function EntityConfigForm() {
  const [expanded, setExpanded] = useState<string | false>('basic');
  const isValid = useGuidesStore((s) => s.isEntityConfigValid);
  const isDirty = useGuidesStore((s) => s.isDirty);
  const venueName = useGuidesStore((s) => s.entityConfig.venueName);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Entity Configuration
        </Typography>
        {isValid() && (
          <Chip icon={<CheckCircleIcon />} label="Valid" color="success" size="small" variant="outlined" />
        )}
        {isDirty && (
          <Chip label="Unsaved" color="warning" size="small" variant="outlined" />
        )}
        <Tooltip title="Set up the venue details before starting the Guide wizard. All fields can be edited later.">
          <InfoOutlinedIcon sx={{ color: 'text.secondary', ml: 'auto' }} />
        </Tooltip>
      </Box>

      {venueName && (
        <Typography variant="subtitle1" color="primary.main" sx={{ mb: 2 }}>
          {venueName}
        </Typography>
      )}

      <Divider sx={{ mb: 2 }} />

      {SECTIONS.map(({ id, title, icon, component: SectionComponent }) => (
        <Accordion
          key={id}
          expanded={expanded === id}
          onChange={(_, isExp) => setExpanded(isExp ? id : false)}
          disableGutters
          sx={{
            mb: 1,
            '&:before': { display: 'none' },
            bgcolor: 'background.paper',
            borderRadius: '8px !important',
            overflow: 'hidden',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {icon} {title}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <SectionComponent />
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
