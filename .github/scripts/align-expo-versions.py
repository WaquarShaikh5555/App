#!/usr/bin/env python3
"""Align declared dependency versions with the Expo SDK's supported versions.

This is `npx expo install --fix` semantics without the network call: the Expo
package ships the authoritative version map at `expo/bundledNativeModules.json`,
so a project can be reconciled offline.

Only packages that are already declared in package.json are touched, and only
when the declared range cannot satisfy the SDK's recommended version. Anything
else is reported and left alone.

Run it after `npm install` (the map comes from the installed expo package) and
re-run `npm install` if it changed anything.
"""

import argparse
import json
import os
import re
import sys

# ranges we know how to reason about; anything else is reported, never rewritten
SIMPLE_RANGE = re.compile(r"^(~|\^|=)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$")


def parse_range(declared):
    """Return (operator, (major, minor, patch)) or None if the range is complex."""
    match = SIMPLE_RANGE.match(declared.strip())
    if not match:
        return None
    op = match.group(1) or "="
    parts = tuple(int(g) if g is not None else 0 for g in match.groups()[1:])
    return op, parts


def satisfies(declared, recommended):
    """Does `recommended` fall inside the range `declared`? None when unsure."""
    declared_parsed = parse_range(declared)
    recommended_parsed = parse_range(recommended.lstrip(">=< "))
    if declared_parsed is None or recommended_parsed is None:
        return None
    op, (dmaj, dmin, _) = declared_parsed
    _, (rmaj, rmin, _) = recommended_parsed
    if op == "^":
        return rmaj == dmaj
    if op == "~":
        return (rmaj, rmin) == (dmaj, dmin)
    return recommended_parsed[1] == declared_parsed[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-root", default=".", help="Expo project root (package.json lives here)")
    parser.add_argument("--dry-run", action="store_true", help="report without rewriting package.json")
    args = parser.parse_args()

    root = os.path.abspath(args.project_root)
    package_json = os.path.join(root, "package.json")
    bundled_path = os.path.join(root, "node_modules", "expo", "bundledNativeModules.json")

    if not os.path.isfile(package_json):
        raise SystemExit(f"no package.json at {package_json}")
    if not os.path.isfile(bundled_path):
        raise SystemExit(
            f"no version map at {bundled_path}; run `npm install` first so the expo package is present"
        )

    with open(package_json, encoding="utf-8") as fh:
        pkg = json.load(fh)
    with open(bundled_path, encoding="utf-8") as fh:
        bundled = json.load(fh)

    print(f"{'package':<42} {'declared':<16} {'SDK wants':<16} action")
    print("-" * 92)

    changes = []
    unknown = []
    for section in ("dependencies", "devDependencies"):
        for name, declared in list(pkg.get(section, {}).items()):
            if name not in bundled:
                continue
            recommended = bundled[name]
            verdict = satisfies(declared, recommended)
            if verdict is True:
                continue
            if verdict is None:
                unknown.append((name, declared, recommended))
                print(f"{name:<42} {declared:<16} {recommended:<16} skipped (complex range)")
                continue
            changes.append((section, name, declared, recommended))
            print(f"{name:<42} {declared:<16} {recommended:<16} -> {recommended}")

    for name, declared, recommended in unknown:
        print(f"  note: {name} is declared as {declared!r}, SDK recommends {recommended!r}; left untouched")

    if not changes:
        if unknown:
            print(f"\nNo packages rewritten; {len(unknown)} package(s) left untouched (see notes above).")
        else:
            print("\nAll SDK-managed dependencies already satisfy the Expo SDK's versions.")
        return

    print(f"\n{len(changes)} package(s) are off the Expo SDK's supported versions.")
    if args.dry_run:
        print("dry run: not writing package.json")
        return

    for section, name, _, recommended in changes:
        pkg[section][name] = recommended

    with open(package_json, "w", encoding="utf-8") as fh:
        json.dump(pkg, fh, indent=2)
        fh.write("\n")
    print(f"Updated {package_json}; re-run npm install to apply.")

    # Anything that drives the native toolchain deserves a loud note.
    for _, name, declared, recommended in changes:
        if name == "react-native":
            print(
                f"note: react-native {declared} -> {recommended}. React Native's Gradle version "
                "catalog pins the Kotlin compiler, and expo-modules-core derives its Compose "
                "Compiler version from that Kotlin version, so an off-SDK react-native can fail "
                "with 'Compose Compiler requires Kotlin version X'."
            )


if __name__ == "__main__":
    sys.exit(main())
