/** 추억 앨범 목록 모델: 루트별 묶음·순서·모은 수·감상 순서(끝에서 처음으로) */
import { describe, expect, it } from 'vitest';
import { albumModel, wrapIndex, type AlbumEntry } from '../../src/ui/screens/album';
import { CG_ORDER, CGS } from '../../src/story/cg';

const catalog: AlbumEntry[] = CG_ORDER.map((id) => ({ id, title: CGS[id].title, route: CGS[id].route }));

describe('추억 앨범 모델', () => {
  it('처음엔 0 / 11, 히로인 순서(아카네 → 히나)로 묶이고 묶음 안은 CG_ORDER 순서다', () => {
    const m = albumModel(catalog, []);
    expect(m.total).toBe(11);
    expect(m.seen).toBe(0);
    expect(m.order).toEqual([]);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko']);
    expect(m.groups[0].items.map((i) => i.id)).toEqual(CG_ORDER.filter((id) => CGS[id].route === 'osana'));
    expect(m.groups[1].items.map((i) => i.id)).toEqual(CG_ORDER.filter((id) => CGS[id].route === 'tenko'));
    // 소나기 CG 는 각 히로인 줄에
    expect(m.groups[0].items[0].id).toBe('rain_osana');
    expect(m.groups[1].items[0].id).toBe('rain_tenko');
    expect(m.groups.flatMap((g) => g.items).every((i) => !i.seen)).toBe(true);
  });

  it('본 CG 만 열리고, 모르는 id·중복은 세지 않으며, 감상 순서는 화면 순서(묶음 → 목록)다', () => {
    const m = albumModel(catalog, ['polaroid_tenko', 'rain_tenko', 'homeward_osana', 'renamed_xyz', 'rain_tenko']);
    expect(m.seen).toBe(3);
    expect(m.groups.map((g) => g.seen)).toEqual([1, 2]);
    expect(m.order).toEqual(['homeward_osana', 'rain_tenko', 'polaroid_tenko']);
  });

  it('루트가 없는(공통) CG 는 맨 뒤 공통 묶음으로 간다', () => {
    const m = albumModel([...catalog, { id: 'extra_common', title: '여분', route: null }], ['extra_common']);
    expect(m.groups.map((g) => g.route)).toEqual(['osana', 'tenko', null]);
    expect(m.order).toEqual(['extra_common']);
    expect(m.total).toBe(12);
  });

  it('감상 넘기기는 끝에서 처음으로, 처음에서 끝으로 돈다', () => {
    expect(wrapIndex(3, 2, 1)).toBe(0);
    expect(wrapIndex(3, 0, -1)).toBe(2);
    expect(wrapIndex(3, 1, 1)).toBe(2);
    expect(wrapIndex(1, 0, 1)).toBe(0);
    expect(wrapIndex(0, 0, 1)).toBe(0);
  });
});
