#!/usr/bin/env python3
"""Rewrite the `react { }` block in android/app/build.gradle to use static paths.

Expo's Android template resolves the JS entry point (and several other paths) by
shelling out to Node *during Gradle configuration*:

    entryFile = file(["node", "-e", "require('expo/scripts/resolveAppEntry')",
                      projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())

`List.execute()` throws on a non-zero exit and captures stdout only, so when the
Node helper fails (for example because package.json still points `main` at
`expo-router/entry` without expo-router installed) `.text.trim()` yields an empty
string and Gradle dies with `path=''` on that very line. Shelling out during
configuration is also fragile: it requires Node, node_modules, and a resolvable
entry point before anything can be configured.

This script replaces those dynamic lookups with the static paths the template
documents in its own comments, then validates that every path it wrote exists.

Replacement rule per ReactExtension property:
  * the line is overwritten if its value is dynamic (contains `.execute(`) or if
    the static path it already declares does not exist on disk;
  * an existing, working, hand-written static path is left untouched.

The script is idempotent and exits non-zero (before Gradle ever runs) if an entry
point cannot be resolved.
"""

import argparse
import difflib
import os
import re
import shutil
import sys

# ReactExtension property -> (gradle form, description)
FILE_PROPERTIES = {
    "entryFile": "file({value})",
    "reactNativeDir": "file({value})",
    "codegenDir": "file({value})",
    "cliFile": "file({value})",
}
STRING_PROPERTIES = {"hermesCommand": "{value}"}  # java.lang.String, not a file()
ALL_PROPERTIES = list(FILE_PROPERTIES) + list(STRING_PROPERTIES)

ENTRY_EXTENSIONS = ("", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs")
PLATFORM_EXTENSIONS = ("android.tsx", "android.ts", "android.jsx", "android.js", "native.js", "js")


def log(msg):
    print(msg, flush=True)


def strip_quotes(text):
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    return text


def gradle_string(value):
    return f'"{value.replace(chr(92), chr(92) * 2)}"'


def find_react_block(lines):
    """Return (open_index, close_index) line indexes of the `react { }` block."""
    open_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^\s*react\s*\{\s*(//.*)?$", line):
            open_idx = i
            break
    if open_idx is None:
        return None, None

    depth = 0
    in_string = None
    in_line_comment = False
    in_block_comment = False
    for i in range(open_idx, len(lines)):
        line = lines[i]
        j = 0
        while j < len(line):
            ch = line[j]
            nxt = line[j + 1] if j + 1 < len(line) else ""
            if in_line_comment:
                break
            if in_block_comment:
                if ch == "*" and nxt == "/":
                    in_block_comment = False
                    j += 2
                    continue
                j += 1
                continue
            if in_string:
                if ch == "\\":
                    j += 2
                    continue
                if ch == in_string:
                    in_string = None
                j += 1
                continue
            if ch == "/" and nxt == "/":
                in_line_comment = True
                break
            if ch == "/" and nxt == "*":
                in_block_comment = True
                j += 2
                continue
            if ch in "\"'":
                in_string = ch
                j += 1
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return open_idx, i
            j += 1
        in_line_comment = False
    raise SystemExit("could not find the closing brace of the react { } block")


def resolve_main_entry(project_root):
    """Resolve package.json `main` to an existing file, the way Expo does."""
    pkg_path = os.path.join(project_root, "package.json")
    if not os.path.exists(pkg_path):
        raise SystemExit(f"no package.json at {pkg_path}")

    import json

    with open(pkg_path, encoding="utf-8") as fh:
        pkg = json.load(fh)
    main = pkg.get("main")

    if not main:
        for candidate in ("index.js", "index.ts", "index.tsx"):
            if os.path.exists(os.path.join(project_root, candidate)):
                return candidate
        raise SystemExit(
            "package.json has no `main` field and no index.* file exists; "
            "define one of them so the entry point resolves."
        )

    relative = main.lstrip("./") if main.startswith(".") else main
    for ext in ENTRY_EXTENSIONS + PLATFORM_EXTENSIONS:
        candidate = os.path.join(project_root, relative + ext)
        if os.path.isfile(candidate):
            return main

    # `main` may point at a module inside node_modules (e.g. "expo/AppEntry").
    module_candidate = os.path.join(project_root, "node_modules", relative)
    if os.path.exists(module_candidate):
        return main

    hint = ""
    if "expo-router" in main and not os.path.isdir(
        os.path.join(project_root, "node_modules", "expo-router")
    ):
        hint = (
            "\n  expo-router is not installed and there is no app/ directory. Either add "
            "expo-router as a dependency or point `main` at your real entry file (e.g. "
            '"index.js" or "App.tsx").'
        )
    raise SystemExit(
        f"package.json `main` is {main!r}, which does not resolve to an existing file "
        f"under {project_root}.{hint}"
    )


def first_existing(paths, fallback):
    for path in paths:
        if path and os.path.exists(path):
            return path
    return fallback


def gradle_path(app_dir, target_abs):
    rel = os.path.relpath(target_abs, app_dir)
    return "./" + rel.replace(os.sep, "/") if not rel.startswith(".") else rel.replace(os.sep, "/")


def build_static_values(project_root, app_dir):
    """Compute the static replacement values, detecting nested node_modules layouts."""
    root_abs = os.path.abspath(project_root)
    app_abs = os.path.abspath(app_dir)

    main = resolve_main_entry(root_abs)
    entry_abs = os.path.join(root_abs, main.lstrip("./") if main.startswith(".") else main)
    if os.path.isdir(entry_abs):  # rarity: extension probing picked a directory
        for ext in ENTRY_EXTENSIONS:
            if os.path.isfile(entry_abs + ext):
                entry_abs += ext
                break

    rn_abs = first_existing(
        [
            os.path.join(root_abs, "node_modules", "react-native"),
            os.path.join(root_abs, "node_modules", "expo", "node_modules", "react-native"),
        ],
        os.path.join(root_abs, "node_modules", "react-native"),
    )

    codegen_abs = first_existing(
        [
            os.path.join(root_abs, "node_modules", "@react-native", "codegen"),
            os.path.join(rn_abs, "node_modules", "@react-native", "codegen"),
            os.path.join(rn_abs, "node_modules", "react-native", "node_modules", "@react-native", "codegen"),
        ],
        os.path.join(root_abs, "node_modules", "@react-native", "codegen"),
    )

    cli_abs = first_existing(
        [
            os.path.join(root_abs, "node_modules", "@expo", "cli", "build", "bin", "cli"),
            os.path.join(root_abs, "node_modules", "expo", "node_modules", "@expo", "cli", "build", "bin", "cli"),
        ],
        os.path.join(root_abs, "node_modules", "@expo", "cli", "build", "bin", "cli"),
    )

    rn_rel = gradle_path(app_abs, rn_abs)
    values = {
        "entryFile": gradle_path(app_abs, entry_abs),
        "reactNativeDir": rn_rel,
        # Property<String>: a plain string, so %OS-BIN% stays a literal for the
        # React Native Gradle plugin to substitute (linux64-bin on CI).
        "hermesCommand": f"{rn_rel}/sdks/hermesc/%OS-BIN%/hermesc",
        "codegenDir": gradle_path(app_abs, codegen_abs),
        "cliFile": gradle_path(app_abs, cli_abs),
    }

    # Filesystem facts used for validation/warnings, keyed by property name.
    checks = {
        "entryFile": entry_abs,
        "reactNativeDir": rn_abs,
        "codegenDir": codegen_abs,
        "cliFile": cli_abs,
        "hermesCommand": os.path.join(rn_abs, "sdks", "hermesc", "linux64-bin", "hermesc"),
    }
    return values, checks, main


def render_line(indent, name, value):
    if name in STRING_PROPERTIES:
        return f"{indent}{name} = {gradle_string(value)}"
    return f"{indent}{name} = file({gradle_string(value)})"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-root", default=".", help="Expo project root (package.json lives here)")
    parser.add_argument("--gradle-file", default=None, help="defaults to <project-root>/android/app/build.gradle")
    parser.add_argument("--dry-run", action="store_true", help="report changes without writing")
    args = parser.parse_args()

    project_root = os.path.abspath(args.project_root)
    gradle_file = os.path.abspath(args.gradle_file or os.path.join(project_root, "android", "app", "build.gradle"))
    app_dir = os.path.dirname(gradle_file)

    if not os.path.isfile(gradle_file):
        raise SystemExit(f"gradle file not found: {gradle_file}")

    values, checks, main = build_static_values(project_root, app_dir)
    log(f"Entry point   : package.json main = {main!r} -> {values['entryFile']}")

    with open(gradle_file, encoding="utf-8") as fh:
        original = fh.read()
    lines = original.splitlines(keepends=True)

    open_idx, close_idx = find_react_block(lines)

    changes = []
    for i in range(open_idx + 1, close_idx):
        raw = lines[i]
        match = re.match(r"^(\s*)([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", raw.rstrip("\n"))
        if not match:
            continue
        indent, name, value = match.groups()
        if name not in ALL_PROPERTIES:
            continue

        dynamic = ".execute(" in value
        declared = strip_quotes(value)
        if declared.startswith("file(") and declared.endswith(")"):
            declared = strip_quotes(declared[5:-1])

        if not dynamic:
            declared_abs = declared if os.path.isabs(declared) else os.path.join(app_dir, declared)
            if os.path.exists(declared_abs) and name != "hermesCommand":
                log(f"  keep  {name}: existing static path resolves ({declared})")
                continue
            if name == "hermesCommand" and "%OS-BIN%" in declared:
                log(f"  keep  {name}: already static ({declared})")
                continue

        new_line = render_line(indent, name, values[name]) + "\n"
        if new_line != raw:
            changes.append((i, name, raw, new_line))
            lines[i] = new_line

    # `root` is optional: the extension convention already equals ../../, so only
    # repair it when it was set dynamically.
    root_handled = any(name == "root" for _, name, _, _ in changes)
    for i in range(open_idx + 1, close_idx):
        match = re.match(r"^(\s*)root\s*=\s*(.*?)\s*$", lines[i].rstrip("\n"))
        if match and ".execute(" in match.group(2):
            indent = match.group(1)
            new_line = f"{indent}root = file(\"../../\")\n"
            changes.append((i, "root", lines[i], new_line))
            lines[i] = new_line
            root_handled = True
            break
    if not root_handled:
        log('  note  root: left to the extension default ("../../"), which is correct')

    updated = "".join(lines)

    # --- validation -------------------------------------------------------
    block = "".join(lines[open_idx : close_idx + 1])
    if ".execute(" in block:
        leftover = [ln.strip() for ln in block.splitlines() if ".execute(" in ln]
        raise SystemExit("refusing to continue, dynamic lookups remain in the react block:\n  " + "\n  ".join(leftover))

    new_open, new_close = find_react_block(lines)
    written = {}
    for i in range(new_open + 1, new_close):
        match = re.match(r"^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", lines[i].rstrip("\n"))
        if match and match.group(1) in ALL_PROPERTIES:
            written[match.group(1)] = strip_quotes(match.group(2))

    problems = []
    log("")
    log(f"{'property':<16} {'path written to build.gradle':<44} status")
    log("-" * 78)
    for name in ALL_PROPERTIES:
        value = written.get(name, values[name])
        declared = value
        if declared.startswith("file("):
            declared = strip_quotes(declared[5:-1])
        absolute = checks[name] if name != "hermesCommand" else checks[name].replace("%OS-BIN%", "linux64-bin")
        exists = os.path.exists(absolute)
        status = "ok" if exists else "MISSING"
        if name == "hermesCommand" and not exists:
            # Only consulted when hermesEnabled=true; warn instead of failing so a
            # JSC-only project can still build.
            status = "warn (hermesc not found)"
        elif not exists:
            problems.append(f"{name} -> {declared} does not exist (checked {absolute})")
        log(f"{name:<16} {declared:<44} {status}")
    log("")

    if problems:
        raise SystemExit("static path validation failed:\n  - " + "\n  - ".join(problems))

    if not changes:
        log("react block already uses static paths; nothing to patch.")
        return

    log(f"Patching {gradle_file}")
    diff = difflib.unified_diff(
        original.splitlines(keepends=True),
        updated.splitlines(keepends=True),
        fromfile="android/app/build.gradle (before)",
        tofile="android/app/build.gradle (after)",
        n=1,
    )
    sys.stdout.writelines(diff)
    for i, name, before, after in changes:
        log(f"  line {i + 1}: {name}")
        log(f"    - {before.strip()}")
        log(f"    + {after.strip()}")

    if args.dry_run:
        log("dry run: not writing changes.")
        return

    shutil.copyfile(gradle_file, gradle_file + ".bak")
    with open(gradle_file, "w", encoding="utf-8") as fh:
        fh.write(updated)
    log(f"Wrote {len(changes)} static path assignment(s) to {gradle_file}")


if __name__ == "__main__":
    main()
