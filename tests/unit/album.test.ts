/**
 * 추억 앨범 목록 모델: 루트별 묶음·순서·모은 수·감상 순서(끝에서 처음으로) + 히든 히로인·히든 루트 공개 규칙(reveal.ts)
 * + 엔딩 화면 폴라로이드 캡션(dates.ts: 그 그림이 뜬 장면의 날짜·장소)
 */
import { describe, expect, it } from 'vitest';
import { albumModel, groupLabel, wrapIndex, type AlbumEntry } from '../../src/ui/screens/album';
import { endingMedals, reachedHeroines, revealedHeroines, titleEndings, visibleCatalog, visibleEndings, visibleRoutes } from '../../src/ui/reveal';
import { ENDING_KIND_NAMES, GROUP_ROUTE_NAME, ROUTE_COLORS, endingLabel, routeColors, routeName, splitDate } from '../../src/ui/screens/common';
import { captionText, cgSceneDate, dateAt, endingDate, placePart, scenePreds } from '../../src/ui/dates';
import { cg as cgStep, ending, jump, mono, place, scene as sceneDef } from '../../src/engine/dsl';
import { resolveText } from '../../src/engine/text';
import { TEXT_VARS } from '../../src/story/config';
import { CG_ORDER, CGS, ENDING_CG, KOHARU_DRAWN_CGS } from '../../src/story/cg';
import { STORY } from '../../src/story';
import type { EndingDef, EndingId, HeroineId, RouteId, Story } from '../../src/engine/types';

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

  it('타이틀 엔딩 배지: 아카네·히나의 두 갈래는 늘, 코하루·네 사람은 그 루트의 엔딩에 하나라도 도달한 뒤에만(네 사람을 봤으면 코하루도)', () => {
    expect(titleEndings(endings, []).map((e) => e.id)).toEqual(['osana', 'osana_daily', 'tenko', 'tenko_daily']);
    expect(titleEndings(endings, ['osana', 'tenko']).map((e) => e.id)).toEqual(['osana', 'osana_daily', 'tenko', 'tenko_daily']);
    expect(titleEndings(endings, ['koharu']).map((e) => e.id)).toEqual(['osana', 'osana_daily', 'tenko', 'tenko_daily', 'koharu', 'koharu_daily']);
    // 네 사람 엔딩만 본 플레이어는 코하루를 이미 안다: 코하루 두 결말도 잠긴 배지로(팀장 결정)
    expect(titleEndings(endings, ['group_daily']).map((e) => e.id)).toEqual([
      'osana',
      'osana_daily',
      'tenko',
      'tenko_daily',
      'koharu',
      'koharu_daily',
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
    // 네 사람 엔딩을 처음 보는 순간: 코하루 엔딩을 본 적 없어도 코하루 메달(잠김)과 네 사람 메달이 함께 더해진다
    expect(routes(endingMedals(endings, [], 'group_daily'))).toEqual(['osana', 'tenko', 'koharu', 'group']);
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

  it('네 사람 엔딩을 하나라도 본 뒤(또는 지금 그 엔딩 화면): 코하루 엔딩을 못 봤어도 코하루 두 결말까지 보여 분모 8', () => {
    expect(ids(titleEndings(endings, ['koharu', 'group_festival']))).toEqual([...BASE4, ...KOHARU2, ...GROUP2]);
    expect(endingMedals(endings, ['koharu', 'group_festival'], 'group_festival').total).toBe(8);
    // 네 사람만 본 플레이어(팀장 결정: 이미 코하루를 아는 플레이어)
    expect(ids(titleEndings(endings, ['group_daily']))).toEqual([...BASE4, ...KOHARU2, ...GROUP2]);
    expect(visibleRoutes(endings, ['group_festival'])).toEqual(['osana', 'tenko', 'koharu', 'group']);
    expect(visibleRoutes(endings, [], 'group_daily')).toEqual(['osana', 'tenko', 'koharu', 'group']);
    const first = endingMedals(endings, [], 'group_daily');
    expect([first.got, first.total]).toEqual([1, 8]);
    expect(first.medals.map((m) => [m.route, m.reached, m.endings.map((x) => x.reached)])).toEqual([
      ['osana', false, [false, false]],
      ['tenko', false, [false, false]],
      ['koharu', false, [false, false]],
      ['group', true, [false, true]],
    ]);
    // 아카네 엔딩 화면이어도 기록에 네 사람 엔딩이 있으면 8
    expect(endingMedals(endings, ['group_festival'], 'osana').total).toBe(8);
    // 코하루 엔딩만 본 플레이어에게는 네 사람이 드러나지 않는다(6)
    expect(hiddenTrace(titleEndings(endings, ['koharu'])).filter((e) => e.route === 'group')).toEqual([]);
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
    // 897ae1f 의 기존 기록(엔딩 osana·tenko·koharu, 옛 CG id)은 이름이 그대로라 그대로 열린다
    const old = ['rain_osana', 'kh_meet', 'kh_draw', 'kh_relay', 'kh_confession', 'kh_home', 'kh_date', 'polaroid_tenko'];
    expect(albumModel(catalog, old, reachedHeroines(endings, ['osana', 'tenko', 'koharu'])).seen).toBe(old.length);
  });
});

describe('엔딩 화면 캡션: 폴라로이드 그림이 뜬 장면의 날짜·장소(dates.ts)', () => {
  const t = (x: string) => resolveText(x, TEXT_VARS);
  const preds = scenePreds(STORY);
  const name = (h: HeroineId) => ({ osana: '아카네', tenko: '히나', koharu: '코하루' })[h];
  /** 엔딩 화면이 뜨는 위치(엔딩 스텝) */
  const endAt = (id: EndingId) => {
    for (const sc of Object.values(STORY.scenes)) for (const st of sc.steps) if (st.t === 'ending' && st.ending === id) return { sceneId: sc.id, stepId: st.id, log: [] };
    throw new Error(`엔딩 스텝 없음: ${id}`);
  };
  const caption = (id: EndingId) => captionText(endingDate(STORY, ENDING_CG[id], endAt(id), t, preds), routeName(STORY.endings[id].route, name));

  it('엔딩 8개 캡션(실제 대본으로 계산): 폴라로이드 그림과 같은 날·같은 곳, 모두 「날짜, 장소」 형식', () => {
    expect(Object.fromEntries(endings.map((e) => [e.id, caption(e.id)]))).toEqual({
      osana: '8월 8일, 아사히 강 여름 축제',
      osana_daily: '7월 20일, 언덕 아래 자판기 앞',
      tenko: '8월 8일, 아사히 강 여름 축제',
      tenko_daily: '7월 24일, 학교 뒷길',
      koharu: '8월 9일, 문구점 앞',
      koharu_daily: '7월 23일, 1학년 교실',
      group_festival: '8월 8일, 강변 둑',
      group_daily: '9월 1일, 집 앞 담장 모퉁이',
    });
    for (const e of endings) expect(caption(e.id), e.id).not.toMatch(/undefined|NaN|null|\{/);
  });

  it('그림이 뜬 장면에 날짜가 없으면(아카네·히나 축제 결말: 같은 밤 귀갓길) 엔딩 위치 기준(dateAt)으로 되돌아간다', () => {
    for (const id of ['osana', 'tenko'] as EndingId[]) {
      expect(cgSceneDate(STORY, ENDING_CG[id], endAt(id), t, preds), id).toBeNull();
      expect(endingDate(STORY, ENDING_CG[id], endAt(id), t, preds), id).toEqual(dateAt(STORY, endAt(id), t, preds));
    }
    for (const id of ['osana_daily', 'tenko_daily', 'koharu', 'koharu_daily', 'group_festival', 'group_daily'] as EndingId[]) {
      expect(cgSceneDate(STORY, ENDING_CG[id], endAt(id), t, preds), id).not.toBeNull();
    }
  });

  it('규칙(작은 대본): 그림 장면에서 거꾸로 — 장소는 가장 가까운 장소 표시(날짜 없어도), 날짜는 가장 가까운 날짜. 그림이 다른 장면이면 들어오는 장면까지', () => {
    const story: Story = {
      version: 't',
      start: 'a',
      scenes: {
        a: sceneDef({ id: 'a', title: 'a', route: 'osana', part: 'epilogue' }, [
          place('7월 20일 월요일 점심 · 교실'),
          mono('a.1', '1'),
          place('하굣길 · 언덕 아래 자판기 앞'),
          cgStep('end_akane_walk'),
          mono('a.2', '2'),
          jump('b'),
        ]),
        b: sceneDef({ id: 'b', title: 'b', route: 'osana', part: 'epilogue' }, [
          place('7월 21일 화요일 · 방과 후, 신발장'),
          mono('b.1', '1'),
          place('강변 둑'),
          mono('b.2', '2'),
          ending('b.end', 'osana_daily'),
        ]),
      },
      endings: STORY.endings,
    };
    const at = { sceneId: 'b', stepId: 'b.end', log: [] };
    const p = scenePreds(story);
    const id = (x: string) => x;
    // 엔딩 위치 기준이면 날짜 있는 b 의 첫 장소 표시(그림과 다른 날·다른 곳)
    expect(dateAt(story, at, id, p)).toEqual({ md: '7월 21일', place: '방과 후, 신발장' });
    // 그림 기준: a 의 자판기 앞(날짜 없는 장소 표시의 장소 부분) + a 의 7월 20일
    expect(cgSceneDate(story, 'end_akane_walk', at, id, p)).toEqual({ md: '7월 20일', place: '언덕 아래 자판기 앞' });
    expect(captionText(endingDate(story, 'end_akane_walk', at, id, p), '아카네')).toBe('7월 20일, 언덕 아래 자판기 앞');
    // 그 그림이 이 길에 없으면 엔딩 위치 기준
    expect(endingDate(story, 'end_hina_walk', at, id, p)).toEqual({ md: '7월 21일', place: '방과 후, 신발장' });
    expect(endingDate(story, null, at, id, p)).toEqual({ md: '7월 21일', place: '방과 후, 신발장' });
    // 날짜를 끝내 못 찾으면 '루트와 함께'
    expect(captionText(null, '네 사람')).toBe('네 사람과 함께');
    expect(captionText(null, '아카네')).toBe('아카네와 함께');
    expect(captionText({ md: '8월 8일', place: '' }, '히나')).toBe('8월 8일');
    // 장소 부분
    expect(placePart('하굣길 · 언덕 아래 자판기 앞')).toBe('언덕 아래 자판기 앞');
    expect(placePart('학교 뒷길')).toBe('학교 뒷길');
    expect(placePart('7월 23일 목요일 점심 · 1학년 교실')).toBe('1학년 교실');
  });

  it('splitDate: 요일 뒤에 때(점심·밤·아침·오전)가 붙어도 장소를 잡고, 예전 규칙이 장소를 잡던 문구는 결과가 같다', () => {
    expect(splitDate('7월 23일 목요일 점심 · 1학년 교실')).toEqual({ md: '7월 23일', place: '1학년 교실' });
    expect(splitDate('8월 8일 토요일 밤 · 강변 둑')).toEqual({ md: '8월 8일', place: '강변 둑' });
    expect(splitDate('9월 1일 화요일 아침 · 집 앞 담장 모퉁이')).toEqual({ md: '9월 1일', place: '집 앞 담장 모퉁이' });
    expect(splitDate('7월 24일 금요일 · 종업식 날, 교실')).toEqual({ md: '7월 24일', place: '종업식 날, 교실' });
    expect(splitDate('몇 주 뒤, 여름방학 · 8월 8일 토요일 · 아사히 강 여름 축제')).toEqual({ md: '8월 8일', place: '아사히 강 여름 축제' });
    expect(splitDate('7월 10일')).toEqual({ md: '7월 10일', place: '' });
    expect(splitDate('같은 밤 · 역 앞으로 가는 길')).toBeNull();
    // 대본의 모든 장소 표시·날짜 카드: 날짜는 늘 같고, 예전 규칙이 잡던 장소는 그대로(예전엔 비던 장소만 새로 잡힌다)
    const OLD = /(\d{1,2}월 \d{1,2}일)(?: [월화수목금토일]요일)?(?:\s*·\s*([^·]+))?/;
    let kept = 0;
    let filled = 0;
    for (const sc of Object.values(STORY.scenes)) {
      for (const st of sc.steps) {
        if (st.t !== 'place' && st.t !== 'card') continue;
        const text = st.t === 'card' ? `${t(st.text)}${st.sub ? ` · ${t(st.sub)}` : ''}` : t(st.text);
        const o = OLD.exec(text);
        const n = splitDate(text);
        expect(n?.md ?? null, text).toBe(o?.[1] ?? null);
        const oldPlace = (o?.[2] ?? '').trim();
        if (oldPlace) {
          expect(n?.place, text).toBe(oldPlace);
          kept++;
        } else if (n?.place) filled++;
      }
    }
    expect(kept).toBeGreaterThanOrEqual(10);
    expect(filled).toBeGreaterThanOrEqual(10);
  });
});
