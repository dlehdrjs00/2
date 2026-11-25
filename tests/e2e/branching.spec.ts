/**
 * 해금 판정·후반 선택지·루트 결정(동점 처리)을 실제 화면으로 확인한다.
 * 기대값은 앱 코드가 아니라 계약 0절 규칙으로 직접 계산해 표에 적었다(아래 각 줄의 주석).
 *  - 초반 c3·c4·c6 개인 +2, c7 개인 +3, c(함께)는 osana +1·tenko +1
 *  - c7 반응 뒤 종이 울린 직후 |osana − tenko| ≤ 1 이면 kh.met = true, koharu = 평균(0.5 단위 그대로), 아니면 kh.met = false
 *  - 후반 c8·c9·c10: a/b/k 개인 +3, k 는 해금 시만, c(함께 +1·+1)는 미해금 시만 → 화면에는 늘 3개
 *  - c10 마지막 독백(c10.j10) 뒤 결정: 최고점 단독이면 그 인물, 동점이면 선택을 뒤에서부터 훑어
 *    '함께'와 공동 최고점이 아닌 인물은 건너뛰고 처음 만나는 공동 최고점 인물. 미해금이면 코하루는 후보가 아니다
 * 표가 규칙과 어긋나지 않았는지는 같은 규칙을 다시 쓴 계산(ruleOutcome)으로 따로 대조한다.
 * 미해금 플레이에서는 코하루 전용 그림(스프라이트·kh_* 배경·CG)을 한 장도 받지 않아야 한다(계약 4절 미리 불러오기).
 */
import { expect, test } from '@playwright/test';
import {
  COMMON_CHOICES,
  ROUTE_FIRST_STEP,
  advanceToRoute,
  advanceToStop,
  boot,
  newGame,
  pick,
  readAutoState,
  visibleChoiceIds,
} from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '분기 규칙은 데스크톱에서만 확인');
});

type Hero = 'osana' | 'tenko' | 'koharu';

/** 코하루 전용 그림 주소(스프라이트, 전용 배경 kh_*, CG kh_*와 그 썸네일) */
const KOHARU_ASSET = /\/assets\/(?:char\/koharu\/|bg\/(?:thumb\/)?kh_|cg\/(?:thumb\/)?kh_)/;
type Pts = { osana: number; tenko: number; koharu: number };
interface Case {
  picks: string;
  met: boolean;
  /** c7 반응 뒤 해금 판정을 마친 점수(= c8.ch 에서의 점수) */
  early: Pts;
  final: Pts;
  route: Hero;
  why: string;
}

const CASES: Case[] = [
  {
    // 초반 a,b,a,b: osana 2+2=4, tenko 2+3=5 → 차 1 해금, koharu (4+5)/2=4.5
    // 후반 k,k,a: osana 7, tenko 5, koharu 10.5 → 코하루 단독 최고
    picks: 'ababkka',
    met: true,
    early: { osana: 4, tenko: 5, koharu: 4.5 },
    final: { osana: 7, tenko: 5, koharu: 10.5 },
    route: 'koharu',
    why: '차 1 경계 해금, 0.5 점수 보존, 코하루 단독 최고',
  },
  {
    // 초반 함께 4회: 4/4 → 해금(koharu 4). 후반 a,b,k → 7/7/7 세 사람 동점 → 가장 최근 개인 선택 k
    picks: 'ccccabk',
    met: true,
    early: { osana: 4, tenko: 4, koharu: 4 },
    final: { osana: 7, tenko: 7, koharu: 7 },
    route: 'koharu',
    why: '세 사람 동점 → 마지막 선택(코하루)',
  },
  {
    // 초반 a,b,c,c: osana 2+1+1=4, tenko 2+1+1=4 → 해금(koharu 4). 후반 b,k,a → 7/7/7 동점 → 마지막 a
    picks: 'abccbka',
    met: true,
    early: { osana: 4, tenko: 4, koharu: 4 },
    final: { osana: 7, tenko: 7, koharu: 7 },
    route: 'osana',
    why: '세 사람 동점 → 마지막 선택(아카네)',
  },
  {
    // 초반 a,b,b,a: osana 2+3=5, tenko 2+2=4 → 해금(koharu 4.5). 후반 b,b,b → tenko 13 단독
    picks: 'abbabbb',
    met: true,
    early: { osana: 5, tenko: 4, koharu: 4.5 },
    final: { osana: 5, tenko: 13, koharu: 4.5 },
    route: 'tenko',
    why: '해금했어도 히나 단독 최고면 히나',
  },
  {
    // 초반 a,a,a,b: osana 6, tenko 3 → 차 3 미해금(koharu 0). 후반 b,c,c → osana 6+1+1=8, tenko 3+3+1+1=8 동점
    // 뒤에서부터: c10 함께·c9 함께는 건너뛰고 c8 b → tenko (계약 손 확인 경계)
    picks: 'aaabbcc',
    met: false,
    early: { osana: 6, tenko: 3, koharu: 0 },
    final: { osana: 8, tenko: 8, koharu: 0 },
    route: 'tenko',
    why: '미해금 두 사람 동점, 함께는 건너뜀',
  },
  {
    // 초반 c,c,c,a: 함께 3회 3/3 + c7 a(+3) → 6/3, 차 3 미해금('함께' 횟수는 조건이 아님)
    // 후반 c,c,b → osana 8, tenko 8 동점 → 마지막 c10 b → tenko
    picks: 'cccaccb',
    met: false,
    early: { osana: 6, tenko: 3, koharu: 0 },
    final: { osana: 8, tenko: 8, koharu: 0 },
    route: 'tenko',
    why: '함께 3회여도 미해금, 후반 함께 선택',
  },
  {
    // 초반 b,b,b,a: tenko 6, osana 3 → 미해금. 후반 a,c,c → osana 3+3+1+1=8, tenko 6+1+1=8 동점 → c8 a → osana
    picks: 'bbbaacc',
    met: false,
    early: { osana: 3, tenko: 6, koharu: 0 },
    final: { osana: 8, tenko: 8, koharu: 0 },
    route: 'osana',
    why: '미해금 동점(대칭) → 아카네',
  },
];

/** 계약 0절 규칙을 그대로 다시 쓴 계산(표 검증용. 앱 코드를 쓰지 않는다) */
function ruleOutcome(picks: string): { met: boolean; early: Pts; final: Pts; route: Hero } {
  const who: Record<string, Hero> = { a: 'osana', b: 'tenko', k: 'koharu' };
  const p: Pts = { osana: 0, tenko: 0, koharu: 0 };
  const hist: Array<Hero | null> = [];
  let met = false;
  let early: Pts = { ...p };
  for (const [i, o] of [...picks].entries()) {
    if (i === 4) {
      // c7 반응 뒤 해금 판정(후반 첫 선택 전)
      met = Math.abs(p.osana - p.tenko) <= 1;
      if (met) p.koharu = (p.osana + p.tenko) / 2;
      early = { ...p };
    }
    if (o === 'c') {
      if (i >= 4 && met) throw new Error(`${picks}: 해금 시 후반 c 는 보이지 않음`);
      p.osana += 1;
      p.tenko += 1;
      hist.push(null);
    } else {
      if (o === 'k' && (i < 4 || !met)) throw new Error(`${picks}: k 는 해금 시 후반에만`);
      p[who[o]] += i < 3 ? 2 : 3;
      hist.push(who[o]);
    }
  }
  const cand: Hero[] = met ? ['osana', 'tenko', 'koharu'] : ['osana', 'tenko'];
  const top = Math.max(...cand.map((h) => p[h]));
  const tops = cand.filter((h) => p[h] === top);
  const route = tops.length === 1 ? tops[0] : [...hist].reverse().find((h): h is Hero => h !== null && tops.includes(h))!;
  return { met, early, final: { ...p }, route };
}

test('표의 기대값은 계약 0절 규칙으로 다시 계산한 값과 같다', () => {
  for (const c of CASES) {
    expect(ruleOutcome(c.picks), c.picks).toEqual({ met: c.met, early: c.early, final: c.final, route: c.route });
  }
  // 계약의 손 확인 경계
  expect(ruleOutcome('ccccabk').route).toBe('koharu');
  expect(ruleOutcome('abbaabk').early).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
  expect(ruleOutcome('aaabbcc')).toMatchObject({ met: false, final: { osana: 8, tenko: 8 }, route: 'tenko' });
});

for (const c of CASES) {
  test(`선택 ${c.picks} → ${c.met ? '해금' : '미해금'}, ${c.route} 루트 (${c.why})`, async ({ page }) => {
    test.setTimeout(240_000);
    const khRequests: string[] = [];
    page.on('request', (r) => {
      if (KOHARU_ASSET.test(r.url())) khRequests.push(r.url());
    });
    await boot(page);
    await newGame(page);
    const seen: string[] = [];
    const onSay = async (i: { step: string | null }) => void seen.push(i.step!);
    for (const [n, choiceId] of COMMON_CHOICES.entries()) {
      const i = await advanceToStop(page, onSay);
      expect(i.frame).toBe('choice');
      expect(i.step).toBe(choiceId);
      expect(i.route).toBeNull();
      // 화면에는 늘 3개: 초반 a,b,c / 후반 해금 a,b,k · 미해금 a,b,c
      const ids = await visibleChoiceIds(page);
      expect(ids, `${choiceId} 옵션`).toEqual(n < 4 || !c.met ? ['a', 'b', 'c'] : ['a', 'b', 'k']);
      if (n === 3) {
        // c6 갈림길 뒤 연결 줄: a 는 c6.j20(우산 돌려줄게), b 는 c6.j25, 함께(c)는 c6.c70 만. c 가 a 쪽 줄로 새지 않는다
        const tail = { a: 'c6.j20', b: 'c6.j25', c: 'c6.c70' } as Record<string, string>;
        for (const [o, id] of Object.entries(tail)) expect(seen.includes(id), `c6 ${c.picks[2]} 선택 뒤 ${id}`).toBe(o === c.picks[2]);
      }
      if (n === 4) {
        // c8.ch: 해금 판정 결과와 그 경로(복도 첫 만남·토요일 오전 추첨은 해금 시에만)
        expect(i.points, '해금 판정 뒤 점수').toEqual(c.early);
        await expect.poll(async () => (await readAutoState(page))?.stepId).toBe('c8.ch');
        expect((await readAutoState(page))!.flags['kh.met'], 'kh.met').toBe(c.met);
        const meet = seen.filter((s) => s.startsWith('c7.m'));
        const raffle = seen.filter((s) => s.startsWith('c8r.'));
        if (c.met) {
          expect(meet, '복도 첫 만남').toContain('c7.m20');
          expect(raffle.length, '토요일 오전 추첨').toBeGreaterThan(0);
          // 첫 만남은 종(c7.join) 뒤, 노을길(c7.j20) 앞
          expect(seen.indexOf('c7.m10')).toBeLessThan(seen.indexOf('c7.j20'));
        } else {
          expect(meet, '미해금인데 복도 첫 만남').toEqual([]);
          expect(raffle, '미해금인데 토요일 오전 추첨').toEqual([]);
        }
        expect(seen).toContain('c7.j40');
      }
      await pick(page, c.picks[n]);
    }
    // 마지막 공통 선택(c10) 반응과 독백을 지나 루트가 확정된다
    const { lastCommon, first } = await advanceToRoute(page);
    expect(lastCommon, '루트 결정 직전 대사').toBe('c10.j10');
    expect(first.route).toBe(c.route);
    expect(first.points).toEqual(c.final);
    // 결과 안내 없이 해당 루트 첫 장면(o1_shop / t1_cats / k1)으로
    expect(first.step!.startsWith(ROUTE_FIRST_STEP[c.route]), first.step!).toBe(true);
    // 판정 결과(kh.met)는 루트에 들어가도 그대로 남는다(다시 판정하지 않음)
    await expect.poll(async () => (await readAutoState(page))?.stepId).toBe(first.step);
    expect((await readAutoState(page))!.flags['kh.met']).toBe(c.met);
    // 미해금: 타이틀·공통·루트 첫 장면까지 코하루 그림 요청이 없다(해금이면 복도에서 이미 그렸다)
    if (c.met) expect(khRequests.length, '해금 플레이의 코하루 그림 요청').toBeGreaterThan(0);
    else expect(khRequests, '미해금 플레이에서 받은 코하루 그림').toEqual([]);
  });
}
