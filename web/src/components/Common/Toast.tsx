import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** A short message in a polite live region; returns the region node and `show`. */
export function useToast(): [ReactNode, (text: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = <div className="toast-region" role="status" aria-live="polite">{message && <div className="toast">{message}</div>}</div>;
  return [node, show];
}
