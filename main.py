from openai import OpenAI
from pathlib import Path

client = OpenAI()

ROOT = Path(".").resolve()

# Folders that should almost never be sent to the model
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
    ".venv",
    "venv",
    "env",
    "dist",
    "build",
    "target",
    ".next",
    ".nuxt",
    ".replit",
}

# File extensions we usually do NOT want to read
SKIP_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".svg",
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

# Readable project/code file extensions
TEXT_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".html",
    ".css",
    ".scss",
    ".json",
    ".toml",
    ".yaml",
    ".yml",
    ".md",
    ".txt",
    ".sql",
    ".sh",
    ".bash",
    ".env.example",
    ".gitignore",
    ".replit",
    ".nix",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".java",
    ".go",
    ".rs",
    ".php",
    ".rb",
}

MAX_FILE_CHARS = 20_000
MAX_TOTAL_CHARS = 180_000


def should_skip_path(path: Path) -> bool:
    parts = set(path.parts)

    if parts & SKIP_DIRS:
        return True

    if path.suffix.lower() in SKIP_EXTENSIONS:
        return True

    return False


def is_probably_text_file(path: Path) -> bool:
    if path.name in {".replit", ".gitignore", "Dockerfile"}:
        return True

    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True

    return False


def build_file_tree() -> str:
    lines = []

    for path in sorted(ROOT.rglob("*")):
        if should_skip_path(path):
            continue

        rel = path.relative_to(ROOT)

        if path.is_dir():
            continue

        if is_probably_text_file(path):
            lines.append(str(rel))

    return "\n".join(lines)


def read_project_files() -> str:
    chunks = []
    total_chars = 0

    files = sorted(ROOT.rglob("*"))

    for path in files:
        if not path.is_file():
            continue

        if should_skip_path(path):
            continue

        if not is_probably_text_file(path):
            continue

        rel = path.relative_to(ROOT)

        try:
            content = path.read_text(errors="ignore")
        except Exception as e:
            content = f"Could not read file: {e}"

        if not content.strip():
            continue

        if len(content) > MAX_FILE_CHARS:
            content = (
                content[:MAX_FILE_CHARS] + "\n\n[File truncated because it is large.]"
            )

        file_block = f"\n\n--- FILE: {rel} ---\n{content}"

        if total_chars + len(file_block) > MAX_TOTAL_CHARS:
            chunks.append("\n\n[Project context truncated because the repo is large.]")
            break

        chunks.append(file_block)
        total_chars += len(file_block)

    return "".join(chunks)


print("Project-aware ChatGPT in Replit.")
print("Type 'exit' to quit.")
print("This version scans the workspace and reads many project files.")

while True:
    user_input = input("\nYou: ")

    if user_input.lower() in ["exit", "quit"]:
        break

    file_tree = build_file_tree()
    project_context = read_project_files()

    prompt = f"""
You are acting as a coding assistant inside a Replit project.

You can inspect the user's project files from the provided context.

PROJECT FILE TREE:
{file_tree}

PROJECT FILE CONTENTS:
{project_context}

USER REQUEST:
{user_input}

Instructions:
- Give practical, direct help.
- Use the actual project files above.
- If changes are needed, say exactly which file to edit.
- If replacing code, provide the full replacement block.
- If you cannot see a needed file, say so clearly.
- Do not pretend you inspected files that are not included.
"""

    response = client.responses.create(
        model="gpt-5.5",
        reasoning={"effort": "medium"},
        text={"verbosity": "medium"},
        input=prompt,
    )

    print("\nChatGPT:", response.output_text)
