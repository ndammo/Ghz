#!/usr/bin/env python3
"""
compress.py — Сжатие всех PNG изображений проекта
Запуск в Termux: python3 compress.py

Требует: pip install Pillow
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Устанавливаю Pillow...")
    os.system("pip install Pillow --break-system-packages -q")
    from PIL import Image

# ── Настройки ──
PROJECT_DIR  = "."          # папка проекта (где лежит index.html)
MAX_SIZE_PX  = 512          # макс размер стороны для иконок (pixr.png, gram.png и т.д.)
SPRITE_MAX   = 2048         # макс размер для спрайтов (spritesheets)
PNG_OPTIMIZE = True
QUALITY      = 85           # для jpg если вдруг встретится

SKIP_DIRS = {'.git', 'node_modules', '__pycache__'}

def is_sprite(path_str):
    """Спрайт-листы — большие, не уменьшаем до MAX_SIZE_PX"""
    p = path_str.lower()
    return any(x in p for x in ['run', 'atk', 'idle', 'monster', 'walk', 'sprite'])

def compress_png(path: Path) -> tuple:
    try:
        orig_size = path.stat().st_size
        img = Image.open(path)
        
        # Конвертируем в RGBA если нужно (сохраняем прозрачность)
        if img.mode not in ('RGBA', 'RGB', 'P'):
            img = img.convert('RGBA')
        
        w, h = img.size
        max_px = SPRITE_MAX if is_sprite(str(path)) else MAX_SIZE_PX

        # Уменьшаем если слишком большое
        if max(w, h) > max_px:
            scale = max_px / max(w, h)
            new_w, new_h = int(w * scale), int(h * scale)
            img = img.resize((new_w, new_h), Image.NEAREST)  # NEAREST сохраняет пиксели

        # Сохраняем
        img.save(path, 'PNG', optimize=PNG_OPTIMIZE, compress_level=9)
        new_size = path.stat().st_size
        return orig_size, new_size
    except Exception as e:
        return None, str(e)

def main():
    project = Path(PROJECT_DIR).resolve()
    print(f"\n📁 Проект: {project}")
    print("🔍 Ищу PNG файлы...\n")

    png_files = []
    for root, dirs, files in os.walk(project):
        # Пропускаем лишние папки
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.lower().endswith('.png'):
                png_files.append(Path(root) / f)

    if not png_files:
        print("❌ PNG файлы не найдены")
        return

    print(f"Найдено {len(png_files)} PNG файлов\n")
    print(f"{'Файл':<45} {'До':>8} {'После':>8} {'Экономия':>10}")
    print("─" * 75)

    total_before = 0
    total_after  = 0
    errors       = 0

    for path in sorted(png_files):
        rel = str(path.relative_to(project))
        before, after = compress_png(path)

        if before is None:
            print(f"{'⚠ ' + rel:<45}  ОШИБКА: {after}")
            errors += 1
            continue

        saved    = before - after
        saved_pc = (saved / before * 100) if before > 0 else 0
        total_before += before
        total_after  += after

        flag = "✅" if saved > 0 else "➖"
        print(f"{flag} {rel:<43} {before/1024:>7.1f}K {after/1024:>7.1f}K {saved_pc:>9.1f}%")

    print("─" * 75)
    total_saved = total_before - total_after
    total_pc    = (total_saved / total_before * 100) if total_before > 0 else 0
    print(f"\n{'ИТОГО':<45} {total_before/1024:>7.1f}K {total_after/1024:>7.1f}K {total_pc:>9.1f}%")
    print(f"\n💾 Сэкономлено: {total_saved/1024:.1f} KB ({total_saved/1024/1024:.2f} MB)")
    if errors:
        print(f"⚠  Ошибок: {errors}")
    print("\n✅ Готово!")

if __name__ == '__main__':
    main()
