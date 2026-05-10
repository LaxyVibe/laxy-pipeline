"""Generate voice sample WAV files for all 6 AudioMvp voices using Gemini TTS."""
import os
import struct
import wave
from google import genai
from google.genai import types as genai_types

VOICES = [
    ("Aoede", "female"),
    ("Laomedeia", "female"),
    ("Sulafat", "female"),
    ("Algenib", "male"),
    ("Schedar", "male"),
    ("Sadaltager", "male"),
]

SAMPLE_TEXT = (
    "Welcome to the audio guide. "
    "Let me walk you through this fascinating story, "
    "one chapter at a time."
)

MODEL = "gemini-2.5-flash-preview-tts"
OUTPUT_DIR = os.path.join(
    os.path.dirname(__file__),
    "..",
    "laxy-studio",
    "public",
    "voice-samples",
)


def generate_sample(client: genai.Client, voice_id: str, output_path: str) -> None:
    """Generate a TTS sample for a single voice and save as WAV."""
    response = client.models.generate_content(
        model=MODEL,
        contents=SAMPLE_TEXT,
        config=genai_types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=genai_types.SpeechConfig(
                voice_config=genai_types.VoiceConfig(
                    prebuilt_voice_config=genai_types.PrebuiltVoiceConfig(
                        voice_name=voice_id,
                    )
                )
            ),
        ),
    )

    audio_data = response.candidates[0].content.parts[0].inline_data.data
    mime = response.candidates[0].content.parts[0].inline_data.mime_type
    print(f"  MIME: {mime}, raw bytes: {len(audio_data)}")

    # Gemini returns L16 (linear 16-bit PCM) at 24000 Hz
    sample_rate = 24000
    if "rate=" in mime:
        rate_str = mime.split("rate=")[1].split(";")[0]
        sample_rate = int(rate_str)

    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(audio_data)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"  Saved: {output_path} ({size_kb:.0f} KB)")


def main() -> None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set. Export it first.")

    client = genai.Client(api_key=api_key)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for voice_id, gender in VOICES:
        print(f"Generating sample for {voice_id} ({gender})...")
        out = os.path.join(OUTPUT_DIR, f"{voice_id.lower()}.wav")
        generate_sample(client, voice_id, out)

    print("\nDone! All voice samples generated.")


if __name__ == "__main__":
    main()
