import { expect, test, type Page } from '@playwright/test';

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'audio-mvp-e2e-admin@example.com';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Passw0rd123';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe('Audio Director one-page workspace', () => {
  test('renders the workspace layout, opens config dialogs, and exposes script tabs', async ({ page }) => {
    await signIn(page);

    const seededDraft = {
      manuscriptText: 'Paragraph one for the director workspace.\n\nParagraph two for the director workspace.',
      sessionId: 'audio-director-test-session',
      coreLanguage: 'en',
      scriptEnhancementEnabled: true,
      globalSettings: {
        contentVersion: 'standard',
        scriptEnhancementLimit: 'none',
        directorNote: {
          scene: 'A quiet museum gallery at closing time.',
          style: 'Warm, grounded, and immersive.',
          pacing: 'Slow, clear, and inviting.',
          compiledPromptOverride: '',
          isPromptCustomized: false,
        },
      },
      items: [
        {
          spotId: 'spot_001',
          spotNumber: 1,
          title: 'Script',
          scriptText: 'Paragraph one for the director workspace.\n\nParagraph two for the director workspace.',
          excerpt: 'Paragraph one for the director workspace.',
          overrideEnabled: false,
        },
      ],
      customCharacters: [],
      enhancementCache: {},
      generationHistory: [
        {
          runId: 'run-1',
          generatedAt: Date.now(),
          coreLanguage: 'en',
          label: 'English generation run',
          itemCount: 1,
          audioFiles: [
            {
              lang: 'en',
              label: 'English',
              audioUrl: 'https://example.com/audio.mp3',
              durationMs: 1234,
              approved: false,
              spots: [
                {
                  spotId: 'spot_001',
                  spotNumber: 1,
                  title: 'Script',
                  audioUrl: 'https://example.com/audio.mp3',
                  durationMs: 1234,
                },
              ],
            },
          ],
          srtFiles: [
            {
              lang: 'en',
              label: 'English',
              rawSrt: '1\n00:00:00,000 --> 00:00:01,234\nParagraph one.\n',
              entries: [],
            },
          ],
        },
      ],
    };

    await page.addInitScript((draft) => {
      window.localStorage.setItem('audio-director-draft-v1', JSON.stringify(draft));
    }, seededDraft);

    await page.goto('/audio-director');

    await expect(page.getByRole('heading', { name: 'One-page audio workspace' })).toBeVisible();
    await expect(page.getByText('Result History')).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate audio/ })).toBeVisible();
    await expect(page.locator('audio').first()).toBeVisible();

    await page.getByRole('button', { name: /Character/ }).click();
    await expect(page.getByRole('dialog', { name: 'Select Character' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Voice/ }).click();
    await expect(page.getByRole('dialog', { name: 'Select Voice' })).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('tab', { name: 'Original script' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Polished script' })).toBeVisible();
    await page.getByRole('tab', { name: 'Original script' }).click();
    await expect(page.getByLabel('Original script')).toBeVisible();
    await page.getByRole('tab', { name: 'Polished script' }).click();
    await expect(page.getByLabel('Polished script')).toBeVisible();

    await expect(page.getByText('English generation run')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download SRT' })).toBeVisible();
  });
});