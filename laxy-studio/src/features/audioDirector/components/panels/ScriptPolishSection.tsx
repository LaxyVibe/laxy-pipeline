import { useState } from 'react';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { langLabel } from '../../../../types/entity';
import { describeScriptEnhancementLimit, type AudioGuideSettings, type AudioPoiDraft } from '../../../audioMvp/model';
import type { EnhancementEntry } from '../../types';
import { audioDirectorStyles } from '../../theme';
import { createEmptyValidation } from '../../utils';
import AudioDirectorSectionHeader from '../AudioDirectorSectionHeader';

type Props = {
  items: AudioPoiDraft[];
  coreLanguage: string;
  scriptEnhancementEnabled: boolean;
  activeEnhancementEntries: Record<string, EnhancementEntry>;
  isGenerating: boolean;
  isEnhancing: boolean;
  generationError: string | null;
  getItemSettings: (item: AudioPoiDraft) => AudioGuideSettings;
  onToggleEnhancement: (enabled: boolean) => void;
  onEnhanceAll: (forceRegenerate?: boolean) => void;
  onChangeEnhancedScript: (language: string, item: AudioPoiDraft, nextText: string) => void;
  onChangePhoneticOverrides?: (
    language: string,
    item: AudioPoiDraft,
    overrides: Array<{ source: string; target: string }>,
  ) => void;
  eyebrow?: string;
  mode?: 'card' | 'plain';
};

type ScriptView = 'original' | 'polished';

export default function ScriptPolishSection(props: Props) {
  const {
    items,
    coreLanguage,
    scriptEnhancementEnabled,
    activeEnhancementEntries,
    isGenerating,
    isEnhancing,
    generationError,
    getItemSettings,
    onToggleEnhancement,
    onEnhanceAll,
    onChangeEnhancedScript,
    eyebrow = 'Right center column',
    mode = 'card',
  } = props;

  const hasEnhancement = Object.keys(activeEnhancementEntries).length > 0;
  const showEmbeddedHeader = mode !== 'plain';
  const content = (
    <Stack spacing={2.5}>
      <Stack spacing={2}>
        {showEmbeddedHeader ? (
          <AudioDirectorSectionHeader
            icon={<AutoAwesomeIcon />}
            title="Script polish"
            body="Review the original transcript and the polished version side by side through tabs."
            eyebrow={eyebrow}
          />
        ) : null}

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Chip label={`Language: ${langLabel(coreLanguage)}`} variant="outlined" />
        </Stack>

        {generationError ? <Alert severity="error">{generationError}</Alert> : null}

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }}>
          <FormControlLabel
            control={(
              <Checkbox
                checked={scriptEnhancementEnabled}
                onChange={(event) => onToggleEnhancement(event.target.checked)}
              />
            )}
            label="Enable performance cue enhancement"
          />

          <Button
            variant="outlined"
            startIcon={isEnhancing ? <RefreshIcon /> : hasEnhancement ? <RefreshIcon /> : <AutoAwesomeIcon />}
            onClick={() => onEnhanceAll(hasEnhancement)}
            disabled={!scriptEnhancementEnabled || isGenerating || isEnhancing}
          >
            {isEnhancing ? 'Enhancing…' : hasEnhancement ? 'Re-run enhance script' : 'Run enhance script'}
          </Button>
        </Stack>

        <Alert severity={scriptEnhancementEnabled ? 'info' : 'warning'}>
          {scriptEnhancementEnabled
            ? 'Performance cues are active. Use the enhance button here when you want a polished script. Generate audio will not run enhancement automatically.'
            : 'Performance cues are off. Audio generation will use the clean script directly.'}
        </Alert>
      </Stack>

      {items.length === 0 ? (
        <Alert severity="info">
          Add guide text first to prepare and polish your script.
        </Alert>
      ) : (
        <Stack spacing={1.5}>
          {items.map((item) => {
            const settings = getItemSettings(item);
            const entry = activeEnhancementEntries[item.spotId];
            return (
              <ScriptPolishItemCard
                key={`${coreLanguage}-${item.spotId}`}
                item={item}
                coreLanguage={coreLanguage}
                entry={entry}
                scriptEnhancementEnabled={scriptEnhancementEnabled}
                scriptEnhancementLimit={settings.scriptEnhancementLimit}
                onChangeEnhancedScript={onChangeEnhancedScript}
              />
            );
          })}
        </Stack>
      )}
    </Stack>
  );

  if (mode === 'plain') {
    return content;
  }

  return (
    <Card sx={audioDirectorStyles.sectionCard}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        {content}
      </CardContent>
    </Card>
  );
}

function ScriptPolishItemCard(props: {
  item: AudioPoiDraft;
  coreLanguage: string;
  entry: EnhancementEntry | undefined;
  scriptEnhancementEnabled: boolean;
  scriptEnhancementLimit: AudioGuideSettings['scriptEnhancementLimit'];
  onChangeEnhancedScript: (language: string, item: AudioPoiDraft, nextText: string) => void;
}) {
  const {
    item,
    coreLanguage,
    entry,
    scriptEnhancementEnabled,
    scriptEnhancementLimit,
    onChangeEnhancedScript,
  } = props;
  const [view, setView] = useState<ScriptView>('polished');
  const validation = entry?.validation ?? createEmptyValidation();
  const displayText = entry?.enhancedText ?? item.scriptText ?? '';

  return (
    <Paper elevation={0} sx={audioDirectorStyles.nestedPanel}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Script
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {describeScriptEnhancementLimit(scriptEnhancementLimit)}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {entry?.isEdited ? <Chip label="Edited" color="primary" size="small" /> : null}
            {validation.totalTags > 0 ? <Chip label={`${validation.totalTags} cue tags`} variant="outlined" size="small" /> : null}
            {!validation.isValid ? <Chip label="Needs cleanup" color="warning" size="small" /> : null}
          </Stack>
        </Stack>

        <Tabs
          value={view}
          onChange={(_, nextValue: ScriptView) => setView(nextValue)}
          sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}
        >
          <Tab value="original" label="Original script" />
          <Tab value="polished" label="Polished script" />
        </Tabs>

        {view === 'original' ? (
          <TextField
            label="Original script"
            multiline
            minRows={8}
            value={item.scriptText ?? ''}
            InputProps={{ readOnly: true }}
          />
        ) : (
          <TextField
            label="Polished script"
            multiline
            minRows={10}
            value={displayText}
            onChange={(event) => onChangeEnhancedScript(coreLanguage, item, event.target.value)}
            disabled={!scriptEnhancementEnabled}
            helperText={scriptEnhancementEnabled
              ? describeScriptEnhancementLimit(scriptEnhancementLimit)
              : 'Enable performance cues above to edit this field.'}
          />
        )}

        {validation.isValid ? null : (
          <Alert severity="warning">
            <Stack spacing={0.5}>
              {validation.issues.map((issue) => (
                <Typography key={`${item.spotId}-${issue.index}`} variant="body2">
                  {issue.message} {issue.excerpt}
                </Typography>
              ))}
            </Stack>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
