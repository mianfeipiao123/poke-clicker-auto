from __future__ import annotations

import argparse
import ast
import html
import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable


def normalize_ui_text(text: str) -> str:
    value = str(text)
    value = value.replace("\u00a0", " ").replace("\u200b", "")
    value = value.replace("\u201c", '"').replace("\u201d", '"')
    value = value.replace("\u2018", "'").replace("\u2019", "'")
    value = value.replace("\u2026", "...")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def normalize_loose_key(text: str) -> str:
    value = normalize_ui_text(text)
    try:
        import unicodedata

        value = unicodedata.normalize("NFKD", value)
    except Exception:
        pass
    value = re.sub(r"[\u0300-\u036f]", "", value)
    value = re.sub(r"[^0-9A-Za-z]+", "", value).lower()
    return value


def should_consider_text(value: str, *, max_length: int) -> bool:
    value = normalize_ui_text(value)
    if not value:
        return False
    if len(value) > max_length:
        return False
    if value.lower() in {"hover", "bottom", "right", "window", "viewport", "opacity", "numeric", "long", "full", "show"}:
        return False
    if value.startswith(("#", ".", "${", "@import", "<", "assets/")):
        return False
    if value.startswith("%-") or "include(" in value:
        return False
    if re.fullmatch(r"\.[A-Za-z0-9]{2,5}", value):
        return False
    if re.fullmatch(r"\d+\s*px", value, flags=re.I):
        return False
    if value.startswith(("'", '"')) and ("/>" in value or "src=" in value):
        return False
    if value.startswith("),"):
        return False
    if "src=" in value or "href=" in value:
        return False
    if "<%" in value or "%>" in value:
        return False
    if value.lower().startswith("http://") or value.lower().startswith("https://"):
        return False
    if re.fullmatch(r"[a-z]{2}-[A-Z]{2}", value):
        return False
    if re.fullmatch(r"\{[A-Za-z0-9_]+\}", value):
        return False
    if not re.search(r"[A-Za-z]{2}", value):
        return False
    if re.fullmatch(r"\d+(?:\.\d+)?[KMBT]", value, flags=re.I):
        return False
    if re.fullmatch(r"\d[\d,]*(?:\.\d+)?", value):
        return False
    # exclude likely class / config tokens
    if re.fullmatch(r"[a-z0-9_-]+( [a-z0-9_-]+)+", value.lower()):
        return False
    if re.fullmatch(r"[a-z0-9_.-]+", value.lower()) and (("." in value) or ("_" in value)):
        return False
    if " " not in value and re.search(r"[a-z][A-Z]", value):
        return False
    if " " not in value and re.fullmatch(r"[a-z0-9_-]+", value.lower()) and ("-" in value or "_" in value):
        return False
    return True


def iter_translation_keys(obj) -> Iterable[str]:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, str):
                yield normalize_ui_text(key)
            else:
                yield from iter_translation_keys(value)


@dataclass(frozen=True)
class TranslationIndex:
    direct: set[str]
    direct_lower: set[str]
    items_loose: set[str]

    def covers(self, text: str) -> bool:
        key = normalize_ui_text(text)
        if not key:
            return True

        if key in self.direct or key.lower() in self.direct_lower:
            return True

        # trailing colon handling (script also does this)
        if key.endswith(":") or key.endswith("："):
            base = normalize_ui_text(key[:-1])
            if base in self.direct or base.lower() in self.direct_lower:
                return True

        if normalize_loose_key(key) in self.items_loose:
            return True

        return False


def load_translation_index(pch_root: Path) -> TranslationIndex:
    pch_ui = json.loads((pch_root / "json" / "PCH_UI.json").read_text(encoding="utf-8"))
    pch_core = json.loads((pch_root / "json" / "PCH_Core.json").read_text(encoding="utf-8"))
    pch_data = json.loads((pch_root / "json" / "PCH_Data.json").read_text(encoding="utf-8"))

    direct: set[str] = set()
    direct.update(iter_translation_keys(pch_ui.get("UI", {})))
    direct.update(normalize_ui_text(k) for k in pch_ui.get("UIRaw", {}).keys())

    # Core resources used by UI translation
    direct.update(normalize_ui_text(k) for k in (pch_core.get("Town") or {}).keys())
    direct.update(normalize_ui_text(k) for k in (pch_core.get("Route") or {}).keys())
    regions = pch_core.get("Regions") or {}
    direct.update(normalize_ui_text(k) for k in (regions.get("Region") or {}).keys())
    direct.update(normalize_ui_text(k) for k in (regions.get("SubRegion") or {}).keys())

    # Data resources used by UI translation
    dungeons = pch_data.get("Dungeon") or {}
    if isinstance(dungeons, dict):
        for region_map in dungeons.values():
            if isinstance(region_map, dict):
                direct.update(normalize_ui_text(k) for k in region_map.keys())

    direct.update(normalize_ui_text(k) for k in (pch_data.get("Berry") or {}).keys())

    stone = pch_data.get("Stone") or {}
    if isinstance(stone, dict):
        direct.update(normalize_ui_text(k) for k in (stone.get("evolutionStone") or {}).keys())
        direct.update(normalize_ui_text(k) for k in (stone.get("megaStone") or {}).keys())
        direct.update(normalize_ui_text(k) for k in (stone.get("zCrystal") or {}).keys())

    underground = pch_data.get("Underground") or {}
    if isinstance(underground, dict):
        direct.update(normalize_ui_text(k) for k in (underground.get("tools") or {}).keys())
        direct.update(normalize_ui_text(k) for k in (underground.get("treasures") or {}).keys())
        direct.update(normalize_ui_text(k) for k in (underground.get("shards") or {}).keys())
        direct.update(normalize_ui_text(k) for k in (underground.get("plates") or {}).keys())

    game_enums = pch_data.get("GameEnums") or {}
    if isinstance(game_enums, dict):
        for enum_map in game_enums.values():
            if isinstance(enum_map, dict):
                direct.update(normalize_ui_text(k) for k in enum_map.keys())

    items_loose: set[str] = set()
    items = pch_data.get("Items") or {}
    if isinstance(items, dict):
        for category in items.values():
            if not isinstance(category, dict):
                continue
            for key, value in category.items():
                if isinstance(value, str) and key:
                    items_loose.add(normalize_loose_key(key))

    direct_lower = {k.lower() for k in direct}
    return TranslationIndex(direct=direct, direct_lower=direct_lower, items_loose=items_loose)


_STRING_RE = re.compile(r"('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")")
_BACKTICK_RE = re.compile(r"`([^`\\]*(?:\\.[^`\\]*)*)`")


def extract_js_string_literals(expr: str) -> Iterable[str]:
    for match in _STRING_RE.finditer(expr):
        literal = match.group(1)
        try:
            value = ast.literal_eval(literal)
        except Exception:
            continue
        if isinstance(value, str):
            yield value

    for match in _BACKTICK_RE.finditer(expr):
        body = match.group(1)
        # split out ${...} parts
        for part in re.split(r"\$\{[^}]*\}", body):
            if part:
                yield part


class ComponentExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.text_nodes: list[str] = []
        self.attr_blobs: list[str] = []
        self._stack: list[str] = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        self._stack.append(tag)
        for name, value in attrs:
            if value is None:
                continue
            key = (name or "").lower()
            if key in {"title", "placeholder", "aria-label", "data-original-title"}:
                self.attr_blobs.append(value)
                continue
            if key == "data-bind":
                if re.search(r"\btooltip\b|\btitle\b|\bconfirm\b|\bmessage\b", value):
                    self.attr_blobs.append(value)

    def handle_endtag(self, tag):
        tag = tag.lower()
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i] == tag:
                self._stack = self._stack[:i]
                break

    def handle_data(self, data):
        if any(t in {"script", "style"} for t in self._stack):
            return
        value = normalize_ui_text(html.unescape(data))
        if value:
            self.text_nodes.append(value)


def iter_component_candidates(path: Path, *, max_length: int) -> Iterable[str]:
    parser = ComponentExtractor()
    parser.feed(path.read_text(encoding="utf-8"))

    for text in parser.text_nodes:
        if should_consider_text(text, max_length=max_length):
            yield normalize_ui_text(text)

    for blob in parser.attr_blobs:
        for literal in extract_js_string_literals(blob):
            for part in re.split(r"<br\s*/?>", literal, flags=re.I):
                part = normalize_ui_text(html.unescape(part))
                part = normalize_ui_text(re.sub(r"<[^>]+>", " ", part))
                if should_consider_text(part, max_length=max_length):
                    yield normalize_ui_text(part)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract missing UI text from pokeclicker source components.")
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("..") / "pokeclicker-develop" / "src",
        help="Path to pokeclicker source root (default: ../pokeclicker-develop/src)",
    )
    parser.add_argument(
        "--pch-root",
        type=Path,
        default=Path("."),
        help="Path to 脚本创建 root (default: current directory)",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        default=200,
        help="Max length of UI text candidate (default: 200)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("missing-ui-from-source.json"),
        help="Output json file (default: missing-ui-from-source.json)",
    )
    parser.add_argument(
        "--include-index",
        action="store_true",
        help="Also scan src/index.html (default: false)",
    )
    args = parser.parse_args()

    index = load_translation_index(args.pch_root)

    components_dir = args.source / "components"
    files: list[Path] = []
    if components_dir.is_dir():
        files.extend(sorted(components_dir.rglob("*.html")))
    if args.include_index:
        index_html = args.source / "index.html"
        if index_html.exists():
            files.append(index_html)

    missing: dict[str, str] = {}
    seen: set[str] = set()

    for file in files:
        for candidate in iter_component_candidates(file, max_length=args.max_length):
            key = normalize_ui_text(candidate)
            if not key or key in seen:
                continue
            seen.add(key)
            if index.covers(key):
                continue
            missing[key] = ""

    args.out.write_text(json.dumps(dict(sorted(missing.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(missing)} entries to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
