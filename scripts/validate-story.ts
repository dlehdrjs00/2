/**
 * 스토리 검증 CLI
 *   npm run validate                 # 연결·에셋 파일·전 분기 시뮬레이션 검사
 *   npm run validate -- --skip-files # 에셋 파일 존재 여부 검사 생략
 *   npm run validate -- --paths      # 모든 선택 조합과 결과 루트 출력
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStory, type PathRecord } from '../src/engine/validate';
import { STORY } from '../src/story';
import { manifestChecker } from '../src/story/checker';
import { NAMES, TEXT_VARS } from '../src/story/config';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const skipFiles = args.has('--skip-files');

const checker = manifestChecker(skipFiles ? undefined : (p) => existsSync(resolve(root, 'public', p)));
const report = validateStory(STORY, checker, TEXT_VARS);

const heroName = (h: string | null) => (h === 'osana' ? NAMES.osana.given : h === 'tenko' ? NAMES.tenko.given : '-');

console.log(`장면 ${report.stats.scenes}개 · 대사 ${report.stats.sayLines}줄 · 선택지 ${report.stats.choices}개 · 선택 조합 ${report.paths.length}개`);

if (report.paths.length) {
  // 읽기 시간 추정: 한국어 대사 1분당 약 380~550자(클릭·글자 표시 포함)
  const byRoute = new Map<string, PathRecord[]>();
  for (const p of report.paths) {
    const k = p.route ?? '-';
    if (!byRoute.has(k)) byRoute.set(k, []);
    byRoute.get(k)!.push(p);
  }
  for (const [route, ps] of byRoute) {
    const mainChars = Math.round(avg(ps.map((p) => p.mainChars)));
    const mainLines = Math.round(avg(ps.map((p) => p.mainLines)));
    const epiChars = Math.round(avg(ps.map((p) => p.epilogueChars)));
    const epiLines = Math.round(avg(ps.map((p) => p.epilogueLines)));
    console.log(
      `  · ${heroName(route)} 루트 (${ps.length}개 조합): 본편 ${mainLines}줄/${mainChars}자 ≈ ${mins(mainChars)} · 후일담 ${epiLines}줄/${epiChars}자 ≈ ${mins(epiChars)}`,
    );
  }
}

if (args.has('--paths')) {
  for (const p of report.paths) {
    const tag = p.choices.map((c) => `${c.choice}:${c.option}${c.heroine ? `(${heroName(c.heroine)})` : ''}`).join(' → ');
    console.log(`  ${tag}  ⇒  ${heroName(p.route)} 엔딩`);
  }
}

if (report.warnings.length) {
  console.log(`\n경고 ${report.warnings.length}건`);
  for (const w of report.warnings) console.log(`  ⚠ ${w}`);
}
if (report.errors.length) {
  console.log(`\n오류 ${report.errors.length}건`);
  for (const e of report.errors) console.log(`  ✖ ${e}`);
  process.exit(1);
}
console.log('\n✔ 스토리 검증 통과');

function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
function mins(chars: number) {
  return `${(chars / 550).toFixed(1)}~${(chars / 380).toFixed(1)}분`;
}
