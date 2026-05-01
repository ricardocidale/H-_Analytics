from openai import OpenAI
from pathlib import Path
import os
import sys
import fnmatch
from typing import List, Tuple

# ============================================================
# Project-Aware ChatGPT for Replit
# TypeScript-Optimized, Higher Limits, Smarter Scanner
# ============================================================
#
# What this does:
# - Runs inside Replit Shell
# - Reads your TypeScript / JavaScript project recursively
# - Prioritizes important files first
# - Skips dependency/build/cache folders
# - Supports focused file review
# - Uses OpenAI's Responses API
# - Defaults to the latest flagship model: gpt-5.5
#
# Before running:
# 1. Add OPENAI_API_KEY in Replit Secrets
# 2. Run: pip install openai
# 3. Run: python main.py
#
# Optional:
# Add OPENAI_MODEL in Replit Secrets if you want to override the model.
# Example:
# OPENAI_MODEL = gpt-5.5-pro
#
# Commands inside the app:
# - files
# - tree
# - limits
# - model
# - rescan
# - focus path/or/pattern
# - askfile path/or/pattern | your question
# - exit
# ============================================================


# ----------------------------
# OpenAI settings
# ----------------------------

DEFAULT_MODEL = "gpt-5.5"
MODEL = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)

DEFAULT_REASONING_EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "high")
DEFAULT_VERBOSITY = os.environ.get("OPENAI_VERBOSITY", "medium")

client = OpenAI()


# ----------------------------
# Project scan settings
# ----------------------------

ROOT = Path(".").resolve()

SKIP_DIRS = {
    ".git",
    ".cache",
    ".config",
    ".pythonlibs",
    ".upm",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    "target",
    ".next",
    ".nuxt",
    ".parcel-cache",
    ".turbo",
    "coverage",
    ".idea",
    ".vscode",
    ".vercel",
    ".netlify",
    "attached_assets",
    "generated",
    "tmp",
    "temp",
    "logs",
}

SKIP_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".mp4",
    ".mov",
    ".avi",
    ".mp3",
    ".wav",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".rar",
    ".7z",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".sqlite",
    ".db",
    ".pyc",
    ".map",
}

TEXT_EXTENSIONS = {
    # TypeScript / JavaScript
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    # Web
    ".html",
    ".css",
    ".scss",
    ".sass",
    ".less",
    # Config / data
    ".json",
    ".jsonc",
    ".toml",
    ".yaml",
    ".yml",
    ".ini",
    ".cfg",
    # Docs
    ".md",
    ".mdx",
    ".txt",
    # Backend / scripts
    ".py",
    ".sql",
    ".sh",
    ".bash",
    ".zsh",
    # Other code
    ".java",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".swift",
    ".kt",
    ".cs",
    ".xml",
}

SPECIAL_TEXT_FILES = {
    # Replit
    ".replit",
    "replit.nix",
    # Package managers
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    # TypeScript / frontend configs
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "vite.config.js",
    "next.config.ts",
    "next.config.js",
    "tailwind.config.ts",
    "tailwind.config.js",
    "postcss.config.js",
    "postcss.config.cjs",
    "eslint.config.js",
    "eslint.config.mjs",
    ".eslintrc",
    ".eslintrc.json",
    ".prettierrc",
    ".prettierrc.json",
    # Deployment / environment examples
    "Dockerfile",
    "Makefile",
    "Procfile",
    ".env.example",
    ".env.sample",
    # Git / docs
    ".gitignore",
    "README",
    "README.md",
}

LOCKFILES = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
}

# Higher limits than before.
# These are still bounded so the request does not become unstable.
MAX_FILES = 800
MAX_TOTAL_CHARS = 700_000
MAX_FILE_CHARS = 50_000
MAX_LOCKFILE_CHARS = 18_000
MAX_FOCUS_CHARS = 250_000


# ----------------------------
# Basic helpers
# ----------------------------


def check_api_key():
    if not os.environ.get("OPENAI_API_KEY"):
        print("\nMissing OPENAI_API_KEY.")
        print("In Replit, go to Tools -> Secrets and add:")
        print("OPENAI_API_KEY = your OpenAI API key")
        sys.exit(1)


def rel_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except Exception:
        return str(path)


def should_skip_path(path: Path) -> bool:
    parts = set(path.parts)

    if parts & SKIP_DIRS:
        return True

    if path.suffix.lower() in SKIP_EXTENSIONS:
        return True

    return False


def is_probably_text_file(path: Path) -> bool:
    if path.name in SPECIAL_TEXT_FILES:
        return True

    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True

    return False


def safe_read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return f"[Could not read file: {e}]"


def file_priority(path: Path) -> int:
    """
    Lower number = higher priority.
    This helps important TypeScript files enter context first.
    """
    name = path.name
    suffix = path.suffix.lower()
    rp = rel_path(path)

    if name == "package.json":
        return 1

    if name.startswith("tsconfig"):
        return 2

    if name in {
        ".replit",
        "replit.nix",
        "vite.config.ts",
        "vite.config.js",
        "next.config.ts",
        "next.config.js",
        "tailwind.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "postcss.config.cjs",
        "eslint.config.js",
        "eslint.config.mjs",
    }:
        return 3

    if rp.startswith("server/") and suffix in {".ts", ".tsx", ".js"}:
        return 4

    if rp.startswith("shared/") and suffix in {".ts", ".tsx"}:
        return 5

    if rp.startswith("domain/") and suffix in {".ts", ".tsx"}:
        return 6

    if rp.startswith("engine/") and suffix in {".ts", ".tsx"}:
        return 7

    if rp.startswith("calc/") and suffix in {".ts", ".tsx"}:
        return 8

    if rp.startswith("analytics/") and suffix in {".ts", ".tsx"}:
        return 9

    if rp.startswith("client/src/") and suffix in {".ts", ".tsx"}:
        return 10

    if rp.startswith("src/") and suffix in {".ts", ".tsx"}:
        return 11

    if rp.startswith("app/") and suffix in {".ts", ".tsx"}:
        return 12

    if rp.startswith("pages/") and suffix in {".ts", ".tsx"}:
        return 13

    if rp.startswith("components/") and suffix in {".ts", ".tsx"}:
        return 14

    if suffix in {".ts", ".tsx"}:
        return 15

    if suffix in {".js", ".jsx", ".mjs", ".cjs"}:
        return 16

    if suffix in {".html", ".css", ".scss", ".sass"}:
        return 17

    if name in {"README.md", "README"}:
        return 18

    if name in LOCKFILES:
        return 40

    return 25


# ----------------------------
# File scanning
# ----------------------------


def list_project_files() -> List[Path]:
    """
    Fast scanner for Replit.

    Uses os.walk so it can skip large folders before descending into them.
    """
    files = []

    for current_root, dirs, filenames in os.walk(ROOT, followlinks=False):
        current_path = Path(current_root)

        dirs[:] = [
            d
            for d in dirs
            if d not in SKIP_DIRS
            and not d.startswith(".cache")
            and not d.startswith(".pythonlibs")
            and d != "node_modules"
        ]

        for filename in filenames:
            path = current_path / filename

            try:
                if path.is_symlink():
                    continue

                if not path.is_file():
                    continue

                if should_skip_path(path):
                    continue

                if not is_probably_text_file(path):
                    continue

                files.append(path)

            except OSError:
                continue

    files = sorted(files, key=lambda p: (file_priority(p), rel_path(p)))
    return files[:MAX_FILES]


def build_file_tree(files: List[Path]) -> str:
    return "\n".join(rel_path(path) for path in files)


def read_project_context(files: List[Path]) -> Tuple[str, int, int]:
    chunks = []
    total_chars = 0
    included_files = 0

    for path in files:
        content = safe_read_text(path)

        if not content.strip():
            continue

        max_chars = MAX_LOCKFILE_CHARS if path.name in LOCKFILES else MAX_FILE_CHARS

        if len(content) > max_chars:
            content = content[:max_chars] + "\n\n[File truncated because it is large.]"

        file_block = f"\n\n--- FILE: {rel_path(path)} ---\n{content}"

        if total_chars + len(file_block) > MAX_TOTAL_CHARS:
            chunks.append(
                "\n\n[Project context truncated because MAX_TOTAL_CHARS was reached.]"
            )
            break

        chunks.append(file_block)
        total_chars += len(file_block)
        included_files += 1

    return "".join(chunks), included_files, total_chars


# ----------------------------
# Focused file tools
# ----------------------------


def find_matching_files(files: List[Path], pattern: str) -> List[Path]:
    pattern = pattern.strip()

    if not pattern:
        return []

    matches = []

    for path in files:
        rp = rel_path(path)

        if pattern == rp:
            matches.append(path)
        elif pattern in rp:
            matches.append(path)
        elif fnmatch.fnmatch(rp, pattern):
            matches.append(path)
        elif fnmatch.fnmatch(path.name, pattern):
            matches.append(path)

    return sorted(matches, key=lambda p: (file_priority(p), rel_path(p)))


def read_focused_context(matches: List[Path]) -> Tuple[str, int]:
    chunks = []
    total_chars = 0

    for path in matches:
        content = safe_read_text(path)

        if not content.strip():
            continue

        file_block = f"\n\n--- FOCUSED FILE: {rel_path(path)} ---\n{content}"

        if total_chars + len(file_block) > MAX_FOCUS_CHARS:
            chunks.append(
                "\n\n[Focused context truncated because MAX_FOCUS_CHARS was reached.]"
            )
            break

        chunks.append(file_block)
        total_chars += len(file_block)

    return "".join(chunks), total_chars


# ----------------------------
# OpenAI calls
# ----------------------------


def ask_openai(
    user_input: str, file_tree: str, project_context: str, mode: str = "broad"
) -> str:
    prompt = f"""
You are acting as a senior project-aware coding assistant inside a Replit workspace.

The project is mainly TypeScript / JavaScript. Pay close attention to:
- package.json
- tsconfig files
- vite / next / react config
- server/**/*.ts
- shared/**/*.ts
- calc/**/*.ts
- analytics/**/*.ts
- client/src/**/*.ts
- client/src/**/*.tsx
- frontend/backend boundaries
- imports, routes, APIs, database access, runtime errors, and financial calculation correctness

MODE:
{mode}

PROJECT FILE TREE:
{file_tree}

PROJECT FILE CONTENTS:
{project_context}

USER REQUEST:
{user_input}

Instructions:
- Be practical and direct.
- Base your answer only on the actual files shown above.
- Do not pretend to inspect files that are not included.
- If you identify a bug, name the file and explain the fix.
- If code changes are needed, say exactly which file to edit.
- If replacing code, provide the full replacement block.
- If creating a new file, provide the full file contents.
- If there are multiple options, recommend the safest one.
- If context was truncated and you need a missing file, say so clearly.
- Prefer minimal safe patches over large rewrites.
- For financial code, avoid silent numeric fallbacks and explain assumptions.
"""

    response = client.responses.create(
        model=MODEL,
        reasoning={"effort": DEFAULT_REASONING_EFFORT},
        text={"verbosity": DEFAULT_VERBOSITY},
        input=prompt,
    )

    return response.output_text


def ask_openai_focused(user_input: str, file_tree: str, focused_context: str) -> str:
    prompt = f"""
You are acting as a senior coding assistant inside a Replit workspace.

The user has requested a focused review using specific files.

PROJECT FILE TREE:
{file_tree}

FOCUSED FILE CONTENTS:
{focused_context}

USER REQUEST:
{user_input}

Instructions:
- Focus on the files provided.
- Be precise.
- If code changes are needed, provide exact replacement blocks.
- If another file is likely needed, say which file and why.
- Do not invent unseen project behavior.
"""

    response = client.responses.create(
        model=MODEL,
        reasoning={"effort": DEFAULT_REASONING_EFFORT},
        text={"verbosity": DEFAULT_VERBOSITY},
        input=prompt,
    )

    return response.output_text


# ----------------------------
# Display helpers
# ----------------------------


def print_help():
    print("\nCommands:")
    print("  files")
    print("    Show readable files being considered.")
    print("")
    print("  tree")
    print("    Same as files.")
    print("")
    print("  limits")
    print("    Show current scanning/context limits.")
    print("")
    print("  model")
    print("    Show the OpenAI model being used.")
    print("")
    print("  rescan")
    print("    Rescan project files.")
    print("")
    print("  focus <path or pattern>")
    print("    Show matching files and read them in focused mode.")
    print("    Examples:")
    print("      focus vite.config.ts")
    print("      focus package.json")
    print("      focus calc/**/*.ts")
    print("")
    print("  askfile <path or pattern> | <question>")
    print("    Ask a question using only matching files plus the file tree.")
    print("    Examples:")
    print("      askfile vite.config.ts | Find build problems.")
    print("      askfile server/*.ts | Explain the backend routes.")
    print("")
    print("  exit")
    print("    Quit.")


def print_limits():
    print("\nCurrent limits:")
    print(f"  MODEL: {MODEL}")
    print(f"  REASONING_EFFORT: {DEFAULT_REASONING_EFFORT}")
    print(f"  VERBOSITY: {DEFAULT_VERBOSITY}")
    print(f"  MAX_FILES: {MAX_FILES}")
    print(f"  MAX_TOTAL_CHARS: {MAX_TOTAL_CHARS:,}")
    print(f"  MAX_FILE_CHARS: {MAX_FILE_CHARS:,}")
    print(f"  MAX_LOCKFILE_CHARS: {MAX_LOCKFILE_CHARS:,}")
    print(f"  MAX_FOCUS_CHARS: {MAX_FOCUS_CHARS:,}")


# ----------------------------
# Main loop
# ----------------------------


def main():
    check_api_key()

    print("\nProject-Aware ChatGPT in Replit")
    print("--------------------------------")
    print("TypeScript-optimized version")
    print("Higher limits + smarter focused file mode")
    print("--------------------------------")
    print(f"Model: {MODEL}")
    print("Type 'help' for commands.")
    print("--------------------------------")

    print("\nScanning project files...")
    files = list_project_files()
    file_tree = build_file_tree(files)

    print(f"Loaded {len(files)} readable project files.")

    while True:
        user_input = input("\nYou: ").strip()

        if not user_input:
            continue

        command = user_input.lower()

        if command in {"exit", "quit"}:
            print("\nGoodbye.")
            break

        if command == "help":
            print_help()
            continue

        if command == "model":
            print(f"\nCurrent model: {MODEL}")
            print("To override it, add OPENAI_MODEL in Replit Secrets.")
            print("Example: OPENAI_MODEL = gpt-5.5-pro")
            continue

        if command == "limits":
            print_limits()
            continue

        if command in {"files", "tree"}:
            files = list_project_files()
            file_tree = build_file_tree(files)

            print("\nReadable project files:\n")
            print(file_tree or "[No readable project files found.]")
            continue

        if command == "rescan":
            print("\nRescanning project files...")
            files = list_project_files()
            file_tree = build_file_tree(files)
            print(f"Loaded {len(files)} readable project files.")
            continue

        if command.startswith("focus "):
            pattern = user_input[len("focus ") :].strip()
            files = list_project_files()
            file_tree = build_file_tree(files)
            matches = find_matching_files(files, pattern)

            if not matches:
                print(f"\nNo files matched: {pattern}")
                continue

            focused_context, focused_chars = read_focused_context(matches)

            print(f"\nMatched {len(matches)} files, {focused_chars:,} chars:\n")
            for path in matches:
                print(f"  {rel_path(path)}")

            print("\nFocused files loaded. Use askfile if you want analysis.")
            continue

        if command.startswith("askfile "):
            raw = user_input[len("askfile ") :].strip()

            if "|" not in raw:
                print("\nUse this format:")
                print("askfile <path or pattern> | <question>")
                continue

            pattern, question = raw.split("|", 1)
            pattern = pattern.strip()
            question = question.strip()

            if not pattern or not question:
                print("\nUse this format:")
                print("askfile <path or pattern> | <question>")
                continue

            files = list_project_files()
            file_tree = build_file_tree(files)
            matches = find_matching_files(files, pattern)

            if not matches:
                print(f"\nNo files matched: {pattern}")
                continue

            focused_context, focused_chars = read_focused_context(matches)

            print(f"\nUsing {len(matches)} focused files, {focused_chars:,} chars.")
            print("Thinking...\n")

            try:
                answer = ask_openai_focused(question, file_tree, focused_context)
                print("ChatGPT:\n")
                print(answer)
            except Exception as e:
                print("Error calling OpenAI:")
                print(e)

            continue

        print("\nScanning project files...")
        files = list_project_files()
        file_tree = build_file_tree(files)
        project_context, included_files, total_chars = read_project_context(files)

        print(
            f"Using {included_files} files and {total_chars:,} chars of project context."
        )
        print("Thinking...\n")

        try:
            answer = ask_openai(
                user_input=user_input,
                file_tree=file_tree,
                project_context=project_context,
                mode="broad project review",
            )
            print("ChatGPT:\n")
            print(answer)
        except Exception as e:
            print("Error calling OpenAI:")
            print(e)


if __name__ == "__main__":
    main()
