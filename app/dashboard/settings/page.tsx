"use client";

import { useEffect, useState } from "react";
import { Plus, X, Loader2, CornerDownLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EndWord {
  id: string;
  word: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [words, setWords] = useState<EndWord[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const loadWords = async () => {
    try {
      const response = await fetch("/api/settings/end-words");
      if (!response.ok) throw new Error("Failed to load end words");
      setWords(await response.json());
      setError("");
    } catch {
      setError("Failed to load end words");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings/end-words");
        if (!response.ok) throw new Error();
        const rows = await response.json();
        if (active) setWords(rows);
      } catch {
        if (active) setError("Failed to load end words");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const addWord = async () => {
    const word = input.trim();
    if (!word || isSaving) return;

    try {
      setIsSaving(true);
      setError("");
      const response = await fetch("/api/settings/end-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to add end word");
      }

      setInput("");
      await loadWords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add end word");
    } finally {
      setIsSaving(false);
    }
  };

  const removeWord = async (id: string) => {
    const previous = words;
    setWords((current) => current.filter((entry) => entry.id !== id));

    try {
      const response = await fetch(`/api/settings/end-words?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setError("");
    } catch {
      setWords(previous);
      setError("Failed to remove end word");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line/70 px-8">
        <div>
          <h1 className="font-display text-[25px] leading-none tracking-[-0.02em]">
            Settings
          </h1>
          <p className="mt-1 text-[11px] text-ink-faint">
            Tune the way your lectures become notes
          </p>
        </div>
        <span className="rounded-full border border-line bg-panel px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Transcription
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-6 px-8 py-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-2xl border border-line bg-panel/85 p-6 shadow-paper">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-[30px] leading-none tracking-[-0.02em]">
                  End words
                </h2>
                <p className="mt-3 max-w-lg text-[12px] leading-6 text-ink-muted">
                  A transcript line only ends when one of these words is spoken.
                  Until then, everything keeps accumulating into the same line.
                  The end word is kept at the end of the transcript line.
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clay-soft text-clay">
                <Sparkles className="h-4 w-4" strokeWidth={1.6} />
              </div>
            </div>

            <form
              className="mt-6 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void addWord();
              }}
            >
              <Input
                type="text"
                placeholder="e.g. done, next question, point taken"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="max-w-md"
              />
              <Button
                type="submit"
                size="default"
                disabled={!input.trim() || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add
              </Button>
            </form>

            {error && (
              <p className="mt-3 text-[11px] text-destructive">{error}</p>
            )}

            <div className="mt-8">
              {isLoading ? (
                <p className="text-[12px] text-ink-faint">Loading…</p>
              ) : words.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong/80 bg-cream/50 px-4 py-6">
                  <CornerDownLeft className="h-4 w-4 text-ink-faint" />
                  <div>
                    <p className="text-[12px] font-medium text-ink-soft">
                      No end words yet
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      Without any, lines close at natural pauses or every 8 seconds.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {words.map((entry, index) => (
                    <li
                      key={entry.id}
                      className="group flex items-center justify-between rounded-lg border border-line bg-cream/45 px-3.5 py-2.5 transition-colors hover:border-line-strong"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="font-mono text-[9px] text-ink-faint">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="font-mono text-[12px] text-ink-soft">
                          {entry.word}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeWord(entry.id)}
                        className="text-ink-faint opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        aria-label={`Remove ${entry.word}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-line bg-ink p-5 text-panel shadow-paper">
              <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-panel/50">
                Line preview
              </div>
              <p className="mt-4 font-display text-[22px] leading-[1.35] text-panel/90">
                “Today we covered gradient descent
                <span className="mx-1.5 rounded bg-clay px-1.5 py-0.5 text-[18px] text-panel">
                  done
                </span>
                Now let’s look at momentum.”
              </p>
              <p className="mt-4 text-[10px] leading-5 text-panel/45">
                The trigger stays in the line, and the next sentence starts fresh.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-panel/70 p-5">
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                Good triggers
              </div>
              <ul className="mt-3 space-y-2 text-[11px] leading-5 text-ink-muted">
                <li className="flex gap-2">
                  <span className="text-clay">→</span> Short and unambiguous
                </li>
                <li className="flex gap-2">
                  <span className="text-clay">→</span> Unlikely in normal speech
                </li>
                <li className="flex gap-2">
                  <span className="text-clay">→</span> Whole words or phrases
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
