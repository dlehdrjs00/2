/**
 * 히든 히로인 '등장 공개' 판정(계약 4절). 화면(타이틀·추억 앨범·엔딩)은 이 함수들로만 고른다.
 *
 * - 기본 히로인(BASE_HEROINES)은 늘 공개.
 * - 히든 히로인(HIDDEN_HEROINES)은 전역 기록에 그 히로인 엔딩 도달, 또는 그 히로인 루트(route)의 hidden CG 를 하나라도
 *   관람한 기록이 있을 때 공개된다. 공개는 '전역 기록' 기준이다(이번 플레이의 해금 여부 kh.met 와 별개).
 * - hidden CG 는 관람한 것만 앨범 칸·총 장수·썸네일·제목·묶음에 들어간다(관람 전에는 빈칸도 없음).
 * - 타이틀 엔딩 배지·엔딩 화면 메달: 히든 히로인 것은 그 엔딩에 도달했거나(메달은) 지금 그 엔딩일 때만.
 */
import type { EndingId, HeroineId } from '../engine/types';
import { BASE_HEROINES, HEROINES, HIDDEN_HEROINES } from '../engine/types';

/** 추억 앨범 목록 한 칸의 공개 판정에 필요한 값 */
export interface CatalogEntry {
  id: string;
  /** 어느 히로인 루트의 장면인지(공통이면 null) */
  route: HeroineId | null;
  /** 관람 전에는 앨범·타이틀·총 장수 어디에도 보이지 않는 CG(히든 히로인 그림) */
  hidden?: boolean;
}

export interface EndingLike {
  id: EndingId;
  heroine: HeroineId;
}

export function isHiddenHeroine(h: HeroineId): boolean {
  return HIDDEN_HEROINES.includes(h);
}

/** hidden 이 아니거나 이미 본 CG 만(목록 순서 유지) */
export function visibleCatalog<T extends CatalogEntry>(catalog: readonly T[], seen: Iterable<string>): T[] {
  const have = seen instanceof Set ? (seen as Set<string>) : new Set(seen);
  return catalog.filter((c) => !c.hidden || have.has(c.id));
}

/** 도달한 엔딩의 히로인(story.endings 기준. 모르는 엔딩 id 는 건너뛴다) */
export function reachedHeroines(endings: readonly EndingLike[], reached: Iterable<EndingId>): HeroineId[] {
  const got = new Set(reached);
  return HEROINES.filter((h) => endings.some((e) => e.heroine === h && got.has(e.id)));
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

/** 타이틀 엔딩 배지: 기본 히로인 엔딩은 늘, 히든 히로인 엔딩은 도달한 것만(순서 유지) */
export function titleEndings<T extends EndingLike>(endings: readonly T[], reached: Iterable<EndingId>): T[] {
  const got = new Set(reached);
  return endings.filter((e) => !isHiddenHeroine(e.heroine) || got.has(e.id));
}

/** 엔딩 화면 메달: 기본 히로인 + 엔딩에 도달했거나 지금 그 엔딩인 히든 히로인(HEROINES 순서) */
export function medalHeroines(endings: readonly EndingLike[], reached: Iterable<EndingId>, current: HeroineId | null): HeroineId[] {
  const done = new Set(reachedHeroines(endings, reached));
  return HEROINES.filter((h) => BASE_HEROINES.includes(h) || done.has(h) || h === current);
}
