import os
from openai import OpenAI  

# Debug: Print environment variables
print(f"API Key (first 20 chars): {os.getenv('OPENAI_API_KEY', 'NOT SET')[:20]}...")
print(f"Base URL: {os.getenv('OPENAI_BASE_URL', 'NOT SET')}")

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url=os.getenv("OPENAI_BASE_URL"),
    timeout=30.0  # Add explicit timeout
)  

# Try to list available models first
try:
    models = client.models.list()
    print("\nAvailable models:")
    for model in models.data:
        print(f"  - {model.id}")
except Exception as e:
    print(f"Could not list models: {e}")

# Use the correct OpenAI SDK method for chat completions
# Try common Bedrock model names
model_to_try = "openai.gpt-oss-120b"  # From the available models list

print(f"\nTrying model: {model_to_try}")
response = client.chat.completions.create(
    model=model_to_try,
    messages=[
        {"role": "user", "content": "Write a one-sentence bedtime story about a unicorn."}
    ],
    max_tokens=100
)  

print(response.choices[0].message.content)
