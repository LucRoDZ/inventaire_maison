'use client';

import { useState, type ImgHTMLAttributes } from 'react';

/**
 * A picture on a skeleton block of its own size: the room is kept while it loads, then it fades in
 * (the fade is cut when the person asks for less motion). Decorative: empty alternative text.
 */
export function FadeImage({
  className = '',
  onLoad,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      {...rest}
      alt=""
      data-loaded={loaded}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={`${loaded ? 'image-in' : 'skeleton'} ${className}`}
    />
  );
}
