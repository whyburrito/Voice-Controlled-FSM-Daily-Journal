# Hands-Free Voice-Activated Journal

A hands-free, voice-driven journaling and note-taking web application controlled by a **6-State Finite-State Machine (FSM)** and **Regular Expressions (Regex)**.

**Live Demo:** https://voice-controlled-fsm-daily-journal.vercel.app/

## Proponents
- Lloyd Lorenzo
- Noah Peñaranda
- Sean Salvador
- Aerown Tamayo

*Course: Automata Theory and Formal Languages (CS205 - 2)*

---

## Features

- **6-State Deterministic FSM:** Enforces strict state transitions (`OFFLINE` → `IDLE_MONITORING` → `ACTIVE_RECORDING` → `PROCESSING_TEXT` → `CONFIRMATION` → `SAVED`) with real-time state diagram visualization and persistent transition history.
- **Regex / DFA Metadata Extraction:** Automatically extracts inline tags (`"hashtag school"`, `"tag as homework"`, `#idea`), priority markers (`"priority high"`, `"low priority"`, `"mark as urgent"`), and temporal expressions (dates and times) while stripping command phrases from the saved note body.
- **3 Selectable Speech-to-Text Engines:**
  - **Cloud AI (Groq `whisper-large-v3-turbo`):** High-accuracy transcription with automatic peak volume normalization and `.wav` phrase segmentation.
  - **Browser Speech (`Web Speech API`):** Native Chromium (`SpeechRecognition`) streaming transcription.
  - **Local AI (`Xenova/whisper-tiny.en`):** 100% offline in-browser WebAssembly speech recognition running in a Web Worker.
- **Hardware & Background Controls:**
  - **Web Audio API (`AudioContext` + `AudioWorklet`):** Real-time 16kHz audio capture, RMS level metering, 5-second silence auto-stop detection, and procedural audio chimes.
  - **Microphone Picker & Sensitivity Slider:** Live microphone device hot-swapping and adjustable voice trigger threshold shown directly on the volume meter.
  - **Off-Screen Visual Cues:** Dynamic browser tab favicon and title badge (`🔵 Idle`, `🔴 RECORDING…`, `🟢 SAVED!`) plus desktop OS notifications on recording start, save, and cancel.
- **Local Database & Portability:** Persists entries and FSM transition logs in browser `IndexedDB` (via `Dexie.js`) with tag filtering, inline editing, and 1-click JSON export/import.

---

## FSM State Table

| State | Responsibility | Key Transitions |
| :--- | :--- | :--- |
| `OFFLINE` | Initial state before listener starts. | `START` → `IDLE_MONITORING` |
| `IDLE_MONITORING` | Monitors audio for the wake phrase; ignores and discards all non-wake speech. | `WAKE` → `ACTIVE_RECORDING`, `SHUTDOWN` → `OFFLINE` |
| `ACTIVE_RECORDING` | Captures spoken journal entry and inline metadata commands. | `STOP` / `SILENCE` (5s) → `PROCESSING_TEXT`, `CANCEL` / `RESET` → `IDLE_MONITORING` |
| `PROCESSING_TEXT` | Runs Regex extraction for tags, priorities, dates, and times. | `PARSED` → `CONFIRMATION`, `INVALID` → `IDLE_MONITORING` |
| `CONFIRMATION` | Verifies the structured entry contains valid content before storage. | `CONFIRM` → `SAVED`, `REJECT` → `IDLE_MONITORING` |
| `SAVED` | Persists the structured entry to `IndexedDB` and notifies the user. | `DONE` → `IDLE_MONITORING` |

---

## Voice Commands

| Spoken Phrase | Effect |
| :--- | :--- |
| `"Hey Journal, start note"` | Transitions `IDLE_MONITORING` → `ACTIVE_RECORDING` |
| `"Save note"` or **5 seconds of silence** | Transitions `ACTIVE_RECORDING` → `PROCESSING_TEXT` |
| `"Cancel note"` or `"Discard this note"` | Cancels recording and returns to `IDLE_MONITORING` |
| `"hashtag homework"`, `"tag as school"`, `#idea` | Extracts `#homework`, `#school`, `#idea` tags |
| `"priority high"`, `"low priority"`, `"mark as urgent"` | Sets priority (`high`, `medium`, `low`) |
| `"tomorrow"`, `"next Friday"`, `"November 25th"`, `"11:30pm"` | Extracts date and time chips |

---

## Getting Started Locally

### Requirements
- Node.js 20+
- Modern desktop browser (Google Chrome or Microsoft Edge recommended)

### Installation

```bash
npm install
npm run dev
```

Open http://localhost:5173/, choose a speech engine (or paste a free [Groq API key](https://console.groq.com/keys) in the control bar / set `VITE_GROQ_API_KEY` in `.env`), and click **Start Background Listener**.

### Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the local Vite development server |
| `npm run build` | Typecheck and build for production (`dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest unit tests (FSM, Regex parser, transcript cursor) |

---

## Project Structure

```text
src/
  core/
    fsm.ts            6-state Finite-State Machine definition and transition table
    parser.ts         Regex / DFA wake, stop, cancel, tag, priority, date & time parser
    cursor.ts         Streaming transcript cursor separating idle speech from active notes
    controller.ts     Orchestrates FSM, audio monitor, speech engines, notifications & DB
    tabIndicator.ts   Dynamic browser tab favicon and title state indicator
  audio/
    audioMonitor.ts   Web Audio API (AudioContext, AudioWorklet, device switching, chimes)
    groqSpeech.ts     Groq Cloud Whisper (whisper-large-v3-turbo) phrase segmenter
    localSpeech.ts    Local in-browser Whisper (Xenova/whisper-tiny.en) manager
    whisper.worker.ts Web Worker running local ONNX Whisper inference
    speech.ts         Browser Web Speech API wrapper with auto-restart
    wav.ts            Peak volume normalizer and 16kHz mono WAV encoder
  db/
    db.ts             Dexie.js IndexedDB schema and JSON export/import helpers
  components/         React UI (ControlBar, StateDiagram, EntryList, Simulator, TransitionLog)
public/
  rms-processor.js    AudioWorkletProcessor for real-time RMS metering and 16kHz downsampling
```
