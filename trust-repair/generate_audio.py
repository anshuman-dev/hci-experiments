"""
Generate all audio clips for the Voice × Trust Repair experiment.
Run once: python3 generate_audio.py
"""

import os, sys, json, urllib.request, urllib.error
from pathlib import Path

API_KEY = os.environ.get("ELEVENLABS_API_KEY", "38f7a49676cb99a0d6c99f8f5fcf95384e5c109c760235516f4fff4053ac6c03")
BASE    = "https://api.elevenlabs.io/v1"
HEADERS = {"xi-api-key": API_KEY, "Content-Type": "application/json"}

# Daniel = flat, measured broadcaster  →  synthetic condition
# Sarah  = warm, reassuring, confident →  natural condition
VOICES = {
    "synthetic": {
        "voice_id": "onwK4e9ZLuTAKqWW03F9",
        "model_id": "eleven_turbo_v2_5",
        "stability": 0.95, "similarity_boost": 0.25, "style": 0.0,
    },
    "natural": {
        "voice_id": "EXAVITQu4vr4xnSDxMaL",
        "model_id": "eleven_turbo_v2_5",
        "stability": 0.40, "similarity_boost": 0.88, "style": 0.55,
    },
}

SCRIPTS = {
    "intro": (
        "Hello. I am RoboGuide, your navigation assistant for this session. "
        "I have been assigned to guide you through this building to your destination. "
        "I am equipped with current floor plan data and real-time positioning. "
        "Please follow my instructions."
    ),
    "task": (
        "We will begin now. Walk forward along the main corridor. "
        "At the checkpoint marker, continue straight ahead. "
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
        "I understand this may have reduced your confidence in my guidance."
    ),
    "repair_explanation": (
        "The floor plan data I was using for this section was version 2.1, "
        "which did not include the corridor reconfiguration completed last month. "
        "My routing algorithm processed outdated map data, "
        "which caused the incorrect direction to be generated."
    ),
}

OUTPUT_DIR = Path(__file__).parent / "audio"
OUTPUT_DIR.mkdir(exist_ok=True)

def generate(voice_key, script_key, text):
    out = OUTPUT_DIR / f"{voice_key}_{script_key}.mp3"
    if out.exists():
        print(f"  skip  {out.name}")
        return
    print(f"  gen   {out.name} ...", end=" ", flush=True)
    cfg = VOICES[voice_key]
    payload = json.dumps({
        "text": text,
        "model_id": cfg["model_id"],
        "voice_settings": {
            "stability":        cfg["stability"],
            "similarity_boost": cfg["similarity_boost"],
            "style":            cfg["style"],
            "use_speaker_boost": cfg.get("use_speaker_boost", False),
        },
        "output_format": "mp3_44100_128",
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/text-to-speech/{cfg['voice_id']}",
        data=payload, headers=HEADERS
    )
    try:
        out.write_bytes(urllib.request.urlopen(req).read())
        print("done")
    except urllib.error.HTTPError as e:
        print(f"FAILED ({e.code}): {e.read().decode()[:200]}")

print("Generating audio clips...\n")
for vk in VOICES:
    for sk, text in SCRIPTS.items():
        generate(vk, sk, text)
print(f"\nDone. {len(list(OUTPUT_DIR.glob('*.mp3')))} files in ./audio/")
