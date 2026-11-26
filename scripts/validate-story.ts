/**
 * 스토리 검증 CLI
 *   npm run validate                       # 연결·에셋 파일·전 분기 시뮬레이션·분기 분포(39,474 경로 기대값)·히든 루트·구저장 시드·
 *                                          # 미해금 코하루 흔적·루트 전용 그림 검사, 루트·엔딩별 읽기 분량
 *   npm run validate -- --skip-files       # 에셋 파일 존재 여부 검사 생략
 *   npm run validate -- --paths            # 모든 선택 조합과 결과 루트 출력(약 4만 줄)
 *   npm run validate -- --paths=group      # 그 루트(osana·tenko·koharu·group)나 엔딩 id 로 끝나는 조합만 출력
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_BRANCHING, validateStory, type PathRecord } from '../src/engine/validate';
import { resolveText } from '../src/engine/text';
import { STORY } from '../src/story';
import { manifestChecker, missingManifestFiles } from '../src/story/checker';
import { NAMES, TEXT_VARS } from '../src/story/config';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const args = new Set(argv);
const skipFiles = args.has('--skip-files');
const pathsArg = argv.find((a) => a === '--paths' || a.startsWith('--paths='));
const pathsFilter = pathsArg?.includes('=') ? pathsArg.slice('--paths='.length) : null;

const checker = manifestChecker(skipFiles ? undefined : (p) => existsSync(resolve(root, 'public', p)));
const t0 = performance.now();
const report = validateStory(STORY, checker, TEXT_VARS, { expect: EXPECTED_BRANCHING });
const elapsed = performance.now() - t0;
// 대본이 쓰지 않는 표정·썸네일까지 매니페스트에 적힌 파일이 모두 있어야 한다(앨범·미리 불러오기·문서가 참조)
if (!skipFiles) {
  for (const p of missingManifestFiles((x) => existsSync(resolve(root, 'public', x)))) report.errors.push(`매니페스트 파일 없음: public/${p}`);
}

const routeNames: Record<string, string> = { osana: NAMES.osana.given, tenko: NAMES.tenko.given, koharu: NAMES.koharu.given, group: '네 사람' };
const routeName = (r: string | null) => (r ? (routeNames[r] ?? r) : '-');
const kindName = (k: string | null | undefined) => (k === 'daily' ? '일상' : k === 'festival' ? '축제' : '-');
const endingDefs = Object.values(STORY.endings);
const endingLabel = (id: string) => {
  const d = STORY.endings[id as keyof typeof STORY.endings];
  return d ? `${routeName(d.route)}·${kindName(d.kind)} 「${resolveText(d.title, TEXT_VARS)}」` : id;
};
const n = (x: number) => x.toLocaleString('en-US');

console.log(
  `장면 ${report.stats.scenes}개 · 대사 ${n(report.stats.sayLines)}줄 · 선택지 ${report.stats.choices}개 · 경로 ${n(report.paths.length)}개(구저장 시드 ${n(report.legacyPaths.length)}개) · ` +
    `검증 ${(elapsed / 1000).toFixed(1)}초(루트 뒤 구간 시뮬레이션 ${report.stats.suffixRuns}회)`,
);
{
  const b = report.branching;
  console.log(
    `분기 분포: 경로 ${n(b.paths)} · 판정 ${n(b.decisions)}(발견 ${n(b.unlockedDecisions)} / 미발견 ${n(b.lockedDecisions)}) · 초반 조합 ${b.earlyCombos}(발견 ${b.unlockedEarlyCombos}) · ` +
      `발견 경로 ${n(b.unlockedPaths)} / 미발견 ${n(b.lockedPaths)}`,
  );
  console.log(`  · 루트(판정 단위): ${Object.entries(b.routes).map(([r, c]) => `${routeName(r)} ${n(c)}`).join(' / ')}`);
  console.log(
    `  · 히든 루트(세 명 완전 동점) ${n(b.hidden)} · 두 사람 동점 처리 ${n(b.ties)}(발견 ${n(b.tiesUnlocked)} / 미발견 ${n(b.tiesLocked)}) · 전원 동점 ${n(b.allTied)}`,
  );
  console.log(`  · 엔딩(경로 단위): ${endingDefs.map((d) => `${endingLabel(d.id)} ${n(b.endings[d.id] ?? 0)}`).join(' / ')}`);
  console.log(
    `  · 결말 갈래: 판정 ${n(b.decisionsReachingRouteEndings)}/${n(b.decisions)}개가 그 루트의 두 엔딩에 모두 닿음 · 초반 조합 ${b.earlyCombosReachingAll}/${b.earlyCombos}개가 낼 수 있는 루트 전원에 닿음`,
  );
  const l = b.legacy;
  if (l) {
    console.log(
      `  · 구저장 시드(옛 c8·c9·c10 +3, 옛 판정): 판정 ${n(l.decisions)} · ${Object.entries(l.routes).map(([r, c]) => `${routeName(r)} ${n(c)}`).join(' / ')} · ` +
        `히든 ${l.hidden} · 동점 처리 ${l.ties}(그중 세 명 동점 ${l.allTied})`,
    );
  } else console.log('  · 구저장 시드: 없음');
}

if (report.paths.length) {
  // 읽기 시간 추정: 한국어 대사 1분당 약 380~550자(클릭·글자 표시 포함). 사람이 잰 시간이 아니다
  const total = (p: PathRecord) => p.mainChars + p.epilogueChars;
  const range = (ps: PathRecord[], f: (p: PathRecord) => number) => {
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    for (const p of ps) {
      const v = f(p);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      sum += v;
    }
    return { lo, hi, avg: Math.round(sum / Math.max(1, ps.length)) };
  };
  const fmtRange = (r: { lo: number; hi: number; avg: number }) => `${n(r.lo)}~${n(r.hi)}자(평균 ${n(r.avg)})`;
  console.log('\n읽기 분량(치환 후 글자 수, 경로별 최소~최대 · 추정 시간은 최소 ÷ 550 ~ 최대 ÷ 380 분):');
  for (const d of endingDefs) {
    const ps = report.paths.filter((p) => p.ending === d.id);
    if (!ps.length) continue;
    const all = range(ps, total);
    const common = range(ps, (p) => p.commonChars);
    const routeMain = range(ps, (p) => p.mainChars - p.commonChars);
    const epi = range(ps, (p) => p.epilogueChars);
    console.log(
      `  · ${endingLabel(d.id)} (${n(ps.length)}개 경로): 전체 ${fmtRange(all)} ≈ ${(all.lo / 550).toFixed(1)}~${(all.hi / 380).toFixed(1)}분 · ` +
        `공통 ${fmtRange(common)} · 루트 본편 ${fmtRange(routeMain)} · 후일담 ${fmtRange(epi)}`,
    );
  }
  for (const met of [true, false]) {
    const ps = report.paths.filter((p) => p.met === met);
    if (!ps.length) continue;
    const c = range(ps, (p) => p.commonChars);
    console.log(`  · 공통 구간(${met ? '발견' : '미발견'} 경로, 에피소드 포함): ${fmtRange(c)} ≈ ${(c.lo / 550).toFixed(1)}~${(c.hi / 380).toFixed(1)}분`);
  }
}

if (pathsArg) {
  for (const p of report.paths) {
    if (pathsFilter && p.route !== pathsFilter && p.ending !== pathsFilter) continue;
    const tag = p.choices.map((c) => `${c.choice}:${c.option}${c.heroine ? `(${routeName(c.heroine)})` : ''}`).join(' → ');
    console.log(`  ${tag}  ⇒  ${routeName(p.route)} 루트 · ${p.ending ? endingLabel(p.ending) : '-'}${p.met ? ' · 발견' : ''}${p.hidden ? ' · 히든(동점)' : ''}${p.tie ? ' · 동점 처리' : ''}`);
  }
}

if (report.warnings.length) {
  console.log(`\n경고 ${report.warnings.length}건`);
  for (const w of report.warnings) console.log(`  ⚠ ${w}`);
}
if (report.errors.length) {
  console.log(`\n오류 ${report.errors.length}건`);
  for (const e of report.errors.slice(0, 200)) console.log(`  ✖ ${e}`);
  if (report.errors.length > 200) console.log(`  … 그 밖에 ${report.errors.length - 200}건`);
  process.exit(1);
}
console.log('\n✔ 스토리 검증 통과');
