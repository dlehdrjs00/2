#!/usr/bin/env python3
"""
배경 썸네일 만들기 (Python 3 + Pillow)

    python3 scripts/bg-thumbs.py            # public/assets/bg/*.webp → public/assets/bg/thumb/*.webp (빠졌거나 오래된 것만)
    python3 scripts/bg-thumbs.py --force    # 최신인 썸네일도 다시 만든다(인계 제공본은 그래도 건너뜀)
    python3 scripts/bg-thumbs.py --check    # 쓰지 않고, 썸네일이 없거나 원본보다 오래됐거나 480x270 이 아니면 종료 코드 1

저장 칸(한 쪽 6칸)·엔딩 폴라로이드의 미니 무대(src/ui/screens/fx.ts miniStage)가 배경 원본(1920x1080) 대신 쓰는
480x270 그림이다(src/story/assets.ts BACKGROUNDS[id].thumb). 칸마다 원본을 해독하면 해독본만 약 8MB x 6 이 된다.
이벤트 CG 썸네일(scripts/import-art.py)과 같은 크기·방식: LANCZOS 축소, WebP 품질 80, method 6.
원본 배경 파일은 읽기만 하고 바꾸지 않는다.

이미 있고 원본보다 새로운 썸네일은 다시 만들지 않는다(다시 인코딩하면 내용이 같아도 바이트가 바뀔 수 있다).
인계 패키지(코하루 루트·여덟 엔딩 확장)가 원본과 함께 준 썸네일(PROVIDED)은 원본이 그 납품본 그대로인 동안 파일 시각과 상관없이
최신으로 보고, --force 로도 덮어쓰지 않는다. --check 는 그 썸네일이 납품본과 바이트 단위로 같은지도 본다.
원본을 다른 그림으로 바꾸면 보통 배경과 같은 규칙(시각 비교)으로 돌아간다.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG_DIR = ROOT / 'public' / 'assets' / 'bg'
THUMB_DIR = BG_DIR / 'thumb'
THUMB_W, THUMB_H = 480, 270
QUALITY = 80

# 인계 패키지가 원본과 함께 납품한 썸네일: 파일 이름 → (원본 sha256, 썸네일 sha256)
PROVIDED: dict[str, tuple[str, str]] = {
    # 코하루 루트 인계 패키지(public/assets/bg/, 2026-11-25 수령)
    'kh_stationery.webp': (
        '99ff946ead92cacac5d5760b93a27351965691d411e03caff0a35a244f36b7ef',
        '36a0a0932aa4d3ac226131e71d07d5599824a308c9d8f0fddf66252e1be57a9d',
    ),
    'kh_lantern_lane.webp': (
        'c1b70f49595de76aa2a872281f522d4fa83bf1c1aa5d552cc1fe09d4f1ab3501',
        '3da586621627c1423d94e30e787c089b990923d5abd95c91f7cd54fd95bfaa09',
    ),
    # 여덟 엔딩 확장 묶음(코덱스 제작, 2026-11-26 수령, ART_MANIFEST.json sha256 대조)
    'bg_ice_shop.webp': (
        '4d3bf643590b95582679a16cc830281407158cd27833084afae7b5a65e36a0c1',
        'ba3caf3465665e708055410bdae3a5ee74e7c6ca31d6fb08469819f72a3265e6',
    ),
    'bg_after_rain.webp': (
        '11e7f1079158f14f843406a74a4d1f35f342317c4d7b906b53910b74d6b1a1b9',
        '6776fe34bfcfd167d2d13f85e76957bfaf31556f4f66da87e797dd2ff5275329',
    ),
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def provided_thumb_sha(src: Path) -> str | None:
    """원본이 인계 납품본 그대로면 그 썸네일의 sha256, 아니면 None"""
    entry = PROVIDED.get(src.name)
    if entry is None or sha256(src) != entry[0]:
        return None
    return entry[1]


def thumb_size(path: Path) -> tuple[int, int] | None:
    try:
        with Image.open(path) as im:
            return im.size
    except OSError:
        return None


def make(src: Path, dest: Path) -> int:
    with Image.open(src) as im:
        im = im.convert('RGB')
        thumb = im.resize((THUMB_W, THUMB_H), Image.LANCZOS, reducing_gap=3.0)
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.thumb-', suffix='.webp', dir=dest.parent)
    os.close(fd)
    try:
        thumb.save(tmp, 'WEBP', quality=QUALITY, method=6)
        os.chmod(tmp, 0o644)
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return dest.stat().st_size


def main() -> int:
    ap = argparse.ArgumentParser(description='배경 썸네일(480x270) 만들기')
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='쓰지 않고 빠졌거나 오래됐거나 크기가 틀린 썸네일만 알린다')
    mode.add_argument('--force', action='store_true', help='최신인 썸네일도 다시 만든다(인계 제공본은 제외)')
    opts = ap.parse_args()
    sources = sorted(p for p in BG_DIR.glob('*.webp') if p.is_file() and not p.is_symlink())
    if not sources:
        print(f'배경 없음: {BG_DIR}', file=sys.stderr)
        return 1
    problems = 0
    made = 0
    skipped = 0
    total = 0
    for src in sources:
        dest = THUMB_DIR / src.name
        rel = dest.relative_to(ROOT)
        provided = provided_thumb_sha(src)
        exists = dest.is_file()
        if opts.check:
            if not exists:
                print(f'썸네일 없음: {rel}')
                problems += 1
            elif provided is not None:
                if sha256(dest) != provided:
                    print(f'인계 제공 썸네일과 다름(패키지의 파일을 다시 복사): {rel}')
                    problems += 1
            elif dest.stat().st_mtime < src.stat().st_mtime:
                print(f'썸네일이 원본보다 오래됨: {rel}')
                problems += 1
            if exists and thumb_size(dest) != (THUMB_W, THUMB_H):
                print(f'썸네일 크기가 {THUMB_W}x{THUMB_H} 가 아님: {rel} {thumb_size(dest)}')
                problems += 1
            continue
        if exists and provided is not None:
            print(f'{rel}  인계 제공본 유지(덮어쓰지 않음)')
            skipped += 1
            continue
        if exists and not opts.force and dest.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            continue
        size = make(src, dest)
        made += 1
        total += size
        print(f'{rel}  {THUMB_W}x{THUMB_H}  {size / 1024:.1f}KB')
    if opts.check:
        if not problems:
            print(f'썸네일 {len(sources)}장 모두 있음·최신·{THUMB_W}x{THUMB_H}')
        return 1 if problems else 0
    print(f'배경 {len(sources)}장: 새로 만듦 {made}장(합계 {total / 1024:.1f}KB), 건너뜀 {skipped}장(이미 최신이거나 인계 제공본)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
