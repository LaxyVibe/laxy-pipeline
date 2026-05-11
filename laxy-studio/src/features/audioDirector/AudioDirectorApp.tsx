import CloseIcon from '@mui/icons-material/Close';
import { Box, Container, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useState } from 'react';
import { useAudioDirectorController } from './useAudioDirectorController';
import { audioDirectorStyles, audioDirectorTheme } from './theme';
import AnalysisOverlay from './components/AnalysisOverlay';
import CharacterEditorDialog from './components/dialogs/CharacterEditorDialog';
import CharacterPickerDialog from './components/dialogs/CharacterPickerDialog';
import ConfigPreviewDialog from './components/dialogs/ConfigPreviewDialog';
import DirectorNoteDialog from './components/dialogs/DirectorNoteDialog';
import VoicePickerDialog from './components/dialogs/VoicePickerDialog';
import GenerationHistoryRail from './components/panels/GenerationHistoryRail';
import ScriptPolishSection from './components/panels/ScriptPolishSection';
import TtsScriptSection from './components/panels/TtsScriptSection';

export default function AudioDirectorApp() {
  const controller = useAudioDirectorController();
  const [scriptPolishOpen, setScriptPolishOpen] = useState(false);

  return (
    <ThemeProvider theme={audioDirectorTheme}>
      <Box sx={audioDirectorStyles.page}>
        <Container maxWidth="xl" sx={{ pb: 4 }}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                xl: 'minmax(0, 1fr) 360px',
              },
              alignItems: 'start',
            }}
          >
            <Stack spacing={2} sx={{ minWidth: 0 }}>
              <TtsScriptSection
                scriptText={controller.currentScriptText}
                compiledPrompt={controller.globalCompiledPrompt}
                characterAvatar={controller.selectedCharacter.avatar}
                characterName={controller.selectedCharacter.name}
                voiceId={controller.selectedVoice.id}
                voiceName={controller.selectedVoice.name}
                isGenerating={controller.isGenerating}
                generateDisabled={controller.currentScriptText.trim().length === 0}
                onChangeScript={controller.handleCurrentScriptTextChange}
                onChangeCompiledPrompt={controller.handleCompiledPromptChange}
                onGenerate={controller.runGeneration}
                onPreviewVoice={controller.handleVoicePreviewRestart}
                onOpenCharacterPicker={() => controller.setCharacterPickerOpen(true)}
                onOpenVoicePicker={() => controller.setVoicePickerOpen(true)}
                onOpenScriptPolish={() => setScriptPolishOpen(true)}
                onOpenDirectorNote={() => controller.setDirectorNoteEditorOpen(true)}
              />
            </Stack>

            <GenerationHistoryRail
              audioFiles={controller.audioFiles}
              generationHistory={controller.generationHistory}
              generationError={controller.generationError}
              isGenerating={controller.isGenerating}
              itemStates={controller.itemStates}
              items={controller.items}
              progressSummary={controller.progressSummary}
            />
          </Box>
        </Container>

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
              onEnhanceAll={controller.handleEnhanceActiveLanguage}
              onToggleEnhancement={controller.setScriptEnhancementEnabled}
              scriptEnhancementEnabled={controller.scriptEnhancementEnabled}
              eyebrow="Polish dialog"
              mode="plain"
            />
          </DialogContent>
        </Dialog>

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
