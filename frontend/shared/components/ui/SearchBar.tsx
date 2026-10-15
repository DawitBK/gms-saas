"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";

interface SearchBarProps {
  /** Placeholder text for the input */
  placeholder?: string;
  /** Callback fired after debounce with the search term */
  onSearch: (query: string) => void;
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Additional className for the wrapper */
  className?: string;
  /** Show a loading indicator */
  isLoading?: boolean;
}

/**
 * Reusable debounced search bar with clear button.
 * Used across all list/table pages for consistent search UX.
 */
export function SearchBar({
  placeholder = "Search...",
  onSearch,
  debounceMs = 300,
  className,
  isLoading = false,
}: SearchBarProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (nextValue: string) => {
      setValue(nextValue);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSearch(nextValue.trim());
      }, debounceMs);
    },
    [onSearch, debounceMs],
  );

  const handleClear = useCallback(() => {
    setValue("");
    onSearch("");
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [onSearch]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={clsx("relative", className)}>
      <Search
        className={clsx(
          "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors",
          isLoading ? "animate-pulse text-sky-400" : "text-slate-500",
        )}
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="ui-input w-full pl-10 pr-9"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
