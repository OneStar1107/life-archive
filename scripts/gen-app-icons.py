#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
「人生档案」App 启动图标生成器。

为什么用代码画而不是生图模型：
  启动图标有硬性几何约束（主体必须落在中心 66% 安全区内、边缘必须铺满不透明、
  48px 下仍要能辨认）。生图模型不保证这些，代码绘制可以一次画对并且可重复重建。

产物：
  frontend/static/app-icon-source.png      1024x1024 源图（入 git，是唯一真源）
  frontend/unpackage/res/icons/*.png       各密度产物（unpackage 被 gitignore，不入 git）

用法：
  python scripts/gen-app-icons.py
  python scripts/gen-app-icons.py --manifest-only   # 只改 manifest，不重新画图

依赖：Pillow（pip install pillow）
"""

import argparse
import json
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.stderr.write(
        "缺少 Pillow。请先安装：\n"
        "  <venv>/Scripts/python.exe -m pip install pillow\n"
    )
    raise SystemExit(2)

# ── 画布 ────────────────────────────────────────────────────────────────
SS = 4              # 超采样倍率：先按 4096 画，再降回 1024，换取干净的抗锯齿
BASE = 1024
SIZE = BASE * SS


def s(v: float) -> float:
    """1024 坐标系 → 超采样坐标系。"""
    return v * SS


# ── 配色（取自 frontend/theme.json，深色主题一侧）─────────────────────
BG_TOP = (10, 37, 50)        # #0A2532
BG_BOTTOM = (18, 63, 84)     # #123F54
HIGHLIGHT = (42, 110, 143)   # #2A6E8F  左上柔光
GLACIER = (127, 212, 242)    # #7FD4F2  --color-glacier-light
GLACIER_MID = (79, 176, 217) # #4FB0D9  --color-glacier


# ── 图元 ────────────────────────────────────────────────────────────────
CARD = (312, 300, 712, 752)          # 卡片外框（1024 坐标系）
CARD_RADIUS = 64
NODE_TOP = (512, 300, 48)            # (cx, cy, r) 顶部节点 —— 压在卡片上沿，形成「破框生长」
NODE_L = (410, 570, 36)
NODE_R = (614, 600, 32)
BAR = (430, 690, 594, 706)           # 卡片底部基线（代表档案封底）
BAR_RADIUS = 8
LINK_WIDTH = 24
CARD_FILL = (255, 255, 255, 18)
CARD_OUTLINE = (255, 255, 255, 51)
LINK_COLOR = (255, 255, 255, 82)
BAR_COLOR = (255, 255, 255, 46)


def draw_icon() -> "Image.Image":
    """画 1024x1024 的源图（内部按 4096 超采样）。"""
    # 1) 背景：垂直渐变
    grad = Image.linear_gradient("L").resize((1, SIZE))
    top_layer = Image.new("RGB", (1, 1), BG_TOP).resize((SIZE, SIZE))
    bottom_layer = Image.new("RGB", (1, 1), BG_BOTTOM).resize((SIZE, SIZE))
    # composite(image1, image2, mask): mask=0 → image2(顶色)，mask=255 → image1(底色)
    img = Image.composite(bottom_layer, top_layer, grad.resize((SIZE, SIZE)))

    # 2) 左上柔光：让深色底不至于死板。
    #    注意：不能用 Image.radial_gradient 直接放大裁剪 —— 它在图边缘衰减不到 0，
    #    裁剪窗口会切出方形硬边（首轮实测踩到）。这里改为在低分辨率上逐像素
    #    写一个真正衰减到 0 的径向 mask，再放大叠加（柔光是低频的，无损观感）。
    MS = 512
    mask = Image.new("L", (MS, MS))
    cx, cy, radius, peak = 0.28 * MS, 0.18 * MS, 0.62 * MS, 90
    mask.putdata([
        max(0, int(peak * (1.0 - ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / radius)))
        for y in range(MS) for x in range(MS)
    ])
    mask = mask.resize((SIZE, SIZE), Image.BILINEAR)
    img = Image.composite(
        Image.new("RGB", (SIZE, SIZE), HIGHLIGHT), img, mask
    )

    img = img.convert("RGBA")
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # 3) 档案卡片（在节点之下，所以后画的节点会压在它上面）
    d.rounded_rectangle(
        [s(CARD[0]), s(CARD[1]), s(CARD[2]), s(CARD[3])],
        radius=s(CARD_RADIUS),
        fill=CARD_FILL,
        outline=CARD_OUTLINE,
        width=s(6),
    )

    # 4) 图谱连线（三条边：顶—左、顶—右、左—右）
    for a, b in ((NODE_TOP, NODE_L), (NODE_TOP, NODE_R), (NODE_L, NODE_R)):
        d.line(
            [s(a[0]), s(a[1]), s(b[0]), s(b[1])],
            fill=LINK_COLOR,
            width=s(LINK_WIDTH),
        )

    # 5) 节点
    for (cx, cy, r), color in (
        (NODE_TOP, GLACIER),
        (NODE_L, GLACIER_MID),
        (NODE_R, GLACIER_MID),
    ):
        d.ellipse(
            [s(cx - r), s(cy - r), s(cx + r), s(cy + r)],
            fill=color + (255,),
            outline=(255, 255, 255, 64),
            width=s(3),
        )

    # 6) 底部基线条
    d.rounded_rectangle(
        [s(BAR[0]), s(BAR[1]), s(BAR[2]), s(BAR[3])],
        radius=s(BAR_RADIUS),
        fill=BAR_COLOR,
    )

    img = Image.alpha_composite(img, layer)
    return img.resize((BASE, BASE), Image.LANCZOS)


# ── 产物尺寸 ────────────────────────────────────────────────────────────
# 键名对应 manifest.json → app-plus.distribute.icons.android.*
ANDROID_DENSITIES = {
    "ldpi": 36,
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
# 顺带产出几个常用尺寸，方便以后做 iOS / 商店素材时直接取用
EXTRA_SIZES = (512, 1024)


def emit(img: "Image.Image", root: str) -> None:
    src_dir = os.path.join(root, "frontend", "static")
    out_dir = os.path.join(root, "frontend", "unpackage", "res", "icons")
    os.makedirs(src_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    src_path = os.path.join(src_dir, "app-icon-source.png")
    img.save(src_path)
    print("  源图  %s (1024x1024)" % os.path.relpath(src_path, root))

    for name, px in ANDROID_DENSITIES.items():
        p = os.path.join(out_dir, "%dx%d.png" % (px, px))
        img.resize((px, px), Image.LANCZOS).save(p)
    for px in EXTRA_SIZES:
        p = os.path.join(out_dir, "%dx%d.png" % (px, px))
        img.resize((px, px), Image.LANCZOS).save(p)
    print("  产物  %s (%d 个尺寸)" % (
        os.path.relpath(out_dir, root), len(ANDROID_DENSITIES) + len(EXTRA_SIZES)))


def update_manifest(root: str) -> None:
    """把 icons 节点替换成指向产物的路径。

    用手写括号配对而不是 json.load/dump：后者会重排整个文件（空对象写法、
    数组换行全部改变），diff 会大到没法 review。
    """
    path = os.path.join(root, "frontend", "manifest.json")
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    key = '"icons"'
    i = text.find(key)
    if i < 0:
        raise SystemExit("manifest.json 里找不到 %s 节点" % key)
    start = text.index("{", i)
    depth = 0
    end = -1
    for j in range(start, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    if end < 0:
        raise SystemExit("manifest.json 的 icons 节点括号不配对")

    android = ",\n".join(
        '\t\t\t\t\t"%s": "unpackage/res/icons/%dx%d.png"' % (n, p, p)
        for n, p in ANDROID_DENSITIES.items()
    )
    # iOS 这次不填：键名结构（iphone/ipad/appstore 嵌套）未经真机验证，
    # 填错反而会让云打包报「配置错误」。等 iOS 端真要做时再补。
    # 缩进用 tab（HBuilderX 保存时会整文件重写为 tab，保持一致避免 diff 噪音）。
    new_block = (
        '"icons": {\n'
        '\t\t\t\t"android": {\n'
        '%s\n'
        '\t\t\t\t},\n'
        '\t\t\t\t"ios": {}\n'
        '\t\t\t}' % android
    )

    text = text[:i] + new_block + text[end:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)

    # 顺手校验一遍，避免手改写出非法 JSON
    with open(path, "r", encoding="utf-8") as f:
        json.load(f)
    print("  清单  frontend/manifest.json → icons.android 已写入 %d 个密度"
          % len(ANDROID_DENSITIES))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest-only", action="store_true",
                    help="只更新 manifest.json，不重新生成图片")
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print("生成「人生档案」App 图标（项目根：%s）" % root)
    if not args.manifest_only:
        img = draw_icon()
        emit(img, root)
    update_manifest(root)
    print("完成。")


if __name__ == "__main__":
    main()
