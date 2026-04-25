from openai import OpenAI

client = OpenAI()

print("ChatGPT in Replit. Type 'exit' to quit.")

while True:
    user_input = input("\nYou: ")

    if user_input.lower() in ["exit", "quit"]:
        break

    response = client.responses.create(
        model="gpt-5.5",
        reasoning={"effort": "low"},
        text={"verbosity": "medium"},
        input=user_input,
    )

    print("\nChatGPT:", response.output_text)
