/** 이벤트 CG: 무대 상태·배경 전환 시 자동 해제·저장 복원·본 CG 기록 + 여덟 엔딩 확장 CG·배경 연결 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CgId, EndingId, Scene, Step, Story } from '../../src/engine/types';
import { advance, newGameState, settle } from '../../src/engine/runner';
import { bg, cg, ending, mono, scene } from '../../src/engine/dsl';
import { SaveManager } from '../../src/engine/save';
import { MemoryStore } from '../../src/engine/storage';
import { validateStory } from '../../src/engine/validate';
import { STORY } from '../../src/story';
import { BACKGROUNDS } from '../../src/story/assets';
import { CG_ORDER, CGS, ENDING_CG, KOHARU_DRAWN_CGS } from '../../src/story/cg';
import { ENDING_TITLES } from '../../src/story/config';
import { permissiveAssets } from './fixtures';

/** 엔딩 8개 정의(작은 대본용, 제목만 짧게) */
const ENDINGS8: Story['endings'] = {
  osana: { id: 'osana', route: 'osana', kind: 'festival', title: 'A' },
  osana_daily: { id: 'osana_daily', route: 'osana', kind: 'daily', title: 'Ad' },
  tenko: { id: 'tenko', route: 'tenko', kind: 'festival', title: 'B' },
  tenko_daily: { id: 'tenko_daily', route: 'tenko', kind: 'daily', title: 'Bd' },
  koharu: { id: 'koharu', route: 'koharu', kind: 'festival', title: 'C' },
  koharu_daily: { id: 'koharu_daily', route: 'koharu', kind: 'daily', title: 'Cd' },
  group_festival: { id: 'group_festival', route: 'group', kind: 'festival', title: 'G' },
  group_daily: { id: 'group_daily', route: 'group', kind: 'daily', title: 'Gd' },
};

function cgStory(): Story {
  const s = scene({ id: 'o1', title: 'CG', route: 'osana', part: 'epilogue' }, [
    bg('road_night', 'black'),
    mono('x.010', 'CG 전'),
    cg('fireworks_osana'),
    mono('x.020', 'CG 표시 중'),
    bg('riverbank_night'),
    mono('x.030', '장소가 바뀌면 CG 는 걷힌다'),
    cg('homeward_osana'),
    mono('x.040', '다시 CG'),
    cg(null),
    mono('x.050', '직접 걷기'),
    ending('x.end', 'osana'),
  ]);
  return {
    version: 't',
    start: 'o1',
    scenes: { o1: s },
    endings: { ...ENDINGS8 },
  };
}

describe('이벤트 CG', () => {
  it('cg 명령은 무대 상태와 이벤트를 남기고, bg 명령은 CG 를 먼저 걷는다', () => {
    const story = cgStory();
    const st = newGameState(story);
    st.route = 'osana';
    let r = settle(story, st);
    expect(st.stage.cg ?? null).toBeNull();
    r = advance(story, st)!;
    expect(r.step.id).toBe('x.020');
    expect(st.stage.cg).toBe('fireworks_osana');
    expect(r.events).toContainEqual({ kind: 'cg', cg: 'fireworks_osana' });
    r = advance(story, st)!;
    expect(r.step.id).toBe('x.030');
    expect(st.stage.cg).toBeNull();
    const kinds = r.events.map((e) => e.kind);
    expect(kinds.indexOf('cg')).toBeLessThan(kinds.indexOf('bg'));
    r = advance(story, st)!;
    expect(st.stage.cg).toBe('homeward_osana');
    r = advance(story, st)!;
    expect(r.step.id).toBe('x.050');
    expect(st.stage.cg).toBeNull();
  });

  it('CG 가 떠 있는 위치에서 저장·불러오면 CG 가 복원되고, 모르는 CG 는 조용히 버린다', () => {
    const story = cgStory();
    const st = newGameState(story);
    st.route = 'osana';
    settle(story, st);
    advance(story, st);
    const store = new MemoryStore(true);
    const known = new SaveManager(store, story, { ...permissiveAssets, hasCg: (id: string) => id === 'fireworks_osana' });
    known.write('1', st, { sceneTitle: '', text: '', route: 'osana' });
    const ok = known.load('1');
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(ok.data.state.stage.cg).toBe('fireworks_osana');

    const strict = new SaveManager(store, story, { ...permissiveAssets, hasCg: () => false });
    const dropped = strict.load('1');
    expect(dropped.status).toBe('ok');
    if (dropped.status === 'ok') {
      expect(dropped.data.state.stage.cg ?? null).toBeNull();
      expect(dropped.data.state.stepId).toBe('x.020');
    }
  });

  it('본 CG 기록은 저장소에 남고, 다른 탭 기록과 합쳐진다', () => {
    const story = cgStory();
    const store = new MemoryStore(true);
    const a = new SaveManager(store, story, permissiveAssets);
    const b = new SaveManager(store, story, permissiveAssets);
    a.markCg('fireworks_osana');
    b.markCg('homeward_osana');
    const c = new SaveManager(store, story, permissiveAssets);
    expect(new Set(c.cgsSeenList())).toEqual(new Set(['fireworks_osana', 'homeward_osana']));
    expect(c.hasSeenCg('fireworks_osana')).toBe(true);
  });

  it('검증기는 없는 CG 를 오류로 잡는다', () => {
    const rep = validateStory(cgStory(), { ...permissiveAssets, hasCg: (id: string) => id !== 'homeward_osana' }, {});
    expect(rep.errors.join('\n')).toMatch(/homeward_osana/);
  });
});

// ---------------------------------------------------------------------------
// 여덟 엔딩 확장: 코덱스가 제작한 CG 9장·배경 2장(설계 계약 docs/EIGHT_ENDINGS_DESIGN.md 7·8절)
// ---------------------------------------------------------------------------

/**
 * 받은 묶음의 sha256(ART_MANIFEST.json, 원본·썸네일). 제공 파일 그대로 쓴다(import-art.py 로 다시 인코딩하지 않음).
 * 그림을 고쳐 다시 받으면 이 표와 scripts/bg-thumbs.py PROVIDED 를 함께 고친다
 */
const PROVIDED_ART: Record<string, [string, string]> = {
  'cg/group_ice_four': ['b4d60fee12717d68acfad02a00c4ca14b641a13149b5dcbb3c0c09588ac9f81e', 'f81aca5e0a43a7e905bee05c62247a7ab66819fa93507036e63ab314e28c67ba'],
  'cg/group_ice_three': ['848473e4f37ca8ea6e4ed8485e9d80ea43bee2bf613884ac5a06369ec6fcf74a', '3ab31da2622cdf2657ab3cf10cfb9a09e2b471cb32c6a74c98edc007c7d70a72'],
  'cg/group_frog': ['cdc06d216e60478fe2b4ab113b332ddcdc7d2f54f18a970dbe721df72ac6d5df', '7aaceee2494fcfe0f96afd89b2a5f1225ade328bb21b9689322d4e4b908e94e2'],
  'cg/group_rain': ['a04ac6e4e557c1f02261c83caa54ed8fa1a6720d1a87a527243cdcaa079ae460', '2364907b5a2e0b80f39e4cbe9ef36d4cc01c233eca456aa79f4c75d9b967362a'],
  'cg/end_akane_walk': ['c9b24affd16a7c21a9370cb3831116189a4274b6b1a4896764cf8135c3b12f78', '032086fe23db146b7fa7f1bc02f85275ad1a34cfebb480d7850b13313fcfe445'],
  'cg/end_hina_walk': ['dc032fd99f34b2cf569f5fbbab76e6a8f27d870488d5e49495bc92a769bdcae1', '1250184df3ce181df5c50a884387b159365d6b86b09c6bb4279819f78d758e9f'],
  'cg/end_koharu_coin': ['0562126a4351e322897da8de22c034ca7ab81bd8dbdd960f0985ea6c9e62feb2', '43e47945d09ea2805c2ee7f526423a8d8ed89d127bbd43b9030149fe45771379'],
  'cg/end_group_fireworks': ['b73a98387e4a8cb63098e6d888f78543344526ae661d7865144b335f2f9f3296', 'e30a34b86da64e2cbfc38c96610fde257196f5bbcd95e2ef4a9a49e822d59c54'],
  'cg/end_group_morning': ['912cdabf5217b55a6dd525ea5d2c15b490517d05e7eaeebad39131833bb5bf44', '10f25313114ce7d96c9c0eecd97d07667b57ca851f167d8156892a80f771275e'],
  'bg/bg_ice_shop': ['4d3bf643590b95582679a16cc830281407158cd27833084afae7b5a65e36a0c1', 'ba3caf3465665e708055410bdae3a5ee74e7c6ca31d6fb08469819f72a3265e6'],
  'bg/bg_after_rain': ['11e7f1079158f14f843406a74a4d1f35f342317c4d7b906b53910b74d6b1a1b9', '6776fe34bfcfd167d2d13f85e76957bfaf31556f4f66da87e797dd2ff5275329'],
};

const publicFile = (p: string) => readFileSync(new URL(`../../public/${p}`, import.meta.url));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** WebP 머리글(VP8 / VP8L / VP8X)에서 픽셀 크기 */
function webpSize(b: Buffer): [number, number] {
  expect(b.toString('ascii', 0, 4)).toBe('RIFF');
  expect(b.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  throw new Error(`알 수 없는 WebP 조각 ${chunk}`);
}

/** cg 스텝이 있는 장면 id(대본 전체) */
function scenesShowing(id: CgId): Scene[] {
  return Object.values(STORY.scenes).filter((s) => s.steps.some((st) => st.t === 'cg' && st.cg === id));
}

/** 장면에서 장면 이동으로 닿는 엔딩 */
function endingsFrom(start: string): Set<EndingId> {
  const out = new Set<EndingId>();
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !STORY.scenes[id]) continue;
    seen.add(id);
    for (const st of STORY.scenes[id].steps as Step[]) {
      if (st.t === 'jump') stack.push(st.scene);
      if (st.t === 'routeBranch') stack.push(...Object.values(st.scenes).filter((x): x is string => !!x));
      if (st.t === 'ending') out.add(st.ending);
    }
  }
  return out;
}

const NEW_CGS: CgId[] = [
  'group_ice_four',
  'group_ice_three',
  'group_frog',
  'group_rain',
  'end_akane_walk',
  'end_hina_walk',
  'end_koharu_coin',
  'end_group_fireworks',
  'end_group_morning',
];

describe('여덟 엔딩 확장 CG·배경', () => {
  it('받은 파일 22개가 그대로 들어 있다(sha256 일치, 원본 1920×1080·썸네일 480×270 WebP)', () => {
    for (const [key, [srcSha, thumbSha]] of Object.entries(PROVIDED_ART)) {
      const [dir, id] = key.split('/');
      const src = publicFile(`assets/${dir}/${id}.webp`);
      const thumb = publicFile(`assets/${dir}/thumb/${id}.webp`);
      expect(sha(src), `${key} 원본`).toBe(srcSha);
      expect(sha(thumb), `${key} 썸네일`).toBe(thumbSha);
      expect(webpSize(src), `${key} 원본 크기`).toEqual([1920, 1080]);
      expect(webpSize(thumb), `${key} 썸네일 크기`).toEqual([480, 270]);
    }
  });

  it('CG 9장은 매니페스트(cg.ts)에 묶음의 제목·경로로 등록되고, 앨범 정책·루트 묶음은 계약 8절 표와 같다', () => {
    const policy: Record<string, [string, string | null, boolean]> = {
      group_ice_four: ['네 숟가락', null, true],
      group_ice_three: ['주문하기도 전에', null, false],
      group_frog: ['딱 한 판만', null, true],
      group_rain: ['비는 벌써 그쳤는데', null, true],
      end_akane_walk: ['세 걸음 뒤에', 'osana', false],
      end_hina_walk: ['이쪽으로 갈래?', 'tenko', false],
      end_koharu_coin: ['네 옆의 빈 의자', 'koharu', true],
      end_group_fireworks: ['불꽃이 오르기 전에', 'group', true],
      end_group_morning: ['내일도 넷이서 갈래?', 'group', true],
    };
    for (const id of NEW_CGS) {
      const c = CGS[id];
      expect([c.title, c.route, c.hidden === true], id).toEqual(policy[id]);
      expect(c.src).toBe(`assets/cg/${id}.webp`);
      expect(c.thumb).toBe(`assets/cg/thumb/${id}.webp`);
      expect(c.placeholder).toBe(false);
    }
    // 앨범 순서: 공통 묶음은 kh_draw 뒤에 에피소드, 각 루트 묶음 끝에 일상 쪽 결말, 네 사람 그림은 맨 끝
    const order = CG_ORDER as string[];
    const after = (a: string, b: string) => expect(order.indexOf(a), `${a} 뒤에 ${b}`).toBeLessThan(order.indexOf(b));
    after('kh_draw', 'group_ice_four');
    after('group_ice_four', 'group_frog');
    after('group_frog', 'group_rain');
    for (const [route, last] of [
      ['osana', 'end_akane_walk'],
      ['tenko', 'end_hina_walk'],
      ['koharu', 'end_koharu_coin'],
    ] as const) {
      const ids = order.filter((id) => CGS[id as CgId].route === route);
      expect(ids[ids.length - 1]).toBe(last);
    }
    expect(order.slice(-2)).toEqual(['end_group_fireworks', 'end_group_morning']);
  });

  it('엔딩 폴라로이드(ENDING_CG)는 엔딩 8개 모두에 있고, 그 그림의 루트가 엔딩의 루트와 같다(계약 7절)', () => {
    expect(ENDING_CG).toEqual({
      osana: 'homeward_osana',
      osana_daily: 'end_akane_walk',
      tenko: 'polaroid_tenko',
      tenko_daily: 'end_hina_walk',
      koharu: 'kh_date',
      koharu_daily: 'end_koharu_coin',
      group_festival: 'end_group_fireworks',
      group_daily: 'end_group_morning',
    });
    expect(Object.keys(STORY.endings).sort()).toEqual(Object.keys(ENDING_TITLES).sort());
    for (const [e, id] of Object.entries(ENDING_CG) as Array<[EndingId, CgId]>) {
      expect(CGS[id].route, `${e} → ${id}`).toBe(STORY.endings[e].route);
      expect(STORY.endings[e].title).toBe(ENDING_TITLES[e]);
    }
  });

  it('각 CG 는 정해진 장면에서 쓰이고, 일상 쪽·히든 결말 그림은 그 엔딩으로 가는 장면에만 있다', () => {
    const where: Record<string, { scene: RegExp; route: string; endings?: EndingId[] }> = {
      group_ice_four: { scene: /^e1_ice4$/, route: 'common' },
      group_ice_three: { scene: /^e1_ice3$/, route: 'common' },
      group_frog: { scene: /^e2_frog4$/, route: 'common' },
      group_rain: { scene: /^e3_rain4$/, route: 'common' },
      end_akane_walk: { scene: /^od\d+$/, route: 'osana', endings: ['osana_daily'] },
      end_hina_walk: { scene: /^td\d+$/, route: 'tenko', endings: ['tenko_daily'] },
      end_koharu_coin: { scene: /^kd\d+$/, route: 'koharu', endings: ['koharu_daily'] },
      end_group_fireworks: { scene: /^hf\d+$/, route: 'group', endings: ['group_festival'] },
      end_group_morning: { scene: /^hd\d+$/, route: 'group', endings: ['group_daily'] },
    };
    for (const id of NEW_CGS) {
      const ss = scenesShowing(id);
      expect(ss.length, `${id} 를 쓰는 장면`).toBeGreaterThan(0);
      for (const s of ss) {
        expect(s.id, id).toMatch(where[id].scene);
        expect(s.route, id).toBe(where[id].route);
        if (where[id].endings) expect([...endingsFrom(s.id)], `${s.id} 에서 닿는 엔딩`).toEqual(where[id].endings);
      }
    }
  });

  it('코하루가 그려진 CG 는 모두 hidden 이고, 미발견(셋) 판 장면에는 코하루 그림·이름이 없다', () => {
    expect(KOHARU_DRAWN_CGS).toHaveLength(12);
    for (const id of KOHARU_DRAWN_CGS) expect(CGS[id].hidden, id).toBe(true);
    for (const sid of ['e1_ice3', 'e2_frog3', 'e3_rain3']) {
      const s = STORY.scenes[sid];
      expect(s, sid).toBeTruthy();
      for (const st of s.steps) {
        if (st.t === 'cg' && st.cg) expect(KOHARU_DRAWN_CGS, `${sid} ${st.id}`).not.toContain(st.cg);
        if (st.t === 'show') expect(st.char, `${sid} ${st.id}`).not.toBe('koharu');
        if (st.t === 'say') expect(`${st.who} ${st.label ?? ''} ${st.text}`, `${sid} ${st.id}`).not.toMatch(/koharu|코하루|나루세/);
      }
    }
  });

  it('배경 2장: 빙수집은 두 판의 e1, 비 갠 처마는 두 판의 e3 에서 쓰고, 둘 다 낮 톤이며 처마는 날씨를 해로 명시한다', () => {
    expect(BACKGROUNDS.bg_ice_shop).toMatchObject({ src: 'assets/bg/bg_ice_shop.webp', thumb: 'assets/bg/thumb/bg_ice_shop.webp', placeholder: false, tone: 'day' });
    expect(BACKGROUNDS.bg_after_rain).toMatchObject({
      src: 'assets/bg/bg_after_rain.webp',
      thumb: 'assets/bg/thumb/bg_after_rain.webp',
      placeholder: false,
      tone: 'day',
      weather: 'sun',
    });
    const uses = (bgId: string) =>
      Object.values(STORY.scenes)
        .filter((s) => s.steps.some((st) => st.t === 'bg' && st.bg === bgId))
        .map((s) => s.id)
        .sort();
    // 다른 장면에서 더 써도 되지만(작가 재량) 두 판 모두에는 있어야 한다
    expect(uses('bg_ice_shop')).toEqual(expect.arrayContaining(['e1_ice3', 'e1_ice4']));
    expect(uses('bg_after_rain')).toEqual(expect.arrayContaining(['e3_rain3', 'e3_rain4']));
  });
});
