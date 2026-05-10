import { useEffect } from 'react';
import { Box, Chip, Container, Dialog, Stack, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useAudioDirectorController } from './useAudioDirectorController';
import { audioDirectorStyles, audioDirectorTheme } from './theme';
import AnalysisOverlay from './components/AnalysisOverlay';
import CharacterEditorDialog from './components/dialogs/CharacterEditorDialog';
import CharacterPickerDialog from './components/dialogs/CharacterPickerDialog';
import ConfigPreviewDialog from './components/dialogs/ConfigPreviewDialog';
import DirectorNoteDialog from './components/dialogs/DirectorNoteDialog';
import VoicePickerDialog from './components/dialogs/VoicePickerDialog';
import AudioDirectorConfigRail from './components/panels/AudioDirectorConfigRail';
import DirectorNoteSection from './components/panels/DirectorNoteSection';
import GenerationHistoryRail from './components/panels/GenerationHistoryRail';
import ScriptPolishSection from './components/panels/ScriptPolishSection';

export default function AudioDirectorApp() {
  const controller = useAudioDirectorController();

  return (
    <ThemeProvider theme={audioDirectorTheme}>
      <Box sx={audioDirectorStyles.page}>
        <Container maxWidth="xl" sx={{ pb: 4 }}>
          <Stack spacing={3}>
            <Box sx={audioDirectorStyles.hero}>
              <Stack spacing={2}>
                <Typography variant="overline" sx={{ letterSpacing: '0.18em', color: 'inherit', opacity: 0.8 }}>
                  Audio Director
                </Typography>
                <Box>
                  <Typography variant="h3" sx={{ color: 'inherit' }}>
                    One-page audio workspace
                  </Typography>
                  <Typography variant="body1" sx={{ maxWidth: 760, color: 'rgba(255,255,255,0.86)' }}>
                    Keep configuration, note editing, script polish, and generation history visible at the same time.
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={`Language: ${controller.coreLanguage.toUpperCase()}`} sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'inherit' }} />
                  <Chip label={`${controller.generationHistory.length} run(s) saved`} sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'inherit' }} />
                  <Chip label={controller.isGenerating ? 'Generating…' : 'Ready'} sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: 'inherit' }} />
                </Stack>
              </Stack>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: '1fr',
                  xl: '320px minmax(0, 1fr) 360px',
                },
                alignItems: 'start',
              }}
            >
              <AudioDirectorConfigRail
                selectedCharacter={controller.selectedCharacter}
                selectedVoice={controller.selectedVoice}
                coreLanguage={controller.coreLanguage}
                estimatedTokens={controller.estimatedTokens}
                onOpenCharacterPicker={() => controller.setCharacterPickerOpen(true)}
                onOpenVoicePicker={() => controller.setVoicePickerOpen(true)}
              />

              <Stack spacing={2} sx={{ minWidth: 0 }}>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      lg: 'repeat(2, minmax(0, 1fr))',
                    },
                    alignItems: 'start',
                  }}
                >
                  <DirectorNoteSection
                    globalSettings={controller.globalSettings}
                    selectedCharacter={controller.selectedCharacter}
                    selectedVoice={controller.selectedVoice}
                    globalRecommendation={controller.globalRecommendation}
                    estimatedTokens={controller.estimatedTokens}
                    saveStatus={controller.saveStatus}
                    saveMessage={controller.saveMessage}
                    onOpenConfigPreview={() => controller.setConfigPreviewOpen(true)}
                    onDownloadConfig={controller.handleDownloadConfig}
                    onSaveDraft={controller.handleSaveToBackend}
                    onOpenAdvancedEditor={() => controller.setDirectorNoteEditorOpen(true)}
                    onContentVersionChange={controller.handleGlobalContentVersionChange}
                    onScriptEnhancementLimitChange={controller.handleScriptEnhancementLimitChange}
                    onDirectorNoteFieldChange={controller.handleDirectorNoteFieldChange}
                  />

                  <ScriptPolishSection
                    activeEnhancementEntries={controller.activeEnhancementEntries}
                    coreLanguage={controller.coreLanguage}
                    generationError={controller.generationError}
                    getItemSettings={controller.getItemSettings}
                    isEnhancing={controller.isEnhancing}
                    isGenerating={controller.isGenerating}
                    items={controller.items}
                    onChangeEnhancedScript={controller.handleEnhancedScriptChange}
                    onEnhanceAll={controller.handleEnhanceActiveLanguage}
                    onToggleEnhancement={controller.setScriptEnhancementEnabled}
                    scriptEnhancementEnabled={controller.scriptEnhancementEnabled}
                  />
                </Box>
              </Stack>

              <GenerationHistoryRail
                audioFiles={controller.audioFiles}
                generationHistory={controller.generationHistory}
                generationError={controller.generationError}
                isGenerating={controller.isGenerating}
                itemStates={controller.itemStates}
                items={controller.items}
                onGenerate={controller.runGeneration}
                progressSummary={controller.progressSummary}
                srtFiles={controller.srtFiles}
              />
            </Box>
          </Stack>
        </Container>

        <CharacterPickerDialog
          characters={controller.allCharacters}
          onClose={() => controller.setCharacterPickerOpen(false)}
          onCreate={controller.openCreateCharacterDialog}
          onDelete={controller.handleDeleteCharacter}
          onEdit={controller.openEditCharacterDialog}
          onSelect={(characterId) => {
            controller.handleGlobalCharacterChange(characterId);
            controller.setCharacterPickerOpen(false);
          }}
          open={controller.characterPickerOpen}
          selectedCharacterId={controller.globalSettings.characterId}
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
          compiledPrompt={controller.globalCompiledPrompt}
          directorNotePrompt={controller.directorNotePrompt}
          hasScript={controller.items.some((item) => item.scriptText.trim())}
          isGenerating={controller.directorNoteGenerating}
          onClose={() => controller.setDirectorNoteEditorOpen(false)}
          onCompiledPromptChange={controller.handleCompiledPromptChange}
          onContentVersionChange={controller.handleGlobalContentVersionChange}
          onDirectorNotePromptChange={controller.setDirectorNotePrompt}
          onGenerate={controller.handleGenerateDirectorNote}
          onPacingChange={(value) => controller.handleDirectorNoteFieldChange('pacing', value)}
          onSceneChange={(value) => controller.handleDirectorNoteFieldChange('scene', value)}
          onScriptEnhancementLimitChange={controller.handleScriptEnhancementLimitChange}
          onStyleChange={(value) => controller.handleDirectorNoteFieldChange('style', value)}
          open={controller.directorNoteEditorOpen}
          settings={controller.globalSettings}
        />

        <CharacterEditorDialog
          characterDraft={controller.characterDraft}
          designerPrompt={controller.designerPrompt}
          editingCharacterId={controller.editingCharacterId}
          isGeneratingCharacter={controller.isGeneratingCharacter}
          onClose={controller.closeCharacterCreator}
          onDesignerPromptChange={controller.setDesignerPrompt}
          onDraftChange={controller.setCharacterDraft}
          onGenerateDraft={controller.handleDraftCharacter}
          onSave={controller.handleSaveCharacter}
          open={controller.characterCreatorOpen}
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
      </Box>
    </ThemeProvider>
  );
}
