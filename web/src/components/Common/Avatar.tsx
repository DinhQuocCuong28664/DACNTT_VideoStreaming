import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';

/**
 * Avatar with the initial-letter block as fallback, also when the image fails to load. `alt` is
 * empty on purpose: the channel name always sits next to it.
 */
export default function Avatar({ src, className = '', fallbackClassName = '', children, ...rest }: {
  src: string | null | undefined;
  className?: string;
  fallbackClassName?: string;
  children?: ReactNode;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={fallbackClassName || className}>{children}</div>;
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} {...rest} />;
}
