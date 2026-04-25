#!/usr/bin/env python3
from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("KIMI_API_KEY", ""),
    base_url="https://api.kimi.com/coding/v1",
    default_headers={"User-Agent": "KimiCLI/1.30.0"},
)

models = [
    "kimi-for-coding",
    "kimi-k2.5",
    "k2p5",
    "kimi-k2.5-latest",
]

for model in models:
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=10,
        )
        print(f"OK: {model}")
    except Exception as e:
        print(f"FAIL: {model} - {type(e).__name__}: {e}")
