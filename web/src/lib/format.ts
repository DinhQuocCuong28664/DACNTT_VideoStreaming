import type { TFunction } from 'i18next';

export function formatViews(views = 0): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
  return String(views);
}

export function formatDuration(total: number): string {
  const s = Math.floor(total % 60);
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function timeAgo(t: TFunction, date: string | null | undefined, now = Date.now()): string {
  if (!date) return '';
  const seconds = Math.floor((now - new Date(date).getTime()) / 1000);
  if (seconds < 60) return t('videoCard.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('videoCard.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('videoCard.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('videoCard.daysAgo', { count: days });
  return t('videoCard.monthsAgo', { count: Math.floor(days / 30) });
}

export function formatDate(lang: string, date: string): string {
  return new Date(date).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', { year: 'numeric', month: 'short', day: 'numeric' });
}
