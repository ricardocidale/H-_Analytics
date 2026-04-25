from openai import OpenAI
from pathlib import Path

client = OpenAI()

# Files the assistant is allowed to read
ALLOWED_FILES = [
    "main.py",
    "README.md",
    "requirements.txt",
    "pyproject.toml",
    ".replit",
]


def read_project_files():
    project_context = ""

    for file_name in ALLOWED_FILES:
        path = Path(file_name)

        if path.exists() and path.is_file():
            try:
                content = path.read_text(errors="ignore")
                project_context += f"\n\n--- FILE: {file_name} ---\n"
                project_context += content[:8000]  # prevents sending huge files
            except Exception as e:
                project_context += f"\n\n--- FILE: {file_name} ---\n"
                project_context += f"Could not read file: {e}"

    return project_context


print("Project-aware ChatGPT in Replit. Type 'exit' to quit.")
print("It can read selected project files before answering.")

while True:
    user_input = input("\nYou: ")

    if user_input.lower() in ["exit", "quit"]:
        break

    project_context = read_project_files()

    prompt = f"""
You are helping with a Replit project.

Here are the project files you can inspect:

{project_context}

User request:
{user_input}

Give practical, direct help. If code changes are needed, explain exactly what to replace or add.
"""

    response = client.responses.create(
        model="gpt-5.5",
        reasoning={"effort": "medium"},
        text={"verbosity": "medium"},
        input=prompt,
    )

    print("\nChatGPT:", response.output_text)
