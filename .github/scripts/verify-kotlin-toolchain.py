#!/usr/bin/env python3
"""Check that the Kotlin toolchain in the generated Android project agrees with itself.

Three different files decide which Kotlin and Compose Compiler a build uses, and
they come from three different packages:

  1. the Kotlin compiler itself - the Kotlin Gradle Plugin version comes from
     React Native's version catalog (node_modules/react-native/gradle/libs.versions.toml);
  2. android/build.gradle's `ext.kotlinVersion` - written by `expo prebuild`, and read by
     Expo modules as `kotlinVersion()`;
  3. expo-modules-core/android/build.gradle, which maps that number to a Compose
     Compiler version:
         def versionsMap = ["1.9.24": "1.5.14", "1.9.25": "1.5.15"]
         kotlinCompilerExtensionVersion = versionsMap[kotlinVersion()]

If (2) disagrees with (1), the Compose Compiler requested by (3) will not match the
compiler that compiles the code, and Gradle fails with:

    e: This version (1.5.15) of the Compose Compiler requires Kotlin version 1.9.25
       but you appear to be using Kotlin version 1.9.24

That costs a full Gradle run to discover. This check is offline and takes
milliseconds, so run it after prebuild and before ./gradlew.
"""

import argparse
import json
import os
import re
import sys

EXPO_FALLBACK = re.compile(r'kspVersion|:\s*"(\d+\.\d+\.\d+)"\s*\n\s*\}')
KOTLIN_VERSION_EXT = re.compile(
    r"^\s*kotlinVersion\s*=\s*findProperty\(\s*['\"]android\.kotlinVersion['\"]\s*\)\s*\?:\s*['\"]([\d.]+)['\"]",
    re.M,
)
KOTLIN_VERSION_EXT_PLAIN = re.compile(r"^\s*kotlinVersion\s*=\s*['\"]([\d.]+)['\"]", re.M)
GRADLE_PROPERTY = re.compile(r"^\s*android\.kotlinVersion\s*=\s*([\d.]+)\s*$", re.M)
CATALOG_KOTLIN = re.compile(r"^\s*kotlin\s*=\s*\"([\d.]+)\"", re.M)
CATALOG_AGP = re.compile(r"^\s*agp\s*=\s*\"([\d.]+)\"", re.M)
COMPOSE_MAP_BLOCK = re.compile(r"def\s+versionsMap\s*=\s*\[(.*?)\]", re.S)
COMPOSE_MAP_ENTRY = re.compile(r"\"([\d.]+)\"\s*:\s*\"([\d.]+)\"")


def read(path):
    with open(path, encoding="utf-8", errors="ignore") as fh:
        return fh.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-root", default=".", help="Expo project root")
    parser.add_argument("--android-dir", default=None, help="defaults to <project-root>/android")
    args = parser.parse_args()

    root = os.path.abspath(args.project_root)
    android = os.path.abspath(args.android_dir or os.path.join(root, "android"))
    problems = []

    # --- the compiler that is actually applied -------------------------------
    catalog_path = os.path.join(root, "node_modules", "react-native", "gradle", "libs.versions.toml")
    rn_pkg = os.path.join(root, "node_modules", "react-native", "package.json")
    rn_version = "(unknown)"
    if os.path.isfile(rn_pkg):
        with open(rn_pkg, encoding="utf-8") as fh:
            rn_version = json.load(fh).get("version", "(unknown)")

    compiler = agp = None
    if os.path.isfile(catalog_path):
        catalog = read(catalog_path)
        match = CATALOG_KOTLIN.search(catalog)
        compiler = match.group(1) if match else None
        match = CATALOG_AGP.search(catalog)
        agp = match.group(1) if match else None
    else:
        print(f"note: {catalog_path} not found; cannot determine the applied Kotlin plugin version")

    # --- what the generated project tells Expo modules ----------------------
    build_gradle = os.path.join(android, "build.gradle")
    declared = None
    if os.path.isfile(build_gradle):
        text = read(build_gradle)
        match = KOTLIN_VERSION_EXT.search(text) or KOTLIN_VERSION_EXT_PLAIN.search(text)
        declared = match.group(1) if match else None

    gradle_properties = os.path.join(android, "gradle.properties")
    override = None
    if os.path.isfile(gradle_properties):
        match = GRADLE_PROPERTY.search(read(gradle_properties))
        override = match.group(1) if match else None

    effective = override or declared

    # --- what expo-modules-core will ask the Compose Compiler to be ---------
    core_gradle = os.path.join(root, "node_modules", "expo-modules-core", "android", "build.gradle")
    compose_for = {}
    if os.path.isfile(core_gradle):
        block = COMPOSE_MAP_BLOCK.search(read(core_gradle))
        if block:
            compose_for = dict(COMPOSE_MAP_ENTRY.findall(block.group(1)))
    compose_version = compose_for.get(effective) if effective else None

    print("Kotlin toolchain")
    print(f"  react-native                         {rn_version}")
    print(f"  Kotlin plugin applied (RN catalog)   {compiler or '(unknown)'}")
    print(f"  android/build.gradle kotlinVersion   {declared or '(not set)'}")
    if override:
        print(f"  android.kotlinVersion property       {override}  (overrides the above)")
    print(f"  value Expo modules read              {effective or '(unknown)'}")
    print(f"  expo-modules-core Compose map        {compose_for or '(not found)'}")
    print(f"  => Compose Compiler                  {compose_version or '(none - the map has no entry)'}")
    if agp:
        print(f"  Android Gradle Plugin (RN catalog)   {agp}")
    print()

    if not effective:
        print("note: no kotlinVersion found in android/build.gradle; Expo modules fall back to their own default")
        return 0

    if compiler and compiler != effective:
        problems.append(
            f"the Kotlin plugin that will compile this project is {compiler}, but Expo modules read "
            f"kotlinVersion = {effective}. expo-modules-core selects the Compose Compiler from that number "
            f"(Compose Compiler {compose_version or 'unmapped'}), and the Compose Compiler only supports the "
            f"exact Kotlin release it was built for, so Kotlin compilation fails with "
            f"'This version ({compose_version}) of the Compose Compiler requires Kotlin version {effective} "
            f"but you appear to be using Kotlin version {compiler}'."
        )
    if not compose_for:
        print("note: no Compose versions map in expo-modules-core; skipping the Compose pairing check")
    elif compose_version is None:
        problems.append(
            f"expo-modules-core's Compose versions map has no entry for kotlinVersion {effective} "
            f"(known: {', '.join(sorted(compose_for))}), so kotlinCompilerExtensionVersion would be unset."
        )

    if problems:
        print("::error::Kotlin toolchain mismatch detected before running Gradle:")
        for problem in problems:
            print(f"  - {problem}")
        print()
        print("How to fix - make the two numbers agree, either way round:")
        if compiler:
            compose_for_compiler = compose_for.get(compiler)
            print(f"  * make Expo read the compiler's version: add `android.kotlinVersion={compiler}` to "
                  f"android/gradle.properties"
                  + (f" (Expo's Compose map pairs {compiler} with {compose_for_compiler})." if compose_for_compiler
                     else f" - but Expo's Compose map has no entry for {compiler}, so prefer the other option."))
        print(f"  * or use the React Native version this Expo SDK was built against, whose Gradle version "
              f"catalog pins the Kotlin release that Expo's Compose map expects (see "
              f"`expo/bundledNativeModules.json` -> react-native).")
        return 1

    print(f"OK: Kotlin {effective} is used consistently and pairs with Compose Compiler {compose_version}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
