/**
 * 히든 히로인 코하루 루트(계약 0·4절) — 실제 화면으로 확인한다.
 *
 * 1. 세 엔딩: 코하루(c,c,c,c,a,b,k → k1~k8 → 「일요일은 둘이서」), 미해금 아카네(a×7)·히나(b×7).
 *    코하루 플레이의 관람 기록은 kh_meet → kh_draw → kh_relay → kh_confession → kh_home → kh_date 순서.
 *    k6 의 불꽃 효과음은 대답(k6.170)이 화면에 나온 뒤에만 울린다(페이지 안에서 오디오 요청·재생 순간을 기록).
 * 2. 해금 전 숨김: 새 게임 전·미해금 엔딩 뒤 타이틀 앨범 'x / 11', 코하루 엔딩 배지 없음, 앨범에 kh_* 칸·빈칸·썸네일·이름 없음.
 *    미해금 플레이 동안 화면 글자(대사창·대화 기록·선택지·저장 칸)·document.title 에 이름이 없고, 코하루 그림을 받지 않는다.
 * 3. 해금 플레이(c,c,c,c): 복도 익명 이름표('여학생'·'여학생의 친구'), kh_meet 만 본 뒤 앨범 'x / 12'·공통 묶음에 kh_meet 한 장,
 *    배지 없음. 토요일 추첨: 이름을 밝히기 전 '여학생', 밝힌 뒤 '코하루'.
 * 4. 저장 1회 반영: c7.ch 선택 직후 퀵저장·수동 저장 → 불러오기에서 점수 한 번만. kh_draw 표시 중 저장 → 불러오기에서
 *    CG 다시 보이고 관람 기록 중복·점수 변화 없음. a,b,b,a 경로의 해금 플래그·코하루 4.5 점이 저장 왕복(새로고침 포함) 뒤에도 유지.
 * 5. 구판 저장(스키마 2, fixtures/legacy-saves.json — 기준 커밋 11612b4 엔진이 쓴 원문): 공통 중간은 새 가중치로 이어 판정,
 *    c7.j20(소급하면 만남이 열릴 점수)은 복도·추첨 없이 c8_bakery 로 가고 후반 선택은 a/b/c, 루트 진행 중은 그 루트 그대로.
 * 6. 새 장면(c8_bakery)에서 자동 저장 실패 안내('이 탭에만 저장됨')와 회복.
 * 7. 후반 선택(c8.ch)에서 자동 진행·건너뛰기가 멈춘다.
 * 8. 휴대폰 가로: 코하루 장면을 탭으로 진행, 가로→세로→가로 뒤에도 진행·선택 가능.
 *
 * 긴 진행은 '읽은 대사 건너뛰기'로 간다(koharu-helpers.ts 머리 주석). 직접 볼 장면은 읽음 기록에서 빼고 한 줄씩 누른다.
 * Linux 의 Chromium·WebKit(iPad 기기 설정 흉내)에서 도는 검사이고, 실제 iPad Safari·Android Chrome 기기 검증이 아니다.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { STORY } from '../../src/story';
import {
  albumSnapshot,
  choose,
  closeOverlays,
  continueAtState,
  continueFromTitle,
  freshBoot,
  kinfo,
  KOHARU_ASSET,
  KOHARU_NAMES,
  line,
  lineIds,
  loadFrom,
  nameHits,
  newGame,
  openAlbum,
  press,
  quickLoad,
  quickSave,
  readGlobalRec,
  readSlotJson,
  run,
  saveTo,
  sceneLines,
  scenesOf,
  seenSteps,
  settled,
  sfxLog,
  toTitle,
  visibleOptions,
  watchNames,
  watchSfx,
  watchSteps,
  type KInfo,
} from './koharu-helpers';

/** 기존 두 히로인의 CG 장수(코하루 CG 6장은 관람 전 총 장수에 넣지 않는다) */
const BASE_CGS = 11;
const KH_CGS = ['kh_meet', 'kh_draw', 'kh_relay', 'kh_confession', 'kh_home', 'kh_date'];
const MET = 'kh.met';

interface LegacyEntry {
  name: string;
  picks: string;
  sceneId: string;
  stepId: string;
  route: string | null;
  save: { schema: number; state: { sceneId: string; stepId: string } };
}
const LEGACY: LegacyEntry[] = JSON.parse(readFileSync(new URL('./fixtures/legacy-saves.json', import.meta.url), 'utf8')).saves;
const legacy = (name: string) => {
  const e = LEGACY.find((x) => x.name === name);
  if (!e) throw new Error(`구판 저장 견본 없음: ${name}`);
  return e;
};

/** 타이틀: 앨범 개수 'seen / 11', 코하루 배지 없음, 앨범 안에 kh_* 칸·썸네일·이름·코하루 묶음 없음 */
async function expectTitleHidden(page: Page, where: string) {
  const seen = (await readGlobalRec(page)).cgs.length;
  await expect(page.locator('#vn-album-count'), `${where}: 타이틀 앨범 개수`).toHaveText(`모은 추억 ${seen} / ${BASE_CGS}`);
  await expect(page.locator('.title-screen [data-ending=koharu]'), `${where}: 코하루 엔딩 배지`).toHaveCount(0);
  await expect(page.locator('.title-foot .badge')).toHaveCount(2);
  expect(await page.locator('.title-screen').textContent(), `${where}: 타이틀 글자`).not.toMatch(KOHARU_NAMES);
  expect(await page.title(), `${where}: document.title`).not.toMatch(KOHARU_NAMES);
  await openAlbum(page);
  const a = await albumSnapshot(page);
  expect(a.total, `${where}: 앨범 총 장수`).toBe(`${seen} / ${BASE_CGS}`);
  expect(a.groups.map((g) => g.route), `${where}: 앨범 묶음`).toEqual(['osana', 'tenko']);
  const cards = a.groups.flatMap((g) => g.cards);
  expect(cards, `${where}: 앨범 칸 수(빈칸 포함)`).toHaveLength(BASE_CGS);
  expect(cards.filter((id) => id.startsWith('kh_')), `${where}: kh_* 칸`).toEqual([]);
  expect(a.imgs.filter((s) => /kh_|koharu/.test(s)), `${where}: kh_* 썸네일`).toEqual([]);
  expect(a.text, `${where}: 앨범 글자`).not.toMatch(KOHARU_NAMES);
  expect(a.html, `${where}: 앨범 마크업`).not.toMatch(/kh_|koharu/);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await kinfo(page)).overlays).toBe(0);
}

/** 대화 기록을 열어 이름표·본문을 읽고 닫는다 */
async function readLog(page: Page): Promise<Array<{ name: string; text: string; k: string }>> {
  await page.locator('.hud button', { hasText: '기록' }).click();
  await expect(page.locator('[data-panel=log]')).toBeVisible();
  const items = await page.locator('[data-panel=log] .log-item').evaluateAll((els) =>
    els.map((e) => ({
      name: e.querySelector('.log-name')?.textContent ?? '',
      text: e.querySelector('.log-text')?.textContent ?? '',
      // 이름 색 클래스(k-osana·k-koharu·k-npc 등)
      k: [...e.classList].find((c) => c.startsWith('k-')) ?? '',
    })),
  );
  await closeOverlays(page);
  return items;
}

const nameTag = (page: Page) => page.locator('.textbox .name');
const points = async (page: Page) => (await kinfo(page)).points;

// ===========================================================================
// 1·2. 세 엔딩과 해금 전 숨김
// ===========================================================================

test('1. 코하루 엔딩: c,c,c,c,a,b,k → k1~k8 → 「일요일은 둘이서」, kh_* 6장을 순서대로 관람, 불꽃 효과음은 대답(k6.170) 뒤', async ({ page }) => {
  test.setTimeout(360_000);
  // k6 은 읽음 기록에서 빼고 한 줄씩 넘긴다(건너뛰기 중에는 효과음을 내지 않으므로)
  const read = lineIds((sc) => sc === 'k6');
  const assets: string[] = [];
  page.on('request', (req) => {
    if (KOHARU_ASSET.test(req.url())) assets.push(req.url());
  });
  await watchSteps(page);
  await watchSfx(page);
  await freshBoot(page, { read, settings: { textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: 60 } });
  await newGame(page);
  const k6: Array<{ step: string; bgm: string | null; name: string }> = [];
  const r = await run(page, ['c', 'c', 'c', 'c', 'a', 'b', 'k'], {
    read: new Set(read),
    onLine: async (i) => {
      if (i.step?.startsWith('k6.')) k6.push({ step: i.step, bgm: i.bgm, name: (await nameTag(page).textContent()) ?? '' });
    },
  });
  expect(r.info.mode).toBe('ending');
  // 선택지: 초반 넷은 a/b/c, 해금 뒤 후반 셋은 a/b/k(함께 c 는 없다). 화면에는 늘 3개
  expect(r.choices.map((c) => `${c.step}:${c.options.join('')}`)).toEqual([
    'c3.ch:abc',
    'c4.ch:abc',
    'c6.ch:abc',
    'c7.ch:abc',
    'c8.ch:abk',
    'c9.ch:abk',
    'c10.ch:abk',
  ]);
  // 지나온 장면: 해금 장면(c8_raffle)을 거쳐 k1~k8
  const scenes = scenesOf(await seenSteps(page));
  expect(scenes).toEqual([
    'c1_morning', 'c2_homeroom', 'c3_break', 'c4_lunch', 'c45_journal', 'c5_gym', 'c6_rain', 'c7_friday',
    'c8_raffle', 'c8_bakery', 'c9_puzzle', 'c10_window', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8',
  ]);
  await expect(page.locator('.ending-screen')).toHaveAttribute('data-ending', 'koharu');
  await expect(page.locator('.ending-screen .ending-title')).toHaveText('「일요일은 둘이서」');
  // 관람 기록: 이 경로의 CG 는 코하루 6장뿐이고 본 순서대로 남는다
  const g = await readGlobalRec(page);
  expect(g.cgs).toEqual(KH_CGS);
  expect(g.endings).toContain('koharu');
  // 미해금 테스트의 '코하루 그림을 받지 않음' 판정이 헛돌지 않는지: 해금 플레이에서는 같은 패턴으로 그림 요청이 잡힌다
  expect(assets.some((u) => /assets\/char\/koharu\//.test(u)), '코하루 스프라이트 요청').toBe(true);
  expect(assets.some((u) => /\/cg\/kh_/.test(u)), 'kh_ CG 요청').toBe(true);

  // k6: 고백 직전 음악을 바꾸고(confession), 대답 k6.170 은 코하루 이름표
  const at = (id: string) => k6.find((x) => x.step === id);
  expect(at('k6.160')?.bgm).toBe('confession');
  expect(at('k6.170')?.name).toBe('코하루');
  // 불꽃 효과음: 오디오 요청(재생 요청 순간)·재생(start) 모두 대답 줄이 화면에 나온 뒤
  const sfx = await sfxLog(page);
  const fw = sfx.log.filter((x) => /firework/.test(x.url));
  const anySfx = sfx.log.length > 0;
  test.info().annotations.push({
    type: 'sfx',
    description: sfx.available ? `오디오 기록 ${sfx.log.length}건, 불꽃 ${fw.map((x) => `${x.kind}@${x.step}`).join(', ') || '없음'}` : 'Web Audio 없음',
  });
  if (sfx.available && anySfx) {
    expect(fw.length, '불꽃 효과음이 한 번은 요청·재생되어야 한다').toBeGreaterThan(0);
    for (const x of fw) {
      expect(x.shown, `불꽃(${x.kind}@${x.step}) 전에 대답 k6.170 이 화면에 나왔어야 한다`).toContain('k6.170');
    }
  } else {
    // 이 브라우저에서 재생을 관찰할 수 없으면 실행 순서(대본의 k6 스텝 순서)로 대신 확인한다
    const steps = STORY.scenes.k6.steps;
    const answer = steps.findIndex((s) => s.id === 'k6.170');
    const first = steps.findIndex((s) => s.t === 'sfx' && s.sound === 'firework');
    expect(answer).toBeGreaterThan(0);
    expect(first).toBeGreaterThan(answer);
  }

  // 타이틀: 코하루 배지가 생기고 앨범은 6 / 17(본 hidden CG 만 총 장수에 더해진다)
  await page.locator('.ending-screen [data-action=to-title]').click();
  await expect(page.locator('.title-screen [data-ending=koharu]')).toHaveAttribute('data-reached', '1');
  await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 6 / ${BASE_CGS + 6}`);
});

for (const [ending, pick, label] of [
  ['osana', 'a', '아카네'],
  ['tenko', 'b', '히나'],
] as const) {
  test(`1·2. 미해금 ${label} 엔딩(${pick}×7): 플레이 내내 코하루 흔적이 없고, 새 게임 전·엔딩 뒤 타이틀·앨범에도 없다`, async ({ page }) => {
    test.setTimeout(300_000);
    const assets: string[] = [];
    page.on('request', (req) => {
      if (KOHARU_ASSET.test(req.url())) assets.push(req.url());
    });
    const read = lineIds();
    await watchNames(page);
    await freshBoot(page, { read });
    await expectTitleHidden(page, '새 게임 전');
    await newGame(page);
    const r = await run(page, Array(7).fill(pick), {
      read: new Set(read),
      onChoice: async (i, options) => {
        expect(options, `${i.step} 선택지`).toEqual(['a', 'b', 'c']);
        if (i.step === 'c10.ch') {
          // 마지막 선택지에서: 수동 저장 칸 요약·대화 기록에 이름이 없다
          await saveTo(page, '1');
          const s = await readSlotJson(page, '1');
          expect(s?.state.flags[MET]).toBe(false);
          expect(`${s?.summary.sceneTitle} ${s?.summary.text}`).not.toMatch(KOHARU_NAMES);
          const log = await readLog(page);
          expect(log.length).toBeGreaterThan(10);
          expect(log.filter((e) => KOHARU_NAMES.test(e.name + e.text) || /여학생/.test(e.name))).toEqual([]);
        }
      },
    });
    expect(r.info.mode).toBe('ending');
    await expect(page.locator('.ending-screen')).toHaveAttribute('data-ending', ending);
    // 엔딩 화면 메달은 두 히로인만
    await expect(page.locator('.ending-screen .medal')).toHaveCount(2);
    expect(await page.locator('.ending-screen').textContent()).not.toMatch(KOHARU_NAMES);
    await page.locator('.ending-screen [data-action=to-title]').click();
    await expect(page.locator(`.title-screen [data-ending=${ending}]`)).toHaveAttribute('data-reached', '1');
    expect((await readGlobalRec(page)).cgs.filter((c) => c.startsWith('kh_'))).toEqual([]);
    await expectTitleHidden(page, `${label} 엔딩 뒤`);
    expect(await nameHits(page), '화면에 코하루 이름이 나온 순간').toEqual([]);
    expect(assets, '미해금 플레이에서 받은 코하루 그림').toEqual([]);
  });
}

// ===========================================================================
// 3. 해금 플레이: 익명 이름표, kh_meet 만 공개, 추첨에서 이름 공개
// ===========================================================================

test('3. 해금 플레이(c,c,c,c): 복도는 익명 이름표, kh_meet 만 본 타이틀은 x / 12·공통 묶음에 한 장, 추첨에서 이름을 밝힌 뒤 코하루', async ({ page }) => {
  test.setTimeout(240_000);
  // 복도(c7.m*)와 토요일 추첨(c8_raffle)은 한 줄씩 본다
  const read = lineIds((sc, id) => sc === 'c8_raffle' || /^c7\.m/.test(id));
  await watchNames(page);
  await freshBoot(page, { read });
  await newGame(page);
  const r = await run(page, ['c', 'c', 'c', 'c'], { read: new Set(read), stopAt: (i) => i.step === 'c7.m10' });
  expect(r.info.step).toBe('c7.m10');
  expect(r.info.bg).toBe('hallway');
  expect((await readSlotJson(page, 'auto'))?.state.flags[MET]).toBe(true);
  expect(r.info.points).toEqual({ osana: 4, tenko: 4, koharu: 4 });

  // 복도: 대사창 이름표. 익명 이름표의 색은 모르는 화자(npc)라 코하루 색(data-who=koharu)이 먼저 드러나지 않는다
  const tags = new Map<string, string>();
  const whos = new Map<string, string>();
  for (let i = await kinfo(page); i.step !== 'c7.m80'; i = await line(page)) {
    tags.set(i.step!, (await nameTag(page).textContent()) ?? '');
    whos.set(i.step!, (await page.locator('.textbox').getAttribute('data-who')) ?? '');
  }
  expect(tags.get('c7.m20')).toBe('여학생');
  expect(tags.get('c7.m40')).toBe('여학생');
  expect(tags.get('c7.m60')).toBe('여학생');
  expect(tags.get('c7.m70')).toBe('여학생의 친구');
  for (const id of ['c7.m20', 'c7.m40', 'c7.m60']) expect(whos.get(id), `${id}: 익명 이름표 색`).toBe('npc');
  expect(whos.get('c7.m50'), '주인공 줄은 주인공 색(감시가 헛돌지 않음)').toBe('me');
  await expect(page.locator('.stage')).toHaveAttribute('data-cg', 'kh_meet');
  // 대화 기록도 익명, 이름은 어디에도 없다
  const log = await readLog(page);
  const names = log.map((e) => e.name);
  expect(names).toContain('여학생');
  expect(names).toContain('여학생의 친구');
  expect(log.filter((e) => KOHARU_NAMES.test(e.name + e.text))).toEqual([]);
  expect(await page.title()).not.toMatch(KOHARU_NAMES);
  expect((await readGlobalRec(page)).cgs).toEqual(['kh_meet']);

  // kh_meet 만 본 상태의 타이틀: 12장 중 1장, 공통 묶음에 kh_meet 한 칸, 다른 kh_* 빈칸·코하루 묶음·배지 없음
  await toTitle(page);
  await expect(page.locator('#vn-album-count')).toHaveText(`모은 추억 1 / ${BASE_CGS + 1}`);
  await expect(page.locator('.title-screen [data-ending=koharu]')).toHaveCount(0);
  await openAlbum(page);
  const a = await albumSnapshot(page);
  expect(a.total).toBe(`1 / ${BASE_CGS + 1}`);
  expect(a.groups.map((g) => g.route)).toEqual(['osana', 'tenko', 'common']);
  const common = a.groups.find((g) => g.route === 'common')!;
  expect(common.cards).toEqual(['kh_meet']);
  expect(common.seen).toEqual(['kh_meet']);
  expect(a.groups.flatMap((g) => g.cards).filter((id) => id.startsWith('kh_'))).toEqual(['kh_meet']);
  expect(a.text).not.toMatch(KOHARU_NAMES);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await kinfo(page)).overlays).toBe(0);
  expect(await nameHits(page), '이름을 밝히기 전(복도·타이틀·앨범) 화면에 나온 이름').toEqual([]);

  // 이어서 토요일 추첨: 이름을 밝히기 전(c8r.120 까지) '여학생', 밝힌 뒤 '코하루'
  await continueFromTitle(page);
  expect((await kinfo(page)).step).toBe('c7.m80');
  await run(page, [], { read: new Set(read), stopAt: (i) => i.step === 'c8r.010' });
  const raffle = new Map<string, { tag: string; who: string; aria: string[] }>();
  for (let i = await kinfo(page); i.step !== 'c8r.180'; i = await line(page)) {
    const aria = await page.locator('.stage .chars img.char').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    raffle.set(i.step!, { tag: (await nameTag(page).textContent()) ?? '', who: (await page.locator('.textbox').getAttribute('data-who')) ?? '', aria });
  }
  // 이름을 밝히기 전(독백·주인공 줄 포함): 이름표 '여학생'(npc 색), 무대 그림의 접근 이름도 '여학생'
  for (const id of ['c8r.020', 'c8r.040', 'c8r.060', 'c8r.080', 'c8r.100', 'c8r.120']) {
    expect(raffle.get(id)?.tag, id).toBe('여학생');
    expect(raffle.get(id)?.who, `${id}: 익명 이름표 색`).toBe('npc');
  }
  for (const id of ['c8r.020', 'c8r.030', 'c8r.040', 'c8r.050', 'c8r.070', 'c8r.090', 'c8r.110', 'c8r.120']) {
    expect(raffle.get(id)?.aria, `${id}: 무대 인물 접근 이름`).toEqual(['여학생']);
  }
  // c8r.120 에서 스스로 이름을 밝힌다(본문). 그 전에는 대사창·무대 인물 접근 이름(그림 해독을 기다리는 동안 포함)·기록 어디에도 이름이 없다
  const hits = await nameHits(page);
  const textHits = hits.filter((h) => h.where === '#vn 글자');
  expect(textHits.length, '이름 공개 뒤에는 화면 글자에 이름이 나온다(감시가 헛돌지 않음)').toBeGreaterThan(0);
  expect(textHits[0].step, `처음 화면 글자에 이름이 나온 프레임: ${JSON.stringify(textHits.slice(0, 2))}`).toBe('c8r.120');
  const early = hits.filter((h) => h.step !== null && /^c8r\.(0\d\d|1[01]\d)$/.test(h.step));
  expect(early, '이름 공개 전 접근 이름·글자에 나온 이름').toEqual([]);
  expect(await page.title()).not.toMatch(KOHARU_NAMES);
  // 이름을 밝힌 뒤 코하루 자신의 줄: 이름표·색·그림 접근 이름 모두 코하루(감시가 헛돌지 않음)
  expect(raffle.get('c8r.140')?.tag).toBe('코하루');
  expect(raffle.get('c8r.140')?.who).toBe('koharu');
  expect(raffle.get('c8r.140')?.aria).toEqual(['코하루']);
  expect(raffle.get('c8r.150')?.tag).toBe('상점회 추첨 담당');
  const after = await readLog(page);
  const tagOf = (text: RegExp) => after.find((e) => text.test(e.text))?.name;
  expect(tagOf(/전 1학년 나루세 코하루예요/)).toBe('여학생');
  expect(tagOf(/잘 부탁해요/)).toBe('코하루');
  // 대화 기록의 이름 색도 대사창과 같다: '여학생'은 npc, 이름을 밝힌 뒤의 '코하루'는 코하루 색
  expect(new Set(after.filter((e) => e.name === '여학생').map((e) => e.k))).toEqual(new Set(['k-npc']));
  expect(new Set(after.filter((e) => e.name === '코하루').map((e) => e.k))).toEqual(new Set(['k-koharu']));

  // 이름을 밝히기 전 주인공 줄(c8r.030)에서 저장한 것을 불러와도(그림을 새로 그림) 무대 그림의 접근 이름은 '여학생'
  await toTitle(page);
  await continueAtState(page, {
    sceneId: 'c8_raffle',
    stepId: 'c8r.030',
    points: { osana: 4, tenko: 4, koharu: 4 },
    flags: { [MET]: true },
    choices: { 'c3.ch': 'c', 'c4.ch': 'c', 'c6.ch': 'c', 'c7.ch': 'c' },
    stage: { bg: 'shotengai', bgm: 'daily', chars: { koharu: { pos: 'center', expr: 'smile', outfit: 'casual', hair: 'default' } }, order: ['koharu'], cg: null },
  });
  await expect(page.locator('.stage .chars img.char')).toHaveCount(1);
  await expect(page.locator('.stage .chars img.char')).toHaveAttribute('aria-label', '여학생');
});

// ===========================================================================
// 4. 저장 왕복에서 점수·관람이 한 번만
// ===========================================================================

test('4. 저장 1회 반영: c7.ch 직후 퀵·수동 저장, kh_draw 표시 중 저장 → 불러오기에서 점수·관람이 한 번만, a,b,b,a 의 4.5 점 유지', async ({ page }) => {
  test.setTimeout(240_000);
  const read = lineIds((sc, id) => (sc === 'c7_friday' && /^c7\.(a|j|m)/.test(id)) || sc === 'c8_raffle');
  await freshBoot(page, { read });
  await newGame(page);
  await run(page, ['a', 'b', 'b', 'a'], { read: new Set(read), stopAt: (i) => i.step === 'c7.a10' });
  // a(+2) b(+2) b(+2) → 2/4, c7 a(+3) → 5/4. 해금 판정은 아직(종 전)
  expect(await points(page)).toEqual({ osana: 5, tenko: 4, koharu: 0 });
  await quickSave(page);
  await page.waitForTimeout(300);
  await saveTo(page, '2');
  const q = await readSlotJson(page, 'quick');
  expect(q?.state.stepId).toBe('c7.a10');
  expect(q?.state.choices['c7.ch']).toBe('a');
  expect(q?.state.flags[MET]).toBeUndefined();
  await line(page);
  await line(page);
  expect(await points(page)).toEqual({ osana: 5, tenko: 4, koharu: 0 });

  await quickLoad(page);
  expect((await kinfo(page)).step).toBe('c7.a10');
  expect(await points(page), '퀵로드 뒤 c7 선택 점수는 한 번만').toEqual({ osana: 5, tenko: 4, koharu: 0 });
  await line(page);
  await loadFrom(page, '2');
  expect((await kinfo(page)).step).toBe('c7.a10');
  expect(await points(page), '수동 저장 불러오기 뒤 c7 선택 점수는 한 번만').toEqual({ osana: 5, tenko: 4, koharu: 0 });

  // 종 뒤 해금 판정: |5-4| ≤ 1 → 만남, 코하루 4.5(0.5 단위 그대로)
  await run(page, [], { read: new Set(read), stopAt: (i) => i.step === 'c7.m10' });
  expect(await points(page)).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
  await saveTo(page, '3');
  const s3 = await readSlotJson(page, '3');
  expect(s3?.schema).toBe(3);
  expect(s3?.state.flags[MET]).toBe(true);
  expect(s3?.state.points).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });

  // 새로고침(새 문서) → 타이틀에서 3번 칸 → 같은 점수·플래그, 해금 장면으로 이어진다
  await page.reload();
  await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
  await loadFrom(page, '3');
  expect((await kinfo(page)).step).toBe('c7.m10');
  expect(await points(page)).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
  await line(page);
  expect((await readSlotJson(page, 'auto'))?.state.flags[MET]).toBe(true);
  const r = await run(page, [], { read: new Set(read), stopAt: (i) => i.step === 'c8r.180' });
  expect(r.steps).toContain('c8r.010');
  expect(await points(page)).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });

  // kh_draw 가 떠 있는 줄에서 저장 → 지나간 뒤 불러오기 → 다시 보이고, 관람 기록은 한 번, 점수 그대로
  await expect(page.locator('.stage')).toHaveAttribute('data-cg', 'kh_draw');
  // c6 의 b(히나 우산 CG rain_tenko) 뒤 kh_meet·kh_draw
  expect((await readGlobalRec(page)).cgs).toEqual(['rain_tenko', 'kh_meet', 'kh_draw']);
  await saveTo(page, '4');
  for (let i = await kinfo(page); i.step !== 'c8r.220'; i = await line(page)) {
    /* CG 를 걷는 줄까지 */
  }
  await expect(page.locator('.stage')).not.toHaveAttribute('data-cg', /.+/);
  await loadFrom(page, '4');
  expect((await kinfo(page)).step).toBe('c8r.180');
  await expect(page.locator('.stage')).toHaveAttribute('data-cg', 'kh_draw');
  await expect(page.locator('.stage .cg-layer img.cg-img').last()).toBeVisible();
  expect((await readGlobalRec(page)).cgs, '관람 기록 중복 없음').toEqual(['rain_tenko', 'kh_meet', 'kh_draw']);
  expect(await points(page)).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
  // 이어서 토요일 오후 선택지: a/b/k
  const r2 = await run(page, [], { read: new Set(read) });
  expect(r2.info.step).toBe('c8.ch');
  expect(await visibleOptions(page)).toEqual(['a', 'b', 'k']);
  expect(await points(page)).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
});

// ===========================================================================
// 5. 구판 저장(스키마 2)
// ===========================================================================

test('5. 구판 저장(스키마 2): 공통 중간은 새 가중치로 판정, c7.j20 은 만남 소급 없이 c8_bakery·a/b/c, 루트 진행 중은 그 루트로', async ({ page }) => {
  test.setTimeout(240_000);
  const mid = legacy('common-mid');
  const gate = legacy('post-gate-tie');
  const route = legacy('route-tenko');
  expect(mid.save.schema).toBe(2);
  // 공통 c6·c7 과 c8_bakery, t2 는 한 줄씩 본다
  const read = lineIds((sc) => ['c6_rain', 'c7_friday', 'c8_raffle', 'c8_bakery', 't2_notebook', 't3_taste'].includes(sc));
  await freshBoot(page, {
    read,
    slots: { '1': JSON.stringify(mid.save), '2': JSON.stringify(gate.save), '3': JSON.stringify(route.save) },
  });

  // (a) 공통 중간(c6.ch, 선택 a·a): 새 가중치 4/0 → b, b 로 4/5 → 차 1 이라 만남(복도)으로, 코하루 4.5
  await loadFrom(page, '1');
  let i = await kinfo(page);
  expect(i.step).toBe(mid.stepId);
  expect(i.points, '구판 a·a → 새 가중치 +2·+2').toEqual({ osana: 4, tenko: 0, koharu: 0 });
  const ra = await run(page, ['b', 'b'], { read: new Set(read), stopAt: (x) => x.step === 'c7.m10' || x.step === 'c7.j20' });
  expect(ra.choices.map((c) => c.options.join(''))).toEqual(['abc', 'abc']);
  expect(ra.info.step, '새 규칙대로 판정해 만남이 열린다').toBe('c7.m10');
  expect(ra.info.points).toEqual({ osana: 4, tenko: 5, koharu: 4.5 });
  expect((await readSlotJson(page, 'auto'))?.state.flags[MET]).toBe(true);

  // (b) c7.j20(구판 a,b,b,a → 새 가중치 5/4, 소급하면 만남): 해금 없이 복도·추첨을 건너 c8_bakery, 후반 선택은 a/b/c
  await toTitle(page);
  await loadFrom(page, '2');
  i = await kinfo(page);
  expect(i.step).toBe('c7.j20');
  expect(i.points).toEqual({ osana: 5, tenko: 4, koharu: 0 });
  const rb = await run(page, [], { read: new Set(read) });
  expect(rb.info.step).toBe('c8.ch');
  expect(rb.steps.filter((s) => /^c7\.m|^c8r\./.test(s)), '복도·추첨 장면').toEqual([]);
  expect(rb.steps).toEqual(expect.arrayContaining(['c7.j20', 'c7.j30', 'c7.j40', ...sceneLines('c8_bakery').slice(0, 2)]));
  expect(rb.info.bg).toBe('shotengai');
  expect(await visibleOptions(page)).toEqual(['a', 'b', 'c']);
  expect((await readSlotJson(page, 'auto'))?.state.flags[MET]).toBe(false);
  expect(rb.info.points).toEqual({ osana: 5, tenko: 4, koharu: 0 });

  // (c) 루트 진행 중(t2.180, 히나 루트): 그 루트 그대로 다음 장면 t3 으로
  await toTitle(page);
  await loadFrom(page, '3');
  i = await kinfo(page);
  expect(i.step).toBe('t2.180');
  expect(i.route).toBe('tenko');
  const rc = await run(page, [], { read: new Set(read), stopAt: (x) => !!x.step?.startsWith('t3.') });
  expect(rc.steps).toEqual(['t2.180', 't2.190', 't2.200']);
  expect(rc.info.route).toBe('tenko');
  expect(rc.info.step).toBe(sceneLines('t3_taste')[0]);
});

// ===========================================================================
// 6. 자동 저장 실패 안내(새 장면 c8_bakery)
// ===========================================================================

/** setItem 실패 스위치와 자동 저장 알림 세기(autosave.spec 과 같은 방식) */
async function instrumentStorage(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __fail: boolean; __toasts: Array<{ kind: string; text: string }> };
    w.__fail = false;
    w.__toasts = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (w.__fail && this === window.localStorage) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
    new MutationObserver((recs) => {
      for (const r of recs)
        for (const n of r.addedNodes) {
          if (n instanceof HTMLElement && n.classList.contains('toast')) w.__toasts.push({ kind: n.dataset.kind ?? '', text: n.textContent ?? '' });
        }
    }).observe(document.getElementById('vn')!, { childList: true });
  });
}
const setFail = (page: Page, on: boolean) => page.evaluate((v) => ((window as unknown as { __fail: boolean }).__fail = v), on);
const toastKinds = (page: Page) => page.evaluate(() => (window as unknown as { __toasts: Array<{ kind: string }> }).__toasts.map((t) => t.kind));

/** 해금된 플레이의 토요일 오후(c8_bakery 첫 줄) 상태 */
const BAKERY = {
  sceneId: 'c8_bakery',
  stepId: 'c8.010',
  points: { osana: 4, tenko: 4, koharu: 4 },
  flags: { [MET]: true },
  choices: { 'c3.ch': 'c', 'c4.ch': 'c', 'c6.ch': 'c', 'c7.ch': 'c' },
  stage: { bg: 'shotengai', bgm: 'daily', chars: {}, order: [], cg: null },
};

test('6. 새 장면(c8_bakery)에서 자동 저장이 실패하면 이 탭에만 저장됨을 알리고, 회복하면 정상으로 돌아온다', async ({ page }) => {
  await freshBoot(page);
  await instrumentStorage(page);
  await continueAtState(page, BAKERY);
  await line(page);
  const kept = (await kinfo(page)).step!;
  expect((await readSlotJson(page, 'auto'))?.state.stepId).toBe(kept);
  expect((await kinfo(page)).autoSave).toBe('ok');
  await expect(page.locator('.autosave-chip')).toBeHidden();

  await setFail(page, true);
  await line(page);
  expect((await kinfo(page)).frame).toBe('choice');
  await expect(page.locator('.autosave-chip')).toBeVisible();
  await expect(page.locator('.autosave-chip')).toContainText('이 탭에만');
  await expect(page.locator('.autosave-chip')).toContainText('저장됨');
  expect((await kinfo(page)).autoSave).toBe('tab-only');
  await choose(page, 'k');
  await line(page);
  expect((await toastKinds(page)).filter((k) => k === 'autosave-tab-only'), '실패 알림은 한 번').toHaveLength(1);
  expect((await readSlotJson(page, 'auto'))?.state.stepId, '브라우저의 자동 저장은 그대로').toBe(kept);

  await setFail(page, false);
  await line(page);
  const now = (await kinfo(page)).step!;
  expect((await kinfo(page)).autoSave).toBe('ok');
  await expect(page.locator('.autosave-chip')).toBeHidden();
  expect((await toastKinds(page)).filter((k) => k === 'autosave-recovered')).toHaveLength(1);
  const auto = await readSlotJson(page, 'auto');
  expect(auto?.state.stepId).toBe(now);
  expect(auto?.state.choices['c8.ch']).toBe('k');
  expect(auto?.state.flags[MET]).toBe(true);
});

// ===========================================================================
// 7. 후반 선택지에서 자동 진행·건너뛰기 정지
// ===========================================================================

test('7. 후반 선택(c8.ch)에서 자동 진행·건너뛰기가 멈춘다(해금: a/b/k, 미해금: a/b/c)', async ({ page }) => {
  test.setTimeout(120_000);
  await freshBoot(page, { read: lineIds() });
  // 자동 진행(해금된 플레이)
  await continueAtState(page, BAKERY);
  await page.locator('.hud button', { hasText: '자동' }).click();
  await expect.poll(async () => (await kinfo(page)).frame, { timeout: 30_000, intervals: [200] }).toBe('choice');
  let i = await kinfo(page);
  expect(i.step).toBe('c8.ch');
  await page.waitForTimeout(3000);
  i = await kinfo(page);
  expect(i.step, '자동 진행이 선택지를 넘기지 않는다').toBe('c8.ch');
  expect(i.auto).toBe(true);
  expect(await visibleOptions(page)).toEqual(['a', 'b', 'k']);
  await choose(page, 'k');
  const reaction = (await kinfo(page)).step;
  expect(reaction).toBe('c8.k10');
  await expect.poll(async () => (await kinfo(page)).step, { timeout: 10_000 }).not.toBe(reaction);
  await page.locator('.hud button', { hasText: '자동' }).click();
  await expect.poll(async () => (await kinfo(page)).auto).toBe(false);

  // 건너뛰기(미해금 플레이, 모든 줄 읽음)
  await toTitle(page);
  await continueAtState(page, { ...BAKERY, points: { osana: 6, tenko: 3, koharu: 0 }, flags: { [MET]: false } });
  await page.locator('.hud button', { hasText: '스킵' }).click();
  await expect.poll(async () => (await kinfo(page)).frame, { timeout: 20_000, intervals: [100] }).toBe('choice');
  i = await kinfo(page);
  expect(i.step).toBe('c8.ch');
  expect(i.skip).toBe(false);
  await page.waitForTimeout(1500);
  expect((await kinfo(page)).step).toBe('c8.ch');
  expect(await visibleOptions(page)).toEqual(['a', 'b', 'c']);
});

// ===========================================================================
// 8. 휴대폰 가로: 코하루 장면 탭 진행과 회전
// ===========================================================================

/** 세로로 돌렸다가(안내가 뜨고 탭해도 진행되지 않음) 가로로 되돌린다 */
async function rotateRoundTrip(page: Page) {
  const land = page.viewportSize()!;
  const before = await kinfo(page);
  await page.setViewportSize({ width: land.height, height: land.width });
  await expect(page.locator('.rotate')).toBeVisible();
  await page.touchscreen.tap(land.height / 2, land.width * 0.3);
  await page.waitForTimeout(300);
  expect((await kinfo(page)).step, '세로 안내 위 탭으로 진행되지 않음').toBe(before.step);
  await page.setViewportSize(land);
  await expect(page.locator('.rotate')).toBeHidden();
  const after = await kinfo(page);
  expect(after.step).toBe(before.step);
  expect(after.mode).toBe('play');
  // 가로로 돌아온 직후 300ms 는 일부러 입력을 받지 않는다(game.ts: 회전 안내가 걷힐 때 inputLockUntil). 사람이 다시 잡는 시간만큼 둔다
  await page.waitForTimeout(350);
}

async function tapChoice(page: Page, id: string) {
  const before = await kinfo(page);
  await expect(page.locator('.choices.on')).toHaveAttribute('data-armed', '1');
  const box = await page.locator(`.choices.on .choice[data-option="${id}"]`).boundingBox();
  if (!box) throw new Error(`선택지 ${id} 가 보이지 않음`);
  const vp = page.viewportSize()!;
  expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5, '선택지가 화면 안').toBe(true);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await press(page, box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await kinfo(page)).step).not.toBe(before.step);
  await settled(page);
}

test('8. 휴대폰 가로: 코하루 장면을 탭으로 진행하고, 가로→세로→가로 뒤에도 진행·선택할 수 있다', async ({ page }, ti) => {
  test.skip(!ti.project.name.startsWith('phone'), '휴대폰 프로젝트 전용');
  test.setTimeout(180_000);
  await freshBoot(page);
  await continueAtState(page, {
    sceneId: 'c10_window',
    stepId: 'c10.010',
    points: { osana: 7, tenko: 4, koharu: 7 },
    flags: { [MET]: true },
    choices: { 'c3.ch': 'c', 'c4.ch': 'c', 'c6.ch': 'c', 'c7.ch': 'c', 'c8.ch': 'a', 'c9.ch': 'k' },
    stage: {
      bg: 'hallway',
      bgm: 'daily',
      chars: {
        osana: { pos: 'left', expr: 'neutral', outfit: 'uniform', hair: 'default' },
        tenko: { pos: 'right', expr: 'smile', outfit: 'uniform', hair: 'default' },
      },
      order: ['osana', 'tenko'],
      cg: null,
    },
  });
  await page.screenshot({ path: test.info().outputPath('c10-start.png') });
  await line(page);
  await rotateRoundTrip(page);
  // 해금 플레이의 창 너머 손 인사 독백(c10.040)까지 탭
  const r = await run(page, []);
  expect(r.steps).toContain('c10.040');
  expect(r.info.step).toBe('c10.ch');
  await rotateRoundTrip(page);
  expect(await visibleOptions(page)).toEqual(['a', 'b', 'k']);
  await tapChoice(page, 'k');
  let i: KInfo = await kinfo(page);
  expect(i.step).toBe('c10.k10');
  // 교복 코하루가 무대 가운데(다른 둘은 내려감)
  const chars = page.locator('.stage .chars img.char:not(.leaving)');
  await expect(chars).toHaveCount(1);
  await expect(chars).toHaveAttribute('data-look', 'uniform_default');
  await expect(chars).toBeVisible();
  await expect(nameTag(page)).toHaveText('코하루');
  await page.screenshot({ path: test.info().outputPath('c10-k10-koharu.png') });
  // 루트 결정(7 / 4 / 10 → 코하루) 뒤 k1 까지 탭
  i = (await run(page, [], { stopAt: (x) => x.step?.startsWith('k1.') ?? false })).info;
  expect(i.route).toBe('koharu');
  await line(page);
  await line(page);
  await page.screenshot({ path: test.info().outputPath('k1-koharu.png') });
  await rotateRoundTrip(page);
  const s = (await kinfo(page)).step;
  i = await line(page);
  expect(i.step).not.toBe(s);
  expect(i.step?.startsWith('k1.')).toBe(true);
  expect((await kinfo(page)).route).toBe('koharu');
});
