import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { SUPPORTED_LANGUAGES, langLabel } from '../../../../types/entity';
import type { AudioPoiDraft } from '../../../audioMvp/model';
import { audioDirectorStyles } from '../../theme';
import AudioDirectorSectionHeader from '../AudioDirectorSectionHeader';

type Props = {
  manuscriptText: string;
  coreLanguage: string;
  items: AudioPoiDraft[];
  onManuscriptChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onBack: () => void;
  onConfirm: () => void;
};

export default function ScriptStopsScreen(props: Props) {
  const {
    manuscriptText,
    coreLanguage,
    items,
    onManuscriptChange,
    onLanguageChange,
    onBack,
    onConfirm,
  } = props;

  return (
    <Stack spacing={3}>
      <Card sx={audioDirectorStyles.sectionCard}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Stack spacing={2.5}>
            <AudioDirectorSectionHeader
              icon={<AccountTreeOutlinedIcon />}
              title="Review script parsing"
              body={`${items.length} stop${items.length !== 1 ? 's' : ''} · ${manuscriptText.length.toLocaleString()} characters · ${langLabel(coreLanguage)}`}
              eyebrow="Step 2"
            />

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip label={`Source: ${langLabel(coreLanguage)}`} variant="outlined" />
              <Chip label={`${items.length} stop${items.length === 1 ? '' : 's'}`} variant="outlined" />
            </Stack>

            <TextField
              multiline
              minRows={10}
              maxRows={26}
              label="Guide Script"
              placeholder="Paste or type your guide script here…"
              value={manuscriptText}
              onChange={(event) => onManuscriptChange(event.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.95rem' } }}
            />

            <TextField
              select
              label="Script Language"
              value={coreLanguage}
              onChange={(event) => onLanguageChange(event.target.value)}
              sx={{ minWidth: { lg: 260 } }}
            >
              {SUPPORTED_LANGUAGES.map((language) => (
                <MenuItem key={language.code} value={language.code}>
                  {langLabel(language.code)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Alert severity="warning">
          Add guide text above to generate stop previews before continuing.
        </Alert>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          {items.map((item) => (
            <Paper key={item.spotId} elevation={0} sx={audioDirectorStyles.nestedPanel}>
              <Stack spacing={1.25}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {item.spotNumber}. {item.title}
                  </Typography>
                  <Chip label={`${item.scriptText.length} chars`} size="small" />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {item.excerpt}
                </Typography>
              </Stack>
            </Paper>
          ))}
        </Box>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={onBack}>
          Back
        </Button>
        <Button
          variant="contained"
          startIcon={<CheckCircleOutlineIcon />}
          onClick={onConfirm}
          disabled={!manuscriptText.trim()}
        >
          Confirm Script
        </Button>
      </Stack>
    </Stack>
  );
}
