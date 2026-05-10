import { expect, test, type Page } from '@playwright/test';

const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'audio-mvp-e2e-admin@example.com';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Passw0rd123';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/audio-mvp');
}

test.describe('Audio MVP extended flows', () => {
  test('shows validation error when manuscript is empty', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: '開始生成音檔' }).click();
    await expect(page.getByText('請先貼上講稿，並以空行分段。')).toBeVisible();
  });

  test('supports .txt upload entry point and generates audio', async ({ page }) => {
    await signIn(page);

    const txtContent = 'Upload paragraph one.\n\nUpload paragraph two.';
    await page.locator('input[type="file"][accept=".txt,text/plain"]').setInputFiles({
      name: 'manuscript.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(txtContent, 'utf-8'),
    });

    await expect(page.getByText('段落數：2')).toBeVisible();
    await page.getByRole('button', { name: '開始生成音檔' }).click();

    await expect(page.getByText(/English.*完成/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: '2. 音檔評估與重生成' }).click();
    await expect(page.locator('audio').first()).toBeVisible({ timeout: 20_000 });
  });
});
