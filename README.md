# isGrace — Your AI Study Partner

> Turn reading into knowing.

isGrace is a free, open-source desktop app that helps you study smarter. Instead of passively consuming content, you actively produce output — summaries, cheatsheets, tests — guided by any AI model you already have access to.

![isGrace Screenshot](public/assets/grace-avatar.png)

## Why isGrace?

- **Active output learning** — AI doesn't learn for you. You answer questions, write summaries, take tests. Grace facilitates; you do the work.
- **Any model, your key, always free** — bring your own API key (Anthropic, OpenRouter, Gemini). No subscription. No middleman.
- **Study materials always persist** — cheatsheets and subject history are saved to your local disk, organised by subject.
- **Your data never leaves your device** — no servers, no telemetry. Everything stays local.
- **Built for large textbooks** — use Claude (200k context) or Gemini (1M+) to handle entire textbooks in a single session.

## Features

- Chat with Grace about your study materials
- Upload PDFs, Word docs, or plain text
- Generate interactive cheatsheets and study guides
- Take auto-generated tests (MC + essay) graded by AI
- Organise subjects in a persistent sidebar
- Bilingual support (English & 中文)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An API key from [Anthropic](https://console.anthropic.com/), [OpenRouter](https://openrouter.ai/), or [Google AI Studio](https://aistudio.google.com/)

### Run in development

```bash
npm install
npm run dev
```

### Build a distributable

```bash
npm run dist
```

This produces a `.dmg` (macOS), `.exe` installer (Windows), or `.AppImage` (Linux) in the `release/` folder.

## Tech Stack

- [Electron](https://www.electronjs.org/) — desktop shell
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) — UI
- [Vite](https://vitejs.dev/) — bundler
- [Tailwind CSS v4](https://tailwindcss.com/) — styling
- [Zustand](https://zustand-demo.pmnd.rs/) — state management

## License

MIT
