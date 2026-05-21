import { Backdrop, Box, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useEffect } from 'react';
import { useAudioDirectorController } from './useAudioDirectorController';
import { audioDirectorStyles, audioDirectorTheme } from './theme';
import AnalysisOverlay from './components/AnalysisOverlay';
import CharacterDesignerDialog from './components/dialogs/CharacterDesignerDialog';
import ConfigPreviewDialog from './components/dialogs/ConfigPreviewDialog';
import DeployVersionFooter from '../../components/DeployVersionFooter';
import AudioDirectorHero from './components/AudioDirectorHero';
import TtsScriptSection from './components/panels/TtsScriptSection';
import { langLabel } from '../../types/entity';

export default function AudioDirectorApp() {
  const controller = useAudioDirectorController();
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
    if ((!launchGuideTitle && !launchSpotTitle) || !launchLang) {
      document.title = 'Audio Director';
      return;
    }
    document.title = `${headerTitle} · ${langLabel(launchLang)} · Audio Director`;
  }, [headerTitle, launchGuideTitle, launchLang, launchSpotTitle]);

  const handleUsePromptInTts = () => {
    const compiledPrompt = controller.globalCompiledPrompt.trim();
    if (!compiledPrompt) return;
    if (!launchedFromTts || !launcherWindow) return;

    launcherWindow.postMessage(
      {
        type: 'laxy:prompt-selected',
        launchId,
        compiledPrompt,
        voiceId: controller.selectedVoice.id,
        voiceName: controller.selectedVoice.name,
        characterId: controller.selectedCharacter?.id ?? '',
        characterName: controller.selectedCharacter?.name ?? '',
        scene: controller.globalSettings.directorNote.scene,
        style: controller.globalSettings.directorNote.style,
        pacing: controller.globalSettings.directorNote.pacing,
        tone: controller.globalSettings.directorNote.tone,
        generatedPerformanceGuidelines: controller.globalSettings.directorNote.generatedPerformanceGuidelines,
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
              selectedCharacterId={controller.globalSettings.characterId}
              presetCharacters={controller.allCharacters.filter((character) => character.source === 'preset')}
              customCharacters={controller.customCharacters}
              characterLibraryTab={controller.characterPickerTab}
              customCharactersLoading={controller.customCharactersLoading}
              customCharactersError={controller.customCharactersError}
              canManageCustomCharacters={controller.canManageCustomCharacters}
              pendingDeleteCharacterId={controller.pendingDeleteCharacterId}
              voiceId={controller.selectedVoice.id}
              voiceName={controller.selectedVoice.name}
              femaleVoices={controller.femaleVoices}
              maleVoices={controller.maleVoices}
              recommendedVoiceId={controller.globalRecommendation.recommendedVoiceId}
              playingVoiceId={controller.playingVoiceId}
              isGenerating={controller.isGenerating}
              isGeneratingJapaneseReading={controller.isGeneratingJapaneseReading}
              generateDisabled={!controller.selectedCharacter || !controller.globalCompiledPrompt.trim()}
              finalActionLabel={launchedFromTts ? 'Use in TTS Job' : 'Done'}
              japaneseReadingStale={controller.currentJapaneseReadingStale}
              japaneseReadingText={controller.currentJapaneseReadingText}
              generationError={controller.generationError}
              onChangeScript={controller.handleCurrentScriptTextChange}
              onChangeJapaneseReading={controller.handleJapaneseReadingTextChange}
              onChangeCompiledPrompt={controller.handleCompiledPromptChange}
              onGenerate={handleUsePromptInTts}
              onGenerateJapaneseReading={controller.handleGenerateJapaneseReading}
              onPreviewVoice={controller.handleVoicePreviewRestart}
              onChangeVoice={controller.handleGlobalVoiceChange}
              onChangeCharacter={controller.handleGlobalCharacterChange}
              onChangeCharacterLibraryTab={controller.setCharacterPickerTab}
              onCreateCustomCharacter={controller.openCreateCharacterDesigner}
              onEditCustomCharacter={controller.openEditCharacterDesigner}
              onDeleteCustomCharacter={controller.handleDeleteCustomCharacter}
              scriptEnhancementLimit={controller.globalSettings.scriptEnhancementLimit}
              scriptEnhancementEnabled={controller.scriptEnhancementEnabled}
              hasScriptEnhancement={Object.keys(controller.activeEnhancementEntries).length > 0}
              isEnhancing={controller.isEnhancing}
              onCueDensityChange={controller.handleScriptEnhancementLimitChange}
              onEnhanceScript={controller.handleEnhanceActiveLanguage}
              onGeneratePerformanceGuidelines={controller.handleDirectorNoteDialogDone}
              onChangePerformanceHintField={controller.handleDirectorNoteFieldChange}
              onChangePerformanceGuidelines={controller.handleGeneratedPerformanceGuidelinesChange}
              performanceHint={{
                where: controller.globalSettings.directorNote.scene,
                who: controller.globalSettings.directorNote.style,
                what: controller.globalSettings.directorNote.pacing,
                how: controller.globalSettings.directorNote.tone,
                generatedGuidelines: controller.globalSettings.directorNote.generatedPerformanceGuidelines,
              }}
              showJapaneseReading={controller.coreLanguage === 'ja'}
            />
            <DeployVersionFooter align="left" compact />
          </Stack>
        </Container>

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
