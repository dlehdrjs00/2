/**
 * 히든 히로인·히든 루트 '등장 공개' 판정(설계 계약 9절). 화면(타이틀·추억 앨범·엔딩)은 이 함수들로만 고른다.
 *
 * - 기본 히로인(BASE_HEROINES)은 늘 공개.
 * - 히든 히로인(HIDDEN_HEROINES)은 전역 기록에 그 히로인 엔딩 도달, 또는 그 히로인 루트(route)의 hidden CG 를 하나라도
 *   관람한 기록이 있을 때 공개된다. 공개는 '전역 기록' 기준이다(이번 플레이의 해금 여부 kh.met 와 별개).
 * - hidden CG 는 관람한 것만 앨범 칸·총 장수·썸네일·제목·묶음에 들어간다(관람 전에는 빈칸도 없음).
 * - 엔딩(타이틀 배지·엔딩 화면 메달·'엔딩 n / 전체'의 분모)은 루트 단위로 공개한다:
 *   아카네·히나 루트의 축제·일상 결말 4개는 처음부터 잠긴 배지로 보이고, 히든 루트(코하루·네 사람)의 두 결말은
 *   그 루트의 엔딩을 하나라도 도달했거나 지금 그 루트의 엔딩 화면일 때만 두 개가 함께 보인다.
 *   모르는 루트의 엔딩은 숨긴다(기본값으로 드러나지 않게).
 */
import type { EndingId, EndingKind, HeroineId, RouteId } from '../engine/types';
import { HEROINES, HIDDEN_HEROINES, ROUTES, isRouteId } from '../engine/types';

/** 추억 앨범 목록 한 칸의 공개 판정에 필요한 값 */
export interface CatalogEntry {
  id: string;
  /** 어느 루트의 장면인지(공통이면 null, 히든 루트는 'group') */
  route: RouteId | null;
  /** 관람 전에는 앨범·타이틀·총 장수 어디에도 보이지 않는 CG(히든 히로인 그림) */
  hidden?: boolean;
}

export interface EndingLike {
  id: EndingId;
  /** 엔딩이 속한 루트(EndingDef.route) */
  route: RouteId;
  /** 축제 쪽 / 일상 쪽(EndingDef.kind). 있으면 같은 루트 안에서 축제 → 일상 순서로 놓는다 */
  kind?: EndingKind;
}

/** 결말 갈래 표시 순서(같은 루트 안) */
const KIND_ORDER: readonly EndingKind[] = ['festival', 'daily'];

export function isHiddenHeroine(h: HeroineId): boolean {
  return HIDDEN_HEROINES.includes(h);
}

/** 미리 드러내지 않는 루트: 히든 히로인 루트와 히든 루트('group', 네 사람) */
export function isHiddenRoute(r: RouteId): boolean {
  return r === 'group' || isHiddenHeroine(r);
}

/** hidden 이 아니거나 이미 본 CG 만(목록 순서 유지) */
export function visibleCatalog<T extends CatalogEntry>(catalog: readonly T[], seen: Iterable<string>): T[] {
  const have = seen instanceof Set ? (seen as Set<string>) : new Set(seen);
  return catalog.filter((c) => !c.hidden || have.has(c.id));
}

/** 도달한 엔딩의 히로인(story.endings 기준. 모르는 엔딩 id 는 건너뛴다. 히든 루트 'group' 엔딩은 히로인 도달이 아니다) */
export function reachedHeroines(endings: readonly EndingLike[], reached: Iterable<EndingId>): HeroineId[] {
  const got = new Set(reached);
  return HEROINES.filter((h) => endings.some((e) => e.route === h && got.has(e.id)));
}

/**
 * 등장이 공개된 히로인(HEROINES 순서). 기본 히로인 + (엔딩 도달 또는 그 루트의 hidden CG 관람) 히든 히로인.
 * reached: 엔딩에 도달한 히로인(reachedHeroines)
 */
export function revealedHeroines(catalog: readonly CatalogEntry[], seen: Iterable<string>, reached: Iterable<HeroineId> = []): HeroineId[] {
  const have = seen instanceof Set ? (seen as Set<string>) : new Set(seen);
  const done = new Set(reached);
  return HEROINES.filter(
    (h) => !isHiddenHeroine(h) || done.has(h) || catalog.some((c) => c.hidden === true && c.route === h && have.has(c.id)),
  );
}

/**
 * 엔딩 목록에 보일 루트(ROUTES 순서). 기본 히로인 루트는 늘, 히든 루트(코하루·네 사람)는 그 루트의 엔딩에 하나라도 도달했거나
 * current(지금 보고 있는 엔딩)가 그 루트일 때만. 엔딩이 하나도 없는 루트와 모르는 루트는 넣지 않는다.
 */
export function visibleRoutes(endings: readonly EndingLike[], reached: Iterable<EndingId>, current: EndingId | null = null): RouteId[] {
  const got = new Set(reached);
  const cur = current !== null ? endings.find((e) => e.id === current)?.route ?? null : null;
  return ROUTES.filter((r) => {
    const mine = endings.filter((e) => e.route === r);
    if (!mine.length) return false;
    if (!isHiddenRoute(r)) return true;
    return r === cur || mine.some((e) => got.has(e.id));
  });
}

/**
 * 보이는 엔딩(타이틀 배지·엔딩 화면 메달과 분모). 순서는 루트(ROUTES: 아카네 → 히나 → 코하루 → 네 사람) → 축제 → 일상,
 * 같은 자리면 목록 순서. route 가 RouteId 가 아닌 엔딩은 넣지 않는다.
 * 분모 예: 아무것도 안 봄 4, 코하루 엔딩을 본 뒤 6, 코하루·네 사람 엔딩을 모두 본 뒤 8(네 사람만 봤으면 6).
 */
export function visibleEndings<T extends EndingLike>(endings: readonly T[], reached: Iterable<EndingId>, current: EndingId | null = null): T[] {
  const routes = visibleRoutes(endings, reached, current);
  const rank = (e: T) => {
    const k = e.kind ? KIND_ORDER.indexOf(e.kind) : -1;
    return routes.indexOf(e.route) * (KIND_ORDER.length + 1) + (k < 0 ? KIND_ORDER.length : k);
  };
  return endings
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => isRouteId(e.route) && routes.includes(e.route))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i)
    .map(({ e }) => e);
}

/** 타이틀 엔딩 배지: 보이는 엔딩(visibleEndings, 지금 보고 있는 엔딩 없음) */
export function titleEndings<T extends EndingLike>(endings: readonly T[], reached: Iterable<EndingId>): T[] {
  return visibleEndings(endings, reached, null);
}

export interface RouteMedal<T extends EndingLike> {
  route: RouteId;
  /** 그 루트의 보이는 엔딩(축제 → 일상)과 도달 여부(지금 엔딩은 도달로 센다) */
  endings: Array<{ ending: T; reached: boolean }>;
  /** 그 루트의 엔딩을 하나라도 도달했다 */
  reached: boolean;
}

/**
 * 엔딩 화면 메달: 보이는 루트마다 하나(그 안에 결말 갈래별 도달 표시). current(지금 엔딩)는 기록 전이어도 도달로 센다.
 * got / total 은 '엔딩 n / 보이는 엔딩 수'.
 */
export function endingMedals<T extends EndingLike>(
  endings: readonly T[],
  reached: Iterable<EndingId>,
  current: EndingId | null,
): { medals: RouteMedal<T>[]; got: number; total: number } {
  const got = new Set(reached);
  if (current !== null) got.add(current);
  const shown = visibleEndings(endings, got, current);
  const medals: RouteMedal<T>[] = [];
  for (const e of shown) {
    let m = medals.find((x) => x.route === e.route);
    if (!m) {
      m = { route: e.route, endings: [], reached: false };
      medals.push(m);
    }
    const r = got.has(e.id);
    m.endings.push({ ending: e, reached: r });
    if (r) m.reached = true;
  }
  return { medals, got: shown.filter((e) => got.has(e.id)).length, total: shown.length };
}
