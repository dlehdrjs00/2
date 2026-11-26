#!/usr/bin/env python3
"""
최종 캐릭터 스프라이트·이벤트 CG·배경 가져오기 (Python 3 + Pillow + numpy 만 사용)

    python3 scripts/import-art.py                 # art-inbox/ → public/assets/
    python3 scripts/import-art.py --src 다른폴더 --only char
    python3 scripts/import-art.py --dry-run       # 입력만 검사하고 쓰지 않음

입력 규칙 (기본 src = 저장소의 art-inbox/, .gitignore 대상)
    <src>/char/{osana,tenko,koharu}/{outfit}_{hair}_{expr}.(png|webp|jpg)   outfit: uniform·casual·yukata
    <src>/cg/{id}.(png|webp|jpg)
    <src>/bg/{id}.(png|webp|jpg)                 id 는 src/story/assets.ts BACKGROUNDS 의 키(예: kh_stationery)
  · 같은 이름에 확장자가 여럿이면 png > webp > jpg 순으로 하나만 쓴다.
  · 예전 안내(docs/ART_PROMPTS.md)의 <src>/{osana,tenko,koharu}/ 배치도 char/ 가 없을 때 받아 준다.
  · 코하루 편집용 ZIP(art-inbox/ 의 같은 이름 PNG)도 이 규칙 그대로 받는다. 단, 게임에는 인계 패키지의 WebP 를
    그대로 넣었으므로(다시 인코딩하지 않음) 편집 원본을 고친 경우에만 돌린다. 돌리면 그 파일들의 바이트가 바뀐다.

출력
    public/assets/char/{osana,tenko,koharu}/{outfit}_{hair}_{expr}.webp   1200x1800 RGBA (--sprite-height, 작업은 1600x2400)
    public/assets/cg/{id}.webp                                            1920x1080
    public/assets/cg/thumb/{id}.webp                                      480x270
    public/assets/bg/{id}.webp                                            1920x1080 (품질 82, --bg-quality)
    public/assets/bg/thumb/{id}.webp                                      480x270 (scripts/bg-thumbs.py 와 같은 방식)
  · 새 배경 id 는 먼저 src/engine/types.ts BgId 와 src/story/assets.ts BACKGROUNDS(desc·tone·thumb)에 등록한다.
    여기서는 BG_IDS 에 없는 id 도 변환은 하되 경고한다.

스프라이트 처리
  1. 알파 확인. 불투명(배경 있음)이면 네 가장자리에서 시작하는 flood-fill 로 '가장자리와 이어진
     단색 배경'만 지운다. 배경이 크로마키처럼 채도 높은 색(#00B140 등)이면 팔·머리카락 사이의
     닫힌 틈(같은 색 덩어리)도 지우고, 흰색 등 무채색 배경이면 닫힌 틈은 남기고 경고만 한다.
     배경이 단색이 아니면 손대지 않고 경고.
  2. 가장자리 번짐(halo) 완화(알파·실루엣은 그대로, 색만 고친다):
     · 반투명 화소는 premultiply 모델 C = aF + (1-a)M 로 매트색 M 을 빼서 원래 색 F 를 되돌린다.
     · 바로 안쪽 1~2px 불투명 테두리의 회색·청록 기는 밝기를 유지한 채 안쪽 색조로 바꾼다.
     · 실루엣 4px 띠의 초록 번짐(안쪽보다 초록으로 치우친 만큼)을 뺀다.
     M 은 묶음(같은 의상·헤어) 전체의 반투명 화소에서 최소제곱으로 추정한다(배경을 직접 지운
     경우엔 그 배경색). M 이 일관되지 않으면(모델이 설명력 없음) 이 단계는 건너뛴다.
  3. 작업 캔버스: 1600x2400 이면 그대로. 다르면 묶음 전체의 불투명 bbox 합집합 기준으로 같은 변환을
     적용해 2:3 캔버스에 머리 위 5% 여백·가로 중앙으로 맞춘다(표정끼리 위치가 어긋나지 않게).
  4. 저장 크기: 캔버스 전체를 같은 비율로 줄인다(기본 세로 1800px = 1200x1800, 위치·여백 비율은 그대로).
     화면에서 스프라이트는 무대 높이의 116% 안팎(1080p 약 1250px, 휴대폰 가로 3배율 약 1360px)이라
     1800px 이면 거의 모든 화면에서 충분하다. 품질 82 와 함께 30장이 5.35MB → 약 3.8MB(약 30% 감소).
     원본 크기 그대로가 필요하면 --sprite-height 2400.
  5. WebP(quality 82, alpha_quality 90, method 6).
  6. 같은 묶음 안에서 불투명 영역(알파 >= 128) bbox 가 다르면 경고(표정 교체 시 흔들림).
     bbox·머리 위 여백은 작업 캔버스(1600x2400) 기준으로 잰다.

업로드 원본은 신뢰하지 않는 데이터로 취급한다: PNG/WebP/JPEG 이미지로만 열고, 심볼릭 링크는
읽지 않으며, 너무 큰 이미지(압축 폭탄)는 거부한다.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import os
import re
import sys
import tempfile
import time
import warnings
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = ROOT / 'art-inbox'
DEFAULT_OUT = ROOT / 'public' / 'assets'

# src/engine/types.ts · src/story/assets.ts · src/story/cg.ts 와 맞출 것(검사·경고용)
CHARS = ('osana', 'tenko', 'koharu')
EXPRS = ('neutral', 'smile', 'fluster', 'shy', 'pout', 'sad')
KNOWN_LOOKS = {
    'osana': {('uniform', 'default'), ('yukata', 'default')},
    'tenko': {('uniform', 'default'), ('uniform', 'ponytail'), ('yukata', 'ponytail')},
    'koharu': {('uniform', 'default'), ('casual', 'default'), ('yukata', 'default')},
}
CG_IDS = ('kv', 'rain_osana', 'rain_tenko', 'door_osana', 'ramune_osana', 'fireworks_osana', 'homeward_osana',
          'cats_tenko', 'bench_tenko', 'selfie_tenko', 'shutter_tenko', 'polaroid_tenko',
          'kh_meet', 'kh_draw', 'kh_relay', 'kh_confession', 'kh_home', 'kh_date',
          # 여덟 엔딩 확장: 코덱스 제작 묶음을 그대로 복사했다. 이 스크립트로 변환하지 않는다
          'group_ice_four', 'group_ice_three', 'group_frog', 'group_rain',
          'end_akane_walk', 'end_hina_walk', 'end_koharu_coin', 'end_group_fireworks', 'end_group_morning')
# 파일이 있는 배경(BACKGROUNDS 중 color 만 쓰는 black 제외)
BG_IDS = ('title', 'road_morning', 'road_evening', 'road_rain', 'road_night', 'classroom_day', 'classroom_evening',
          'hallway', 'shoe_lockers', 'shoe_lockers_rain', 'courtyard', 'shotengai', 'riverbank_evening',
          'station_morning', 'apartment_door', 'shrine_steps', 'festival_street', 'riverbank_night', 'shrine_night',
          'kh_stationery', 'kh_lantern_lane',
          # 여덟 엔딩 확장: 코덱스 제작 묶음을 그대로 복사했다. 이 스크립트로 변환하지 않는다
          'bg_ice_shop', 'bg_after_rain')

EXT_RANK = {'.png': 0, '.webp': 1, '.jpg': 2, '.jpeg': 2}
ALLOWED_FORMATS = {'PNG', 'WEBP', 'JPEG'}
MAX_PIXELS = 50_000_000

SPRITE_W, SPRITE_H = 1600, 2400   # 작업 캔버스(원본 권장 크기)
SPRITE_OUT_H = 1800                # 저장 크기 기본값(세로). 가로는 2:3 비율로 1200
SPRITE_QUALITY = 82                # 스프라이트 WebP 품질 기본값(1800px 에서 88 과 눈으로 구분되지 않음)
HEAD_MARGIN = 0.05
CG_W, CG_H = 1920, 1080
THUMB_W, THUMB_H = 480, 270
SOLID_ALPHA = 128           # bbox·실루엣 판정 기준 알파
SPRITE_BUDGET_KB = 600      # docs/ASSETS.md 권장 상한

SPRITE_RE = re.compile(r'^([a-z]+)_([a-z]+)_([a-z]+)$')
CG_RE = re.compile(r'^[a-z0-9_]+$')

Image.MAX_IMAGE_PIXELS = MAX_PIXELS
warnings.simplefilter('error', Image.DecompressionBombWarning)


class ArtError(Exception):
    pass


# ---------------------------------------------------------------------------
# 입력 읽기
# ---------------------------------------------------------------------------

def load_image(path: Path) -> Image.Image:
    """업로드 파일을 '이미지로만' 연다. 형식·크기를 확인하고 EXIF 회전, sRGB 변환을 적용."""
    if path.is_symlink():
        raise ArtError('심볼릭 링크는 읽지 않습니다')
    if not path.is_file():
        raise ArtError('일반 파일이 아닙니다')
    try:
        with Image.open(path) as im:
            if im.format not in ALLOWED_FORMATS:
                raise ArtError(f'지원하지 않는 형식 {im.format}')
            if getattr(im, 'n_frames', 1) > 1:
                im.seek(0)  # 애니메이션이면 첫 프레임만
            im.load()
            im = ImageOps.exif_transpose(im)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as e:
        raise ArtError(f'이미지가 너무 큽니다({MAX_PIXELS:,}px 초과): {e}') from None
    except OSError as e:
        raise ArtError(f'이미지를 읽을 수 없습니다: {e}') from None
    return to_srgb(im)


def to_srgb(im: Image.Image) -> Image.Image:
    icc = im.info.get('icc_profile')
    if not icc:
        return im
    try:
        import io
        from PIL import ImageCms
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        name = ImageCms.getProfileDescription(src) or ''
        if 'srgb' in name.lower():
            return im
        mode = 'RGBA' if 'A' in im.getbands() else 'RGB'
        im = im.convert(mode)
        return ImageCms.profileToProfile(im, src, ImageCms.createProfile('sRGB'), outputMode=mode)
    except Exception:  # 프로파일이 깨졌으면 그대로 sRGB 로 간주
        return im


def to_rgba_array(im: Image.Image) -> np.ndarray:
    if im.mode in ('I;16', 'I;16B', 'I;16L', 'I', 'F'):
        a = np.asarray(im, dtype=np.float32)
        a = a / (257.0 if a.max() > 255 else 1.0)
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L')
    return np.array(im.convert('RGBA'), dtype=np.uint8)


def pick_files(folder: Path) -> tuple[dict[str, Path], list[str]]:
    """stem → 경로. 확장자 우선순위 적용. 경고 목록도 돌려준다."""
    found: dict[str, Path] = {}
    notes = []
    if not folder.is_dir():
        return found, notes
    for p in sorted(folder.iterdir()):
        ext = p.suffix.lower()
        if ext not in EXT_RANK:
            if not p.name.startswith('.'):
                notes.append(f'{p.name}: 이미지 확장자가 아니라 건너뜀')
            continue
        stem = p.stem.lower()
        if stem in found:
            keep, drop = sorted([found[stem], p], key=lambda q: EXT_RANK[q.suffix.lower()])
            notes.append(f'{stem}: {keep.name} 사용, {drop.name} 무시(png > webp > jpg)')
            found[stem] = keep
        else:
            found[stem] = p
    return found, notes


# ---------------------------------------------------------------------------
# numpy 도우미
# ---------------------------------------------------------------------------

def integral(x: np.ndarray) -> np.ndarray:
    """적분 영상(위·왼쪽 0 패딩)."""
    S = np.zeros((x.shape[0] + 1, x.shape[1] + 1), np.float64)
    S[1:, 1:] = np.cumsum(np.cumsum(x, axis=0, dtype=np.float64), axis=1)
    return S


def window_sum(S: np.ndarray, ys: np.ndarray, xs: np.ndarray, r: int) -> np.ndarray:
    """적분 영상 S 에서 (ys, xs) 중심 (2r+1)^2 창의 합(이미지 밖은 0)."""
    h, w = S.shape[0] - 1, S.shape[1] - 1
    y0, y1 = np.clip(ys - r, 0, h), np.clip(ys + r + 1, 0, h)
    x0, x1 = np.clip(xs - r, 0, w), np.clip(xs + r + 1, 0, w)
    return S[y1, x1] - S[y0, x1] - S[y1, x0] + S[y0, x0]


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    """4-이웃 팽창 r 회(마름모 반경 r)."""
    out = mask.copy()
    for _ in range(r):
        n = out.copy()
        n[1:, :] |= out[:-1, :]
        n[:-1, :] |= out[1:, :]
        n[:, 1:] |= out[:, :-1]
        n[:, :-1] |= out[:, 1:]
        out = n
    return out


def _spread_rows(mask: np.ndarray, seed: np.ndarray) -> np.ndarray:
    """각 행에서 seed 가 하나라도 있는 mask 연속 구간 전체를 채운다."""
    h, w = mask.shape
    m = np.zeros((h, w + 1), bool)
    m[:, :w] = mask
    s = np.zeros((h, w + 1), bool)
    s[:, :w] = seed & mask
    fm, fs = m.ravel(), s.ravel()
    starts = fm & ~np.concatenate(([False], fm[:-1]))
    run = np.where(fm, np.cumsum(starts), 0)
    hit = np.zeros(int(run.max()) + 1, bool)
    hit[run[fs]] = True
    hit[0] = False
    return hit[run].reshape(h, w + 1)[:, :w]


def flood(mask: np.ndarray, seed: np.ndarray) -> np.ndarray:
    """mask 안에서 seed 와 (4-이웃으로) 이어진 영역. 행/열 구간 전파를 수렴할 때까지 반복."""
    seed = seed & mask
    count = -1
    while True:
        seed = _spread_rows(mask, seed)
        seed = _spread_rows(mask.T, seed.T).T
        c = int(seed.sum())
        if c == count:
            return seed
        count = c


def flood_from_border(mask: np.ndarray) -> np.ndarray:
    """mask 중 이미지 네 가장자리와 이어진 영역."""
    seed = np.zeros_like(mask)
    seed[0, :] = seed[-1, :] = True
    seed[:, 0] = seed[:, -1] = True
    return flood(mask, seed)


def erode(mask: np.ndarray, r: int) -> np.ndarray:
    return ~dilate(~mask, r)


def alpha_bbox(alpha: np.ndarray, thr: int = SOLID_ALPHA):
    ys = np.flatnonzero((alpha >= thr).any(1))
    xs = np.flatnonzero((alpha >= thr).any(0))
    if len(ys) == 0:
        return None
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1


# ---------------------------------------------------------------------------
# 스프라이트: 배경 제거(대비책)
# ---------------------------------------------------------------------------

def remove_flat_background(rgba: np.ndarray):
    """불투명 이미지에서 가장자리와 이어진 단색 배경만 투명하게. (rgba, 배경색 or None, 메모) 반환.
    가장자리 색 보정(매트색 빼기·스필 억제)은 뒤의 defringe 가 이 배경색을 매트색으로 써서 한다."""
    rgb = rgba[..., :3].astype(np.float32)
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[:2].reshape(-1, 3), rgb[-2:].reshape(-1, 3),
                             rgb[:, :2].reshape(-1, 3), rgb[:, -2:].reshape(-1, 3)])
    q = (border // 16).astype(np.int32)
    keys = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    top = vals[np.argmax(counts)]
    frac = counts.max() / len(keys)
    if frac < 0.35:
        return rgba, None, [f'불투명 이미지인데 가장자리가 단색이 아님(최빈색 {frac:.0%}) → 배경 제거 생략']
    sample = border[keys == top]
    bg = np.median(sample, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))
    noise = float(np.percentile(np.sqrt(((sample - bg) ** 2).sum(-1)), 95))
    t_lo = max(10.0, noise * 1.5 + 4.0)
    t_hi = t_lo + 48.0
    cand = dist < t_lo
    bgmask = flood_from_border(cand)
    notes = []
    holes = cand & ~bgmask
    n_holes = int(holes.sum())
    chroma = float(bg.max() - bg.min()) >= 100  # 크로마키(#00B140 등) 처럼 채도 높은 배경색
    if chroma and n_holes:
        # 크로마키 색은 인물에 쓰일 일이 거의 없으므로 닫힌 틈(팔과 몸 사이, 머리카락 사이)도 지운다.
        # 단, 3x3 이상 덩어리에서 시작한 영역만(우연히 비슷한 낱개 화소는 남김).
        holes = flood(holes, erode(holes, 1))
        bgmask |= holes
        notes.append(f'가장자리와 닿지 않은 크로마키 영역 {int(holes.sum()):,}px 도 제거(팔·몸 사이 등)')
    elif n_holes > 0.001 * h * w:
        notes.append(f'가장자리와 닿지 않은 배경색 영역 {n_holes:,}px 남음(팔·몸 사이 등) — 원본에서 확인 필요')
    ring = dilate(bgmask, 3) & ~bgmask
    alpha = np.full((h, w), 255.0, np.float32)
    alpha[bgmask] = 0
    alpha[ring] = 255.0 * np.clip((dist[ring] - t_lo) / (t_hi - t_lo), 0, 1)
    out = rgba.copy()
    out[..., 3] = np.round(alpha).astype(np.uint8)
    notes.insert(0, f'불투명 원본 → 가장자리와 이어진 단색 배경 제거(배경색 #{int(bg[0]):02x}{int(bg[1]):02x}{int(bg[2]):02x}, '
                    f'{bgmask.mean():.0%} 투명화)')
    return out, bg, notes


# ---------------------------------------------------------------------------
# 스프라이트: 가장자리 번짐 완화
# ---------------------------------------------------------------------------

BAND_PX = 2     # 매트 제거·테두리 색조 보정 띠(바깥에서 안쪽으로 px)
SPILL_PX = 4    # 초록 번짐 억제 띠


def luma(c: np.ndarray) -> np.ndarray:
    return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


class EdgeModel:
    """실루엣 근처(바깥에서 SPILL_PX 이내) 화소만 골라, 각 화소의 '안쪽 깨끗한 색' E 를 구해 둔다.
    E = 띠에서 떨어진 불투명 화소(core)의 국소 평균(반경 4px, 없으면 10px). 계산은 띠 화소에서만 한다."""

    def __init__(self, rgba: np.ndarray):
        a = rgba[..., 3].astype(np.float32) / 255.0
        outside = a < 0.5
        semi = a < 1
        wide = (a > 0) & (semi | dilate(outside, SPILL_PX))
        self.ys, self.xs = np.nonzero(wide)
        ys, xs = self.ys, self.xs
        self.band = (semi | dilate(outside, BAND_PX))[ys, xs]
        self.band3 = (semi | dilate(outside, 3))[ys, xs]
        self.C = rgba[ys, xs, :3].astype(np.float32)
        self.a = a[ys, xs]
        core = ((a >= 0.99) & ~dilate(outside, BAND_PX + 1)).astype(np.float64)
        Ss = [integral(core)] + [integral(core * rgba[..., i]) for i in range(3)]
        n = len(ys)
        self.E = np.zeros((n, 3), np.float32)
        self.have = np.zeros(n, bool)
        for r in (4, 10):  # 가까운 안쪽 색을 우선, 없으면 더 넓게
            den = window_sum(Ss[0], ys, xs, r)
            ok = (den >= 3) & ~self.have
            for i in range(3):
                self.E[ok, i] = (window_sum(Ss[i + 1], ys[ok], xs[ok], r) / den[ok]).astype(np.float32)
            self.have |= ok

    def matte_stats(self):
        """반투명 화소로 매트색 최소제곱 통계(C - aE = (1-a)M). (합계 벡터, 표본) 반환."""
        sel = self.band & self.have & (self.a > 0.1) & (self.a < 0.9)
        A = self.a[sel][:, None].astype(np.float64)
        C, Ee = self.C[sel].astype(np.float64), self.E[sel].astype(np.float64)
        num = ((1 - A) * (C - A * Ee)).sum(0)
        den = float(((1 - A) ** 2).sum())
        return np.array([*num, den, np.abs(C - Ee).sum(), float(sel.sum())], np.float64), (C, A, Ee)

    def halo(self, C: np.ndarray | None = None) -> float:
        """가장자리 색 번짐 정도: 띠 화소가 '같은 밝기의 안쪽 색 음영'에서 벗어난 양(알파 가중 평균).
        회색·청록·초록 테두리는 크고, 안쪽 색조의 어두운 선화는 작다. 낮을수록 깨끗."""
        C = self.C if C is None else C
        sel = self.band & self.have & (self.a > 0.02)
        if not sel.any():
            return 0.0
        return float((np.abs(C[sel] - shade_of(self.E[sel], luma(C[sel]))).mean(-1) * self.a[sel]).mean())


def shade_of(E: np.ndarray, L: np.ndarray) -> np.ndarray:
    """안쪽 색 E 를 밝기 L 로 맞춘 음영(어두우면 곱해서, 밝으면 흰색 쪽으로)."""
    L = L[..., None]
    Le = np.maximum(luma(E), 1)[..., None]
    dark = E * (L / Le)
    light = E + (255 - E) * np.clip((L - Le) / np.maximum(255 - Le, 1), 0, 1)
    return np.clip(np.where(L <= Le, dark, light), 0, 255)


def estimate_matte(models: list[EdgeModel]):
    """묶음 전체에서 매트색 추정. 모델이 잔차를 25% 이상 줄이지 못하면 None."""
    tot = np.zeros(6)
    samples = []
    for m in models:
        s, smp = m.matte_stats()
        tot += s
        samples.append(smp)
    n = tot[5]
    if n < 500 or tot[3] <= 0:
        return None, '반투명 화소가 너무 적음'
    M = np.clip(tot[:3] / tot[3], 0, 255)
    r0 = tot[4] / (n * 3)
    r1 = sum(float(np.abs(C - (A * Ee + (1 - A) * M)).sum()) for C, A, Ee in samples) / (n * 3)
    if r1 > 0.75 * r0:
        return None, f'일관된 매트색 없음(잔차 {r0:.1f}→{r1:.1f})'
    return M, f'잔차 {r0:.1f}→{r1:.1f}'


def defringe(m: EdgeModel, rgba: np.ndarray, M: np.ndarray, strength: float = 1.0):
    """실루엣 가장자리 색 보정. 알파(실루엣 모양)는 바꾸지 않는다. (rgba, 보정 후 띠 색, 고친 화소 수)

    1) 반투명 화소: premultiply 모델 C = aF + (1-a)M 로 매트색을 빼서 F 를 되돌린다(Remove Matte).
       알파가 아주 낮으면 나눗셈이 불안정하므로 안쪽 색 E 쪽으로 섞는다.
    2) 바로 안쪽 불투명 화소(BAND_PX 이내): 매트가 섞여 회색·청록으로 탁해진 테두리를, 밝기는 그대로 두고
       색조만 안쪽 색 E 의 같은 밝기 음영으로 바꾼다(선화의 어두운 외곽선은 유지, 회색·초록 기만 제거).
       E 가 매트색과 비슷하거나(어두운 옷) 화소 색이 M–E 혼합선에서 멀면(따로 그려진 색) 약하게만.
    3) 초록 번짐 억제(SPILL_PX 띠):
       · 화소의 '초록 치우침'(G - (R+B)/2)이 안쪽 색 E 보다 크면 그 초과분만 G 에서 뺀다
         (남색 소매의 청록 테두리 등. E 자체가 초록이면 초과분이 없어 그대로).
       · 매트가 채도 높은 색(크로마키 #00B140 등)이면 그 채널이 다른 두 채널을 넘지 않게 누른다(3px 띠).
    """
    M = np.asarray(M, np.float32)
    C, a, E, have = m.C, m.a[:, None], m.E, m.have
    out = C.copy()
    # 1) 반투명: 매트 제거
    semi = m.band & have & (m.a < 1)
    F = np.clip((C - (1 - a) * M) / np.maximum(a, 1e-3), 0, 255)
    w = np.clip((a - 0.1) / 0.3, 0, 1)            # a<0.1 이면 E, 0.4 이상이면 F
    F = w * F + (1 - w) * E
    k1 = (semi * strength)[:, None]
    out = out * (1 - k1) + F * k1
    # 2) 불투명 테두리: 같은 밝기의 E 음영으로
    v = E - M
    vn2 = (v * v).sum(-1)
    vn = np.sqrt(vn2)
    beta = np.clip(((C - M) * v).sum(-1) / np.maximum(vn2, 1e-6), 0, 1)
    perp = np.sqrt(np.maximum(((C - M - beta[:, None] * v) ** 2).sum(-1), 0))
    conf = np.clip((vn - 40) / 60, 0, 1) * np.clip(1 - perp / (0.25 * vn + 20), 0, 1) * strength
    rim = m.band & have & (m.a >= 1)
    k2 = np.where(rim, conf, 0)[:, None]
    out = out * (1 - k2) + shade_of(E, luma(C)) * k2
    # 3) 초록 번짐
    gx = out[:, 1] - (out[:, 0] + out[:, 2]) / 2
    ge = E[:, 1] - (E[:, 0] + E[:, 2]) / 2
    out[:, 1] -= np.where(have, np.clip(gx - ge, 0, None), 0)
    k = int(np.argmax(M))
    others = [i for i in range(3) if i != k]
    if M[k] - M[others].max() >= 60:
        lim = out[:, others].max(-1)
        e_own = have & (E[:, k] > E[:, others].max(-1) + 10)
        sel = m.band3 & ~e_own & (out[:, k] > lim)
        out[:, k] = np.where(sel, lim, out[:, k])
    out = np.clip(out, 0, 255)
    res = rgba.copy()
    q = np.round(out).astype(np.uint8)
    res[m.ys, m.xs, :3] = q
    res[..., 3][res[..., 3] < 3] = 0  # 보이지 않는 먼지 알파 정리
    touched = int((np.abs(q.astype(np.int16) - np.round(C).astype(np.int16)).max(-1) > 2).sum())
    return res, out, touched


# ---------------------------------------------------------------------------
# 스프라이트: 캔버스 맞춤
# ---------------------------------------------------------------------------

def fit_transform(bbox, src_h):
    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0, y1 - y0
    top = SPRITE_H * HEAD_MARGIN
    s = min((SPRITE_H - top) / bh, SPRITE_W / bw)
    th = bh * s
    touches_bottom = y1 >= src_h - 1
    oy = SPRITE_H - th if touches_bottom else top  # 잘린 반신이면 아래에 붙인다(머리 위 여백 ≥ 5%)
    ox = (SPRITE_W - bw * s) / 2
    return s, ox, oy


def sprite_out_size(height: int) -> tuple[int, int]:
    """저장 크기: 작업 캔버스(2:3)를 세로 height 로 같은 비율 축소. 작업 캔버스보다 키우지는 않는다."""
    h = max(1, min(int(height), SPRITE_H))
    return (round(SPRITE_W * h / SPRITE_H), h)


def apply_transform(rgba: np.ndarray, bbox, s, ox, oy) -> np.ndarray:
    x0, y0, x1, y1 = bbox
    im = Image.fromarray(rgba, 'RGBA')
    # 화소 격자에 맞추기 위해 목적지 정수 위치에서 역산한 소스 박스로 리샘플(RGBA 는 Pillow 가 premultiply 후 보간)
    dx0, dy0 = int(np.floor(ox)), int(np.floor(oy))
    dx1, dy1 = int(np.ceil(ox + (x1 - x0) * s)), int(np.ceil(oy + (y1 - y0) * s))
    dx0, dy0, dx1, dy1 = max(dx0, 0), max(dy0, 0), min(dx1, SPRITE_W), min(dy1, SPRITE_H)
    sb = (x0 + (dx0 - ox) / s, y0 + (dy0 - oy) / s, x0 + (dx1 - ox) / s, y0 + (dy1 - oy) / s)
    part = im.resize((dx1 - dx0, dy1 - dy0), Image.LANCZOS, box=sb)
    canvas = Image.new('RGBA', (SPRITE_W, SPRITE_H), (0, 0, 0, 0))
    canvas.paste(part, (dx0, dy0))
    return np.array(canvas)


# ---------------------------------------------------------------------------
# 저장
# ---------------------------------------------------------------------------

_UMASK = os.umask(0)
os.umask(_UMASK)


def save_webp(img: Image.Image, dest: Path, dry_run: bool = False, **params) -> int:
    """WebP 로 저장(임시 파일 → 이름 바꾸기). dry_run 이면 메모리에만 인코딩해 크기만 돌려준다."""
    if dry_run:
        import io
        buf = io.BytesIO()
        img.save(buf, 'WEBP', method=6, **params)
        return buf.tell()
    dest.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.import-', suffix='.webp', dir=dest.parent)
    os.close(fd)
    try:
        img.save(tmp, 'WEBP', method=6, **params)
        os.chmod(tmp, 0o666 & ~_UMASK)  # mkstemp 는 0600 으로 만든다 → 일반 파일 권한으로
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return dest.stat().st_size


# ---------------------------------------------------------------------------
# 작업 단위
# ---------------------------------------------------------------------------

def process_sprite_group(char, outfit, hair, items, out_dir, opts):
    """한 의상·헤어 묶음(표정 여러 장). items: [(expr, Path)]"""
    res = {'kind': 'char', 'group': f'{char}/{outfit}_{hair}', 'files': [], 'warn': [], 'info': [], 'errors': []}
    loaded = []
    for expr, path in items:
        try:
            rgba = to_rgba_array(load_image(path))
        except ArtError as e:
            res['errors'].append(f'{path.name}: {e}')
            continue
        notes, matte = [], None
        a = rgba[..., 3]
        if np.mean(a < 250) < 0.005:
            rgba, matte, notes = remove_flat_background(rgba)
        loaded.append({'expr': expr, 'path': path, 'rgba': rgba, 'notes': notes, 'matte': matte,
                       'src_size': (rgba.shape[1], rgba.shape[0])})
    if not loaded:
        return res

    # 1) 번짐 완화: 배경을 직접 지운 그림은 그 배경색, 나머지는 묶음 전체에서 추정한 매트색
    for x in loaded:
        x['model'] = EdgeModel(x['rgba'])
        x['halo_before'] = x['model'].halo()
    M_est, why = None, '꺼짐'
    if opts.defringe:
        rest = [x['model'] for x in loaded if x['matte'] is None]
        M_est, why = estimate_matte(rest) if rest else (None, '')
        if M_est is not None:
            res['info'].append(f'가장자리 매트색 #{int(M_est[0]):02x}{int(M_est[1]):02x}{int(M_est[2]):02x} '
                               f'(묶음 추정, {why}) 기준으로 번짐 보정')
        elif rest:
            res['info'].append(f'가장자리 번짐 보정 생략: {why}')
    else:
        res['info'].append('가장자리 번짐 보정 꺼짐(--no-defringe)')
    for x in loaded:
        m = x.pop('model')
        M = (x['matte'] if x['matte'] is not None else M_est) if opts.defringe else None
        if M is not None:
            x['rgba'], fixed_colours, x['fixed_px'] = defringe(m, x['rgba'], M, opts.defringe_strength)
            x['halo_after'] = m.halo(fixed_colours)
        else:
            x['fixed_px'] = 0
            x['halo_after'] = x['halo_before']
        del m

    # 2) 캔버스 맞춤(원본 크기별로 묶음 bbox 합집합 → 같은 변환)
    by_size: dict[tuple, list] = {}
    for x in loaded:
        by_size.setdefault(x['src_size'], []).append(x)
    if len(by_size) > 1:
        sizes = ', '.join(f'{w}x{h}({len(v)}장)' for (w, h), v in by_size.items())
        res['warn'].append(f'원본 크기가 섞여 있음: {sizes} — 크기별로 따로 맞추므로 표정 간 위치가 어긋날 수 있음')
    for size, xs in by_size.items():
        if size == (SPRITE_W, SPRITE_H):
            continue
        boxes = [alpha_bbox(x['rgba'][..., 3], 8) for x in xs]
        boxes = [b for b in boxes if b]
        if not boxes:
            continue
        u = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        s, ox, oy = fit_transform(u, size[1])
        res['warn'].append(f'{len(xs)}장 원본 {size[0]}x{size[1]} → {SPRITE_W}x{SPRITE_H} 캔버스에 맞춤'
                           f'(배율 {s:.3f}, 머리 위 {oy / SPRITE_H:.1%})')
        if s > 1.0:
            res['warn'].append(f'원본이 작아 {s:.2f}배 확대됨 — 흐릿할 수 있음(세로 2400px 이상 권장)')
        if u[1] <= 0:
            res['warn'].append('원본에서 머리 위가 잘려 있을 수 있음(불투명 영역이 위쪽 끝에 닿음)')
        for x in xs:
            x['rgba'] = apply_transform(x['rgba'], u, s, ox, oy)

    # 3) 저장(캔버스 전체를 같은 비율로 줄임) + bbox 비교(작업 캔버스 기준)
    out_dim = sprite_out_size(opts.sprite_height)
    ref = next((x for x in loaded if x['expr'] == 'neutral'), loaded[0])
    ref_box = alpha_bbox(ref['rgba'][..., 3])
    for x in loaded:
        box = alpha_bbox(x['rgba'][..., 3])
        dest = out_dir / 'char' / char / f'{outfit}_{hair}_{x["expr"]}.webp'
        img = Image.fromarray(x['rgba'], 'RGBA')
        if out_dim != (SPRITE_W, SPRITE_H):
            img = img.resize(out_dim, Image.LANCZOS)  # RGBA 는 Pillow 가 premultiply 후 보간(가장자리 번짐 없음)
        size = save_webp(img, dest, opts.dry_run, quality=opts.quality,
                         alpha_quality=opts.alpha_quality, exact=False)
        diff = int((np.abs(x['rgba'][..., 3].astype(np.int16) - ref['rgba'][..., 3].astype(np.int16)) > 64).sum())
        if box != ref_box and x is not ref:
            d = [b - r for b, r in zip(box, ref_box)] if box and ref_box else None
            res['warn'].append(f'bbox 불일치 {x["expr"]} vs {ref["expr"]}: {box} vs {ref_box} '
                               f'(Δx0,y0,x1,y1={d}) — 표정 교체 시 흔들릴 수 있음')
        if size > SPRITE_BUDGET_KB * 1024:
            res['warn'].append(f'{dest.name} {size / 1024:.0f}KB — 권장 {SPRITE_BUDGET_KB}KB 초과')
        res['files'].append({'dest': dest, 'size': size, 'src': x['path'].name, 'dim': out_dim,
                             'bbox': box, 'sil_diff': diff, 'halo': (x['halo_before'], x['halo_after']),
                             'fixed_px': x['fixed_px'], 'notes': x['notes']})
        for n in x['notes']:
            res['warn'].append(f'{x["path"].name}: {n}')
    if ref_box:
        top = ref_box[1] / SPRITE_H
        if not 0.02 <= top <= 0.10:
            res['warn'].append(f'머리 위 여백 {top:.1%} (권장 약 5%)')
    return res


def process_cg(cg_id, path, out_dir, opts, kind='cg'):
    """이벤트 CG(kind='cg') 또는 배경(kind='bg'): 1920x1080 RGB 로 맞추고 480x270 썸네일을 함께 쓴다.
    배경 썸네일은 scripts/bg-thumbs.py 와 같은 크기·방식(LANCZOS, reducing_gap 3, 품질 80, method 6)."""
    res = {'kind': kind, 'group': f'{kind}/{cg_id}', 'files': [], 'warn': [], 'info': [], 'errors': []}
    try:
        im = load_image(path)
    except ArtError as e:
        res['errors'].append(f'{path.name}: {e}')
        return res
    if 'A' in im.getbands() or im.mode in ('P', 'LA', 'RGBa'):
        rgba = im.convert('RGBA')
        if rgba.getextrema()[3][0] < 255:
            res['warn'].append(f'{path.name}: 투명 영역이 있어 검은색 위에 합성함')
        bg = Image.new('RGBA', rgba.size, (0, 0, 0, 255))
        bg.alpha_composite(rgba)
        im = bg
    im = im.convert('RGB')
    w, h = im.size
    if (w, h) != (CG_W, CG_H):
        s = max(CG_W / w, CG_H / h)
        cw, ch = CG_W / s, CG_H / s
        box = ((w - cw) / 2, (h - ch) / 2, (w + cw) / 2, (h + ch) / 2)
        if abs((w / h) / (CG_W / CG_H) - 1) > 0.01:
            res['warn'].append(f'{path.name}: 비율 {w}x{h} ≠ 16:9 → 가운데를 잘라 맞춤')
        if s > 1.0:
            res['warn'].append(f'{path.name}: 원본이 작아 {s:.2f}배 확대됨')
        im = im.resize((CG_W, CG_H), Image.LANCZOS, box=box)
    thumb = im.resize((THUMB_W, THUMB_H), Image.LANCZOS, reducing_gap=3.0)
    dest = out_dir / kind / f'{cg_id}.webp'
    tdest = out_dir / kind / 'thumb' / f'{cg_id}.webp'
    size = save_webp(im, dest, opts.dry_run, quality=opts.bg_quality if kind == 'bg' else opts.cg_quality)
    tsize = save_webp(thumb, tdest, opts.dry_run, quality=opts.thumb_quality)
    res['files'].append({'dest': dest, 'size': size, 'src': path.name, 'dim': (CG_W, CG_H)})
    res['files'].append({'dest': tdest, 'size': tsize, 'src': path.name, 'dim': (THUMB_W, THUMB_H), 'thumb': True})
    return res


# ---------------------------------------------------------------------------
# 입력 수집
# ---------------------------------------------------------------------------

def collect(src: Path, only: str | None):
    jobs, notes = [], []
    if only in (None, 'char'):
        for char in CHARS:
            folder = src / 'char' / char
            if not folder.is_dir() and (src / char).is_dir():
                folder = src / char
                notes.append(f'{char}: {src / char} 사용(권장 위치는 {src / "char" / char})')
            files, n = pick_files(folder)
            notes += [f'char/{char}/{m}' for m in n]
            groups: dict[tuple, list] = {}
            for stem, p in files.items():
                mt = SPRITE_RE.match(stem)
                if not mt:
                    notes.append(f'char/{char}/{p.name}: 이름이 {{outfit}}_{{hair}}_{{expr}} 규칙과 다름 → 건너뜀')
                    continue
                outfit, hair, expr = mt.groups()
                if expr not in EXPRS:
                    notes.append(f'char/{char}/{p.name}: 알 수 없는 표정 {expr!r} (허용: {" ".join(EXPRS)}) → 건너뜀')
                    continue
                groups.setdefault((outfit, hair), []).append((expr, p))
            for (outfit, hair), items in sorted(groups.items()):
                if (outfit, hair) not in KNOWN_LOOKS[char]:
                    notes.append(f'{char}/{outfit}_{hair}: src/story/assets.ts looks 에 없는 조합(변환은 함)')
                have = {e for e, _ in items}
                missing = [e for e in EXPRS if e not in have]
                if missing:
                    notes.append(f'{char}/{outfit}_{hair}: 표정 누락 {" ".join(missing)}')
                items.sort(key=lambda t: EXPRS.index(t[0]))
                jobs.append(('char', (char, outfit, hair, items)))
            for outfit, hair in sorted(KNOWN_LOOKS[char] - set(groups)):
                if files or folder.is_dir():
                    notes.append(f'{char}/{outfit}_{hair}: 입력 없음')
    if only in (None, 'cg'):
        files, n = pick_files(src / 'cg')
        notes += [f'cg/{m}' for m in n]
        for stem, p in sorted(files.items()):
            if not CG_RE.match(stem):
                notes.append(f'cg/{p.name}: 이름 규칙([a-z0-9_]) 위반 → 건너뜀')
                continue
            if stem not in CG_IDS:
                notes.append(f'cg/{p.name}: src/story/cg.ts 에 없는 id(변환은 함)')
            jobs.append(('cg', (stem, p)))
        if files:
            missing = [c for c in CG_IDS if c not in files]
            if missing:
                notes.append(f'cg: 입력 없음 {" ".join(missing)}')
    if only in (None, 'bg'):
        # 배경은 일부만 고쳐 넣는 일이 보통이라 빠진 id 는 알리지 않는다
        files, n = pick_files(src / 'bg')
        notes += [f'bg/{m}' for m in n]
        for stem, p in sorted(files.items()):
            if not CG_RE.match(stem):
                notes.append(f'bg/{p.name}: 이름 규칙([a-z0-9_]) 위반 → 건너뜀')
                continue
            if stem not in BG_IDS:
                notes.append(f'bg/{p.name}: src/story/assets.ts BACKGROUNDS 에 없는 id(변환은 함, '
                             'types.ts BgId·assets.ts 에 등록 필요)')
            jobs.append(('bg', (stem, p)))
    return jobs, notes


def run_job(job, out_dir, opts):
    kind, args = job
    if kind == 'char':
        return process_sprite_group(*args, out_dir, opts)
    return process_cg(*args, out_dir, opts, kind=kind)


def kb(n: int) -> str:
    return f'{n / 1024:,.0f} KB' if n < 1024 * 1024 else f'{n / 1024 / 1024:,.2f} MB'


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='최종 스프라이트·CG·배경을 게임용 WebP 로 변환')
    ap.add_argument('--src', type=Path, default=DEFAULT_SRC, help=f'입력 폴더(기본 {DEFAULT_SRC})')
    ap.add_argument('--out', type=Path, default=DEFAULT_OUT, help=f'출력 폴더(기본 {DEFAULT_OUT})')
    ap.add_argument('--only', choices=('char', 'cg', 'bg'), help='한 종류만 처리')
    ap.add_argument('--quality', type=int, default=SPRITE_QUALITY, help=f'스프라이트 WebP 품질(기본 {SPRITE_QUALITY})')
    ap.add_argument('--sprite-height', type=int, default=SPRITE_OUT_H,
                    help=f'스프라이트 저장 세로 크기(기본 {SPRITE_OUT_H}, 가로는 2:3). {SPRITE_H} 이면 줄이지 않음')
    ap.add_argument('--alpha-quality', type=int, default=90, help='스프라이트 알파 품질(기본 90)')
    ap.add_argument('--cg-quality', type=int, default=85, help='CG WebP 품질(기본 85)')
    ap.add_argument('--bg-quality', type=int, default=82, help='배경 WebP 품질(기본 82)')
    ap.add_argument('--thumb-quality', type=int, default=80, help='CG·배경 썸네일 품질(기본 80)')
    ap.add_argument('--no-defringe', dest='defringe', action='store_false', help='가장자리 번짐 보정 끄기')
    ap.add_argument('--defringe-strength', type=float, default=1.0, help='번짐 보정 세기 0~1(기본 1)')
    ap.add_argument('-j', '--jobs', type=int, default=min(4, os.cpu_count() or 1), help='병렬 작업 수')
    ap.add_argument('--dry-run', action='store_true', help='처리·검사만 하고 파일은 쓰지 않음(크기는 메모리 인코딩으로 계산)')
    ap.add_argument('--strict', action='store_true', help='경고가 있으면 종료 코드 1')
    opts = ap.parse_args(argv)

    src, out_dir = opts.src.resolve(), opts.out.resolve()
    if not src.is_dir():
        print(f'입력 폴더가 없습니다: {src}', file=sys.stderr)
        return 2
    jobs, notes = collect(src, opts.only)
    print(f'입력 {src}\n출력 {out_dir}{"  (dry-run: 쓰지 않음)" if opts.dry_run else ""}')
    if not jobs:
        print('처리할 파일이 없습니다.')
        for n in notes:
            print(f'  ! {n}')
        return 1

    t0 = time.time()
    results = []
    with cf.ProcessPoolExecutor(max_workers=max(1, opts.jobs)) as ex:
        futs = {ex.submit(run_job, j, out_dir, opts): j for j in jobs}
        for f in cf.as_completed(futs):
            try:
                results.append(f.result())
            except Exception as e:  # 한 묶음 실패가 전체를 멈추지 않게
                j = futs[f]
                results.append({'kind': j[0], 'group': str(j[1][:3] if j[0] == 'char' else j[1][0]), 'files': [],
                                'warn': [], 'info': [], 'errors': [f'{type(e).__name__}: {e}']})
    results.sort(key=lambda r: (r['kind'] != 'char', r['group']))

    def rel(p: Path) -> str:
        try:
            return str(p.relative_to(ROOT))
        except ValueError:
            return str(p)

    tot = {'char': [0, 0], 'cg': [0, 0], 'bg': [0, 0], 'thumb': [0, 0]}
    warns, errors = [], []
    for r in results:
        print(f'\n[{r["group"]}]')
        for i in r['info']:
            print(f'  · {i}')
        for f in r['files']:
            key = 'thumb' if f.get('thumb') else r['kind']
            tot[key][0] += 1
            tot[key][1] += f['size']
            extra = ''
            if r['kind'] == 'char':
                b = f['bbox']
                hb, ha = f['halo']
                extra = (f'  머리꼭대기 y={b[1]} bbox x{b[0]}–{b[2]} y{b[1]}–{b[3]}'
                         f'  가장자리 번짐 {hb:.1f}→{ha:.1f}'
                         + (f'  neutral 대비 실루엣Δ {f["sil_diff"]}px' if f['sil_diff'] else ''))
            print(f'  {rel(f["dest"]):58s} {f["dim"][0]}x{f["dim"][1]:<5d} {kb(f["size"]):>9s}  ← {f["src"]}{extra}')
        warns += [f'{r["group"]}: {w}' for w in r['warn']]
        errors += [f'{r["group"]}: {e}' for e in r['errors']]

    print('\n요약')
    print(f'  스프라이트 {tot["char"][0]}장 {kb(tot["char"][1])}'
          + (f' (평균 {kb(tot["char"][1] // tot["char"][0])})' if tot['char'][0] else ''))
    print(f'  CG {tot["cg"][0]}장 {kb(tot["cg"][1])}, 배경 {tot["bg"][0]}장 {kb(tot["bg"][1])}, '
          f'썸네일 {tot["thumb"][0]}장 {kb(tot["thumb"][1])}')
    print(f'  총 {sum(v[0] for v in tot.values())}개 파일 {kb(sum(v[1] for v in tot.values()))}  ({time.time() - t0:.1f}s)')
    for n in notes:
        print(f'  ! {n}')
    for w in warns:
        print(f'  ! {w}')
    for e in errors:
        print(f'  ✗ {e}', file=sys.stderr)
    if errors:
        return 1
    return 1 if (opts.strict and (warns or notes)) else 0


if __name__ == '__main__':
    sys.exit(main())
