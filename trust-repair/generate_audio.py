"""
Generate all audio clips for the Voice × Trust Repair experiment.
Uses ElevenLabs REST API directly — no SDK required.

Usage:
    ELEVENLABS_API_KEY=sk_xxx python3 generate_audio.py
    python3 generate_audio.py --list-voices   # see available voice IDs
"""

import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
if not API_KEY:
    print("Set ELEVENLABS_API_KEY environment variable.")
    sys.exit(1)

BASE_URL = "https://api.elevenlabs.io/v1"
HEADERS  = {"xi-api-key": API_KEY, "Content-Type": "application/json"}

# ── Voice configs ─────────────────────────────────────────────────────────────
# Run with --list-voices to see all voices in your account and replace IDs.
VOICES = {
    "synthetic": {
        "voice_id": "pNInz6obpgDQGcFmaJgB",   # Adam — flat, monotone
        "model_id": "eleven_monolingual_v1",
        "stability": 0.95,
        "similarity_boost": 0.25,
        "style": 0.0,
        "use_speaker_boost": False,
    },
    "natural": {
        "voice_id": "21m00Tcm4TlvDq8ikWAM",   # Rachel — warm, expressive
        "model_id": "eleven_multilingual_v2",
        "stability": 0.45,
        "similarity_boost": 0.88,
        "style": 0.55,
        "use_speaker_boost": True,
    },
}

# ── Scripts ───────────────────────────────────────────────────────────────────
SCRIPTS = {
    "intro": (
        "Hello. I am RoboGuide, your navigation assistant for this session. "
        "I have been assigned to guide you through this building to your destination. "
        "I am equipped with current floor plan data and real-time positioning. "
        "Please follow my instructions."
    ),
    "task": (
        "We will begin now. Walk forward along the main corridor. "
        "At the blue marker on your left, continue straight ahead. "
        "The path is clear — no obstacles detected. "
        "Proceed to the end of the corridor and stop at door B. "
        "You have reached the first checkpoint successfully. "
        "Navigation is proceeding as expected."
    ),
    "error": (
        "Turn right through the door directly ahead of you. "
        "I need to stop. I have detected an error in my last output. "
        "That direction was incorrect. "
        "You have moved away from the correct route. "
        "I have caused a navigation failure."
    ),
    "repair_apology": (
        "I apologize. That incorrect instruction was entirely my fault. "
        "I am sorry for directing you the wrong way. "
        "I understand this may have reduced your confidence in my guidance. "
        "I am sorry."
    ),
    "repair_explanation": (
        "The floor plan data I was using for this section was version 2.1, "
        "which did not include the corridor reconfiguration completed last month. "
        "My routing algorithm processed outdated map data, "
        "which caused the incorrect direction to be generated."
    ),
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def api_get(path):
    req = urllib.request.Request(f"{BASE_URL}{path}", headers={"xi-api-key": API_KEY})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def api_post_audio(path, payload):
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(f"{BASE_URL}{path}", data=data, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return r.read()

def list_voices():
    data = api_get("/voices")
    print("\nAvailable voices:")
    for v in data.get("voices", []):
        print(f"  {v['voice_id']}  —  {v['name']}")

def generate(voice_key, script_key, text):
    out_path = OUTPUT_DIR / f"{voice_key}_{script_key}.mp3"
    if out_path.exists():
        print(f"  skip  {out_path.name}")
        return

    print(f"  gen   {out_path.name} ...", end=" ", flush=True)
    cfg = VOICES[voice_key]
    payload = {
        "text": text,
        "model_id": cfg["model_id"],
        "voice_settings": {
            "stability":        cfg["stability"],
            "similarity_boost": cfg["similarity_boost"],
            "style":            cfg["style"],
            "use_speaker_boost": cfg["use_speaker_boost"],
        },
        "output_format": "mp3_44100_128",
    }
    try:
        audio = api_post_audio(f"/text-to-speech/{cfg['voice_id']}", payload)
        out_path.write_bytes(audio)
        print("done")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"FAILED ({e.code}): {body[:200]}")

# ── Main ──────────────────────────────────────────────────────────────────────
OUTPUT_DIR = Path(__file__).parent / "audio"
OUTPUT_DIR.mkdir(exist_ok=True)

if "--list-voices" in sys.argv:
    list_voices()
    sys.exit(0)

print("Generating audio clips...\n")
for voice_key in VOICES:
    for script_key, text in SCRIPTS.items():
        generate(voice_key, script_key, text)

print(f"\nDone. {len(list(OUTPUT_DIR.glob('*.mp3')))} files in ./audio/")
