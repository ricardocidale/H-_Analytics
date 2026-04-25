from openai import OpenAI

client = OpenAI()

response = client.responses.create(
    model="gpt-5.5",
    reasoning={"effort": "low"},
    text={"verbosity": "medium"},
    input="You are running inside Replit. Explain in one sentence what you can do.",
)

print(response.output_text)
