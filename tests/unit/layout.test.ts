import { describe, expect, it } from 'vitest';
import { computeLayout, MIN_FONT } from '../../src/ui/layout';

const none = { t: 0, r: 0, b: 0, l: 0 };
const notch = { t: 0, r: 47, b: 21, l: 47 }; // 아이폰 가로(노치) 대략값

const cases: Array<[string, number, number, typeof none]> = [
  ['PC 1920x1080', 1920, 1080, none],
  ['PC 1366x768', 1366, 768, none],
  ['울트라와이드 2560x1080', 2560, 1080, none],
  ['4:3 태블릿 가로 1024x768', 1024, 768, none],
  ['아이폰 SE 가로 667x375', 667, 375, none],
  ['아이폰 13 가로(노치) 844x390', 844, 390, notch],
  ['안드로이드 가로(브라우저 UI 포함) 800x340', 800, 340, none],
  ['세로 390x844', 390, 844, none],
];

describe('화면 배치', () => {
  it.each(cases)('%s: 무대·대사창·버튼이 화면/안전 영역 안에 있고 글자가 최소 크기 이상', (_n, vw, vh, safe) => {
    const L = computeLayout(vw, vh, safe);
    expect(L.fs).toBeGreaterThanOrEqual(MIN_FONT);
    // 무대 16:9
    expect(Math.abs(L.sw / L.sh - 16 / 9)).toBeLessThan(0.01);
    // 안전 영역 안
    expect(L.sx).toBeGreaterThanOrEqual(safe.l - 0.5);
    expect(L.sx + L.sw).toBeLessThanOrEqual(vw - safe.r + 0.5);
    expect(L.sy).toBeGreaterThanOrEqual(safe.t - 0.5);
    expect(L.sy + L.sh).toBeLessThanOrEqual(vh - safe.b + 0.5);
    // 대사창
    expect(L.tx).toBeGreaterThanOrEqual(safe.l - 0.5);
    expect(L.tx + L.tw).toBeLessThanOrEqual(vw - safe.r + 0.5);
    expect(L.ty + L.th).toBeLessThanOrEqual(vh - safe.b + 0.5);
    // 대사창에 3줄 이상 들어감 (패딩 ≈1.55em + 줄 1.62em×3)
    expect(L.th).toBeGreaterThanOrEqual(L.fs * (1.55 + 1.62 * 3) - 0.5);
    // 선택지 영역에 터치 버튼 2개(48px)가 들어감
    expect(L.ch).toBeGreaterThanOrEqual(48 * 2 + 12);
    // 버튼 터치 영역
    expect(L.btn).toBeGreaterThanOrEqual(40);
  });

  it('가로 화면은 overlay, 세로 화면은 대사창을 무대 아래에 둔다', () => {
    expect(computeLayout(844, 390, none).mode).toBe('overlay');
    expect(computeLayout(390, 844, none).mode).toBe('below');
  });
});
