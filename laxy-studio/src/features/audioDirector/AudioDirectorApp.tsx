import CloseIcon from '@mui/icons-material/Close';
import GraphicEqOutlinedIcon from '@mui/icons-material/GraphicEqOutlined';
import { Backdrop, Badge, Box, CircularProgress, Container, Dialog, DialogContent, DialogTitle, Fab, IconButton, Paper, Stack, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { useAudioDirectorController } from './useAudioDirectorController';
import { audioDirectorStyles, audioDirectorTheme } from './theme';
import AnalysisOverlay from './components/AnalysisOverlay';
import CharacterDesignerDialog from './components/dialogs/CharacterDesignerDialog';
import CharacterPickerDialog from './components/dialogs/CharacterPickerDialog';
import ConfigPreviewDialog from './components/dialogs/ConfigPreviewDialog';
import DirectorNoteDialog from './components/dialogs/DirectorNoteDialog';
import VoicePickerDialog from './components/dialogs/VoicePickerDialog';
import DeployVersionFooter from '../../components/DeployVersionFooter';
import AudioDirectorHero from './components/AudioDirectorHero';
import GenerationHistoryRail from './components/panels/GenerationHistoryRail';
import ScriptPolishSection from './components/panels/ScriptPolishSection';
import TtsScriptSection from './components/panels/TtsScriptSection';
import { langLabel } from '../../types/entity';

function playWarmCompletionBeep() {
  const AudioContextCtor = window.AudioContext ?? (window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const audioContext = new AudioContextCtor();
  const now = audioContext.currentTime;
  const masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.11, now + 0.03);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  masterGain.connect(audioContext.destination);

  const createTone = (frequency: number, startOffset: number, duration: number) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now + startOffset);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.04, now + startOffset + duration);
    gainNode.gain.setValueAtTime(0.0001, now + startOffset);
    gainNode.gain.exponentialRampToValueAtTime(0.65, now + startOffset + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    oscillator.start(now + startOffset);
    oscillator.stop(now + startOffset + duration + 0.05);
  };

  createTone(523.25, 0, 0.28);
  createTone(659.25, 0.18, 0.34);

  window.setTimeout(() => {
    void audioContext.close().catch(() => undefined);
  }, 1400);
}

export default function AudioDirectorApp() {
  const controller = useAudioDirectorController();
  const [scriptPolishOpen, setScriptPolishOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [hasUnreadGeneratedResult, setHasUnreadGeneratedResult] = useState(false);
  const resultCount = controller.generationHistory.reduce(
    (runTotal, run) =>
      runTotal + run.audioFiles.reduce((audioTotal, languageAudio) => audioTotal + (languageAudio.spots?.length ?? 0), 0),
    0,
  );
  const isEmbedded = window.self !== window.top;
  const hasWindowOpener = window.opener !== null && window.opener !== window;
  const launcherWindow = hasWindowOpener ? window.opener : (isEmbedded ? window.parent : null);
  const launchSearchParams = new URLSearchParams(window.location.search);
  const launchId = launchSearchParams.get('launchId')?.trim() || undefined;
  const launchedFromTts = launchSearchParams.get('source') === 'tts' && Boolean(launcherWindow);
  const launchGuideTitle = launchSearchParams.get('guideTitle')?.trim() || '';
  const launchSpotTitle = launchSearchParams.get('spotTitle')?.trim() || launchSearchParams.get('spotId')?.trim() || '';
  const launchLang = launchSearchParams.get('lang')?.trim() || '';
  const headerTitle = launchGuideTitle && launchSpotTitle
    ? `${launchGuideTitle} · ${launchSpotTitle}`
    : launchGuideTitle || launchSpotTitle || 'Audio Director';
  const headerSubtitle = launchLang ? `${langLabel(launchLang)} narration workspace` : 'Narration workspace';

  useEffect(() => {
    if (controller.resultDialogRequestAt) {
      setResultOpen(true);
    }
  }, [controller.resultDialogRequestAt]);

  useEffect(() => {
    const titlePrefix = hasUnreadGeneratedResult ? '🔔 ' : '';
    if ((!launchGuideTitle && !launchSpotTitle) || !launchLang) {
      document.title = `${titlePrefix}Audio Director`;
      return;
    }
    document.title = `${titlePrefix}${headerTitle} · ${langLabel(launchLang)} · Audio Director`;
  }, [hasUnreadGeneratedResult, headerTitle, launchGuideTitle, launchLang, launchSpotTitle]);

  useEffect(() => {
    if (!controller.generationCompletedAt) return;
    setResultOpen(true);
    setHasUnreadGeneratedResult(true);
    playWarmCompletionBeep();
  }, [controller.generationCompletedAt]);

  useEffect(() => {
    const clearUnreadIfViewed = () => {
      if (!resultOpen) return;
      if (document.visibilityState !== 'visible') return;
      if (!document.hasFocus()) return;
      setHasUnreadGeneratedResult(false);
    };

    clearUnreadIfViewed();
    window.addEventListener('focus', clearUnreadIfViewed);
    document.addEventListener('visibilitychange', clearUnreadIfViewed);
    return () => {
      window.removeEventListener('focus', clearUnreadIfViewed);
      document.removeEventListener('visibilitychange', clearUnreadIfViewed);
    };
  }, [resultOpen]);

  const handleChooseAudio = (selection: {
    audioUrl: string;
    scriptText: string;
    versionId?: string;
    storagePath?: string;
    guideId?: string;
    spotId?: string;
    lang?: string;
  }) => {
    if (!selection.audioUrl) return;
    if (!launchedFromTts || !launcherWindow) return;

    launcherWindow.postMessage(
      {
        type: 'laxy:result-selected',
        launchId,
        outputScript: selection.scriptText,
        outputAudio: selection.audioUrl,
        versionId: selection.versionId,
        storagePath: selection.storagePath,
        guideId: selection.guideId,
        spotId: selection.spotId,
        lang: selection.lang,
      },
      window.location.origin,
    );
    if (hasWindowOpener) {
      window.setTimeout(() => {
        window.close();
      }, 0);
    }
  };

  return (
    <ThemeProvider theme={audioDirectorTheme}>
      <Box sx={audioDirectorStyles.page}>
        <Container maxWidth="xl" sx={{ pb: 4 }}>
          <Stack spacing={2} sx={{ minWidth: 0 }}>
            <AudioDirectorHero
              title={headerTitle}
              subtitle={headerSubtitle}
            />
            <TtsScriptSection
              scriptText={controller.currentScriptText}
              compiledPrompt={controller.globalCompiledPrompt}
              characterAvatar={controller.selectedCharacter?.avatar ?? '＋'}
              characterName={controller.selectedCharacter?.name ?? 'Select a character'}
              characterSelected={Boolean(controller.selectedCharacter)}
              voiceId={controller.selectedVoice.id}
              voiceName={controller.selectedVoice.name}
              isGenerating={controller.isGenerating}
              isGeneratingJapaneseReading={controller.isGeneratingJapaneseReading}
              generateDisabled={!controller.selectedCharacter || controller.currentScriptText.trim().length === 0}
              japaneseReadingStale={controller.currentJapaneseReadingStale}
              japaneseReadingText={controller.currentJapaneseReadingText}
              onChangeScript={controller.handleCurrentScriptTextChange}
              onChangeJapaneseReading={controller.handleJapaneseReadingTextChange}
              onChangeCompiledPrompt={controller.handleCompiledPromptChange}
              onGenerate={controller.runGeneration}
              onGenerateJapaneseReading={controller.handleGenerateJapaneseReading}
              onPreviewVoice={controller.handleVoicePreviewRestart}
              onOpenCharacterPicker={() => controller.setCharacterPickerOpen(true)}
              onOpenVoicePicker={() => controller.setVoicePickerOpen(true)}
                onOpenScriptPolish={() => setScriptPolishOpen(true)}
                onOpenDirectorNote={() => controller.setDirectorNoteEditorOpen(true)}
              showJapaneseReading={controller.coreLanguage === 'ja'}
              />
            <DeployVersionFooter align="left" compact />
          </Stack>
        </Container>

        <Fab
          color="primary"
          variant="extended"
          onClick={() => setResultOpen(true)}
          sx={{
            position: 'fixed',
            right: { xs: 16, md: 24 },
            bottom: { xs: 16, md: 24 },
            zIndex: 1200,
          }}
        >
          <Badge
            badgeContent={resultCount}
            color="secondary"
            overlap="circular"
            sx={{
              mr: 1,
              '& .MuiBadge-badge': {
                fontWeight: 700,
                minWidth: 18,
                height: 18,
              },
            }}
          >
            <GraphicEqOutlinedIcon />
          </Badge>
          Result
        </Fab>

        <Dialog open={resultOpen} onClose={() => setResultOpen(false)} maxWidth="lg" fullWidth>
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Stack>
              <Typography variant="h6">Generated Audio</Typography>
              <Typography variant="body2" color="text.secondary">
                Review generated script audio in a compact list.
              </Typography>
            </Stack>
            <IconButton size="small" onClick={() => setResultOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <GenerationHistoryRail
              audioFiles={controller.audioFiles}
              generationHistory={controller.generationHistory}
              generationError={controller.generationError}
              isGenerating={controller.isGenerating}
              itemStates={controller.itemStates}
              items={controller.items}
              onChooseAudio={handleChooseAudio}
              progressSummary={controller.progressSummary}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={scriptPolishOpen} onClose={() => setScriptPolishOpen(false)} maxWidth="lg" fullWidth>
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Stack>
              <Typography variant="h6">Script Polish</Typography>
              <Typography variant="body2" color="text.secondary">
                Review and refine the polished script without leaving the main workflow.
              </Typography>
            </Stack>
            <IconButton size="small" onClick={() => setScriptPolishOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <ScriptPolishSection
              activeEnhancementEntries={controller.activeEnhancementEntries}
              coreLanguage={controller.coreLanguage}
              generationError={controller.generationError}
              getItemSettings={controller.getItemSettings}
              isEnhancing={controller.isEnhancing}
              isGenerating={controller.isGenerating}
              items={controller.items}
              onChangeEnhancedScript={controller.handleEnhancedScriptChange}
              onChangePhoneticOverrides={controller.handlePhoneticOverridesChange}
              onCueDensityChange={controller.handleScriptEnhancementLimitChange}
              onEnhanceAll={controller.handleEnhanceActiveLanguage}
              scriptEnhancementEnabled={controller.scriptEnhancementEnabled}
              scriptEnhancementLimit={controller.globalSettings.scriptEnhancementLimit}
              eyebrow="Polish dialog"
              mode="plain"
            />
          </DialogContent>
        </Dialog>

        <CharacterPickerDialog
          activeTab={controller.characterPickerTab}
          canManageCustomCharacters={controller.canManageCustomCharacters}
          customCharacters={controller.customCharacters}
          customCharactersError={controller.customCharactersError}
          customCharactersLoading={controller.customCharactersLoading}
          onClose={() => controller.setCharacterPickerOpen(false)}
          onCreateCustomCharacter={controller.openCreateCharacterDesigner}
          onDeleteCustomCharacter={controller.handleDeleteCustomCharacter}
          onEditCustomCharacter={controller.openEditCharacterDesigner}
          onSelect={(characterId) => {
            controller.handleGlobalCharacterChange(characterId);
            controller.setCharacterPickerOpen(false);
          }}
          onTabChange={controller.setCharacterPickerTab}
          open={controller.characterPickerOpen}
          pendingDeleteCharacterId={controller.pendingDeleteCharacterId}
          presetCharacters={controller.allCharacters.filter((character) => character.source === 'preset')}
          selectedCharacterId={controller.globalSettings.characterId}
        />

        <CharacterDesignerDialog
          generatedProfile={controller.characterDesignerPreview}
          generateError={controller.characterDesignerError}
          initialValues={controller.characterDesignerInitialValues}
          isGenerating={controller.characterDesignerGenerating}
          isSaving={controller.characterDesignerSaving}
          mode={controller.characterDesignerMode}
          onClose={controller.closeCharacterDesigner}
          onGenerate={controller.handleGenerateCharacterProfile}
          onSave={controller.handleSaveCustomCharacter}
          open={controller.characterDesignerOpen}
        />

        <VoicePickerDialog
          femaleVoices={controller.femaleVoices}
          maleVoices={controller.maleVoices}
          onClose={() => controller.setVoicePickerOpen(false)}
          onPreview={controller.handleVoicePreview}
          onSelect={(voiceId) => {
            controller.handleGlobalVoiceChange(voiceId);
            controller.setVoicePickerOpen(false);
          }}
          open={controller.voicePickerOpen}
          playingVoiceId={controller.playingVoiceId}
          recommendedVoiceId={controller.globalRecommendation.recommendedVoiceId}
          selectedVoiceId={controller.globalSettings.voiceId}
        />

        <DirectorNoteDialog
          onClose={() => controller.setDirectorNoteEditorOpen(false)}
          onEnvironmentChange={(value) => controller.handleDirectorNoteFieldChange('scene', value)}
          onGoalChange={(value) => controller.handleDirectorNoteFieldChange('pacing', value)}
          onTargetAudienceChange={(value) => controller.handleDirectorNoteFieldChange('style', value)}
          onToneChange={(value) => controller.handleDirectorNoteFieldChange('tone', value)}
          open={controller.directorNoteEditorOpen}
          settings={controller.globalSettings}
        />

        <ConfigPreviewDialog
          onClose={() => controller.setConfigPreviewOpen(false)}
          onDownload={controller.handleDownloadConfig}
          open={controller.configPreviewOpen}
          payload={controller.promptPreviewPayload}
        />

        <AnalysisOverlay
          analysisPhase={controller.analysisPhase}
          detectedLangLabel={controller.detectedLangLabel}
          open={controller.isAnalyzing}
        />

        <Backdrop
          open={controller.hasBusyOverlay}
          sx={{
            zIndex: (theme) => theme.zIndex.modal + 2,
            bgcolor: 'rgba(6, 10, 20, 0.76)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Paper
            elevation={10}
            sx={{
              px: 4,
              py: 3,
              minWidth: 320,
              maxWidth: 'min(92vw, 520px)',
              borderRadius: 3,
              bgcolor: 'rgba(18, 25, 42, 0.96)',
              color: 'common.white',
            }}
          >
            <Stack spacing={2} alignItems="center" textAlign="center">
              <CircularProgress color="inherit" size={34} thickness={4.5} />
              <Stack spacing={0.75}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Audio Director is working
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.84)' }}>
                  {controller.activeBusyLabel ?? 'Processing request…'}
                </Typography>
              </Stack>
            </Stack>
          </Paper>
        </Backdrop>
      </Box>
    </ThemeProvider>
  );
}
