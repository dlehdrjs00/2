import { describe, expect, it } from 'vitest';
import { advance, choose, decideRoute, newGameState, settle } from '../../src/engine/runner';
import { validateStory } from '../../src/engine/validate';
import { attachJosa, resolveText } from '../../src/engine/text';
import { miniStory, permissiveAssets } from './fixtures';

/** 다음 선택지(또는 엔딩)까지 대사를 넘긴다 */
function toNextChoice(story = miniStory(), state = newGameState(story)) {
  let r = settle(story, state);
  while (r.step.t === 'say' || r.step.t === 'card') r = advance(story, state)!;
  return { story, state, r };
}

describe('루트 결정 규칙(예전 2인 호환 함수 decideRoute)', () => {
  it('점수가 높은 히로인으로 간다', () => {
    expect(decideRoute({ osana: 3, tenko: 1 }, 'tenko')).toBe('osana');
    expect(decideRoute({ osana: 1, tenko: 3 }, 'osana')).toBe('tenko');
  });
  it('동점이면 가장 최근 히로인 선택을 따른다', () => {
    expect(decideRoute({ osana: 2, tenko: 2 }, 'tenko')).toBe('tenko');
    expect(decideRoute({ osana: 2, tenko: 2 }, 'osana')).toBe('osana');
  });
  it('기록이 전혀 없으면 소꿉친구(규칙상 기본값)', () => {
    expect(decideRoute({ osana: 0, tenko: 0 }, null)).toBe('osana');
  });

  it.each([
    [['a', 'b', 'a', 'b'], 'tenko'],
    [['b', 'a', 'b', 'a'], 'osana'],
    [['a', 'a', 'a', 'b'], 'osana'],
    [['b', 'b', 'b', 'a'], 'tenko'],
  ])('선택 %j → %s 루트로 확정되고 다른 루트로 섞이지 않는다', (picks, route) => {
    const story = miniStory();
    const state = newGameState(story);
    let r = settle(story, state);
    let i = 0;
    while (r.step.t !== 'ending') {
      if (r.step.t === 'choice') {
        const pick = state.route === null ? picks[i++] : r.step.options[0].id;
        r = choose(story, state, pick)!;
      } else r = advance(story, state)!;
      if (state.route) expect(story.scenes[state.sceneId].route).toBe(state.route);
    }
    expect(state.route).toBe(route);
    expect(r.step.ending).toBe(route);
  });

  it('루트 확정 후 히로인 태그가 붙은 선택을 해도 점수·루트가 바뀌지 않는다', () => {
    const story = miniStory();
    const state = newGameState(story);
    let r = settle(story, state);
    for (const pick of ['a', 'a', 'a', 'a']) {
      while (r.step.t !== 'choice') r = advance(story, state)!;
      r = choose(story, state, pick)!;
    }
    expect(state.route).toBe('osana');
    while (r.step.t !== 'choice') r = advance(story, state)!;
    expect(r.step.id).toBe('o1.ch');
    const before = { ...state.points };
    choose(story, state, 'a'); // heroine: tenko 태그
    expect(state.points).toEqual(before);
    expect(state.route).toBe('osana');
  });
});

describe('실행기 입력 방어', () => {
  it('선택지에서 advance 는 아무것도 하지 않는다', () => {
    const { story, state, r } = toNextChoice();
    expect(r.step.t).toBe('choice');
    expect(advance(story, state)).toBeNull();
    expect(state.stepId).toBe('c1.ch');
  });

  it('같은 선택지를 두 번 고를 수 없다(두 번째 호출은 무시)', () => {
    const { story, state } = toNextChoice();
    const first = choose(story, state, 'a');
    expect(first?.step.id).toBe('c1.a10');
    const second = choose(story, state, 'b');
    expect(second).toBeNull();
    expect(state.points).toEqual({ osana: 1, tenko: 0, koharu: 0 });
    expect(state.choices['c1.ch']).toBe('a');
  });

  it('존재하지 않는 옵션은 무시', () => {
    const { story, state } = toNextChoice();
    expect(choose(story, state, 'zzz')).toBeNull();
    expect(state.stepId).toBe('c1.ch');
  });

  it('선택 직후 반응이 옵션마다 다르다', () => {
    const a = toNextChoice();
    const b = toNextChoice();
    expect(choose(a.story, a.state, 'a')!.step.id).toBe('c1.a10');
    expect(choose(b.story, b.state, 'b')!.step.id).toBe('c1.b10');
  });

  it('대사의 표정 지정이 무대 상태(저장 스냅샷)에 반영된다', () => {
    const story = miniStory();
    const state = newGameState(story);
    settle(story, state);
    const r = advance(story, state)!;
    expect(r.step.id).toBe('c1.020');
    expect(state.stage.chars.osana?.expr).toBe('smile');
    expect(state.stage.bg).toBe('classroom_day');
  });
});

describe('스토리 검증기', () => {
  it('합성 스토리는 통과하고 모든 조합이 기대 루트로 끝난다', () => {
    const rep = validateStory(miniStory(), permissiveAssets, {});
    expect(rep.errors).toEqual([]);
    // 미해금(첫 선택 a·b): 16개 조합 중 소꿉 8개(루트 안 선택지 2개씩) + 전학 8개 = 24
    // 해금(첫 선택 c): 2×2×3 = 12개 조합 중 소꿉 5개(×2) + 전학 5개 + 후배 2개 = 17
    expect(rep.paths.length).toBe(8 * 2 + 8 + (5 * 2 + 5 + 2));
    for (const p of rep.paths) expect(p.route).toBe(p.expectedRoute);
    expect(rep.branching).toMatchObject({
      paths: 41,
      earlyCombos: 3,
      unlockedEarlyCombos: 1,
      endings: { osana: 26, tenko: 13, koharu: 2 },
      ties: 11,
      tiesUnlocked: 2,
      tiesLocked: 9,
      earlyCombosReachingAll: 3,
    });
    // 해금된 경로만 met, 해금 판정은 첫 선택 직후
    for (const p of rep.paths) {
      expect(p.met).toBe(p.choices[0].option === 'c');
      expect(p.gateAt).toBe(1);
    }
  });

  it('없는 장면·라벨·엔딩 연결을 잡아낸다', () => {
    const s = miniStory();
    s.scenes.o1.steps.push({ t: 'jump', id: 'bad.jump', scene: 'nope' });
    s.scenes.c1.steps.splice(3, 0, { t: 'goto', id: 'bad.goto', to: 'missing-label' });
    const rep = validateStory(s, permissiveAssets, {});
    expect(rep.errors.join('\n')).toMatch(/nope/);
    expect(rep.errors.join('\n')).toMatch(/missing-label/);
  });

  it('도달할 수 없는 엔딩을 잡아낸다', () => {
    const s = miniStory();
    const br = s.scenes.c1.steps.find((x) => x.t === 'routeBranch')!;
    if (br.t === 'routeBranch') br.scenes.tenko = 'o1';
    const rep = validateStory(s, permissiveAssets, {});
    expect(rep.errors.join('\n')).toMatch(/도달할 수 없는 엔딩: tenko|route 가 'osana'/);
  });

  it('id 중복을 잡아낸다', () => {
    const s = miniStory();
    s.scenes.t1.steps.unshift({ t: 'say', id: 'c1.010', who: null, text: '중복' });
    const rep = validateStory(s, permissiveAssets, {});
    expect(rep.errors.join('\n')).toMatch(/중복/);
  });
});

describe('치환·조사', () => {
  it('받침에 따라 조사를 고른다', () => {
    expect(attachJosa('아카네', '는')).toBe('아카네는');
    expect(attachJosa('유진', '는')).toBe('유진은');
    expect(attachJosa('유진', '가')).toBe('유진이');
    expect(attachJosa('히나', '을')).toBe('히나를');
    expect(attachJosa('하늘', '으로')).toBe('하늘로');
    expect(attachJosa('유진', '로')).toBe('유진으로');
    expect(attachJosa('유진', '야')).toBe('유진아');
    expect(attachJosa('Ann', '은')).toBe('Ann은(는)');
  });
  it('치환 키를 해석한다', () => {
    expect(resolveText('{a:는} {b} 군', { a: '소우타', b: '아오야마' })).toBe('소우타는 아오야마 군');
    expect(resolveText('{없음}', {})).toBe('{없음}');
  });
});
