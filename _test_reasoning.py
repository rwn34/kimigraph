#!/usr/bin/env python3
from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("KIMI_API_KEY", ""),
    base_url="https://api.kimi.com/coding/v1",
    default_headers={"User-Agent": "KimiCLI/1.30.0"},
)

# Test with reasoning_effort (what upstream now sends)
try:
    resp = client.chat.completions.create(
        model="kimi-for-coding",
        messages=[{"role": "user", "content": "hi"}],
        max_tokens=10,
        reasoning_effort="medium",
    )
    print("OK with reasoning_effort=medium")
except Exception as e:
    print(f"FAIL with reasoning_effort: {type(e).__name__}: {e}")

# Test with extra_body.thinking
try:
    resp = client.chat.completions.create(
        model="kimi-for-coding",
        messages=[{"role": "user", "content": "hi"}],
        max_tokens=10,
        extra_body={"thinking": {"type": "disabled"}},
    )
    print("OK with extra_body.thinking=disabled")
except Exception as e:
    print(f"FAIL with extra_body.thinking: {type(e).__name__}: {e}")

# Test with both
try:
    resp = client.chat.completions.create(
        model="kimi-for-coding",
        messages=[{"role": "user", "content": "hi"}],
        max_tokens=10,
        reasoning_effort="medium",
        extra_body={"thinking": {"type": "disabled"}},
    )
    print("OK with both")
except Exception as e:
    print(f"FAIL with both: {type(e).__name__}: {e}")
