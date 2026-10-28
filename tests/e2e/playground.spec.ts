import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test('charge → repeat → quantity purchase → inventory → reload → reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/shop');
  await expect(page.getByTestId('fc-balance')).toHaveText('0 FC');
  await expect(page.getByRole('link', { name: /로그인|회원가입|Guest/i })).toHaveCount(0);
  await page.getByRole('link', { name: 'FC 구매', exact: true }).click();
  const charge = page.getByRole('button', { name: '11,000 FC 충전', exact: true });
  await charge.click();
  await expect(page.getByTestId('fc-balance')).toHaveText('11,000 FC');
  await charge.click();
  await expect(page.getByTestId('fc-balance')).toHaveText('22,000 FC');
  await page.screenshot({ path: `test-results/fc-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: '상점', exact: true }).click();
  await page.getByRole('link', { name: '개발용 상품', exact: true }).click();
  await page.getByRole('link', { name: /파운데이션 패키지/ }).click();
  await page.getByRole('spinbutton', { name: '구매 수량' }).fill('2');
  await expect(page.locator('.purchase-total')).toContainText('2,400 FC');
  await page.getByRole('button', { name: '가상 구매' }).click();
  await expect(page.getByTestId('fc-balance')).toHaveText('19,600 FC');
  await page.getByRole('link', { name: /지급된 아이템 확인/ }).click();
  await expect(page.getByTestId('inventory-demo-player-pack-v1')).toContainText('× 10');
  await expect(page.getByTestId('inventory-demo-box-v1')).toContainText('× 6');
  await expect(page.getByTestId('inventory-demo-event-item-v1')).toContainText('× 2');
  await expect(page.getByTestId('inventory-demo-bp-card-v1')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /개봉|열기/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('fc-balance')).toHaveText('19,600 FC');
  await expect(page.locator('.inventory-card')).toHaveCount(3);
  await page.locator('.inventory-card summary').first().click();
  await expect(page.locator('.inventory-card').first()).toContainText('파운데이션 패키지');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/inventory-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: '시뮬레이션 초기화', exact: true }).click();
  await expect(page.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByTestId('fc-balance')).toHaveText('19,600 FC');
  await page.getByRole('button', { name: '시뮬레이션 초기화', exact: true }).click();
  await page.getByRole('button', { name: '초기화하기', exact: true }).click();
  await expect(page.getByTestId('fc-balance')).toHaveText('0 FC');
  await expect(page.getByRole('heading', { name: '아직 보유한 아이템이 없습니다' })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('fc-balance')).toHaveText('0 FC');
  expect(errors).toEqual([]);
});

test('rapid double-click grants once; a later intentional click grants again', async ({ page }) => {
  await page.goto('/shop/fc');
  const charge = page.getByRole('button', { name: '300 FC 충전', exact: true });
  await expect(charge).toBeEnabled();
  await charge.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByTestId('fc-balance')).toHaveText('300 FC');
  await charge.click();
  await expect(page.getByTestId('fc-balance')).toHaveText('600 FC');
});

test('lost response survives reload and retries the original key without double credit', async ({ page }) => {
  await page.goto('/shop/fc');
  let lose = true;
  const keys: string[] = [];
  await page.route('**/api/fc/charges', async route => {
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    if (lose) { lose = false; await route.abort(); }
    else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '11,000 FC 충전', exact: true }).click();
  await expect(page.getByRole('button', { name: '처리 결과 다시 확인' })).toBeEnabled();
  const refreshed = page.waitForResponse('**/api/wallet');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  await expect(page.getByTestId('fc-balance')).toHaveText('11,000 FC');
  await expect(page.getByRole('button', { name: '처리 결과 다시 확인' })).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId('fc-balance')).toHaveText('11,000 FC');
  await page.getByRole('button', { name: '처리 결과 다시 확인' }).click();
  await expect(page.getByText('이미 처리된 요청을 확인했습니다. 중복 지급되지 않았습니다.')).toBeVisible();
  await expect(page.getByTestId('fc-balance')).toHaveText('11,000 FC');
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});

test('insufficient FC blocks purchase; quantity is integral; incomplete product cannot be bought', async ({ page }) => {
  await page.goto('/shop/product/demo-foundation-package');
  await expect(page.getByTestId('fc-balance')).toHaveText('0 FC');
  await expect(page.getByRole('button', { name: '가상 구매' })).toBeDisabled();
  await expect(page.locator('.purchase-warning')).toContainText('FC가 부족합니다.');
  await page.getByRole('spinbutton', { name: '구매 수량' }).fill('1.5');
  await expect(page.getByRole('spinbutton', { name: '구매 수량' })).toHaveValue('1');
  await page.locator('.purchase-warning').getByRole('link').click();
  await expect(page).toHaveURL(/\/shop\/fc$/);
  await page.goto('/shop/product/demo-unverified-package');
  await expect(page.getByRole('button', { name: '가상 구매' })).toHaveCount(0);
});

test('cookie persistence, independent browsers, HTTP validation and cross-tab refresh', async ({ page, context, browser, baseURL }) => {
  await page.goto('/shop/fc');
  await expect(page.getByTestId('fc-balance')).toHaveText('0 FC');
  const cookie = (await context.cookies()).find(c => c.name === 'fclab_play')!;
  expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Lax');
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
  const tab = await context.newPage();
  await tab.goto('/inventory');
  await expect(tab.getByTestId('fc-balance')).toHaveText('0 FC');
  await page.getByRole('button', { name: '300 FC 충전', exact: true }).click();
  await expect(tab.getByTestId('fc-balance')).toHaveText('300 FC');
  const headers = { Origin: baseURL!, 'Idempotency-Key': randomUUID() };
  expect((await context.request.post('/api/fc/charges', { headers, data: { chargeOptionId: 'fc-300-20260919', epoch: 0, amount: 99999 } })).status()).toBe(400);
  expect((await context.request.post('/api/purchases', { headers, data: { productId: 'demo-foundation-package', quantity: 1, epoch: 0, price: 0 } })).status()).toBe(400);
  expect((await context.request.post('/api/fc/charges', { headers: { ...headers, Origin: 'https://other.example' }, data: { chargeOptionId: 'fc-300-20260919', epoch: 0 } })).status()).toBe(403);
  expect((await context.request.post('/api/fc/charges', { data: {} })).status()).toBe(403);
  const wallet = await context.request.get('/api/wallet');
  expect(wallet.headers()['cache-control']).toContain('no-store');
  expect((await wallet.json()).balance).toBe('300');
  const saved = await context.storageState();
  const reopened = await browser.newContext({ baseURL, storageState: saved });
  const other = await browser.newContext({ baseURL });
  try {
    const restoredPage = await reopened.newPage(); await restoredPage.goto('/shop');
    await expect(restoredPage.getByTestId('fc-balance')).toHaveText('300 FC');
    expect((await other.request.get('/api/wallet')).status()).toBe(419);
    const otherPage = await other.newPage(); await otherPage.goto('/inventory');
    await expect(otherPage.getByTestId('fc-balance')).toHaveText('0 FC');
    await expect(otherPage.getByRole('heading', { name: '아직 보유한 아이템이 없습니다' })).toBeVisible();
  } finally { await reopened.close(); await other.close(); }
});
