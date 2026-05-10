import type { ChangeEvent, RefObject } from 'react';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Button, Card, CardContent, Chip, Stack, TextField } from '@mui/material';
import { audioDirectorStyles } from '../../theme';
import AudioDirectorSectionHeader from '../AudioDirectorSectionHeader';

type Props = {
  manuscriptText: string;
  isAnalyzing: boolean;
  txtInputRef: RefObject<HTMLInputElement | null>;
  onManuscriptChange: (value: string) => void;
  onContinue: () => void;
  onUploadRequest: () => void;
  onTxtSelected: (file: File | null) => Promise<void>;
};

export default function ScriptInputScreen(props: Props) {
  const {
    manuscriptText,
    isAnalyzing,
    txtInputRef,
    onManuscriptChange,
    onContinue,
    onUploadRequest,
    onTxtSelected,
  } = props;

  const canContinue = manuscriptText.trim().length > 0;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    void onTxtSelected(file);
    event.target.value = '';
  };

  return (
    <Card sx={audioDirectorStyles.sectionCard}>
      <CardContent sx={{ p: { xs: 3, md: 5 } }}>
        <Stack spacing={3}>
          <AudioDirectorSectionHeader
            icon={<UploadFileIcon />}
            title="Bring in the master script"
            body="Paste the full narration manuscript or upload a .txt file. AudioDirector will detect the source language and prepare the script for production."
            eyebrow="Step 1"
          />

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip label={`${manuscriptText.length.toLocaleString()} characters`} variant="outlined" />
          </Stack>

          <TextField
            multiline
            minRows={14}
            maxRows={30}
            placeholder="Paste or type your guide script here…"
            value={manuscriptText}
            onChange={(event) => onManuscriptChange(event.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.95rem' } }}
          />

          <input
            ref={txtInputRef}
            hidden
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileChange}
          />

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
          >
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={onUploadRequest}>
              Upload .txt
            </Button>

            <Button
              variant="contained"
              size="large"
              startIcon={<AutoAwesomeIcon />}
              disabled={!canContinue || isAnalyzing}
              onClick={onContinue}
            >
              {isAnalyzing ? 'Analyzing…' : 'Analyze Script'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
