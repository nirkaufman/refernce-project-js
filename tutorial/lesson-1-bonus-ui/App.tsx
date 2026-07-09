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
