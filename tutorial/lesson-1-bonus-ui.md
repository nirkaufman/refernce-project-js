# Lesson 1 Bonus — A Custom UI for Your Agent with `useStream`

**Duration:** ~15 minutes
**Goal:** Replace LangGraph Studio with your own minimal React chat UI, talking to the *same* `npx langgraphjs dev` server from Lesson 1, using the `useStream` hook from `@langchain/react`.

**Prerequisite:** the Lesson 1 bonus section ("LangGraph server and studio") — you need `langgraph.json` in place and `npx langgraphjs dev` running on `http://localhost:2024`.

**By the end of this lesson, participants have:**

```
content-studio/
└── ui/
    ├── index.html
    ├── App.tsx
    ├── vite.config.ts
    └── package.json
```

---

## Step 1 — Why a custom UI? (0:00–2:00)

🎙️ **Script**

> Studio is great for debugging — you saw that in Lesson 1's bonus. But Studio is *your* tool, not something you'd hand to an end user. Sooner or later you want your agent behind a real chat interface: your own branding, your own layout, embedded in your own product.
>
> Here's the good news: the `npx langgraphjs dev` server you already have running doesn't only power Studio. It exposes a full REST API — the same one Studio talks to. Anything that speaks that API can drive your agent. And LangChain gives us exactly that client: `@langchain/react`, and its one hook, `useStream`.
>
> We're going to build the smallest possible frontend that proves this: one file, plain CSS, no state management library, no component tree. Just `useStream` doing the heavy lifting.

🛠️ **Instructions**

- Make sure the Lesson 1 dev server is still running: `npx langgraphjs dev`.
- Leave that terminal open — we're adding a second app alongside it, not replacing it.

---

## Step 2 — Scaffold the `ui/` folder (2:00–6:00)

🎙️ **Script**

> This UI is a separate little Vite + React app. It doesn't need `langchain` or `@langchain/openai` at all — it never talks to OpenAI directly. It only needs React, Vite, and one package: `@langchain/react`, which ships the `useStream` hook.

🛠️ **Instructions** — from the `content-studio` root:

```bash
mkdir ui && cd ui
npm init -y
npm install react react-dom @langchain/react
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom
```

Edit `ui/package.json` — add a dev script and mark it a module:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite"
  }
}
```

Create `ui/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

Create `ui/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Content Studio Chat</title>
  </head>
  <body style="margin:0">
    <div id="root"></div>
    <script type="module" src="/App.tsx"></script>
  </body>
</html>
```

🎙️ **Script**

> Nothing new here — same Vite + React skeleton you've seen for any single-page app. The interesting part is next.

---

## Step 3 — The whole app in one file (6:00–13:00)

🎙️ **Script**

> Here's the entire frontend. One file: `App.tsx`. It renders a message list and an input box, and `useStream` supplies everything else — the messages array, a loading flag, and a `submit` function. No `fetch`, no manual SSE parsing, no reducer. That's the whole point of the hook: it already knows the LangGraph Server protocol your dev server speaks.
>
> Notice the styling too: one `<style>` tag with plain CSS classes, right in the file. No CSS-in-JS, no separate stylesheet to wire up — for a one-file demo, plain CSS is the simplest thing that works.

🛠️ **Instructions** — create `ui/App.tsx`:

```tsx
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { useStream } from "@langchain/react";

function App() {
  const [input, setInput] = useState("");

  // useStream talks directly to the `npx langgraphjs dev` server —
  // the same server and the same "agent" graph that Studio uses.
  const { messages, isLoading, submit } = useStream({
    apiUrl: "http://localhost:2024",
    assistantId: "agent",
    messagesKey: "messages",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    submit({ messages: [{ type: "human", content: input }] });
    setInput("");
  }

  return (
    <>
      <style>{`
        body { font-family: system-ui, sans-serif; background: #f5f5f7; }
        .chat { max-width: 560px; margin: 40px auto; background: #fff;
          border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          display: flex; flex-direction: column; height: 80vh; }
        .messages { flex: 1; overflow-y: auto; padding: 20px; }
        .bubble { max-width: 75%; margin: 6px 0; padding: 10px 14px;
          border-radius: 14px; line-height: 1.4; white-space: pre-wrap; }
        .human { margin-left: auto; background: #2563eb; color: #fff; }
        .ai { background: #eee; color: #111; }
        .composer { display: flex; gap: 8px; padding: 16px; border-top: 1px solid #eee; }
        .composer input { flex: 1; padding: 10px 12px; border: 1px solid #ddd;
          border-radius: 8px; font-size: 14px; }
        .composer button { padding: 10px 18px; border: none; border-radius: 8px;
          background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
        .composer button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div className="chat">
        <div className="messages">
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.type === "human" ? "human" : "ai"}`}>
              {typeof m.content === "string" ? m.content : JSON.stringify(m.content)}
            </div>
          ))}
          {isLoading && <div className="bubble ai">…</div>}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the content strategist…"
            disabled={isLoading}
            autoFocus
          />
          <button type="submit" disabled={isLoading || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
```

🎙️ **Script**

> Walk through the three pieces of `useStream`:
>
> `apiUrl` is just where your dev server is listening — `http://localhost:2024`, the address `npx langgraphjs dev` printed in Lesson 1.
>
> `assistantId` has to match a key in `langgraph.json`'s `graphs` object. Ours is `"agent"` — same file, same name, no changes needed.
>
> `messagesKey` tells `useStream` which field of your agent's state holds the message list. Our agent's state is `{ messages: [...] }`, exactly what `createAgent` expects — so `"messages"` matches out of the box.
>
> From there, `submit()` sends a new human message, and the `messages` array `useStream` returns updates live as the agent streams its answer back — token by token, the same way Studio's chat panel does it. We didn't write a single line of streaming logic.

---

## Step 4 — Run it (13:00–15:00)

🎙️ **Script**

> Two terminals, same as any full-stack app. Terminal one is the agent server from Lesson 1. Terminal two is this UI.

🛠️ **Instructions**

Terminal 1 (if not already running):

```bash
npx langgraphjs dev
```

Terminal 2:

```bash
cd ui
npm run dev
```

Open the printed Vite URL (typically `http://localhost:5173`). Type a topic, hit Send, and watch the response stream in.

🎙️ **Script**

> That's it — same agent, same dev server, brand new interface. Nothing about `src/index.ts` or `models.ts` changed. This is the payoff of building on `createAgent` and the LangGraph server from day one: the moment you need a real UI, you're not rewriting your agent, you're just pointing `useStream` at it.
>
> Keep this `ui/` folder around — as we add tools and more agents in the coming lessons, this same chat window keeps working, no changes needed, because it never knew or cared what the agent does internally. It only speaks the LangGraph Server protocol.
