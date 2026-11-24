#!/usr/bin/env python3
"""
배경 썸네일 만들기 (Python 3 + Pillow)

    python3 scripts/bg-thumbs.py            # public/assets/bg/*.webp → public/assets/bg/thumb/*.webp
    python3 scripts/bg-thumbs.py --check    # 쓰지 않고, 썸네일이 없거나 원본보다 오래됐으면 종료 코드 1

저장 칸(한 쪽 6칸)·엔딩 폴라로이드의 미니 무대(src/ui/screens/fx.ts miniStage)가 배경 원본(1920x1080) 대신 쓰는
480x270 그림이다(src/story/assets.ts BACKGROUNDS[id].thumb). 칸마다 원본을 해독하면 해독본만 약 8MB x 6 이 된다.
이벤트 CG 썸네일(scripts/import-art.py)과 같은 크기·방식: LANCZOS 축소, WebP 품질 80, method 6.
원본 배경 파일은 읽기만 하고 바꾸지 않는다.
"""
from __future__ import annotations

import argparse
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
    ap.add_argument('--check', action='store_true', help='쓰지 않고 빠졌거나 오래된 썸네일만 알린다')
    opts = ap.parse_args()
    sources = sorted(p for p in BG_DIR.glob('*.webp') if p.is_file() and not p.is_symlink())
    if not sources:
        print(f'배경 없음: {BG_DIR}', file=sys.stderr)
        return 1
    stale = 0
    total = 0
    for src in sources:
        dest = THUMB_DIR / src.name
        if opts.check:
            if not dest.exists() or dest.stat().st_mtime < src.stat().st_mtime:
                print(f'썸네일 없음 또는 오래됨: {dest.relative_to(ROOT)}')
                stale += 1
            continue
        size = make(src, dest)
        total += size
        print(f'{dest.relative_to(ROOT)}  {THUMB_W}x{THUMB_H}  {size / 1024:.1f}KB')
    if opts.check:
        return 1 if stale else 0
    print(f'썸네일 {len(sources)}장, 합계 {total / 1024:.1f}KB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
