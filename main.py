from openai import OpenAI
from pathlib import Path
import os
import sys

# ============================================================
# Project-Aware ChatGPT for Replit
# TypeScript-Optimized Version
# ============================================================
# What this does:
# - Runs inside Replit Shell
# - Reads your project recursively
# - Optimized for TypeScript / React / Next / Vite projects
# - Skips junk folders like node_modules, .git, dist, build, etc.
# - Reads useful files like .ts, .tsx, package.json, tsconfig.json
# - Sends project context to OpenAI
#
# Before running:
# 1. Add OPENAI_API_KEY in Replit Secrets
# 2. Run: pip install openai
# 3. Run: python main.py
# ============================================================


# ----------------------------
# OpenAI client
# ----------------------------

client = OpenAI()

MODEL = "gpt-5.5"


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

# Lockfiles can be useful but large.
# They will be read only up to MAX_LOCKFILE_CHARS.
LOCKFILES = {
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
}

MAX_FILE_CHARS = 30_000
MAX_LOCKFILE_CHARS = 12_000
MAX_TOTAL_CHARS = 300_000


# ----------------------------
# Helpers
# ----------------------------


def check_api_key():
    if not os.environ.get("OPENAI_API_KEY"):
        print("\nMissing OPENAI_API_KEY.")
        print("In Replit, go to Tools -> Secrets and add:")
        print("OPENAI_API_KEY = your OpenAI API key")
        sys.exit(1)


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


def list_project_files():
    files = []

    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue

        if should_skip_path(path):
            continue

        if not is_probably_text_file(path):
            continue

        files.append(path)

    return files


def file_priority(path: Path) -> int:
    """
    Lower number = higher priority.
    This helps the model see important TypeScript project files first.
    """
    name = path.name
    path_str = str(path)

    if name == "package.json":
        return 1

    if name.startswith("tsconfig"):
        return 2

    if name in {
        "vite.config.ts",
        "vite.config.js",
        "next.config.ts",
        "next.config.js",
        "tailwind.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        "eslint.config.js",
        "eslint.config.mjs",
        ".replit",
        "replit.nix",
    }:
        return 3

    if path_str.startswith("src/") and path.suffix.lower() in {".ts", ".tsx"}:
        return 4

    if path.suffix.lower() in {".ts", ".tsx"}:
        return 5

    if path.suffix.lower() in {".js", ".jsx", ".mjs", ".cjs"}:
        return 6

    if path.suffix.lower() in {".html", ".css", ".scss", ".sass"}:
        return 7

    if name in {"README.md", "README"}:
        return 8

    if name in LOCKFILES:
        return 20

    return 10


def build_file_tree(files):
    lines = []

    for path in files:
        try:
            rel = path.relative_to(ROOT)
            lines.append(str(rel))
        except Exception:
            continue

    return "\n".join(lines)


def read_project_context(files):
    chunks = []
    total_chars = 0

    sorted_files = sorted(files, key=lambda p: (file_priority(p), str(p)))

    for path in sorted_files:
        try:
            rel = path.relative_to(ROOT)
        except Exception:
            continue

        content = safe_read_text(path)

        if not content.strip():
            continue

        max_chars = MAX_LOCKFILE_CHARS if path.name in LOCKFILES else MAX_FILE_CHARS

        if len(content) > max_chars:
            content = content[:max_chars] + "\n\n[File truncated because it is large.]"

        file_block = f"\n\n--- FILE: {rel} ---\n{content}"

        if total_chars + len(file_block) > MAX_TOTAL_CHARS:
            chunks.append("\n\n[Project context truncated because the repo is large.]")
            break

        chunks.append(file_block)
        total_chars += len(file_block)

    return "".join(chunks)


def ask_openai(user_input, file_tree, project_context):
    prompt = f"""
You are acting as a project-aware coding assistant inside a Replit workspace.

This project is mainly TypeScript / JavaScript, so pay close attention to:
- package.json
- tsconfig files
- vite / next / react config
- src/**/*.ts
- src/**/*.tsx
- frontend/backend boundaries
- imports, routes, components, APIs, and runtime errors

You are given the user's project file tree and the contents of many project files.

Use the actual files shown below. Do not pretend to inspect files that are not included.

PROJECT FILE TREE:
{file_tree}

PROJECT FILE CONTENTS:
{project_context}

USER REQUEST:
{user_input}

Instructions:
- Be practical and direct.
- Base your answer on the actual project files above.
- If you identify a bug, name the file and explain the fix.
- If code changes are needed, say exactly which file to edit.
- If replacing code, provide the full replacement block.
- If creating a new file, provide the full file contents.
- If there are multiple options, recommend the safest one.
- If the project context was truncated and you need a missing file, say so clearly.
- Do not make unnecessary changes.
"""

    response = client.responses.create(
        model=MODEL,
        reasoning={"effort": "medium"},
        text={"verbosity": "medium"},
        input=prompt,
    )

    return response.output_text


# ----------------------------
# Main loop
# ----------------------------


def main():
    check_api_key()

    print("\nProject-Aware ChatGPT in Replit")
    print("--------------------------------")
    print("TypeScript-optimized version")
    print("--------------------------------")
    print("Type your question and press Enter.")
    print("Type 'exit' or 'quit' to stop.")
    print("Type 'files' to see which files are being read.")
    print("--------------------------------")

    files = list_project_files()
    files = sorted(files, key=lambda p: (file_priority(p), str(p)))
    file_tree = build_file_tree(files)

    print(f"\nLoaded {len(files)} readable project files.")

    while True:
        user_input = input("\nYou: ").strip()

        if not user_input:
            continue

        if user_input.lower() in {"exit", "quit"}:
            print("\nGoodbye.")
            break

        if user_input.lower() == "files":
            files = list_project_files()
            files = sorted(files, key=lambda p: (file_priority(p), str(p)))
            file_tree = build_file_tree(files)

            print("\nReadable project files:\n")
            print(file_tree or "[No readable project files found.]")
            continue

        # Refresh project context each turn so changes are picked up
        files = list_project_files()
        files = sorted(files, key=lambda p: (file_priority(p), str(p)))
        file_tree = build_file_tree(files)
        project_context = read_project_context(files)

        print("\nThinking...\n")

        try:
            answer = ask_openai(user_input, file_tree, project_context)
            print("ChatGPT:\n")
            print(answer)
        except Exception as e:
            print("Error calling OpenAI:")
            print(e)


if __name__ == "__main__":
    main()
