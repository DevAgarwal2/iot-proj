"use client";

import { useEffect, useState } from "react";
import { Plus, X, Loader2, CornerDownLeft } from "lucide-react";
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
    <div className="h-full flex flex-col">
      <header className="h-14 flex items-center px-8 border-b border-[#e8e8e8] shrink-0">
        <h1 className="text-[13px] font-medium text-[#111]">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl px-8 py-8">
          <h2 className="text-[15px] font-medium text-[#111]">End words</h2>
          <p className="text-[12px] text-[#999] mt-1 leading-relaxed">
            A transcript line only ends when one of these words is spoken. Until
            then, everything the speaker says keeps accumulating into the same
            line. The end word is kept at the end of the transcript line.
          </p>

          <form
            className="flex items-center gap-2 mt-5"
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
              className="h-9 max-w-sm text-[13px] border-[#e8e8e8] focus:border-[#999] focus:ring-0"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || isSaving}
              className="h-9 text-[12px] bg-[#111] text-white hover:bg-[#333]"
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
            <p className="text-[11px] text-[#ef4444] mt-3">{error}</p>
          )}

          <div className="mt-6">
            {isLoading ? (
              <p className="text-[12px] text-[#bbb]">Loading...</p>
            ) : words.length === 0 ? (
              <div className="flex items-center gap-2 text-[12px] text-[#bbb] border border-dashed border-[#e8e8e8] rounded-lg px-4 py-6">
                <CornerDownLeft className="h-3.5 w-3.5" />
                No end words yet. Without any, lines fall back to closing every
                few seconds.
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {words.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between px-3.5 py-2.5 border border-[#e8e8e8] rounded-lg bg-white group"
                  >
                    <span className="text-[13px] text-[#333] font-mono">
                      {entry.word}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeWord(entry.id)}
                      className="h-7 w-7 p-0 text-[#bbb] hover:text-[#ef4444] hover:bg-[#fef2f2]"
                      aria-label={`Remove ${entry.word}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
