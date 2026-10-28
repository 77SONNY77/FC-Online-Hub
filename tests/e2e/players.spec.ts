import { expect, test } from '@playwright/test';
test('searches official metadata and explores enhancement-specific observations', async ({ page }, info) => {
  await page.goto('/players');
  await expect(page.getByRole('heading', { name: '선수 검색', exact: true })).toBeVisible();
  await page.getByLabel('선수 이름', { exact: true }).fill('호나우지뉴');
  await page.getByLabel('클래스', { exact: true }).selectOption('877');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.locator('.player-card')).toHaveCount(1);
  await expect(page.locator('.player-card')).toContainText('UC (Untouchable Champions)');
  await page.locator('.player-card-link').click();
  await expect(page.getByRole('heading', { name: '호나우지뉴', exact: true })).toBeVisible();
  await expect(page.locator('.player-price')).toContainText('공식 기준 시각 미확인');
  const before = await page.locator('.player-price strong').innerText();
  await page.getByRole('link', { name: '+8강', exact: true }).click();
  await expect(page.getByRole('heading', { name: '+8강', exact: true })).toBeVisible();
  await expect(page.locator('.player-price strong')).not.toHaveText(before);
  await expect(page.locator('.player-price')).toContainText('확인 시각:');
  await expect(page.getByText('이 강화 단계의 OVR 미확인', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /개봉|열기/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/player-detail-${info.project.name}.png`, fullPage: true });
});
test('missing prices stay unavailable and images have a fallback', async ({ page }, info) => {
  await page.route('https://fco.dn.nexoncdn.co.kr/**', route => route.abort());
  await page.goto('/players/879243780');
  await expect(page.getByText('가격 정보 없음', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '이강인 이미지 없음' })).toBeVisible();
  await page.getByRole('link', { name: '+13강 가격 미확인', exact: true }).click();
  await expect(page.getByText('가격 정보 없음', { exact: true })).toBeVisible();
  await page.goto('/players?q=__NO_SUCH_PLAYER__');
  await expect(page.getByRole('heading', { name: '검색 결과가 없습니다' })).toBeVisible();
  await page.goto('/players?season=877');
  await expect(page.locator('.player-card').first()).toBeVisible();
  await page.screenshot({ path: `test-results/players-${info.project.name}.png`, fullPage: true });
});
test('player APIs paginate and expose actual price provenance without fabricated history', async ({ request }) => {
  const first = await (await request.get('/api/players?season=877')).json();
  const second = await (await request.get('/api/players?season=877&page=2')).json();
  expect(first.items.length).toBe(24); expect(second.items.length).toBeGreaterThan(0);
  expect(new Set([...first.items, ...second.items].map((p: { spid: string }) => p.spid)).size).toBe(first.items.length + second.items.length);
  expect((await request.get('/api/players?page=-1')).status()).toBe(400);
  expect((await request.get('/api/players/999999999')).status()).toBe(404);
  const price = await (await request.get('/api/players/877028130/price?enhancement=8')).json();
  expect(price.status).toBe('AVAILABLE'); expect(typeof price.price.price).toBe('string'); expect(price.price.referenceAt).toBeNull(); expect(price.price.source).toBe('OFFICIAL_WEB');
  const history = await (await request.get('/api/players/879243780/price-history')).json();
  expect(history).toMatchObject({ status: 'UNAVAILABLE', records: [], total: 0 });
});
test('official probability preserves rank text and explicitly reports unresolved players', async ({ page, request }) => {
  const data = await (await request.get('/api/items/official-item-24987-v1/probabilities')).json();
  expect(data.pool.resolutionStatus).toBe('UNRESOLVED');
  expect(data.entries.every((e: { resolution: { player: unknown } }) => e.resolution.player === null)).toBe(true);
  await page.goto('/items/official-item-24987-v1/probabilities');
  await expect(page.getByText(/선수 구성 확인 중 · 기준일/)).toBeVisible();
  await expect(page.getByRole('cell', { name: /개봉일 0~1시 사이 기준가 TOP 1 / }).first()).toBeVisible();
  await expect(page.locator('.probability-table a[href^="/players/"]')).toHaveCount(0);
});

test('crawler observations accumulate without replacing historical prices', async ({ request }) => {
  const history = await (await request.get('/api/players/877028130/price-history?enhancement=1')).json();
  expect(history.total).toBeGreaterThanOrEqual(2);
  expect(new Set(history.records.map((r: { observedAt: string }) => r.observedAt)).size).toBeGreaterThanOrEqual(2);
  expect(history.records.every((r: { referenceAt: unknown; price: unknown }) => r.referenceAt === null && typeof r.price === 'string')).toBe(true);
  const price = await (await request.get('/api/players/877020801/price?enhancement=7')).json();
  expect(price.status).toBe('AVAILABLE');
  expect(price.price.referenceAt).toBeNull();
});

test('full market prices reach existing search and detail APIs', async ({ request, page }) => {
  const list = await (await request.get('/api/players?season=100&enhancement=13')).json();
  expect(list.items).toHaveLength(24);
  expect(list.items.every((p: { price: { price: string; referenceAt: unknown; observationFreshness: string } | null }) => p.price !== null && BigInt(p.price.price) > 0n && p.price.referenceAt === null && ['FRESH','STALE','UNKNOWN'].includes(p.price.observationFreshness))).toBe(true);
  await page.goto('/players/100000041?enhancement=13');
  await expect(page.locator('.player-price')).toContainText('공식 기준 시각 미확인');
  await expect(page.getByText('가격 정보 없음', { exact: true })).toHaveCount(0);
});

test('player browsing never sends browser traffic to the Data Center', async ({ page }) => {
  const external: string[] = [];
  await page.route('https://fconline.nexon.com/**', async route => { external.push(route.request().url()); await route.abort(); });
  await page.goto('/players?season=100');
  await expect(page.locator('.player-card').first()).toBeVisible();
  await page.goto('/players/100000041?enhancement=13');
  await expect(page.locator('.player-price')).toBeVisible();
  expect(external).toEqual([]);
});
