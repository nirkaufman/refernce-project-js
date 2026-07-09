# Lesson 1 Bonus — Custom UI with `useStream`

Implementation of [`../lesson-1-bonus-ui.md`](../lesson-1-bonus-ui.md): the same Lesson 1 agent (`createAgent`, no tools) exposed through `npx langgraphjs dev`, with a minimal one-file React chat UI connected via `@langchain/react`'s `useStream` hook — no custom backend.

```
lesson-1-bonus-ui/
├── .env.example
├── langgraph.json
├── package.json
├── src/
│   ├── models.ts
│   └── index.ts        # exports `agent`
└── ui/
    ├── index.html
    ├── App.tsx          # the entire frontend
    ├── vite.config.ts
    └── package.json
```

## Setup

```bash
cd lesson-1-bonus-ui
cp .env.example .env   # add your real OPENAI_API_KEY
npm install

cd ui
npm install
```

## Run (two terminals)

**Terminal 1 — agent dev server:**

```bash
cd lesson-1-bonus-ui
npx langgraphjs dev
# → http://localhost:2024
```

**Terminal 2 — chat UI:**

```bash
cd lesson-1-bonus-ui/ui
npm run dev
# → http://localhost:5173
```

Open the Vite URL and chat with the agent.
