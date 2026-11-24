/** 배포되는 글꼴 라이선스 안내(public/licenses/fonts-OFL.txt)가 실제로 싣는 글꼴과 맞는지 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const notice = read('public/licenses/fonts-OFL.txt');
const lines = notice.split('\n');
const tokens = read('src/ui/styles/tokens.css');

/** tokens.css 가 불러오는 글꼴 패키지 이름(@fontsource/jua, pretendard …) */
const packages = [...tokens.matchAll(/@import '((?:@[^/']+\/)?[^/']+)\//g)].map((m) => m[1]);

/** `== 제목` 바로 아래의 저작권 줄들(빈 줄 전까지) */
function section(title: string): string[] {
  const at = lines.indexOf(`== ${title}`);
  if (at < 0) return [];
  const end = lines.indexOf('', at + 1);
  return lines.slice(at + 1, end < 0 ? undefined : end);
}

function packageLicense(pkg: string): string {
  const dir = `node_modules/${pkg}/`;
  const file = ['LICENSE', 'LICENSE.txt', 'OFL.txt', 'dist/LICENSE.txt'].find((f) => existsSync(new URL(dir + f, root)));
  if (!file) throw new Error(`${pkg} 의 라이선스 파일을 찾지 못함`);
  return read(dir + file);
}

describe('글꼴 라이선스 안내', () => {
  it('OFL 1.1 전문을 싣는다', () => {
    expect(notice).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
    expect(notice).toContain('TERMINATION');
    expect(notice).toContain('DISCLAIMER');
  });

  it('한 줄에 저작권 문구가 두 번 이어 붙지 않는다', () => {
    for (const line of lines) expect(line.match(/Copyright/g)?.length ?? 0, line).toBeLessThanOrEqual(1);
  });

  it('tokens.css 가 불러오는 글꼴 패키지마다 원본 패키지와 같은 저작권 줄이 있다', () => {
    expect(packages).toEqual(expect.arrayContaining(['pretendard', '@fontsource/jua', '@fontsource/gowun-batang']));
    for (const pkg of packages) {
      const block = section(pkg);
      expect(block[0], pkg).toMatch(/^Copyright /);
      // 패키지 원문(공백 정리)에 같은 문구가 있어야 한다. 원문이 같은 줄을 두 번 이어 붙인 경우도 앞 한 줄과 맞으면 된다.
      const original = packageLicense(pkg).replace(/\s+/g, ' ');
      expect(original, pkg).toContain(block.join(' ').replace(/\s+/g, ' '));
    }
  });

  it('타이틀 글자 조각(부분 글꼴)마다 출처와 원본 글꼴의 저작권 줄을 따로 적는다', () => {
    const subsets = readdirSync(new URL('src/ui/styles/fonts/', root)).filter((f) => f.endsWith('.woff2'));
    expect(subsets.length).toBeGreaterThan(0);
    for (const file of subsets) {
      // tokens.css 에서 이 조각을 쓰는 글꼴 이름 → 같은 글꼴의 @fontsource 패키지
      const face = tokens.match(new RegExp(`font-family: '([^']+)';[^}]*url\\('\\./fonts/${file.replace('.', '\\.')}'\\)`));
      expect(face, file).not.toBeNull();
      const pkg = `@fontsource/${face![1].toLowerCase().replace(/ /g, '-')}`;
      const at = lines.findIndex((l) => l.startsWith(`${file} `));
      expect(at, file).toBeGreaterThan(-1);
      expect(lines[at], file).toMatch(/\(원본: ofl\/[^)]+\.ttf\)$/);
      expect(lines[at + 1], file).toBe(section(pkg)[0]);
    }
  });
});
