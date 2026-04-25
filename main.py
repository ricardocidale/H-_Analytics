from openai import OpenAI
from pathlib import Path
import os
import sys

# ============================================================
# Project-Aware ChatGPT for Replit
# TypeScript-Optimized + Faster File Scanner
# ============================================================
#
# What this does:
# - Runs inside Replit Shell
# - Reads your project files recursively
# - Optimized for TypeScript / React / Next / Vite projects
# - Skips huge folders like node_modules, .git, .pythonlibs, dist, build
# - Avoids slow full-workspace rglob scanning
# - Sends useful project context to OpenAI
#
# Before running:
# 1. Add OPENAI_API_KEY in Replit Secrets
# 2. Run: pip install openai
# 3. Run: python main.py
#
# Commands inside the app:
# - files  = show readable files
# - tree   = show project tree
# - exit   = quit
# ============================================================


# ----------------------------
# OpenAI client
# ----------------------------

MODEL = "gpt-5.5"
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

# Safety limits
MAX_FILE_CHARS = 30_000
MAX_LOCKFILE_CHARS = 12_000
MAX_TOTAL_CHARS = 300_000
MAX_FILES = 300


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


def file_priority(path: Path) -> int:
    """
    Lower number = higher priority.
    This helps the model see important TypeScript project files first.
    """
    try:
        rel = path.relative_to(ROOT)
        path_str = str(rel)
    except Exception:
        path_str = str(path)

    name = path.name
    suffix = path.suffix.lower()

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

    if path_str.startswith("src/") and suffix in {".ts", ".tsx"}:
        return 4

    if path_str.startswith("app/") and suffix in {".ts", ".tsx"}:
        return 4

    if path_str.startswith("pages/") and suffix in {".ts", ".tsx"}:
        return 4

    if path_str.startswith("components/") and suffix in {".ts", ".tsx"}:
        return 5

    if suffix in {".ts", ".tsx"}:
        return 6

    if suffix in {".js", ".jsx", ".mjs", ".cjs"}:
        return 7

    if suffix in {".html", ".css", ".scss", ".sass"}:
        return 8

    if name in {"README.md", "README"}:
        return 9

    if name in LOCKFILES:
        return 20

    return 10


def list_project_files():
    """
    Fast scanner for Replit.

    Important:
    Uses os.walk so we can prevent Python from descending into huge folders
    like node_modules and .pythonlibs.
    """
    files = []

    for current_root, dirs, filenames in os.walk(ROOT, followlinks=False):
        current_path = Path(current_root)

        # Skip hidden/system/dependency-heavy directories before descending
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

    files = sorted(files, key=lambda p: (file_priority(p), str(p)))

    return files[:MAX_FILES]


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

    for path in files:
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
    print("Fast scanner enabled")
    print("--------------------------------")
    print("Type your question and press Enter.")
    print("Type 'files' to see which files are being read.")
    print("Type 'tree' to show the project file tree.")
    print("Type 'exit' or 'quit' to stop.")
    print("--------------------------------")

    print("\nScanning project files...")
    files = list_project_files()
    file_tree = build_file_tree(files)

    print(f"Loaded {len(files)} readable project files.")

    while True:
        user_input = input("\nYou: ").strip()

        if not user_input:
            continue

        if user_input.lower() in {"exit", "quit"}:
            print("\nGoodbye.")
            break

        if user_input.lower() in {"files", "tree"}:
            files = list_project_files()
            file_tree = build_file_tree(files)

            print("\nReadable project files:\n")
            print(file_tree or "[No readable project files found.]")
            continue

        # Refresh each turn so new edits are picked up
        print("\nScanning project files...")
        files = list_project_files()
        file_tree = build_file_tree(files)
        project_context = read_project_context(files)

        print("Thinking...\n")

        try:
            answer = ask_openai(user_input, file_tree, project_context)
            print("ChatGPT:\n")
            print(answer)
        except Exception as e:
            print("Error calling OpenAI:")
            print(e)


if __name__ == "__main__":
    main()
