# Hands-Free Voice-Activated Journal

A voice-driven journaling web app controlled by a 6-state Finite-State Machine and Regular Expressions.

## Stack

- Vite + React + TypeScript + Tailwind CSS
- Web Audio API (`AudioContext` + `AudioWorklet`) for keeping the tab alive, silence detection, and chimes
- Web Speech API for live transcription
- IndexedDB via Dexie.js for persistence

## Requirements

- Node.js 20+
- Desktop Google Chrome or Microsoft Edge (the Web Speech API is not available in Firefox)

## Getting Started

```bash
npm install
npm run dev
```

Open the printed URL, click **Start Background Listener**, and allow microphone access.

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build for production |
| `npm test` | Run unit tests (FSM, parser, transcript cursor) |

## Voice Commands

| Phrase | Effect |
| :--- | :--- |
| "Hey Journal, start note" | `IDLE_MONITORING` → `ACTIVE_RECORDING` |
| "Save note" / 3 seconds of silence | `ACTIVE_RECORDING` → `PROCESSING_TEXT` |
| "Cancel note" | `ACTIVE_RECORDING` → `IDLE_MONITORING` |
| "hashtag homework", "tag as school", `#idea` | Adds a tag |
| "priority high", "low priority", "mark as urgent" | Sets priority |
| "tomorrow", "next friday", "March 3rd", "5pm" | Extracted as dates/times |

## Project Structure

```
src/
  core/        FSM, regex parser, transcript cursor, controller
  audio/       AudioContext monitor and Web Speech wrapper
  db/          Dexie database
  components/  UI
public/
  rms-processor.js   AudioWorklet for RMS levels
```
