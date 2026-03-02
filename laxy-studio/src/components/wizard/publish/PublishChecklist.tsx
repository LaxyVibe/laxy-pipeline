// ---------------------------------------------------------------------------
// PublishChecklist — readiness checklist before publishing
// ---------------------------------------------------------------------------
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  Chip,
  alpha,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { useGuidesStore, type WizardStep } from '../../../guidesStore';
import type { ChecklistItem } from '../../../types/entity';
import { useMemo } from 'react';

export default function PublishChecklist() {
  const spots = useGuidesStore((s) => s.spots);
  const scripts = useGuidesStore((s) => s.scripts);
  const translations = useGuidesStore((s) => s.translations);
  const audioFiles = useGuidesStore((s) => s.audioFiles);
  const srtFiles = useGuidesStore((s) => s.srtFiles);
  const slideshows = useGuidesStore((s) => s.slideshows);
  const ingestionStatus = useGuidesStore((s) => s.ingestionStatus);
  const scriptStatus = useGuidesStore((s) => s.scriptStatus);
  const translationStatus = useGuidesStore((s) => s.translationStatus);
  const audioStatus = useGuidesStore((s) => s.audioStatus);
  const supportedLanguages = useGuidesStore((s) => s.entityConfig.supportedLanguages);
  const goToStep = useGuidesStore((s) => s.goToStep);

  const checklist = useMemo((): ChecklistItem[] => {
    const approvedScripts = scripts.filter((s) => s.approved).length;
    const approvedTranslations = translations.filter((t) => t.approved).length;
    const approvedAudio = audioFiles.filter((a) => a.approved).length;
    const configuredSlideshows = slideshows.filter(
      (ss) => ss.images.length > 0,
    ).length;
    const hasSingleLang = supportedLanguages.length === 1;

    return [
      {
        id: 'metadata',
        label: 'Metadata Reviewed',
        description: 'AI-extracted metadata approved in Ingestion step',
        checked: ingestionStatus === 'approved',
        linkedStep: 'ingest',
        detail: ingestionStatus === 'approved'
          ? `${spots.length} spot${spots.length !== 1 ? 's' : ''} approved`
          : 'Not approved',
      },
      {
        id: 'scripts',
        label: 'Scripts Approved',
        description: 'Generated scripts reviewed and approved',
        checked: scriptStatus === 'approved',
        linkedStep: 'script',
        detail:
          scriptStatus === 'approved'
            ? `${approvedScripts}/${scripts.length} spots approved`
            : `${approvedScripts}/${scripts.length} approved`,
      },
      {
        id: 'translations',
        label: 'Translations Approved',
        description: hasSingleLang
          ? 'Single language — no translation needed'
          : 'All language translations reviewed and approved',
        checked: translationStatus === 'approved' || hasSingleLang,
        linkedStep: 'translation',
        detail: hasSingleLang
          ? 'Skipped (single language)'
          : translationStatus === 'approved'
            ? `${approvedTranslations}/${translations.length} languages approved`
            : `${approvedTranslations}/${translations.length} approved`,
      },
      {
        id: 'audio',
        label: 'Audio Generated & Reviewed',
        description: 'TTS audio generated and approved for all languages',
        checked: audioStatus === 'approved',
        linkedStep: 'audio',
        detail:
          audioStatus === 'approved'
            ? `${approvedAudio}/${audioFiles.length} languages approved`
            : `${approvedAudio}/${audioFiles.length} approved`,
      },
      {
        id: 'srt',
        label: 'SRT Files Generated',
        description: 'Subtitle files generated and available',
        checked: srtFiles.length > 0,
        linkedStep: 'audio',
        detail:
          srtFiles.length > 0
            ? `${srtFiles.length} SRT file${srtFiles.length !== 1 ? 's' : ''}`
            : 'No SRT files',
      },
      {
        id: 'slideshow',
        label: 'Slideshow Configured',
        description: 'Images assigned and timed for each spot',
        checked: configuredSlideshows === slideshows.length && slideshows.length > 0,
        linkedStep: 'publish',
        detail:
          slideshows.length > 0
            ? `${configuredSlideshows}/${slideshows.length} spots configured`
            : 'No slideshows',
      },
    ];
  }, [
    spots,
    scripts,
    translations,
    audioFiles,
    srtFiles,
    slideshows,
    ingestionStatus,
    scriptStatus,
    translationStatus,
    audioStatus,
    supportedLanguages,
  ]);

  const allChecked = checklist.every((item) => item.checked);
  const checkedCount = checklist.filter((item) => item.checked).length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <FactCheckIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={700}>
          Publish Readiness Checklist
        </Typography>
        <Chip
          label={`${checkedCount}/${checklist.length}`}
          size="small"
          color={allChecked ? 'success' : 'warning'}
          variant="outlined"
        />
      </Box>

      {!allChecked && (
        <Paper
          sx={{
            p: 1.5,
            mb: 2,
            bgcolor: (t) => alpha(t.palette.warning.main, 0.08),
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <WarningAmberIcon color="warning" fontSize="small" />
          <Typography variant="body2" color="text.secondary">
            Complete all items before publishing. Click an item to navigate to its step.
          </Typography>
        </Paper>
      )}

      <Paper variant="outlined">
        <List dense disablePadding>
          {checklist.map((item, idx) => (
            <ListItem
              key={item.id}
              divider={idx < checklist.length - 1}
              secondaryAction={
                !item.checked && item.linkedStep !== 'publish' ? (
                  <Button
                    size="small"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => goToStep(item.linkedStep as WizardStep)}
                  >
                    Fix
                  </Button>
                ) : undefined
              }
              sx={{
                py: 1,
                bgcolor: item.checked
                  ? (t) => alpha(t.palette.success.main, 0.04)
                  : undefined,
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                {item.checked ? (
                  <CheckCircleIcon color="success" />
                ) : (
                  <RadioButtonUncheckedIcon color="disabled" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{
                        textDecoration: item.checked ? 'none' : undefined,
                        color: item.checked ? 'text.primary' : 'text.secondary',
                      }}
                    >
                      {item.label}
                    </Typography>
                    <Chip
                      label={item.detail}
                      size="small"
                      variant="outlined"
                      color={item.checked ? 'success' : 'default'}
                      sx={{ fontSize: '0.7rem' }}
                    />
                  </Box>
                }
                secondary={item.description}
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
}
