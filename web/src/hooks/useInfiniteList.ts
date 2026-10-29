import { useCallback, useEffect, useRef, useState } from 'react';

export interface PageResult<T> { items: T[]; next: string | null }
export type ListStatus = 'loading' | 'loadingMore' | 'idle' | 'error';

/**
 * Infinite list over the API's cursors. A sentinel near the bottom loads the next page; a
 * newer query cancels the answer of an older one; repeated ids are dropped.
 */
export function useInfiniteList<T extends { id: string }>(fetchPage: (cursor: string | null) => Promise<PageResult<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<ListStatus>('loading');
  const requestId = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async (cursor: string | null) => {
    const id = ++requestId.current;
    setStatus(cursor === null ? 'loading' : 'loadingMore');
    try {
      const page = await fetchPage(cursor);
      if (id !== requestId.current) return;
      setItems((prev) => {
        if (cursor === null) return page.items;
        const seen = new Set(prev.map((v) => v.id));
        return [...prev, ...page.items.filter((v) => !seen.has(v.id))];
      });
      setNext(page.next);
      loadedOnce.current = true;
      setStatus('idle');
    } catch (err) {
      if (id !== requestId.current) return;
      console.error('Failed to load list:', err);
      setStatus('error');
    }
  }, [fetchPage]);

  useEffect(() => {
    setItems([]);
    setNext(null);
    loadedOnce.current = false;
    void load(null);
  }, [load]);

  const hasMore = next !== null;
  const canLoadMore = hasMore && status === 'idle';
  const loadMore = useCallback(() => { if (canLoadMore) void load(next); }, [canLoadMore, load, next]);
  const retry = useCallback(() => void load(loadedOnce.current ? next : null), [load, next]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) loadMore(); }, { rootMargin: '800px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore, loadMore]);

  return { items, setItems, status, hasMore, canLoadMore, loadMore, retry, sentinelRef };
}
export type InfiniteList<T extends { id: string }> = ReturnType<typeof useInfiniteList<T>>;
