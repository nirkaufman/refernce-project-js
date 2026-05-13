/**
 * REACT CHAT FRONTEND — LangChain useStream demo
 * -----------------------------------------------
 * A minimal chat UI that connects to the Express backend (server.ts)
 * using the `useStream` hook from @langchain/react.
 *
 * useStream handles all streaming state: messages, loading, submission.
 * The backend must expose a LangGraph-compatible API (see server.ts).
 */

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { useStream } from "@langchain/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TextBlock {
  type: "text";
  text: string;
}

interface ChatMessage {
  id: string;
  type: "human" | "ai";
  content: string | TextBlock[] | Array<unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  return (content as TextBlock[])
    .map((block) => (typeof block === "object" && block && "text" in block ? block.text : String(block)))
    .join("");
}

// ---------------------------------------------------------------------------
// App Component
// ---------------------------------------------------------------------------

function App() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // useStream connects to the LangGraph-compatible Express backend.
  // It manages the full message list, loading state, and submission.
  const { messages, isLoading, submit } = useStream<{ messages: ChatMessage[] }>({
    apiUrl: "http://localhost:2024",
    assistantId: "agent",
    messagesKey: "messages",
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    submit({ messages: [{ id: crypto.randomUUID(), type: "human" as const, content: text }] });
    setInput("");
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerDot} />
          <h1 style={styles.title}>LangChain Chat</h1>
          <span style={styles.badge}>useStream demo</span>
        </header>

        {/* Message list */}
        <div style={styles.messages}>
          {messages.length === 0 && (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>💬</div>
              <p style={styles.emptyText}>Start a conversation</p>
              <p style={styles.emptyHint}>Powered by LangChain + @langchain/react</p>
            </div>
          )}

          {messages.map((msg) => {
            const isHuman = msg.type === "human";
            return (
              <div key={msg.id} style={{ ...styles.row, justifyContent: isHuman ? "flex-end" : "flex-start" }}>
                {!isHuman && <div style={styles.avatar}>AI</div>}
                <div style={{ ...styles.bubble, ...(isHuman ? styles.humanBubble : styles.aiBubble) }}>
                  {extractText(msg.content)}
                </div>
                {isHuman && <div style={{ ...styles.avatar, ...styles.humanAvatar }}>You</div>}
              </div>
            );
          })}

          {isLoading && (
            <div style={{ ...styles.row, justifyContent: "flex-start" }}>
              <div style={styles.avatar}>AI</div>
              <div style={{ ...styles.bubble, ...styles.aiBubble, ...styles.typing }}>
                <span style={styles.dot} />
                <span style={{ ...styles.dot, animationDelay: "0.2s" }} />
                <span style={{ ...styles.dot, animationDelay: "0.4s" }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            style={styles.input}
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{
              ...styles.button,
              opacity: isLoading || !input.trim() ? 0.5 : 1,
              cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
            }}
          >
            Send
          </button>
        </form>
      </div>

      {/* Keyframe animation for typing dots */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #e0e7ff 0%, #f0fdf4 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    padding: "16px",
    boxSizing: "border-box",
  },
  container: {
    width: "100%",
    maxWidth: "720px",
    height: "90vh",
    maxHeight: "800px",
    display: "flex",
    flexDirection: "column",
    background: "#ffffff",
    borderRadius: "20px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "18px 24px",
    borderBottom: "1px solid #f0f0f0",
    background: "#fafafa",
  },
  headerDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#22c55e",
    boxShadow: "0 0 0 3px rgba(34,197,94,0.2)",
  },
  title: {
    margin: 0,
    fontSize: "17px",
    fontWeight: 700,
    color: "#111827",
    flex: 1,
  },
  badge: {
    fontSize: "11px",
    fontWeight: 500,
    color: "#6366f1",
    background: "#eef2ff",
    padding: "3px 10px",
    borderRadius: "20px",
    letterSpacing: "0.02em",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "24px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "60px",
    gap: "8px",
  },
  emptyIcon: {
    fontSize: "40px",
    marginBottom: "8px",
  },
  emptyText: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "#374151",
  },
  emptyHint: {
    margin: 0,
    fontSize: "13px",
    color: "#9ca3af",
  },
  row: {
    display: "flex",
    alignItems: "flex-end",
    gap: "8px",
  },
  avatar: {
    flexShrink: 0,
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    background: "#6366f1",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    letterSpacing: "0.02em",
  },
  humanAvatar: {
    background: "#2563eb",
  },
  bubble: {
    maxWidth: "72%",
    padding: "12px 16px",
    borderRadius: "16px",
    fontSize: "15px",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  humanBubble: {
    background: "#2563eb",
    color: "#ffffff",
    borderBottomRightRadius: "4px",
  },
  aiBubble: {
    background: "#f3f4f6",
    color: "#111827",
    borderBottomLeftRadius: "4px",
  },
  typing: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "14px 18px",
  },
  dot: {
    display: "inline-block",
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#9ca3af",
    animation: "bounce 1.2s infinite ease-in-out",
  },
  form: {
    display: "flex",
    gap: "10px",
    padding: "16px 20px",
    borderTop: "1px solid #f0f0f0",
    background: "#fafafa",
  },
  input: {
    flex: 1,
    padding: "11px 16px",
    border: "1.5px solid #e5e7eb",
    borderRadius: "12px",
    fontSize: "15px",
    outline: "none",
    background: "#ffffff",
    color: "#111827",
    transition: "border-color 0.15s",
  },
  button: {
    padding: "11px 22px",
    background: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "12px",
    fontSize: "15px",
    fontWeight: 600,
    transition: "opacity 0.15s",
    flexShrink: 0,
  },
};

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
