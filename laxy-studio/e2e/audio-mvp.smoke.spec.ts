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

async function openAudioMvp(page: Page): Promise<void> {
  await page.goto('/audio-mvp');
  await expect(page.getByRole('heading', { name: 'Audio MVP' })).toBeVisible();
}

async function waitLanguageDone(page: Page, label: string): Promise<void> {
  await expect(page.getByText(new RegExp(`${label}.*完成`))).toBeVisible({ timeout: 20_000 });
}

test.describe('Audio MVP smoke', () => {
  test('renders protected audio MVP page after login', async ({ page }) => {
    await signIn(page);
    await openAudioMvp(page);

    await expect(page.getByText('流程：音導設定與生成 → 音檔評估與重生成。')).toBeVisible();
    await expect(page.getByRole('combobox', { name: '原稿語言' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '1. 音導設定與生成' })).toBeVisible();
  });

  test('generates single-language audio from 2-paragraph manuscript', async ({ page }) => {
    await signIn(page);
    await openAudioMvp(page);

    await page.getByLabel('原稿（原稿語言）').fill('Paragraph one for smoke test.\n\nParagraph two for smoke test.');
    await page.getByRole('button', { name: '開始生成音檔' }).click();

    await waitLanguageDone(page, 'English');
    await page.getByRole('tab', { name: '2. 音檔評估與重生成' }).click();
    await expect(page.locator('audio').first()).toBeVisible({ timeout: 20_000 });
  });
});
