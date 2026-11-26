/**
 * 세 히로인과 여덟 엔딩(docs/EIGHT_ENDINGS_DESIGN.md 3·5·6·7·9·13절, 원 요구 7절) — 실제 화면으로 확인한다.
 *
 * 1. 여덟 엔딩: 새 게임에서 선택지 버튼을 눌러 각 엔딩까지 간다. 엔딩 화면(.ending-screen[data-ending][data-route][data-kind]·
 *    제목·배지·폴라로이드 CG·'엔딩 n / 보이는 수'·메달), 전역 기록(세 키 ashita.global·.ext·.v2), 관람 CG 와 타이틀·앨범의 증가.
 *    아카네·히나는 미발견 경로 하나(축제 a·a·a·a / 일상 b·b·b·b)와 발견 경로 하나(계약 5.1 표 5행·4행)를 섞었다.
 * 2. 계약 5.1 표: 1행(히든 축제)·2행(히든 일상)·4행(히나, 두 사람만 동점)·5행(아카네)은 1 의 플레이로, 3행은 따로 판정 직후까지.
 *    초반 네 선택 뒤 점수, 판정 때 점수, 첫 루트 장면(h1/t1_cats/o1_shop/k1)을 본다.
 * 3. 저장·복원 이중 가점 없음(선택 직전·직후, 다섯째/여섯째 사이, 루트 확정 직후, 결말 갈래 전후, CG 표시 중 — 수동·퀵·자동).
 * 4. 미발견 무노출(코하루가 그려진 그림 요청 0, 화면·대화 기록에 이름 0, 타이틀 '???' 4개, 앨범 총 장수에 숨김 CG 없음),
 *    발견했지만 히든이 아닌 플레이에서 end_group_* 요청 0·네 사람 배지 없음.
 * 5. 자동 진행이 새 진행 선택지(e1f.ch1)·결말 갈래 선택지에서 멈춤, 읽은 대사 건너뛰기가 새 장면에서도 읽은 줄만 건너뜀.
 * 6. 구저장(tests/unit/fixtures/v3-saves.897ae1f.json: 897ae1f 엔진이 쓴 진짜 스키마 3 저장)과 옛 전역 기록.
 * 7. 히든 축제의 첫 불꽃 효과음 → end_group_fireworks 순서, 히든 일상 hd4 의 chorus 이름표.
 * 8. 사용자 지정 대사창 불투명도(55%)가 새 CG 장면에서도 유지.
 *
 * 긴 진행은 '읽은 대사 건너뛰기'(S 키)로 간다(eight-helpers.ts 머리 주석). 선택은 모두 화면의 선택지 버튼을 눌러서 한다.
 * Linux 의 Chromium(1280×720)·WebKit(iPad (gen 7) 가로 기기 설정 흉내)에서 도는 검사이고, 실제 iPad Safari·Android 기기 검증이 아니다.
 * 휴대폰 크기 프로젝트에서는 돌리지 않는다(layout·mobile 스펙 담당). 오래 걸리는 검사는 desktop 에서만, iPad 에는 대표만 돌린다.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { STORY } from '../../src/story';
import { ENDING_CG } from '../../src/story/cg';
import {
  albumSnapshot,
  cgLog,
  choose,
  closeOverlays,
  continueFromTitle,
  END_GROUP_ASSET,
  firstRouted,
  freshBoot,
  HIDDEN_CGS,
  line,
  KOHARU_DRAWN_ASSET,
  KOHARU_NAMES,
  lineAfterCg,
  lineIds,
  linesBefore,
  loadFrom,
  nameHits,
  nameTag,
  newGame,
  openAlbum,
  pts,
  quickLoad,
  quickSave,
  readGlobalAll,
  readLog,
  readSlotJson,
  reload,
  run,
  saveTo,
  sceneLines,
  sceneOf,
  scenesOf,
  seen,
  settled,
  sfxLog,
  titleAlbumCount,
  titleBadges,
  toTitle,
  vi,
  VISIBLE_CGS,
  visibleOptions,
  watchNames,
  watchRequests,
  watchSfx,
  watchSteps,
  type Pts,
} from './eight-helpers';

const IPAD = 'ipad-webkit';
const DESKTOP = 'desktop';

test.beforeEach(({}, ti) => {
  test.skip(ti.project.name.startsWith('phone'), '여덟 엔딩 E2E 는 desktop·ipad-webkit 에서만(휴대폰 크기는 layout·mobile 스펙)');
});

/** 이 테스트를 돌릴 프로젝트(그 밖에서는 건너뜀) */
function onlyOn(names: readonly string[], why = 'iPad 는 대표 검사만(오래 걸리는 검사는 desktop 에서만)') {
  test.skip(!names.includes(test.info().project.name), why);
}

const EARLY = ['c3.ch', 'c4.ch', 'c6.ch', 'c7.ch'] as const;
const LATE6 = ['e1f.ch1', 'e1f.ch2', 'e2f.ch1', 'e2f.ch2', 'e3f.ch1', 'e3f.ch2'] as const;
const LATE3 = ['c8.ch', 'c9.ch', 'c10.ch'] as const;
const FORK: Record<string, string> = { osana: 'o4.fork', tenko: 't4.fork', koharu: 'k4.fork', group: 'h.fork' };
/** 계약 5.1 표기 A·H·K → 옵션 id(아카네 a · 히나 b · 코하루 k) */
const AHK: Record<string, string> = { A: 'a', H: 'b', K: 'k' };

interface EndPlan {
  ending: string;
  route: 'osana' | 'tenko' | 'koharu' | 'group';
  kind: 'festival' | 'daily';
  title: string;
  /** 엔딩 화면 배지 '아카네 · 축제 엔딩' 의 루트 이름 */
  name: string;
  /** 초반 네 선택(a/b/c) */
  early: string;
  /** 발견: 계약 표기 A/H/K 여섯 자, 미발견: c8·c9·c10 의 a/b/c 세 자 */
  late: string;
  met: boolean;
  /** 초반 네 선택 뒤(첫 후반 선택지에서) 점수 */
  earlyPts: string;
  /** 판정 직후(첫 루트 프레임) 점수 */
  routePts: string;
  /** 첫 루트 장면 */
  firstScene: string;
  /** 지나는 장면(대본 실행 순서) */
  scenes: string[];
  /** 이 플레이에서 보는 CG(실제 실행기로 미리 확인한 목록, 순서 무관) */
  cgs: string[];
  /** 엔딩 화면 '엔딩 1 / n' 의 n(빈 기록에서 처음 본 엔딩) */
  total: number;
  /** 엔딩 화면 메달 루트 */
  medals: string[];
  /** 계약 5.1 표의 행(있으면) */
  table?: string;
  ipad?: boolean;
}

const COMMON_HEAD = ['c1_morning', 'c2_homeroom', 'c3_break', 'c4_lunch', 'c45_journal', 'c5_gym', 'c6_rain', 'c7_friday'];
const MET_EPS = ['c8_raffle', 'e1_ice4', 'e1s_sunday4', 'e2_frog4', 'e3_rain4'];
const UNMET_EPS = ['e1_ice3', 'c8_bakery', 'c9_puzzle', 'e2_frog3', 'c10_window', 'e3_rain3'];
const MET_CGS = ['kh_meet', 'kh_draw', 'group_ice_four', 'group_frog', 'group_rain'];

const PLANS: EndPlan[] = [
  {
    ending: 'osana',
    route: 'osana',
    kind: 'festival',
    title: '내일도, 그다음 날도',
    name: '아카네',
    early: 'aaaa',
    late: 'aaa',
    met: false,
    earlyPts: '9/0/0',
    routePts: '18/0/0',
    firstScene: 'o1_shop',
    scenes: [...COMMON_HEAD, ...UNMET_EPS, 'o1_shop', 'o2_cold', 'o3_pickup', 'o4_promise', 'o5_festival', 'o6_confession', 'o7_homeward'],
    cgs: ['rain_osana', 'group_ice_three', 'door_osana', 'ramune_osana', 'fireworks_osana', 'homeward_osana'],
    total: 4,
    medals: ['osana', 'tenko'],
    ipad: true,
  },
  {
    ending: 'osana_daily',
    route: 'osana',
    kind: 'daily',
    title: '내일은 데이트하자',
    name: '아카네',
    early: 'cccc',
    late: 'AAAAAA',
    met: true,
    earlyPts: '4/4/4',
    routePts: '7/4/4',
    firstScene: 'o1_shop',
    scenes: [...COMMON_HEAD, ...MET_EPS, 'o1_shop', 'o2_cold', 'o3_pickup', 'o4_promise', 'od1', 'od2', 'od3'],
    cgs: [...MET_CGS, 'door_osana', 'end_akane_walk'],
    total: 4,
    medals: ['osana', 'tenko'],
    table: '5.1 5행(4/4/4 · A×6 → 7/4/4 아카네)',
  },
  {
    ending: 'tenko',
    route: 'tenko',
    kind: 'festival',
    title: '처음으로 함께 찍힌 사진',
    name: '히나',
    early: 'cccc',
    late: 'AHAHAH',
    met: true,
    earlyPts: '4/4/4',
    routePts: '5.5/5.5/4',
    firstScene: 't1_cats',
    scenes: [...COMMON_HEAD, ...MET_EPS, 't1_cats', 't2_notebook', 't3_taste', 't4_invite', 't5_festival', 't6_confession', 't7_homeward'],
    cgs: [...MET_CGS, 'cats_tenko', 'bench_tenko', 'selfie_tenko', 'shutter_tenko', 'polaroid_tenko'],
    total: 4,
    medals: ['osana', 'tenko'],
    table: '5.1 4행(4/4/4 · A H A H A H → 5.5/5.5/4 히나, 두 사람만 동점)',
  },
  {
    ending: 'tenko_daily',
    route: 'tenko',
    kind: 'daily',
    title: '네가 먼저 보는 것',
    name: '히나',
    early: 'bbbb',
    late: 'bbb',
    met: false,
    earlyPts: '0/9/0',
    routePts: '0/18/0',
    firstScene: 't1_cats',
    scenes: [...COMMON_HEAD, ...UNMET_EPS, 't1_cats', 't2_notebook', 't3_taste', 't4_invite', 'td1', 'td2', 'td3'],
    cgs: ['rain_tenko', 'group_ice_three', 'cats_tenko', 'end_hina_walk'],
    total: 4,
    medals: ['osana', 'tenko'],
  },
  {
    ending: 'koharu',
    route: 'koharu',
    kind: 'festival',
    title: '일요일은 둘이서',
    name: '코하루',
    early: 'cccc',
    late: 'KKKKKK',
    met: true,
    earlyPts: '4/4/4',
    routePts: '4/4/7',
    firstScene: 'k1',
    scenes: [...COMMON_HEAD, ...MET_EPS, 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8'],
    cgs: [...MET_CGS, 'kh_relay', 'kh_confession', 'kh_home', 'kh_date'],
    total: 6,
    medals: ['osana', 'tenko', 'koharu'],
  },
  {
    ending: 'koharu_daily',
    route: 'koharu',
    kind: 'daily',
    title: '옆자리는 비워 둘게요',
    name: '코하루',
    early: 'abba',
    late: 'KKKKKK',
    met: true,
    earlyPts: '5/4/4.5',
    routePts: '5/4/7.5',
    firstScene: 'k1',
    scenes: [...COMMON_HEAD, ...MET_EPS, 'k1', 'k2', 'k3', 'k4', 'kd1', 'kd2', 'kd3', 'kd4'],
    cgs: ['rain_tenko', ...MET_CGS, 'end_koharu_coin'],
    total: 6,
    medals: ['osana', 'tenko', 'koharu'],
  },
  {
    ending: 'group_festival',
    route: 'group',
    kind: 'festival',
    title: '불꽃이 오르기 전에',
    name: '네 사람',
    early: 'cccc',
    late: 'AHKAHK',
    met: true,
    earlyPts: '4/4/4',
    routePts: '5/5/5',
    firstScene: 'h1',
    scenes: [...COMMON_HEAD, ...MET_EPS, 'h1', 'h2', 'h3', 'h4', 'h5', 'hf1', 'hf2', 'hf3'],
    cgs: [...MET_CGS, 'end_group_fireworks'],
    total: 6,
    medals: ['osana', 'tenko', 'group'],
    table: "5.1 1행('함께' 네 번 4/4/4 · A H K A H K → 5/5/5 히든)",
    ipad: true,
  },
  {
    ending: 'group_daily',
    route: 'group',
    kind: 'daily',
    title: '내일도 넷이서 갈래?',
    name: '네 사람',
    early: 'abba',
    late: 'HKHAKH',
    met: true,
    earlyPts: '5/4/4.5',
    routePts: '5.5/5.5/5.5',
    firstScene: 'h1',
    scenes: [...COMMON_HEAD, ...MET_EPS, 'h1', 'h2', 'h3', 'h4', 'h5', 'hd1', 'hd2', 'hd3', 'hd4'],
    cgs: ['rain_tenko', ...MET_CGS, 'end_group_morning'],
    total: 6,
    medals: ['osana', 'tenko', 'group'],
    table: '5.1 2행(A H H A 5/4/4.5 · H K H A K H → 5.5/5.5/5.5 히든)',
  },
];

function picksOf(p: { early: string; late: string; met: boolean; route: string }, fork: 'f' | 'd' | null): string[] {
  const late = p.met ? [...p.late].map((c) => AHK[c]) : [...p.late];
  return [...p.early, ...late, ...(fork ? [fork] : [])];
}

/** 이 플레이에서 나와야 하는 선택지(스텝:옵션) */
function expectedChoices(p: EndPlan): string[] {
  const early = EARLY.map((s) => `${s}:abc`);
  const late = p.met ? LATE6.map((s) => `${s}:abk`) : LATE3.map((s) => `${s}:abc`);
  return [...early, ...late, `${FORK[p.route]}:fd`];
}

/** 엔딩 화면 폴라로이드 사진의 그림 주소(.polaroid .mini.cg 의 --bg) */
async function polaroidUrl(page: Page): Promise<string> {
  return page.locator('.ending-screen .polaroid .cg').evaluate((e) => (e as HTMLElement).style.getPropertyValue('--bg'));
}

/** 그림 주소가 실제로 받아지는 그림인지(vite preview 는 없는 주소에도 index.html 을 주므로 content-type 으로 판정) */
async function expectImage(page: Page, cssUrl: string) {
  const m = cssUrl.match(/url\("?([^")]+)"?\)/);
  expect(m, `url() 형식: ${cssUrl}`).not.toBeNull();
  const res = await page.request.get(new URL(m![1], page.url()).href);
  expect(res.status(), m![1]).toBe(200);
  expect(res.headers()['content-type'] ?? '', `${m![1]} 는 그림이어야 함`).toMatch(/^image\//);
}

/** 미발견(코하루를 모르는) 타이틀·앨범: 엔딩 배지는 아카네·히나 넷뿐, 앨범 총 장수에 숨김 CG 없음, 이름·그림 흔적 없음 */
async function expectTitleUnmet(page: Page, where: string, reached: string[]) {
  const g = await readGlobalAll(page);
  const seenVisible = g.cgs.filter((c) => !HIDDEN_CGS.has(c));
  expect(g.cgs.filter((c) => HIDDEN_CGS.has(c)), `${where}: 숨김 CG 관람 기록`).toEqual([]);
  const badges = await titleBadges(page);
  expect(badges.map((b) => b.ending), `${where}: 타이틀 엔딩 배지`).toEqual(['osana', 'osana_daily', 'tenko', 'tenko_daily']);
  expect(badges.filter((b) => b.reached).map((b) => b.ending), `${where}: 본 엔딩 배지`).toEqual(reached);
  for (const b of badges.filter((x) => !x.reached)) expect(b.text, `${where}: 못 본 배지 글자`).toBe('???');
  await expect(page.locator('.title-screen [data-ending^=koharu], .title-screen [data-ending^=group], .title-screen [data-route=koharu], .title-screen [data-route=group]')).toHaveCount(0);
  await expect(page.locator('#vn-album-count'), `${where}: 타이틀 앨범 개수`).toHaveText(`모은 추억 ${seenVisible.length} / ${VISIBLE_CGS}`);
  expect(await page.locator('.title-screen').textContent(), `${where}: 타이틀 글자`).not.toMatch(KOHARU_NAMES);
  expect(await page.title(), `${where}: document.title`).not.toMatch(KOHARU_NAMES);
  await openAlbum(page);
  const a = await albumSnapshot(page);
  expect(a.total, `${where}: 앨범 총 장수`).toBe(`${seenVisible.length} / ${VISIBLE_CGS}`);
  for (const r of a.groups.map((x) => x.route)) expect(['osana', 'tenko', 'common'], `${where}: 앨범 묶음`).toContain(r);
  const cards = a.groups.flatMap((x) => x.cards);
  expect(cards, `${where}: 앨범 칸 수(잠긴 칸 포함)`).toHaveLength(VISIBLE_CGS);
  expect(cards.filter((id) => HIDDEN_CGS.has(id)), `${where}: 숨김 CG 칸`).toEqual([]);
  expect(a.imgs.filter((s) => KOHARU_DRAWN_ASSET.test(s) || /koharu/.test(s)), `${where}: 코하루 썸네일`).toEqual([]);
  expect(a.text, `${where}: 앨범 글자`).not.toMatch(KOHARU_NAMES);
  expect(a.html, `${where}: 앨범 마크업`).not.toMatch(/kh_|koharu|group_ice_four|group_frog|group_rain|end_koharu|end_group/);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await vi(page)).overlays).toBe(0);
}

// ===========================================================================
// 1·2·4·7. 여덟 엔딩
// ===========================================================================

for (const p of PLANS) {
  const how = `${p.early}${p.met ? ` · ${p.late}` : ` · ${p.late}(옛 후반 셋)`} · ${p.kind === 'festival' ? 'f' : 'd'}`;
  test(`1. ${p.name} · ${p.kind === 'festival' ? '축제' : '일상'} 「${p.title}」: ${p.met ? '발견' : '미발견'} 경로 ${how}${p.table ? ` — ${p.table}` : ''}`, async ({ page }) => {
    if (!p.ipad) onlyOn([DESKTOP]);
    test.setTimeout(420_000);
    const fork = p.kind === 'festival' ? 'f' : 'd';
    const koharuReq = watchRequests(page, KOHARU_DRAWN_ASSET);
    const groupReq = watchRequests(page, END_GROUP_ASSET);
    const sfxOn = p.ending === 'group_festival';
    // 직접 볼 줄: 히든 축제 hf2(첫 불꽃 효과음 순서)는 한 줄씩, 히든 일상 hd4 의 chorus 줄(hd4.150)과 그 앞 줄
    const unread = new Set<string>(
      p.ending === 'group_festival' ? sceneLines('hf2') : p.ending === 'group_daily' ? ['hd4.140', 'hd4.150'] : [],
    );
    const read = lineIds((_sc, id) => unread.has(id));
    await watchSteps(page);
    if (!p.met) await watchNames(page);
    if (sfxOn) await watchSfx(page);
    await freshBoot(page, { read, settings: { textSpeed: 10, autoSpeed: 10, bgmVolume: 0, sfxVolume: sfxOn ? 60 : 0 } });

    // 새 게임 전 타이틀: 엔딩 배지 '???' 넷(코하루·네 사람 배지 없음), 앨범 0 / 14
    if (!p.met) await expectTitleUnmet(page, '새 게임 전', []);
    else {
      const b = await titleBadges(page);
      expect(b.map((x) => `${x.ending}:${x.text}`)).toEqual(['osana:???', 'osana_daily:???', 'tenko:???', 'tenko_daily:???']);
      expect(await titleAlbumCount(page)).toEqual([0, VISIBLE_CGS]);
    }

    await newGame(page);
    const atChoice: Record<string, string> = {};
    const chorus: Array<{ step: string; name: string; who: string | null }> = [];
    let logChecked = false;
    const r = await run(page, picksOf(p, fork), {
      read: new Set(read),
      onChoice: async (i) => {
        atChoice[i.step!] = pts(i.points);
        // 미발견: 결말 갈래 선택지에서 대화 기록(공통 전체 + 루트 본편)에 코하루 이름·익명 이름표가 없다
        if (!p.met && i.step === FORK[p.route]) {
          const log = await readLog(page);
          expect(log.length).toBeGreaterThan(30);
          expect(log.filter((e) => KOHARU_NAMES.test(e.name + e.text) || /여학생/.test(e.name))).toEqual([]);
          logChecked = true;
        }
      },
      onLine: async (i) => {
        if (i.step === 'hd4.150' || i.step === 'hd4.140') chorus.push({ step: i.step, ...(await nameTag(page)) });
      },
    });
    expect(r.info.mode).toBe('ending');
    if (!p.met) expect(logChecked, '대화 기록 검사').toBe(true);

    // 선택지: 초반 넷 a/b/c, 발견 경로 후반 여섯 a/b/k('모두' 없음), 미발견 후반 셋 a/b/c, 결말 갈래 f/d
    expect(r.choices.map((c) => `${c.step}:${c.options.join('')}`)).toEqual(expectedChoices(p));
    // 초반 네 선택 뒤 점수(계약 5.1 '초반 결과')
    expect(atChoice[p.met ? 'e1f.ch1' : 'c8.ch'], '초반 네 선택 뒤 점수 A/H/K').toBe(p.earlyPts);

    // 지나온 장면과 판정: 첫 루트 프레임의 장면·점수
    const list = await seen(page);
    expect(scenesOf(list.map((x) => x.s))).toEqual(p.scenes);
    const first = firstRouted(list);
    expect(first, '루트가 정해진 프레임').not.toBeNull();
    expect(first!.r).toBe(p.route);
    expect(sceneOf(first!.s), `첫 루트 장면(${first!.s})`).toBe(p.firstScene);
    expect(pts(first!.p), '판정 때 점수 A/H/K').toBe(p.routePts);
    // 결말 갈래 선택은 점수에 영향이 없다
    expect(atChoice[FORK[p.route]]).toBe(p.routePts);
    expect(pts(r.info.points)).toBe(p.routePts);

    // 엔딩 화면
    const scr = page.locator('.ending-screen');
    await expect(scr).toHaveAttribute('data-ending', p.ending);
    await expect(scr).toHaveAttribute('data-route', p.route);
    await expect(scr).toHaveAttribute('data-kind', p.kind);
    await expect(scr.locator('.ending-title')).toHaveText(`「${p.title}」`);
    await expect(scr.locator('.end-kicker')).toHaveText(`${p.name} · ${p.kind === 'festival' ? '축제' : '일상'} 엔딩`);
    const photo = await polaroidUrl(page);
    expect(photo, '폴라로이드 CG').toContain(`assets/cg/${ENDING_CG[p.ending as keyof typeof ENDING_CG]}.webp`);
    await expectImage(page, photo);
    await expect(scr.locator('.end-count')).toContainText(`엔딩 1 / ${p.total}`);
    await expect(scr.locator('.firework')).toHaveCount(p.kind === 'festival' ? 3 : 0);
    expect(await scr.locator('.medal').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.route))).toEqual(p.medals);
    await expect(scr.locator(`.medal[data-route=${p.route}] .pip[data-ending=${p.ending}]`)).toHaveAttribute('data-reached', '1');
    if (!p.met) expect(await scr.textContent()).not.toMatch(KOHARU_NAMES);

    // 전역 기록: 엔딩은 세 키 모두, 관람 CG 는 이 경로의 그림만(중복 없이)
    await expect.poll(async () => (await readGlobalAll(page)).byKey).toEqual({ global: [p.ending], ext: [p.ending], v2: [p.ending] });
    const g = await readGlobalAll(page);
    expect(new Set(g.cgs).size, '관람 기록 중복').toBe(g.cgs.length);
    expect([...g.cgs].sort()).toEqual([...p.cgs].sort());
    expect(g.cgs).toContain(ENDING_CG[p.ending as keyof typeof ENDING_CG]);

    // 타이틀: 본 엔딩 배지, 앨범 개수 = 본 장수 / (14 + 본 숨김 CG)
    await page.locator('.ending-screen [data-action=to-title]').click();
    await expect(page.locator('#vn')).toHaveAttribute('data-mode', 'title');
    const hiddenSeen = p.cgs.filter((c) => HIDDEN_CGS.has(c)).length;
    expect(await titleAlbumCount(page), '타이틀 앨범 개수').toEqual([p.cgs.length, VISIBLE_CGS + hiddenSeen]);
    const badges = await titleBadges(page);
    const mine = badges.find((b) => b.ending === p.ending);
    expect(mine?.reached).toBe(true);
    expect(mine?.text).toBe(`${p.name} · ${p.kind === 'festival' ? '축제' : '일상'}`);
    expect(mine?.title).toBe(`「${p.title}」`);
    expect(badges.filter((b) => b.reached).map((b) => b.ending)).toEqual([p.ending]);
    const visibleRoutes = p.route === 'koharu' ? ['osana', 'tenko', 'koharu'] : p.route === 'group' ? ['osana', 'tenko', 'group'] : ['osana', 'tenko'];
    expect([...new Set(badges.map((b) => b.route))], '타이틀 배지 루트').toEqual(visibleRoutes);
    for (const b of badges.filter((x) => !x.reached)) expect(b.text).toBe('???');

    if (p.met) {
      // 앨범: 본 그림만, 숨김 CG 는 본 것만 총 장수에 더해진다
      await openAlbum(page);
      const a = await albumSnapshot(page);
      expect(a.total).toBe(`${p.cgs.length} / ${VISIBLE_CGS + hiddenSeen}`);
      expect(a.groups.flatMap((x) => x.seen).sort()).toEqual([...p.cgs].sort());
      expect(a.groups.flatMap((x) => x.cards).filter((c) => HIDDEN_CGS.has(c)).sort()).toEqual(p.cgs.filter((c) => HIDDEN_CGS.has(c)).sort());
      if (p.route !== 'group') expect(a.groups.map((x) => x.route)).not.toContain('group');
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await vi(page)).overlays).toBe(0);
    } else {
      await expectTitleUnmet(page, `${p.name} 엔딩 뒤`, [p.ending]);
      expect(await nameHits(page), '화면에 코하루 이름이 나온 순간').toEqual([]);
      expect(koharuReq, '미발견 플레이에서 받은 코하루가 그려진 그림').toEqual([]);
    }

    // 히든 루트 전용 그림은 히든 루트에서만 받는다
    if (p.route === 'group') expect(groupReq.length, 'end_group_* 요청(히든 루트에서는 있어야 함)').toBeGreaterThan(0);
    else expect(groupReq, `${p.route} 루트에서 받은 end_group_* 그림`).toEqual([]);
    if (p.met) expect(koharuReq.length, '발견 플레이에서는 코하루 그림을 받는다(관찰이 헛돌지 않는지)').toBeGreaterThan(0);

    // 7. 히든 일상 hd4 의 chorus 줄: '소우타 · 히나 · 코하루' 한목소리 이름표, 대화 기록도 chorus 색
    if (p.ending === 'group_daily') {
      expect(chorus).toEqual([
        { step: 'hd4.140', name: '아카네', who: 'osana' },
        { step: 'hd4.150', name: '소우타 · 히나 · 코하루', who: 'chorus' },
      ]);
    }

    // 7. 히든 축제: 세 사람의 대답(hf2.220~330) 뒤 첫 불꽃 효과음 → end_group_fireworks
    if (sfxOn) {
      const cgs = await cgLog(page);
      const fwCg = cgs.find((x) => x.cg === 'end_group_fireworks');
      expect(fwCg, 'end_group_fireworks 가 무대에 떴는지').toBeTruthy();
      expect(fwCg!.step, 'CG 가 뜬 프레임').toBe('hf2.360');
      const shownBeforeCg = list.filter((x) => x.t <= fwCg!.t).map((x) => x.s);
      for (const ans of ['hf2.220', 'hf2.270', 'hf2.330']) expect(shownBeforeCg, `CG 전에 대답 ${ans}`).toContain(ans);
      const sfx = await sfxLog(page);
      const fw = sfx.log.filter((x) => /firework/.test(x.url));
      test.info().annotations.push({
        type: 'sfx',
        description: sfx.available
          ? `오디오 기록 ${sfx.log.length}건 · 불꽃 ${fw.map((x) => `${x.kind}@${x.step}(+${Math.round(x.t - fwCg!.t)}ms)`).join(', ') || '없음'} · CG 표시 ${Math.round(fwCg!.t)}ms`
          : 'Web Audio 없음(스텝 순서로 확인)',
      });
      const steps = STORY.scenes.hf2.steps;
      const at = (pred: (s: (typeof steps)[number]) => boolean) => steps.findIndex(pred);
      const firstFw = at((s) => s.t === 'sfx' && (s as { sound: string }).sound === 'firework');
      const cgAt = at((s) => s.t === 'cg' && (s as { cg: string | null }).cg === 'end_group_fireworks');
      expect(firstFw, '대본: 첫 불꽃 효과음은 마지막 대답(hf2.330) 뒤').toBeGreaterThan(at((s) => s.id === 'hf2.330'));
      expect(cgAt, '대본: CG 는 첫 불꽃 효과음 뒤').toBeGreaterThan(firstFw);
      if (sfx.available && sfx.log.length > 0) {
        const firstReq = fw[0];
        expect(firstReq, '불꽃 효과음 요청').toBeTruthy();
        expect(firstReq.step, '첫 불꽃 효과음을 요청한 프레임').toBe('hf2.360');
        expect(firstReq.shown, '불꽃 전에 마지막 대답 hf2.330').toContain('hf2.330');
        expect(firstReq.t, '첫 불꽃 효과음 요청이 CG 표시보다 먼저').toBeLessThanOrEqual(fwCg!.t);
        const start = fw.find((x) => x.kind === 'start');
        expect(start, '불꽃 효과음 재생(start)').toBeTruthy();
        expect(start!.shown).toContain('hf2.330');
      }
    }
  });
}

// 2. 계약 5.1 표 3행: 4/5/4.5 · A K A H K A → 5.5/5.5/5.5 히든(첫 루트 장면 h1 까지)
test('2. 계약 5.1 표 3행: H A A H(4/5/4.5) · A K A H K A → 5.5/5.5/5.5 히든, 첫 루트 장면 h1', async ({ page }) => {
  onlyOn([DESKTOP]);
  test.setTimeout(240_000);
  // h1 의 줄을 읽지 않은 줄로 두어 건너뛰기가 루트 첫 줄에서 멈추게 한다
  const read = lineIds((sc) => sc === 'h1');
  await watchSteps(page);
  await freshBoot(page, { read });
  await newGame(page);
  const at: Record<string, string> = {};
  const r = await run(page, picksOf({ early: 'baab', late: 'AKAHKA', met: true, route: 'group' }, null), {
    read: new Set(read),
    stopAt: (i) => i.route !== null,
    onChoice: (i) => {
      at[i.step!] = pts(i.points);
    },
  });
  expect(at['e1f.ch1']).toBe('4/5/4.5');
  expect(at['e3f.ch2'], '여섯째 직전').toBe('5/5.5/5.5');
  expect(r.info.route).toBe('group');
  expect(sceneOf(r.info.step)).toBe('h1');
  expect(r.info.step).toBe(sceneLines('h1')[0]);
  expect(pts(r.info.points)).toBe('5.5/5.5/5.5');
  expect(scenesOf((await seen(page)).map((x) => x.s)).slice(-6)).toEqual(['c8_raffle', 'e1_ice4', 'e1s_sunday4', 'e2_frog4', 'e3_rain4', 'h1']);
});

// ===========================================================================
// 3. 저장·복원 이중 가점·중복 해금 없음
// ===========================================================================

/** 저장해 둔 위치(스텝·점수·루트·무대 CG)가 불러온 뒤 그대로인지 */
async function expectRestored(page: Page, want: { step: string; pts: string; route: string | null; cg?: string | null }, where: string) {
  await settled(page);
  const i = await vi(page);
  expect(i.step, `${where}: 위치`).toBe(want.step);
  expect(pts(i.points), `${where}: 점수 A/H/K`).toBe(want.pts);
  expect(i.route, `${where}: 루트`).toBe(want.route);
  if (want.cg !== undefined) {
    if (want.cg) await expect(page.locator('#vn .stage'), `${where}: CG`).toHaveAttribute('data-cg', want.cg);
    else await expect(page.locator('#vn .stage[data-cg]'), `${where}: CG 없음`).toHaveCount(0);
  }
  const a = await readSlotJson(page, 'auto');
  expect(a?.schema, `${where}: 자동 저장 스키마`).toBe(4);
}

async function here(page: Page, cg?: string | null) {
  const i = await vi(page);
  return { step: i.step!, pts: pts(i.points), route: i.route, ...(cg !== undefined ? { cg } : {}) };
}

test('3. 저장·복원: 선택 직전·직후, CG 표시 중, 다섯째/여섯째 사이, 루트 확정 직후, 결말 갈래 전후에 수동·퀵·자동 저장 → 새로고침·불러오기 → 같은 선택이면 5/5/5 히든 「불꽃이 오르기 전에」, 해금·관람 1회', async ({ page }, ti) => {
  const full = ti.project.name !== IPAD;
  test.setTimeout(full ? 600_000 : 360_000);
  // 계약 5.1 1행: cccc · A H K A H K · f. 저장 위치에서 멈추도록 몇 줄은 읽지 않은 줄로 둔다
  const iceLine = lineAfterCg('group_ice_four');
  const h1First = sceneLines('h1')[0];
  const fwLine = lineAfterCg('end_group_fireworks');
  const stops = new Set([iceLine, h1First, fwLine]);
  const read = lineIds((_sc, id) => stops.has(id));
  const R = new Set(read);
  await watchSteps(page);
  await freshBoot(page, { read });
  await newGame(page);

  // (1) 선택 직전 퀵저장(c7.ch, 해금 판정 전) → 고르고 해금 뒤 e1f.ch1 까지 → 퀵로드 → 같은 선택
  let r = await run(page, ['c', 'c', 'c'], { read: R });
  expect(r.info.step).toBe('c7.ch');
  const beforeC7 = await here(page);
  expect(beforeC7.pts).toBe('3/3/0');
  await quickSave(page);
  await choose(page, 'c');
  r = await run(page, [], { read: R });
  expect(r.info.step).toBe('e1f.ch1');
  expect(pts(r.info.points), '해금: 코하루 = 두 점수의 평균').toBe('4/4/4');
  await quickLoad(page);
  await expectRestored(page, beforeC7, '퀵로드(c7.ch 선택 직전)');
  expect((await readSlotJson(page, 'quick'))?.state.flags['kh.met'], '선택 직전 저장에는 아직 해금 판정이 없다').toBeUndefined();
  await choose(page, 'c');
  r = await run(page, [], { read: R });
  expect(r.info.step).toBe('e1f.ch1');
  expect(pts(r.info.points), '다시 골라도 해금·평균은 한 번').toBe('4/4/4');
  expect((await readSlotJson(page, 'auto'))?.state.flags['kh.met']).toBe(true);

  // (2) 선택 직후 수동 저장(e1f.ch1 = A 의 반응 줄) → 새로고침 → [불러오기] 1번 칸
  await choose(page, 'a');
  const afterE1 = await here(page);
  expect(afterE1.pts).toBe('4.5/4/4');
  expect(sceneOf(afterE1.step)).toBe('e1_ice4');
  await saveTo(page, '1');
  expect((await readSlotJson(page, '1'))?.schema).toBe(4);
  await reload(page);
  await loadFrom(page, '1');
  await expectRestored(page, afterE1, '수동 저장(e1f.ch1 선택 직후)');

  // (3) CG 표시 중(group_ice_four) 자동 저장 → 새로고침 → [이어하기]
  r = await run(page, ['b'], { read: R, stopAt: (i) => i.step === iceLine });
  expect(r.info.step).toBe(iceLine);
  await expect(page.locator('#vn .stage')).toHaveAttribute('data-cg', 'group_ice_four');
  const atIce = await here(page, 'group_ice_four');
  expect(atIce.pts).toBe('4.5/4.5/4');
  await reload(page);
  await continueFromTitle(page);
  await expectRestored(page, atIce, '이어하기(group_ice_four 표시 중)');
  let g = await readGlobalAll(page);
  expect(g.cgs.filter((c) => c === 'group_ice_four'), 'group_ice_four 관람 기록 1회').toHaveLength(1);
  expect(g.cgs.filter((c) => c === 'kh_meet'), 'kh_meet 관람 기록 1회').toHaveLength(1);
  if (!full) {
    test.info().annotations.push({ type: 'scope', description: 'iPad: (1)~(3) 까지만(나머지는 desktop)' });
    return;
  }

  // (4) 다섯째/여섯째 사이: e3f.ch1 = H 의 반응 줄에서 수동 저장 → 새로고침 → 불러오기
  r = await run(page, ['k', 'a'], { read: R });
  expect(r.info.step).toBe('e3f.ch1');
  expect(pts(r.info.points)).toBe('5/4.5/4.5');
  await choose(page, 'b');
  const between = await here(page);
  expect(between.pts).toBe('5/5/4.5');
  await saveTo(page, '2');
  await reload(page);
  await loadFrom(page, '2');
  await expectRestored(page, between, '수동 저장(다섯째 뒤 · 여섯째 전)');

  // (5) 루트 확정 직후(h1 첫 줄) 퀵저장 → 새로고침 → 타이틀 [불러오기] 퀵 칸
  r = await run(page, ['k'], { read: R, stopAt: (i) => i.route !== null });
  expect(r.info.step).toBe(h1First);
  const routed = await here(page);
  expect(routed).toEqual({ step: h1First, pts: '5/5/5', route: 'group' });
  await quickSave(page);
  await reload(page);
  await loadFrom(page, 'quick');
  await expectRestored(page, routed, '퀵 칸(루트 확정 직후)');

  // (6) 결말 갈래 선택 전(h.fork) 수동 저장, 선택 후 퀵저장 → 새로고침 → 이어하기 → 갈래 전 칸 다시 불러와 같은 선택
  r = await run(page, [], { read: R });
  expect(r.info.step).toBe('h.fork');
  const beforeFork = await here(page);
  await saveTo(page, '3');
  await choose(page, 'f');
  const afterFork = await here(page);
  expect(afterFork.pts).toBe('5/5/5');
  await quickSave(page);
  await reload(page);
  await continueFromTitle(page);
  await expectRestored(page, afterFork, '이어하기(결말 갈래 선택 직후)');
  await loadFrom(page, '3');
  await expectRestored(page, beforeFork, '수동 저장(결말 갈래 선택 전)');
  expect(await visibleOptions(page)).toEqual(['f', 'd']);
  await choose(page, 'f');
  expect(await here(page)).toEqual(afterFork);

  // (7) CG 표시 중(end_group_fireworks, hf2.360) 자동 저장 → 새로고침 → 이어하기
  r = await run(page, [], { read: R, stopAt: (i) => i.step === fwLine });
  await expect(page.locator('#vn .stage')).toHaveAttribute('data-cg', 'end_group_fireworks');
  const atFw = await here(page, 'end_group_fireworks');
  await reload(page);
  await continueFromTitle(page);
  await expectRestored(page, atFw, '이어하기(end_group_fireworks 표시 중)');

  // 끝: 저장 없이 진행한 것과 같은 루트·점수·엔딩, 관람·엔딩 기록 중복 없음
  r = await run(page, [], { read: R });
  expect(r.info.mode).toBe('ending');
  await expect(page.locator('.ending-screen')).toHaveAttribute('data-ending', 'group_festival');
  expect(pts(r.info.points)).toBe('5/5/5');
  expect(r.info.route).toBe('group');
  await expect.poll(async () => (await readGlobalAll(page)).byKey).toEqual({ global: ['group_festival'], ext: ['group_festival'], v2: ['group_festival'] });
  g = await readGlobalAll(page);
  expect(new Set(g.cgs).size, '관람 기록 중복').toBe(g.cgs.length);
  expect([...g.cgs].sort()).toEqual([...MET_CGS, 'end_group_fireworks'].sort());
  // 이번 판의 수동·퀵 칸은 모두 스키마 4, 구저장 표식 없음
  for (const slot of ['1', '2', '3', 'quick']) {
    const s = await readSlotJson(page, slot);
    expect(s?.schema, `${slot} 칸 스키마`).toBe(4);
    expect(s?.state.flags['kh.met'], `${slot} 칸 kh.met`).toBe(true);
    expect(s?.state.flags['kh.late3'], `${slot} 칸 kh.late3`).toBeUndefined();
  }
});

// ===========================================================================
// 5. 자동 진행·읽은 대사 건너뛰기
// ===========================================================================

test('5. 읽은 대사 건너뛰기는 새 장면(e1_ice4)에서도 읽은 줄만 건너뛰고, 자동 진행은 새 진행 선택지 e1f.ch1·결말 갈래 o4.fork 에서 멈춘다', async ({ page }) => {
  test.setTimeout(300_000);
  // e1f.ch1 앞 여덟 줄 중 첫째·여섯째를 읽지 않은 줄로, o4.fork 앞 두 줄 중 첫째를 읽지 않은 줄로
  const pre = linesBefore('e1f.ch1', 8);
  const [u1, u2] = [pre[0], pre[5]];
  const u3 = linesBefore('o4.fork', 2)[0];
  const unread = new Set([u1, u2, u3]);
  const read = lineIds((_sc, id) => unread.has(id));
  await watchSteps(page);
  await freshBoot(page, { read });
  await newGame(page);
  // 초반 넷은 '함께'(발견 경로). 건너뛰기는 c7 → c8_raffle → e1_ice4 의 읽은 줄을 지나 첫 읽지 않은 줄 u1 에서 멈춘다
  let r = await run(page, ['c', 'c', 'c', 'c'], {
    read: new Set(read),
    stopAt: (i) => i.step === u1,
    onChoice: (i) => {
      expect(i.skip, `${i.step}: 선택지에서 건너뛰기 멈춤`).toBe(false);
    },
  });
  expect(r.info.step).toBe(u1);
  expect(r.info.skip).toBe(false);
  // e1_ice4(새 장면)에 들어와 읽은 줄만 지나고(건너뜀) 처음 읽지 않은 줄 u1 에서 멈췄다
  const iceSeen = (await seen(page)).filter((x) => x.sc === 'e1_ice4').map((x) => x.s);
  expect(iceSeen[iceSeen.length - 1]).toBe(u1);
  expect(iceSeen.length, 'e1_ice4 에서 건너뛴 읽은 줄 수').toBeGreaterThan(20);
  expect(iceSeen.slice(0, -1).filter((id) => !read.includes(id)), 'u1 앞에서 지나간 줄은 모두 읽은 줄').toEqual([]);
  // 처음 보는 줄에서는 건너뛰기를 켤 수 없다
  await page.keyboard.press('s');
  await page.waitForTimeout(400);
  expect((await vi(page)).skip).toBe(false);
  expect((await vi(page)).step).toBe(u1);
  // 한 줄 넘기고(읽은 줄) 다시 켜면 다음 읽지 않은 줄 u2 에서 멈춘다(그 사이 읽은 줄 넷은 건너뜀)
  expect((await line(page)).step).toBe(pre[1]);
  // 줄을 넘긴 직후의 짧은 입력 잠금에 걸리면 S 가 무시되므로, 건너뛰기가 켜지거나 줄이 바뀔 때까지 몇 번 누른다
  for (let k = 0; k < 6; k++) {
    await page.keyboard.press('s');
    const moved = await expect
      .poll(async () => {
        const v = await vi(page);
        return v.skip || v.step !== pre[1];
      }, { timeout: 1000 })
      .toBe(true)
      .then(
        () => true,
        () => false,
      );
    if (moved) break;
  }
  await expect.poll(async () => (await vi(page)).step, { timeout: 20_000 }).toBe(u2);
  await expect.poll(async () => (await vi(page)).skip).toBe(false);
  // 자동 진행: u2 에서 켜면 남은 줄을 지나 새 진행 선택지 e1f.ch1 에서 멈추고, 3초 기다려도 넘기지 않는다
  await page.waitForTimeout(500);
  await page.locator('.hud button', { hasText: '자동' }).click();
  await expect.poll(async () => (await vi(page)).frame, { timeout: 30_000, intervals: [100] }).toBe('choice');
  let i = await vi(page);
  expect(i.step).toBe('e1f.ch1');
  await page.waitForTimeout(3000);
  i = await vi(page);
  expect(i.step, '자동 진행이 e1f.ch1 을 넘기지 않는다').toBe('e1f.ch1');
  expect(i.auto).toBe(true);
  expect(await visibleOptions(page)).toEqual(['a', 'b', 'k']);
  await choose(page, 'a');
  await page.locator('.hud button', { hasText: '자동' }).click();
  await expect.poll(async () => (await vi(page)).auto).toBe(false);
  // 나머지 다섯은 아카네(4/4/4 · A×6 → 아카네), 건너뛰기는 o4.fork 앞 u3 에서 멈춘다
  r = await run(page, ['a', 'a', 'a', 'a', 'a'], { read: new Set(read), stopAt: (x) => x.step === u3 });
  expect(r.info.step).toBe(u3);
  expect(r.info.route).toBe('osana');
  await page.waitForTimeout(500);
  await page.locator('.hud button', { hasText: '자동' }).click();
  await expect.poll(async () => (await vi(page)).frame, { timeout: 30_000, intervals: [100] }).toBe('choice');
  i = await vi(page);
  expect(i.step).toBe('o4.fork');
  await page.waitForTimeout(3000);
  i = await vi(page);
  expect(i.step, '자동 진행이 결말 갈래 o4.fork 를 넘기지 않는다').toBe('o4.fork');
  expect(i.auto).toBe(true);
  expect(await visibleOptions(page)).toEqual(['f', 'd']);
  await choose(page, 'd');
  expect(sceneOf((await vi(page)).step)).toBe('o4_promise');
  await page.locator('.hud button', { hasText: '자동' }).click();
  await expect.poll(async () => (await vi(page)).auto).toBe(false);
  // 건너뛰기도 결말 갈래 선택지에서 멈췄어야 한다(읽은 줄에서 켠 건너뛰기가 o4.fork 를 지나지 않음): 위 run 이 u3 에서 섰고 선택지는 자동 진행으로 도달
  expect((await readSlotJson(page, 'auto'))?.state.choices['o4.fork']).toBe('d');
});

// ===========================================================================
// 6. 구저장(897ae1f 스키마 3)과 옛 전역 기록
// ===========================================================================

interface V3Entry {
  name: string;
  how: string;
  picks: string;
  sceneId: string;
  stepId: string;
  route: string | null;
  points: Pts;
  met: boolean;
  old: { finalRoute: string; ending: string; finalPoints: Pts };
  save: unknown;
}
const V3 = JSON.parse(readFileSync(new URL('../unit/fixtures/v3-saves.897ae1f.json', import.meta.url), 'utf8')) as {
  saves: V3Entry[];
  global: Record<string, unknown>;
};
const v3 = (name: string) => {
  const e = V3.saves.find((x) => x.name === name);
  if (!e) throw new Error(`구저장 고정 자료 없음: ${name}`);
  return { ...e, raw: JSON.stringify(e.save) };
};
/** 897ae1f 빌드가 쓴 옛 전역 기록 원문(ashita.global·ashita.global.ext) */
const OLD_GLOBAL_RAW = Object.fromEntries(Object.entries(V3.global).map(([k, v]) => [k, JSON.stringify(v)]));
const OLD_ENDINGS = ['osana', 'tenko', 'koharu'];
const OLD_CGS = (V3.global['ashita.global'] as { cgs: string[] }).cgs;
/** 옛 전역 기록 + 이 스펙의 읽음 기록(건너뛰기용). 엔딩·CG 는 옛 기록 그대로 */
const oldGlobalWithRead = (read: string[]) => ({
  ...OLD_GLOBAL_RAW,
  'ashita.global': JSON.stringify({ ...(V3.global['ashita.global'] as object), read }),
});

/** 옛 전역 기록이 그대로 보이는 타이틀: 엔딩 배지 6(코하루 포함, 본 셋), 앨범 17 / 20 */
async function expectOldGlobalTitle(page: Page, where: string) {
  const b = await titleBadges(page);
  expect(b.map((x) => x.ending), `${where}: 배지`).toEqual(['osana', 'osana_daily', 'tenko', 'tenko_daily', 'koharu', 'koharu_daily']);
  expect(b.filter((x) => x.reached).map((x) => x.ending), `${where}: 본 엔딩`).toEqual(OLD_ENDINGS);
  expect(await titleAlbumCount(page), `${where}: 앨범`).toEqual([17, 20]);
  const g = await readGlobalAll(page);
  for (const e of OLD_ENDINGS) expect(g.endings, `${where}: 옛 엔딩 ${e}`).toContain(e);
  for (const c of OLD_CGS) expect(g.cgs, `${where}: 옛 CG ${c}`).toContain(c);
  expect(new Set(g.cgs).size).toBe(g.cgs.length);
}

test('6a. 구저장 c8.k10(발견, 옛 후반 선택 c8.ch=k 를 한 뒤): 이어하기 → c8_bakery → c9 → c10 옛 흐름(a/b/k, +3), 히든 없이 옛 판정 아카네 10/4/7, 새 저장은 스키마 4·kh.late3, 옛 전역 기록 유지', async ({ page }) => {
  test.setTimeout(240_000);
  const e = v3('met-c8k10');
  await watchSteps(page);
  await freshBoot(page, { raw: OLD_GLOBAL_RAW, slots: { auto: e.raw } });
  await expectOldGlobalTitle(page, '새 빌드 첫 타이틀');
  await continueFromTitle(page);
  expect((await vi(page)).step).toBe('c8.k10');
  expect(pts((await vi(page)).points)).toBe('4/4/7');
  // 옛 장면은 한 줄씩(옛 전역 기록의 읽음 기록은 손대지 않는다)
  const r = await run(page, ['a', 'a'], { stopAt: (i) => i.route !== null });
  expect(r.choices.map((c) => `${c.step}:${c.options.join('')}`)).toEqual(['c9.ch:abk', 'c10.ch:abk']);
  expect(r.info.route).toBe(e.old.finalRoute);
  expect(sceneOf(r.info.step)).toBe('o1_shop');
  expect(pts(r.info.points)).toBe(pts(e.old.finalPoints));
  const sc = scenesOf((await seen(page)).map((x) => x.s));
  expect(sc).toEqual(['c8_bakery', 'c9_puzzle', 'c10_window', 'o1_shop']);
  // 새로 저장하면 스키마 4, 구저장 표식(kh.late3)은 남고 점수·선택은 그대로
  await quickSave(page);
  const q = await readSlotJson(page, 'quick');
  expect(q?.schema).toBe(4);
  expect(q?.state.flags).toMatchObject({ 'kh.met': true, 'kh.late3': true });
  expect(q?.state.route).toBe('osana');
  expect(q?.state.choices).toMatchObject({ 'c8.ch': 'k', 'c9.ch': 'a', 'c10.ch': 'a' });
  expect(Object.keys(q!.state.choices).filter((k) => /^e[123]f\./.test(k)), '고르지 않은 새 선택을 채우지 않음').toEqual([]);
  await toTitle(page);
  await expectOldGlobalTitle(page, '구저장 진행 뒤 타이틀');
  const g = await readGlobalAll(page);
  expect(g.byKey.v2, '새 빌드가 쓴 v2 키에도 옛 엔딩').toEqual(expect.arrayContaining(OLD_ENDINGS));
});

test('6b. 구저장 c10.j10(7/7/7, 옛 후반 a·b·k): [불러오기] 1번 칸 → 옛 규칙으로 코하루(새 규칙이면 히든이었을 점수), 히든 루트로 재분류하지 않음', async ({ page }) => {
  test.setTimeout(180_000);
  const e = v3('met-c10j10-abk');
  await watchSteps(page);
  await freshBoot(page, { raw: OLD_GLOBAL_RAW, slots: { '1': e.raw } });
  await loadFrom(page, '1');
  expect((await vi(page)).step).toBe('c10.j10');
  expect(pts((await vi(page)).points)).toBe('7/7/7');
  const r = await run(page, [], { stopAt: (i) => i.route !== null });
  expect(r.info.route).toBe('koharu');
  expect(sceneOf(r.info.step)).toBe('k1');
  expect(pts(r.info.points)).toBe('7/7/7');
  const a = await readSlotJson(page, 'auto');
  expect(a?.schema).toBe(4);
  expect(a?.state.route).toBe('koharu');
  expect(a?.state.flags['kh.late3']).toBe(true);
});

test('6c. 구저장 c8r.180(kh_draw 표시 중, 후반 선택 전): 이어하기 → CG 다시 보이고 관람 1회, 새 흐름 e1_ice4 의 a/b/k(+0.5), 점수 5/4/4.5 그대로', async ({ page }) => {
  test.setTimeout(240_000);
  const e = v3('met-c8r-cg');
  const read = lineIds();
  await watchSteps(page);
  await freshBoot(page, { raw: oldGlobalWithRead(read), slots: { auto: e.raw } });
  await continueFromTitle(page);
  expect((await vi(page)).step).toBe('c8r.180');
  await expect(page.locator('#vn .stage')).toHaveAttribute('data-cg', 'kh_draw');
  const r = await run(page, ['b'], { read: new Set(read) });
  expect(r.choices.map((c) => `${c.step}:${c.options.join('')}`)).toEqual(['e1f.ch1:abk']);
  expect(r.info.step).toBe('e1f.ch2');
  expect(pts(r.info.points)).toBe('5/4.5/4.5');
  expect(scenesOf((await seen(page)).map((x) => x.s))).toEqual(['c8_raffle', 'e1_ice4']);
  const g = await readGlobalAll(page);
  expect(g.cgs.filter((c) => c === 'kh_draw')).toHaveLength(1);
  expect(g.cgs).toContain('group_ice_four');
  const a = await readSlotJson(page, 'auto');
  expect(a?.schema).toBe(4);
  expect(a?.state.flags['kh.late3'], '후반 선택 전 구저장에는 구저장 표식이 없다(새 흐름)').toBeUndefined();
});

test('6d. 구저장 c9.ch(미발견 6/3 → c8 함께): 이어하기 → a/b/c, c9 → e2_frog3 → c10 → e3_rain3 → 아카네 13/4/0, 코하루 그림·이름 없음, 수동 저장은 스키마 4', async ({ page }) => {
  onlyOn([DESKTOP]);
  test.setTimeout(240_000);
  const e = v3('unmet-c9ch');
  const read = lineIds();
  const koharuReq = watchRequests(page, KOHARU_DRAWN_ASSET);
  await watchSteps(page);
  await watchNames(page);
  await freshBoot(page, { raw: oldGlobalWithRead(read), slots: { auto: e.raw } });
  await continueFromTitle(page);
  expect((await vi(page)).step).toBe('c9.ch');
  const r = await run(page, ['a', 'a'], { read: new Set(read), stopAt: (i) => i.route !== null });
  expect(r.choices.map((c) => `${c.step}:${c.options.join('')}`)).toEqual(['c9.ch:abc', 'c10.ch:abc']);
  expect(r.info.route).toBe('osana');
  expect(pts(r.info.points)).toBe(pts(e.old.finalPoints));
  expect(scenesOf((await seen(page)).map((x) => x.s))).toEqual(['c9_puzzle', 'e2_frog3', 'c10_window', 'e3_rain3', 'o1_shop']);
  await saveTo(page, '2');
  expect((await readSlotJson(page, '2'))?.schema).toBe(4);
  expect(koharuReq).toEqual([]);
  expect(await nameHits(page)).toEqual([]);
});

test('6e. 구저장 o5.010(아카네 루트 축제 후일담): 이어하기 → 결말 갈래 없이 「내일도, 그다음 날도」, 옛 엔딩·CG 기록 유지(세 키)', async ({ page }) => {
  test.setTimeout(240_000);
  const e = v3('route-o5');
  await freshBoot(page, { raw: OLD_GLOBAL_RAW, slots: { auto: e.raw } });
  await continueFromTitle(page);
  expect((await vi(page)).step).toBe('o5.010');
  expect((await vi(page)).route).toBe('osana');
  const r = await run(page, []);
  expect(r.choices, '후일담 안에서는 선택지가 없다').toEqual([]);
  expect(r.info.mode).toBe('ending');
  await expect(page.locator('.ending-screen')).toHaveAttribute('data-ending', 'osana');
  await expect(page.locator('.ending-screen .ending-title')).toHaveText('「내일도, 그다음 날도」');
  // 이미 본 엔딩: 엔딩 1 이 아니라 옛 기록 셋 그대로(보이는 6 중 3)
  await expect(page.locator('.ending-screen .end-count')).toContainText('엔딩 3 / 6');
  await expect.poll(async () => (await readGlobalAll(page)).byKey.v2?.slice().sort()).toEqual([...OLD_ENDINGS].sort());
  const g = await readGlobalAll(page);
  expect(g.byKey.global?.slice().sort()).toEqual([...OLD_ENDINGS].sort());
  expect(g.byKey.ext?.slice().sort()).toEqual([...OLD_ENDINGS].sort());
  await page.locator('.ending-screen [data-action=to-title]').click();
  await expectOldGlobalTitle(page, '엔딩 뒤 타이틀');
});

// ===========================================================================
// 8. 대사창 불투명도 사용자 설정
// ===========================================================================

const clamp = (lo: number, x: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** CG 중 대사창 유리 알파(play.css --cg-a, Apple 터치는 +0.1 판) — window-opacity.spec 의 배합식 */
const cgAlpha = (a: number, apple: boolean) => (apple ? clamp(0.4, a * a * 0.78 + 0.1, 0.9) : clamp(0.3, a * a * 0.78, 0.8));

async function textboxAlpha(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#vn > .textbox')!);
    const src = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor;
    const m = src.match(/rgba?\(([^)]*)\)/);
    const v = (m?.[1] ?? '').split(/[\s,/]+/).filter(Boolean).map(Number);
    return v.length > 3 ? v[3] : 1;
  });
}

test('8. 대사창 불투명도 55%(사용자 설정)가 새 CG 장면(group_ice_three)에서도, 새로고침 뒤에도 유지된다', async ({ page }) => {
  test.setTimeout(180_000);
  const cgLine = lineAfterCg('group_ice_three');
  const read = lineIds((_sc, id) => id === cgLine);
  await freshBoot(page, { read });
  await newGame(page);
  // 플레이 중 설정 시트 → 글자·대사창 → 슬라이더 55
  const cfg = page.locator('#vn > .qbar [data-q=config]');
  if (await cfg.isVisible()) await cfg.click();
  else {
    await page.locator('.hud button', { hasText: '메뉴' }).click();
    await page.locator('[data-panel=menu] [data-action=settings]').click();
  }
  await expect(page.locator('[data-panel=settings]')).toBeVisible();
  await page.locator('[data-panel=settings] [data-cfg=text]').click();
  const slider = page.locator('[data-panel=settings] input[data-setting=windowOpacity]');
  await slider.fill('55');
  await expect(slider).toHaveValue('55');
  await page.locator('[data-panel=settings] [data-action=close-settings]').click();
  await closeOverlays(page);
  await expect.poll(() => page.locator('#vn').evaluate((e) => getComputedStyle(e).getPropertyValue('--win-alpha').trim())).toBe('0.55');
  // 미발견 경로(a×4)로 빙수집 셋 판의 CG 줄까지
  const r = await run(page, ['a', 'a', 'a', 'a'], { read: new Set(read), stopAt: (i) => i.step === cgLine });
  expect(r.info.step).toBe(cgLine);
  await expect(page.locator('#vn .stage')).toHaveAttribute('data-cg', 'group_ice_three');
  const apple = (await page.locator('#vn').getAttribute('data-render')) === 'apple-touch';
  const want = cgAlpha(0.55, apple);
  await expect.poll(() => textboxAlpha(page), { message: 'CG 중 대사창 알파(55%)' }).toBeCloseTo(want, 2);
  expect(Math.abs(want - cgAlpha(0.7, apple)), '기본 70% 와 구별되는 값').toBeGreaterThan(0.05);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ashita.settings') ?? '{}').windowOpacity)).toBe(55);
  // 새로고침 → 이어하기: 같은 CG 줄, 같은 설정·알파
  await reload(page);
  await continueFromTitle(page);
  expect((await vi(page)).step).toBe(cgLine);
  await expect(page.locator('#vn .stage')).toHaveAttribute('data-cg', 'group_ice_three');
  await expect.poll(() => page.locator('#vn').evaluate((e) => getComputedStyle(e).getPropertyValue('--win-alpha').trim())).toBe('0.55');
  await expect.poll(() => textboxAlpha(page)).toBeCloseTo(want, 2);
});
