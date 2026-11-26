/** 추억 앨범 목록 모델: 루트별 묶음·순서·모은 수·감상 순서(끝에서 처음으로) + 히든 히로인·히든 루트 공개 규칙(reveal.ts) */
import { describe, expect, it } from 'vitest';
import { albumModel, groupLabel, wrapIndex, type AlbumEntry } from '../../src/ui/screens/album';
import { endingMedals, reachedHeroines, revealedHeroines, titleEndings, visibleCatalog, visibleEndings, visibleRoutes } from '../../src/ui/reveal';
import { ENDING_KIND_NAMES, GROUP_ROUTE_NAME, ROUTE_COLORS, endingLabel, routeColors, routeName } from '../../src/ui/screens/common';
import { CG_ORDER, CGS, ENDING_CG, KOHARU_DRAWN_CGS } from '../../src/story/cg';
import { STORY } from '../../src/story';
import type { EndingDef, EndingId, HeroineId, RouteId } from '../../src/engine/types';

// main.ts 의 cgCatalog 와 같은 모양(hidden 포함)
const catalog: AlbumEntry[] = CG_ORDER.map((id) => ({ id, title: CGS[id].title, route: CGS[id].route, hidden: CGS[id].hidden === true }));
/** 처음부터 잠긴 칸으로 보이는 CG: 기존 11장 + 미발견 빙수집(group_ice_three) + 아카네·히나 일상 결말 2장 */
const BASE_IDS = CG_ORDER.filter((id) => !CGS[id].hidden);
/** 관람 전에는 어디에도 없는 CG: 코하루가 그려진 12장(kh_* 6 + 여덟 엔딩 확장 6) */
const HIDDEN_IDS = CG_ORDER.filter((id) => CGS[id].hidden);
const endings = Object.values(STORY.endings);
const OSANA_IDS = ['rain_osana', 'door_osana', 'ramune_osana', 'fireworks_osana', 'homeward_osana', 'end_akane_walk'];
const TENKO_IDS = ['rain_tenko', 'cats_tenko', 'bench_tenko', 'selfie_tenko', 'shutter_tenko', 'polaroid_tenko', 'end_hina_walk'];

describe('추억 앨범 모델', () => {
  it('처음엔 0 / 14, 아카네 → 히나 → 공통(미발견 빙수집) 순서로 묶이고 묶음 안은 CG_ORDER 순서다', () => {
    const m = albumModel(catalog, []);
    expect(BASE_IDS).toHaveLength(14);
    expect(m.total).toBe(14);
    expect(m.seen).toBe(0);
    expect(m.order).toEqual([]);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', null]);
    expect(m.groups[0].items.map((i) => i.id)).toEqual(OSANA_IDS);
    expect(m.groups[1].items.map((i) => i.id)).toEqual(TENKO_IDS);
    expect(m.groups[2].items.map((i) => i.id)).toEqual(['group_ice_three']);
    // 소나기 CG 는 각 히로인 줄 맨 앞, 일상 쪽 결말 그림은 각 루트 묶음 끝
    expect(m.groups[0].items[0].id).toBe('rain_osana');
    expect(m.groups[1].items[0].id).toBe('rain_tenko');
    expect(m.groups.flatMap((g) => g.items).every((i) => !i.seen)).toBe(true);
  });

  it('본 CG 만 열리고, 모르는 id·중복은 세지 않으며, 감상 순서는 화면 순서(묶음 → 목록)다', () => {
    const m = albumModel(catalog, ['polaroid_tenko', 'rain_tenko', 'homeward_osana', 'renamed_xyz', 'rain_tenko', 'group_ice_three']);
    expect(m.seen).toBe(4);
    expect(m.groups.map((g) => g.seen)).toEqual([1, 2, 1]);
    expect(m.order).toEqual(['homeward_osana', 'rain_tenko', 'polaroid_tenko', 'group_ice_three']);
  });

  it('루트가 없는(공통) CG 는 맨 뒤 공통 묶음으로 간다', () => {
    const m = albumModel([...catalog, { id: 'extra_common', title: '여분', route: null }], ['extra_common']);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', null]);
    expect(m.groups[2].items.map((i) => i.id)).toEqual(['group_ice_three', 'extra_common']);
    expect(m.order).toEqual(['extra_common']);
    expect(m.total).toBe(15);
  });

  it('감상 넘기기는 끝에서 처음으로, 처음에서 끝으로 돈다', () => {
    expect(wrapIndex(3, 2, 1)).toBe(0);
    expect(wrapIndex(3, 0, -1)).toBe(2);
    expect(wrapIndex(3, 1, 1)).toBe(2);
    expect(wrapIndex(1, 0, 1)).toBe(0);
    expect(wrapIndex(0, 0, 1)).toBe(0);
  });
});

describe('히든 히로인(코하루)·히든 루트(네 사람): 관람 전에는 앨범·타이틀에 드러나지 않는다', () => {
  const allItems = (m: ReturnType<typeof albumModel>) => m.groups.flatMap((g) => g.items);

  it('매니페스트: 코하루가 그려진 CG 12장은 모두 hidden 이고, hidden 은 모두 코하루가 그려진 CG 다', () => {
    expect(HIDDEN_IDS).toEqual([
      'kh_meet',
      'kh_draw',
      'group_ice_four',
      'group_frog',
      'group_rain',
      'kh_relay',
      'kh_confession',
      'kh_home',
      'kh_date',
      'end_koharu_coin',
      'end_group_fireworks',
      'end_group_morning',
    ]);
    expect(new Set(HIDDEN_IDS)).toEqual(new Set(KOHARU_DRAWN_CGS));
    // 공통 장면의 그림은 route null, 히든 루트 그림은 'group'
    expect(HIDDEN_IDS.map((id) => CGS[id].route)).toEqual([
      null,
      null,
      null,
      null,
      null,
      'koharu',
      'koharu',
      'koharu',
      'koharu',
      'koharu',
      'group',
      'group',
    ]);
    expect(ENDING_CG.koharu).toBe('kh_date');
    // 기존 11장과 group_ice_three·end_akane_walk·end_hina_walk 는 hidden 이 아니다(잠긴 칸으로 보인다)
    for (const id of BASE_IDS) expect(CGS[id].hidden ?? false).toBe(false);
    expect(BASE_IDS.filter((id) => /^(group_|end_)/.test(id))).toEqual(['end_akane_walk', 'end_hina_walk', 'group_ice_three']);
  });

  it('아무것도 보지 않았으면 칸·빈칸·총 장수·제목·묶음 어디에도 숨김 CG 가 없다(0 / 14, 코하루·네 사람 묶음 없음)', () => {
    const m = albumModel(catalog, []);
    expect(m.total).toBe(14);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', null]);
    const items = allItems(m);
    expect(items.some((i) => i.id.startsWith('kh_') || i.route === 'koharu' || i.route === 'group' || i.hidden)).toBe(false);
    expect(items.some((i) => KOHARU_DRAWN_CGS.includes(i.id as never))).toBe(false);
    const titles = new Set(items.map((i) => i.title));
    for (const id of HIDDEN_IDS) expect(titles.has(CGS[id].title), id).toBe(false);
    expect(visibleCatalog(catalog, []).map((c) => c.id)).toEqual(BASE_IDS);
  });

  it('잠긴 칸으로 보이는 CG 를 모두 봐도 14 / 14(코하루·네 사람 몫의 빈칸이 생기지 않는다)', () => {
    const m = albumModel(catalog, BASE_IDS, reachedHeroines(endings, ['osana', 'tenko', 'osana_daily', 'tenko_daily']));
    expect([m.seen, m.total]).toEqual([14, 14]);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', null]);
  });

  it('복도 첫 만남(kh_meet)만 본 뒤: 공통 묶음에 그 한 장이 더해지고, 코하루 묶음은 없다(1 / 15)', () => {
    const m = albumModel(catalog, ['kh_meet']);
    expect([m.seen, m.total]).toEqual([1, 15]);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', null]);
    expect(m.groups[2].items.map((i) => [i.id, i.seen])).toEqual([
      ['kh_meet', true],
      ['group_ice_three', false],
    ]);
    expect(groupLabel(null, () => 'x')).toBe('공통');
    expect(m.order).toEqual(['kh_meet']);
  });

  it('넷 판 에피소드 CG 는 본 것만 공통 묶음에 시간순(kh_draw 뒤)으로 들어간다', () => {
    const m = albumModel(catalog, ['kh_meet', 'kh_draw', 'group_ice_four', 'group_frog', 'group_rain']);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', null]);
    expect(m.groups[2].items.map((i) => i.id)).toEqual(['kh_meet', 'kh_draw', 'group_ice_four', 'group_ice_three', 'group_frog', 'group_rain']);
    expect([m.seen, m.total]).toEqual([5, 19]);
  });

  it('코하루 루트 CG 를 본 뒤: 코하루 묶음(이름은 heroineName)에 본 칸만, 보지 않은 루트 CG 는 여전히 없다', () => {
    const m = albumModel(catalog, ['kh_meet', 'kh_draw', 'kh_relay', 'rain_osana']);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', 'koharu', null]);
    const kh = m.groups[2];
    expect(kh.items.map((i) => i.id)).toEqual(['kh_relay']);
    expect(kh.seen).toBe(1);
    expect(groupLabel(kh.route, (h) => (h === 'koharu' ? '코하루' : h))).toBe('코하루');
    expect([m.seen, m.total]).toEqual([4, 17]);
    // 감상 순서 = 화면 순서(아카네 → 히나 → 코하루 → 공통)
    expect(m.order).toEqual(['rain_osana', 'kh_relay', 'kh_meet', 'kh_draw']);
  });

  it('네 사람(히든 루트) 묶음은 그 그림을 하나라도 보기 전에는 없고, 본 뒤에는 본 칸만 있다(이름 「네 사람」)', () => {
    expect(albumModel(catalog, ['end_koharu_coin']).groups.map((g) => g.route)).toEqual(['osana', 'tenko', 'koharu', null]);
    const m = albumModel(catalog, ['end_group_morning']);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', 'group', null]);
    const grp = m.groups[2];
    expect(grp.items.map((i) => i.id)).toEqual(['end_group_morning']);
    expect(groupLabel(grp.route, () => 'x')).toBe('네 사람');
    expect([m.seen, m.total]).toEqual([1, 15]);
    // 히든 루트 그림만 본 것으로는 코하루 인물 공개가 아니다(코하루 루트 묶음은 생기지 않는다)
    expect(revealedHeroines(catalog, ['end_group_morning'])).toEqual(['osana', 'tenko']);
  });

  it('모든 그림을 다 보면 26 / 26', () => {
    const m = albumModel(catalog, CG_ORDER, reachedHeroines(endings, Object.keys(STORY.endings) as EndingId[]));
    expect([m.seen, m.total]).toEqual([26, 26]);
    expect(m.groups.map((g) => [g.route, g.items.length])).toEqual([
      ['osana', 6],
      ['tenko', 7],
      ['koharu', 5],
      ['group', 2],
      [null, 6],
    ]);
  });

  it('엔딩에 도달했어도 그 CG 를 보지 않았으면(기록이 지워진 경우 등) 코하루 칸은 생기지 않는다', () => {
    const m = albumModel(catalog, [], ['koharu']);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', null]);
    expect(m.total).toBe(14);
  });

  it('모르는 id·중복은 세지 않는다(hidden CG 도 같은 규칙)', () => {
    const m = albumModel(catalog, ['kh_relay', 'kh_relay', 'kh_unknown']);
    expect([m.seen, m.total]).toEqual([1, 15]);
  });

  it('등장 공개(revealedHeroines): 코하루 엔딩 도달 또는 코하루 루트의 hidden CG 관람 뒤에만', () => {
    expect(revealedHeroines(catalog, [])).toEqual(['osana', 'tenko']);
    // 공통(route null) 히든 CG 만 본 것으로는 인물 공개가 아니다(그 그림 한 장만 공통 묶음에 보인다)
    expect(revealedHeroines(catalog, ['kh_meet', 'kh_draw', 'group_frog'])).toEqual(['osana', 'tenko']);
    expect(revealedHeroines(catalog, ['kh_home'])).toEqual(['osana', 'tenko', 'koharu']);
    expect(revealedHeroines(catalog, ['end_koharu_coin'])).toEqual(['osana', 'tenko', 'koharu']);
    expect(revealedHeroines(catalog, [], reachedHeroines(endings, ['koharu']))).toEqual(['osana', 'tenko', 'koharu']);
    expect(revealedHeroines(catalog, [], reachedHeroines(endings, ['koharu_daily']))).toEqual(['osana', 'tenko', 'koharu']);
    expect(reachedHeroines(endings, ['tenko', 'bogus' as EndingId])).toEqual(['tenko']);
    // 히든 루트 엔딩은 히로인 도달로 세지 않는다
    expect(reachedHeroines(endings, ['group_festival', 'group_daily'])).toEqual([]);
  });

  it('타이틀 엔딩 배지: 아카네·히나의 두 갈래는 늘, 코하루·네 사람은 그 루트의 엔딩에 하나라도 도달한 뒤에만', () => {
    expect(titleEndings(endings, []).map((e) => e.id)).toEqual(['osana', 'osana_daily', 'tenko', 'tenko_daily']);
    expect(titleEndings(endings, ['osana', 'tenko']).map((e) => e.id)).toEqual(['osana', 'osana_daily', 'tenko', 'tenko_daily']);
    expect(titleEndings(endings, ['koharu']).map((e) => e.id)).toEqual(['osana', 'osana_daily', 'tenko', 'tenko_daily', 'koharu', 'koharu_daily']);
    expect(titleEndings(endings, ['group_daily']).map((e) => e.id)).toEqual([
      'osana',
      'osana_daily',
      'tenko',
      'tenko_daily',
      'group_festival',
      'group_daily',
    ]);
    expect(STORY.endings.koharu.route).toBe('koharu');
    expect(STORY.endings.koharu.kind).toBe('festival');
  });

  it('타이틀 [추억 앨범] 수(albumModel 의 seen / total): 보지 않은 hidden CG 는 총 장수에서 빠진다', () => {
    const count = (seen: string[], reached: EndingId[] = []) => {
      const m = albumModel(catalog, seen, reachedHeroines(endings, reached));
      return `${m.seen} / ${m.total}`;
    };
    expect(count([])).toBe('0 / 14');
    expect(count(['rain_tenko', 'polaroid_tenko'], ['tenko'])).toBe('2 / 14');
    expect(count(['kh_meet'])).toBe('1 / 15');
    expect(count(['kh_meet', 'kh_draw', 'kh_relay', 'kh_confession', 'kh_home', 'kh_date'], ['koharu'])).toBe('6 / 20');
  });

  it('엔딩 화면 메달(endingMedals): 보이는 루트마다 하나, 코하루·네 사람 메달은 도달했거나 지금 그 루트 엔딩일 때만', () => {
    const routes = (r: ReturnType<typeof endingMedals>) => r.medals.map((m) => m.route);
    expect(routes(endingMedals(endings, [], 'osana'))).toEqual(['osana', 'tenko']);
    expect(routes(endingMedals(endings, ['osana', 'tenko'], 'tenko'))).toEqual(['osana', 'tenko']);
    // 처음 코하루 엔딩에 닿은 순간(markEnding 전이라도)
    expect(routes(endingMedals(endings, [], 'koharu'))).toEqual(['osana', 'tenko', 'koharu']);
    // 한 번 도달한 뒤에는 다른 엔딩 화면에서도(일상 쪽 결말도 같은 루트)
    expect(routes(endingMedals(endings, ['koharu'], 'osana'))).toEqual(['osana', 'tenko', 'koharu']);
    expect(routes(endingMedals(endings, ['koharu_daily'], 'osana'))).toEqual(['osana', 'tenko', 'koharu']);
    // 네 사람 엔딩을 처음 보는 순간: 네 사람 메달만 더해진다(코하루 엔딩을 본 적 없으면 코하루 메달은 없다)
    expect(routes(endingMedals(endings, [], 'group_daily'))).toEqual(['osana', 'tenko', 'group']);
    expect(routes(endingMedals(endings, ['koharu'], 'group_festival'))).toEqual(['osana', 'tenko', 'koharu', 'group']);
  });
});

describe('엔딩 8개: 공개 정책·분모·배지 문구(설계 계약 7·9절)', () => {
  const ids = (xs: readonly { id: EndingId }[]) => xs.map((e) => e.id);
  const BASE4: EndingId[] = ['osana', 'osana_daily', 'tenko', 'tenko_daily'];
  const KOHARU2: EndingId[] = ['koharu', 'koharu_daily'];
  const GROUP2: EndingId[] = ['group_festival', 'group_daily'];
  const hiddenTrace = (xs: readonly { route: RouteId }[]) => xs.filter((e) => e.route === 'koharu' || e.route === 'group');
  const name = (h: HeroineId) => ({ osana: '아카네', tenko: '히나', koharu: '코하루' })[h];

  it('이야기의 엔딩 정의: 8개, 루트마다 축제·일상 하나씩(엔딩=히로인 1:1 가정이 없다)', () => {
    expect(endings).toHaveLength(8);
    for (const r of ['osana', 'tenko', 'koharu', 'group'] as RouteId[]) {
      expect(endings.filter((e) => e.route === r).map((e) => e.kind).sort(), r).toEqual(['daily', 'festival']);
    }
  });

  it('아무것도 보지 않았으면(미발견 플레이어): 공개 목록·메달·분모에 코하루·네 사람 흔적이 0, 분모 4', () => {
    expect(ids(titleEndings(endings, []))).toEqual(BASE4);
    expect(hiddenTrace(titleEndings(endings, []))).toEqual([]);
    expect(visibleRoutes(endings, [])).toEqual(['osana', 'tenko']);
    const r = endingMedals(endings, ['osana'], 'osana');
    expect([r.got, r.total]).toEqual([1, 4]);
    expect(r.medals.flatMap((m) => m.endings.map((x) => x.ending.route)).filter((x) => x === 'koharu' || x === 'group')).toEqual([]);
    // 아카네 두 결말을 다 본 상태(b): 여전히 4
    const both = endingMedals(endings, ['osana', 'osana_daily'], 'osana_daily');
    expect([both.got, both.total]).toEqual([2, 4]);
    expect(both.medals[0].endings.map((x) => [x.ending.id, x.reached])).toEqual([
      ['osana', true],
      ['osana_daily', true],
    ]);
    expect(both.medals[1].reached).toBe(false);
  });

  it('코하루 엔딩을 하나라도 본 뒤(또는 지금 그 엔딩 화면): 코하루 두 결말이 함께 보여 분모 6', () => {
    expect(ids(titleEndings(endings, ['koharu']))).toEqual([...BASE4, ...KOHARU2]);
    expect(ids(titleEndings(endings, ['koharu_daily']))).toEqual([...BASE4, ...KOHARU2]);
    // 기록 전(지금 그 엔딩 화면)
    const now = endingMedals(endings, [], 'koharu');
    expect([now.got, now.total]).toEqual([1, 6]);
    expect(now.medals[2].endings.map((x) => [x.ending.id, x.reached])).toEqual([
      ['koharu', true],
      ['koharu_daily', false],
    ]);
    expect(endingMedals(endings, ['koharu', 'tenko'], 'tenko').total).toBe(6);
  });

  it('네 사람 엔딩도 같은 규칙: 코하루·네 사람을 다 본 뒤 8, 네 사람만 봤으면 6(코하루 결말은 그 루트 엔딩을 본 뒤에만)', () => {
    expect(ids(titleEndings(endings, ['koharu', 'group_festival']))).toEqual([...BASE4, ...KOHARU2, ...GROUP2]);
    expect(endingMedals(endings, ['koharu', 'group_festival'], 'group_festival').total).toBe(8);
    expect(ids(titleEndings(endings, ['group_daily']))).toEqual([...BASE4, ...GROUP2]);
    expect(endingMedals(endings, [], 'group_daily').total).toBe(6);
    const all = endingMedals(endings, Object.keys(STORY.endings) as EndingId[], 'group_daily');
    expect([all.got, all.total]).toEqual([8, 8]);
    expect(all.medals.map((m) => [m.route, m.endings.length, m.reached])).toEqual([
      ['osana', 2, true],
      ['tenko', 2, true],
      ['koharu', 2, true],
      ['group', 2, true],
    ]);
    // 지금 엔딩이 아닌 네 사람 엔딩을 기록 없이 보지는 않는다(타이틀)
    expect(hiddenTrace(titleEndings(endings, ['osana', 'tenko', 'osana_daily', 'tenko_daily']))).toEqual([]);
  });

  it('순서는 루트(아카네 → 히나 → 코하루 → 네 사람) → 축제 → 일상, 모르는 루트의 엔딩은 숨긴다', () => {
    const shuffled = [...endings].reverse();
    expect(ids(visibleEndings(shuffled, Object.keys(STORY.endings) as EndingId[]))).toEqual([...BASE4, ...KOHARU2, ...GROUP2]);
    const bogus = { id: 'bogus' as EndingId, route: 'nobody' as RouteId, kind: 'festival', title: 'x' } as EndingDef;
    expect(ids(visibleEndings([...endings, bogus], ['bogus' as EndingId]))).toEqual(BASE4);
  });

  it('배지 문구: 같은 루트의 두 결말이 갈래 이름으로 구별되고(8개 모두 다름), 히든 루트 이름은 「네 사람」', () => {
    const labels = endings.map((e) => endingLabel(e.route, e.kind, name));
    expect(new Set(labels).size).toBe(8);
    expect(endingLabel('osana', 'festival', name)).toBe('아카네 · 축제');
    expect(endingLabel('osana', 'daily', name)).toBe('아카네 · 일상');
    expect(endingLabel('group', 'daily', name)).toBe('네 사람 · 일상');
    expect(routeName('group', name)).toBe(GROUP_ROUTE_NAME);
    expect(ENDING_KIND_NAMES).toEqual({ festival: '축제', daily: '일상' });
    for (const l of labels) expect(l).not.toMatch(/undefined|NaN/);
  });

  it('루트 색: 네 사람은 고유 토큰(--group-1·-2)으로 세 히로인 색과 다르고, 모르는 루트는 공통 색(TypeError 없음)', () => {
    expect(ROUTE_COLORS.group).toEqual({ c1: 'var(--group-1)', c2: 'var(--group-2)' });
    for (const h of ['osana', 'tenko', 'koharu'] as RouteId[]) expect(ROUTE_COLORS[h].c1).not.toBe(ROUTE_COLORS.group.c1);
    expect(routeColors('nobody' as RouteId)).toEqual({ c1: 'var(--npc-1)', c2: 'var(--npc-2)' });
    expect(routeColors(null)).toEqual({ c1: 'var(--npc-1)', c2: 'var(--npc-2)' });
  });

  it('앨범 총 장수: hidden CG 는 본 것만 센다(네 사람 그림 한 장을 보면 총 장수가 딱 1 늘고 「네 사람」 묶음이 생긴다)', () => {
    const before = albumModel(catalog, BASE_IDS);
    expect(before.total).toBe(14);
    for (const id of HIDDEN_IDS) {
      const m = albumModel(catalog, [...BASE_IDS, id]);
      expect(m.total, id).toBe(15);
      expect(m.order.filter((x) => x === id), id).toEqual([id]);
    }
    const g = albumModel(catalog, ['end_group_fireworks']);
    expect(g.groups.map((x) => x.route)).toEqual(['osana', 'tenko', 'group', null]);
    expect(g.groups[2].items.map((i) => [i.id, i.seen])).toEqual([['end_group_fireworks', true]]);
    // 기존 기록(엔딩 3개·CG 17장)은 이름이 그대로라 그대로 열린다
    const old = ['rain_osana', 'kh_meet', 'kh_draw', 'kh_relay', 'kh_confession', 'kh_home', 'kh_date', 'polaroid_tenko'];
    expect(albumModel(catalog, old, reachedHeroines(endings, ['osana', 'tenko', 'koharu'])).seen).toBe(old.length);
  });
});
