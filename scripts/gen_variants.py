"""生成 OCR 预处理对照素材。
1. public/samples/wechat-ocr-demo-enhanced.png —— 灰度(YIQ 权重 0.299/0.587/0.114) + 二值化(阈值 200)，
   与 src/lib/parser.ts 的 enhanceScreenshot 逐像素同一算法（本图宽 1528≥1000，不放大），
   供 scripts/measure-metrics.ts 测量"浏览器实际输入给 Tesseract 的图"。
2. $env:TEMP/ocr-exp/variant_*.png —— 预处理消融变体，供 scripts/ocr-experiment.mjs 对照实验。
运行：python scripts/gen_variants.py（依赖 pillow，仅开发期使用）
"""
import os
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'samples', 'wechat-ocr-demo.png')
OUT = os.path.join(os.environ['TEMP'], 'ocr-exp')
os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC)
print('source size:', img.size)

gray = ImageOps.grayscale(img)

# 1) 提交到仓库的规范增强图（阈值 200，与浏览器一致）
enhanced = gray.point(lambda p: 0 if p < 200 else 255)
enhanced_path = os.path.join(ROOT, 'public', 'samples', 'wechat-ocr-demo-enhanced.png')
enhanced.save(enhanced_path)
print('saved', enhanced_path, enhanced.size)

# 2) 消融实验变体：放大 × 阈值，含不做二值化的原始灰度
variants = {}
for scale in (1.0, 1.5):
    w = round(gray.width * scale)
    h = round(gray.height * scale)
    resized = gray.resize((w, h), Image.LANCZOS)
    for threshold in (190, 200, 210):
        variants[f's{scale}_t{threshold}'] = resized.point(lambda p, t=threshold: 0 if p < t else 255)
    variants[f's{scale}_raw'] = resized

for name, im in variants.items():
    target = os.path.join(OUT, f'variant_{name}.png')
    im.save(target)
    print('saved', target, im.size)
