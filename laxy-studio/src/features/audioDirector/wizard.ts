import type { WizardScreen } from './types';

export const AUDIO_DIRECTOR_WIZARD_STEPS: WizardScreen[] = [
  'guide-settings',
  'script-polish',
  'audio-production',
];

export const AUDIO_DIRECTOR_WIZARD_LABELS: Record<WizardScreen, string> = {
  'guide-settings': 'Guide Settings',
  'script-polish': 'Script Polish',
  'audio-production': 'Audio Production',
};
