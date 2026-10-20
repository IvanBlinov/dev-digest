import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface TourMarkdownProps {
  text: string;
  /** Paths from the tour's index; only inline code naming one of them becomes a link. */
  knownPaths: readonly string[];
  hrefFor: (path: string) => string;
  /** Render paragraphs as spans (for one-line contexts). */
  inline?: boolean;
}

/** Markdown for model-written tour text. No raw HTML, images or model-authored links (AC-67);
 *  the only links are inline code that names a known path (AC-40). */
export function TourMarkdown({ text, knownPaths, hrefFor, inline = false }: TourMarkdownProps) {
  if (!text) return null;
  const known = new Set(knownPaths);
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img", "a"]}
        unwrapDisallowed
        components={{
          p: ({ children }) =>
            inline ? <span>{children}</span> : <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => {
            const value = String(children ?? "");
            const code = (
              <code
                className="mono"
                style={{
                  fontSize: "0.92em",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "var(--bg-hover)",
                  color: "var(--accent-text)",
                }}
              >
                {children}
              </code>
            );
            if (!known.has(value)) return code;
            return (
              <a
                href={hrefFor(value)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "underline" }}
              >
                {code}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
