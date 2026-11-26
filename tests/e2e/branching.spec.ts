/**
 * 해금 판정·후반 선택지·루트 결정(동점 처리·히든 루트)을 실제 화면으로 확인한다.
 * 기대값은 앱 코드가 아니라 계약 규칙(코하루 계약 0절, 여덟 엔딩 계약 3·5절)으로 직접 계산해 표에 적었다(아래 각 줄의 주석).
 *  - 초반 c3·c4·c6 개인 +2, c7 개인 +3, c(함께)는 osana +1·tenko +1
 *  - c7 반응 뒤 종이 울린 직후 |osana − tenko| ≤ 1 이면 kh.met = true, koharu = 평균(0.5 단위 그대로), 아니면 kh.met = false
 *  - 발견(kh.met) 새 흐름: c8_raffle → e1_ice4 → e1s_sunday4 → e2_frog4 → e3_rain4, 에피소드 여섯 선택(e1f·e2f·e3f ch1·ch2)은
 *    a/b/k 이고 고른 한 사람만 +0.5. e3_rain4 끝(e3f.410 뒤)에서 판정: 세 점수가 완전히 같으면 히든 루트 group(h1),
 *    단독 최고점이면 그 인물, 두 사람만 공동 최고점이면 선택을 뒤에서부터 훑어 공동 최고점 인물 중 마지막으로 고른 사람
 *  - 미발견 흐름: e1_ice3 → c8_bakery → c9_puzzle → e2_frog3 → c10_window → e3_rain3, 옛 후반 c8·c9·c10 은 a/b 개인 +3,
 *    c(함께 +1·+1). e3_rain3 끝(e3t.670 뒤)에서 옛 규칙으로 판정(동점이면 '함께'를 건너뛰고 마지막 개인 선택). 코하루는 후보가 아니다
 * 표가 규칙과 어긋나지 않았는지는 같은 규칙을 다시 쓴 계산(ruleOutcome)으로 따로 대조한다.
 * 미해금 플레이에서는 코하루 흔적 그림(스프라이트·kh_* 배경·CG, 코하루가 그려진 새 CG·히든 루트 CG)을 한 장도 받지 않아야 하고,
 * 해금 플레이도 판정 전에는 히든 루트 전용 그림(end_group_*)을 받지 않아야 한다(여덟 엔딩 계약 9절 미리 불러오기).
 */
import { expect, test } from '@playwright/test';
import {
  EARLY_CHOICES,
  GROUP_ONLY_ART,
  HIDDEN_ART,
  LAST_COMMON_LINE,
  ROUTE_FIRST_STEP,
  advanceToRoute,
  advanceToStop,
  boot,
  commonChoices,
  newGame,
  pick,
  readAutoState,
  visibleChoiceIds,
} from './helpers';

test.beforeEach(async ({}, ti) => {
  test.skip(ti.project.name !== 'desktop', '분기 규칙은 데스크톱에서만 확인');
});

type Hero = 'osana' | 'tenko' | 'koharu';
type Route = Hero | 'group';

type Pts = { osana: number; tenko: number; koharu: number };
interface Case {
  /** 시간순 공통 선택 옵션: 초반 4 + 발견 6 / 미발견 3 */
  picks: string;
  met: boolean;
  /** c7 반응 뒤 해금 판정을 마친 점수(= 첫 후반 선택지에서의 점수) */
  early: Pts;
  final: Pts;
  route: Route;
  why: string;
}

const CASES: Case[] = [
  {
    // 초반 a,b,a,b: osana 2+2=4, tenko 2+3=5 → 차 1 해금, koharu (4+5)/2=4.5
    // 후반 k,k,a,k,k,k: osana 4.5, tenko 5, koharu 4.5+2.5=7 → 코하루 단독 최고
    picks: 'ababkkakkk',
    met: true,
    early: { osana: 4, tenko: 5, koharu: 4.5 },
    final: { osana: 4.5, tenko: 5, koharu: 7 },
    route: 'koharu',
    why: '차 1 경계 해금, 0.5 점수 보존, 코하루 단독 최고',
  },
  {
    // 초반 함께 4회: 4/4 → 해금(koharu 4). 후반 a,b,k,a,b,k → 5/5/5 세 사람 완전 동점 → 히든 루트(계약 5.1 표 1행)
    picks: 'ccccabkabk',
    met: true,
    early: { osana: 4, tenko: 4, koharu: 4 },
    final: { osana: 5, tenko: 5, koharu: 5 },
    route: 'group',
    why: '세 사람 동점 → 히든 루트(네 사람)',
  },
  {
    // 초반 a,b,b,a: osana 2+3=5, tenko 2+2=4 → 해금(koharu 4.5). 후반 b,k,b,a,k,b → 5.5/5.5/5.5 → 히든 루트(계약 5.1 표 2행)
    picks: 'abbabkbakb',
    met: true,
    early: { osana: 5, tenko: 4, koharu: 4.5 },
    final: { osana: 5.5, tenko: 5.5, koharu: 5.5 },
    route: 'group',
    why: '점수가 달리 출발해도 세 사람 동점이면 히든 루트',
  },
  {
    // 초반 a,b,c,c: osana 2+1+1=4, tenko 2+1+1=4 → 해금(koharu 4). 후반 b,a,b,a,b,a → 5.5/5.5/4 두 사람 동점 → 마지막 a
    picks: 'abccbababa',
    met: true,
    early: { osana: 4, tenko: 4, koharu: 4 },
    final: { osana: 5.5, tenko: 5.5, koharu: 4 },
    route: 'osana',
    why: '두 사람만 동점 → 마지막 선택(아카네)',
  },
  {
    // 초반 함께 4회 → 4/4/4. 후반 a,b,a,b,a,b → 5.5/5.5/4 두 사람만 동점 → 마지막 b(계약 5.1 표 4행)
    picks: 'ccccababab',
    met: true,
    early: { osana: 4, tenko: 4, koharu: 4 },
    final: { osana: 5.5, tenko: 5.5, koharu: 4 },
    route: 'tenko',
    why: '두 사람만 동점 → 마지막 선택(히나)',
  },
  {
    // 초반 a,b,b,a: 5/4 → 해금(koharu 4.5). 후반 b×6 → tenko 7 단독
    picks: 'abbabbbbbb',
    met: true,
    early: { osana: 5, tenko: 4, koharu: 4.5 },
    final: { osana: 5, tenko: 7, koharu: 4.5 },
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

/** 계약 규칙(코하루 계약 0절 + 여덟 엔딩 계약 5절)을 그대로 다시 쓴 계산(표 검증용. 앱 코드를 쓰지 않는다) */
function ruleOutcome(picks: string): { met: boolean; early: Pts; final: Pts; route: Route } {
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
      // 초반 c3·c4·c6 +2, c7 +3. 후반: 발견 흐름 에피소드 +0.5, 미발견 옛 c8·c9·c10 +3
      p[who[o]] += i < 3 ? 2 : i === 3 ? 3 : met ? 0.5 : 3;
      hist.push(who[o]);
    }
  }
  const late = picks.length - 4;
  if (late !== (met ? 6 : 3)) throw new Error(`${picks}: 후반 선택 수 ${late}(발견 6 / 미발견 3)`);
  const cand: Hero[] = met ? ['osana', 'tenko', 'koharu'] : ['osana', 'tenko'];
  const top = Math.max(...cand.map((h) => p[h]));
  const tops = cand.filter((h) => p[h] === top);
  // 발견 흐름에서 세 사람이 완전히 같으면 히든 루트(group)
  const route: Route =
    met && tops.length === 3 ? 'group' : tops.length === 1 ? tops[0] : [...hist].reverse().find((h): h is Hero => h !== null && tops.includes(h))!;
  return { met, early, final: { ...p }, route };
}

test('표의 기대값은 계약 규칙으로 다시 계산한 값과 같다', () => {
  for (const c of CASES) {
    expect(ruleOutcome(c.picks), c.picks).toEqual({ met: c.met, early: c.early, final: c.final, route: c.route });
  }
  // 여덟 엔딩 계약 5.1 표 다섯 행
  expect(ruleOutcome('ccccabkabk')).toMatchObject({ final: { osana: 5, tenko: 5, koharu: 5 }, route: 'group' });
  expect(ruleOutcome('abbabkbakb')).toMatchObject({ final: { osana: 5.5, tenko: 5.5, koharu: 5.5 }, route: 'group' });
  expect(ruleOutcome('ababakabka')).toMatchObject({ early: { osana: 4, tenko: 5, koharu: 4.5 }, final: { osana: 5.5, tenko: 5.5, koharu: 5.5 }, route: 'group' });
  expect(ruleOutcome('ccccababab')).toMatchObject({ final: { osana: 5.5, tenko: 5.5, koharu: 4 }, route: 'tenko' });
  expect(ruleOutcome('ccccaaaaaa')).toMatchObject({ final: { osana: 7, tenko: 4, koharu: 4 }, route: 'osana' });
  // 코하루 계약의 손 확인 경계(미발견 옛 규칙은 그대로)
  expect(ruleOutcome('abbaabkkkk').early).toEqual({ osana: 5, tenko: 4, koharu: 4.5 });
  expect(ruleOutcome('aaabbcc')).toMatchObject({ met: false, final: { osana: 8, tenko: 8 }, route: 'tenko' });
});

for (const c of CASES) {
  test(`선택 ${c.picks} → ${c.met ? '해금' : '미해금'}, ${c.route} 루트 (${c.why})`, async ({ page }) => {
    test.setTimeout(300_000);
    const khRequests: string[] = [];
    const groupRequests: string[] = [];
    page.on('request', (r) => {
      if (HIDDEN_ART.test(r.url())) khRequests.push(r.url());
      if (GROUP_ONLY_ART.test(r.url())) groupRequests.push(r.url());
    });
    await boot(page);
    await newGame(page);
    const seen: string[] = [];
    const onSay = async (i: { step: string | null }) => void seen.push(i.step!);
    const order = commonChoices(c.met);
    expect(order.length, '선택 수').toBe(c.picks.length);
    for (const [n, choiceId] of order.entries()) {
      const i = await advanceToStop(page, onSay);
      expect(i.frame).toBe('choice');
      expect(i.step).toBe(choiceId);
      expect(i.route).toBeNull();
      // 화면에는 늘 3개: 초반 a,b,c / 후반 해금 a,b,k · 미해금 a,b,c
      const ids = await visibleChoiceIds(page);
      expect(ids, `${choiceId} 옵션`).toEqual(n < EARLY_CHOICES.length || !c.met ? ['a', 'b', 'c'] : ['a', 'b', 'k']);
      if (n === 3) {
        // c6 갈림길 뒤 연결 줄: a 는 c6.j20(우산 돌려줄게), b 는 c6.j25, 함께(c)는 c6.c70 만. c 가 a 쪽 줄로 새지 않는다
        const tail = { a: 'c6.j20', b: 'c6.j25', c: 'c6.c70' } as Record<string, string>;
        for (const [o, id] of Object.entries(tail)) expect(seen.includes(id), `c6 ${c.picks[2]} 선택 뒤 ${id}`).toBe(o === c.picks[2]);
      }
      if (n === 4) {
        // 첫 후반 선택: 해금 판정 결과와 그 경로(복도 첫 만남·토요일 오전 추첨·빙수집 넷 판은 해금 시에만, 셋 판·빵집은 미해금 시에만)
        expect(i.points, '해금 판정 뒤 점수').toEqual(c.early);
        await expect.poll(async () => (await readAutoState(page))?.stepId).toBe(choiceId);
        expect((await readAutoState(page))!.flags['kh.met'], 'kh.met').toBe(c.met);
        const meet = seen.filter((s) => s.startsWith('c7.m'));
        const raffle = seen.filter((s) => s.startsWith('c8r.'));
        const ice4 = seen.filter((s) => s.startsWith('e1f.'));
        const ice3 = seen.filter((s) => s.startsWith('e1t.'));
        const bakery = seen.filter((s) => s.startsWith('c8.'));
        if (c.met) {
          expect(meet, '복도 첫 만남').toContain('c7.m20');
          expect(raffle.length, '토요일 오전 추첨').toBeGreaterThan(0);
          expect(ice4.length, '빙수집 넷 판').toBeGreaterThan(0);
          expect([...ice3, ...bakery], '해금인데 셋 판 빙수집·빵집').toEqual([]);
          // 첫 만남은 종(c7.join) 뒤, 노을길(c7.j20) 앞. 추첨 뒤 빙수집
          expect(seen.indexOf('c7.m10')).toBeLessThan(seen.indexOf('c7.j20'));
          expect(seen.indexOf(raffle[raffle.length - 1])).toBeLessThan(seen.indexOf(ice4[0]));
        } else {
          expect(meet, '미해금인데 복도 첫 만남').toEqual([]);
          expect(raffle, '미해금인데 토요일 오전 추첨').toEqual([]);
          expect(ice4, '미해금인데 빙수집 넷 판').toEqual([]);
          // 노을길 → 빙수집 셋 판(e1_ice3) → 빵집(c8_bakery)
          expect(ice3.length, '빙수집 셋 판').toBeGreaterThan(0);
          expect(seen.indexOf('c7.j40')).toBeLessThan(seen.indexOf(ice3[0]));
          expect(seen.indexOf(ice3[ice3.length - 1])).toBeLessThan(seen.indexOf(bakery[0]));
        }
        expect(seen).toContain('c7.j40');
      }
      await pick(page, c.picks[n]);
    }
    // 마지막 공통 선택의 반응과 처마 장면(e3_rain4 / e3_rain3)을 지나 루트가 확정된다
    const { lastCommon, first } = await advanceToRoute(page);
    expect(lastCommon, '루트 결정 직전 대사').toBe(c.met ? LAST_COMMON_LINE.met : LAST_COMMON_LINE.unmet);
    if (!c.met) {
      // 미발견: c9 뒤 종이개구리 셋 판(e2_frog3) → c10, c10 뒤 처마 셋 판(e3_rain3)
      const frog3 = seen.findIndex((s) => s.startsWith('e2t.'));
      expect(frog3, '종이개구리 셋 판').toBeGreaterThan(seen.indexOf('c9.j10'));
      expect(seen.findIndex((s) => s.startsWith('c10.'))).toBeGreaterThan(frog3);
      expect(seen.some((s) => s.startsWith('e3t.')), '처마 셋 판').toBe(true);
      expect(seen.filter((s) => /^e[123]f\./.test(s)), '넷 판 장면').toEqual([]);
    } else {
      expect(seen.some((s) => s.startsWith('e1s.')), '짧은 일요일').toBe(true);
      expect(seen.filter((s) => /^(?:c8|c9|c10|e[123]t)\./.test(s)), '해금인데 옛 후반·셋 판 장면').toEqual([]);
    }
    expect(first.route).toBe(c.route);
    expect(first.points).toEqual(c.final);
    // 결과 안내 없이 해당 루트 첫 장면(o1_shop / t1_cats / k1 / h1)으로
    expect(first.step!.startsWith(ROUTE_FIRST_STEP[c.route]), first.step!).toBe(true);
    // 판정 결과(kh.met)는 루트에 들어가도 그대로 남는다(다시 판정하지 않음). 새 흐름은 처마 장면 표식 ep3.done
    await expect.poll(async () => (await readAutoState(page))?.stepId).toBe(first.step);
    const st = (await readAutoState(page))!;
    expect(st.flags['kh.met']).toBe(c.met);
    expect(st.flags['ep3.done']).toBe(true);
    expect(st.route).toBe(c.route);
    // 미해금: 타이틀·공통·루트 첫 장면까지 코하루 흔적 그림 요청이 없다(해금이면 복도에서 이미 그렸다)
    if (c.met) expect(khRequests.length, '해금 플레이의 코하루 그림 요청').toBeGreaterThan(0);
    else expect(khRequests, '미해금 플레이에서 받은 코하루 그림').toEqual([]);
    // 히든 루트 전용 그림(end_group_*)은 루트가 group 이 아니면 해금 플레이에서도 받지 않는다(group 이면 판정 뒤에 받을 수 있다.
    // 판정 순간과 요청 순간의 앞뒤는 화면 밖에서 가를 수 없어, 그 경우는 단위 테스트 rendering.test 의 미리 불러오기 계획 검사에 맡긴다)
    if (c.route !== 'group') expect(groupRequests, '네 사람 루트가 아닌 플레이에서 받은 네 사람 엔딩 그림').toEqual([]);
  });
}
