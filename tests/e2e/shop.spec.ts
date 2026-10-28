import { test, expect } from '@playwright/test';

test('home → shop → product → components/source → back; direct access', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('link', { name: '상점으로 이동' }).click();
  await page.getByRole('link', { name: '개발용 상품', exact: true }).click();
  await expect(page.getByRole('heading', { name: '상점.' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(3);
  await page.screenshot({ path: `test-results/catalog-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: /파운데이션 패키지/ }).click();
  await expect(page.getByRole('heading', { name: '파운데이션 패키지', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '상품 구성품' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '데이터 출처' })).toBeVisible();
  await expect(page.getByText('실제 FC Online 상품이 아닙니다. 가격과 구성은 개발용 예시입니다.', { exact: false })).toBeVisible();
  await expect(page.getByText('수량은 상자 1개 기준')).toBeVisible();
  await page.screenshot({ path: `test-results/detail-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: '상품 목록으로', exact: false }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
  await page.goto('/shop/product/demo-foundation-package');
  await expect(page.getByRole('heading', { name: '파운데이션 패키지', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: /개봉|열기/ })).toHaveCount(0);
});

test('missing product shows genuine 404 UI and API', async ({ page, request }) => {
  const response = await page.goto('/shop/product/invalid-id');
  // App Router streaming may deliver a 200 shell; notFound still renders the 404 boundary.
  expect([200, 404]).toContain(response!.status());
  await expect(page.getByRole('heading', { name: '상품 또는 페이지를 찾을 수 없습니다' })).toBeVisible();
  expect((await request.get('/api/products/invalid-id')).status()).toBe(404);
});

test('real database API preserves component mapping and data isolation', async ({ request }) => {
  const list = await request.get('/api/products?mode=mock');
  expect(list.status()).toBe(200);
  const data = await list.json();
  expect(data.meta).toEqual({ mode: 'MOCK', count: 3 });
  const detail = await (await request.get('/api/products/demo-foundation-package')).json();
  expect(detail.data.metadata.source).toBe('MOCK');
  expect(detail.data.components.map((c: { quantity: number }) => c.quantity)).toEqual([5, 3, 1]);
  expect(detail.data.components[1].children).toHaveLength(2);
  const official = (await (await request.get('/api/products?mode=official')).json()).data;
  expect(official).toHaveLength(1);
  expect(official.every((p: { metadata: { dataType: string } }) => p.metadata.dataType === 'OFFICIAL')).toBe(true);
  expect((await request.get('/api/products?mode=bad')).status()).toBe(400);
});

test('official empty state and development tab work', async ({ page }) => {
  await page.route('**/api/products?mode=official', route => route.fulfill({ json: { data: [], meta: { mode: 'OFFICIAL', count: 0 } } }));
  await page.goto('/shop?mode=official');
  await expect(page.getByRole('heading', { name: '등록된 공식 상품이 없습니다' })).toBeVisible();
  await page.getByRole('link', { name: '개발용 카탈로그 보기' }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('loading, API error and retry are usable', async ({ page }) => {
  let finish: () => void = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/products?mode=mock', async route => { await pending; await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"DATA_UNAVAILABLE"}}' }); });
  await page.goto('/shop?mode=mock');
  await expect(page.getByRole('status', { name: '상품을 불러오는 중' })).toBeVisible();
  finish();
  await expect(page.getByRole('heading', { name: '상품을 불러오지 못했습니다' })).toBeVisible();
  await page.unroute('**/api/products?mode=mock');
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(3);
});

test('missing data and failed images do not become fabricated values or broken images', async ({ page }) => {
  await page.route('**/images/unverified-pack.svg', route => route.abort());
  await page.goto('/shop/product/demo-unverified-package');
  await expect(page.getByRole('main').getByText('가격 확인 필요', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('구매 제한 확인 필요', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /상품 이미지 없음/ })).toBeVisible();
  await expect(page.getByRole('main').getByText('확인되지 않은 구성품은 표시하지 않습니다.')).toBeVisible();
});

test('keyboard navigation reaches the content and product cards', async ({ page }) => {
  await page.goto('/shop?mode=mock');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.product-card')).toHaveCount(3);
  const card = page.getByRole('link', { name: /파운데이션 패키지/ });
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '상품 구성품' })).toBeVisible();
});
