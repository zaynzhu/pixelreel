import { useState } from "react";

interface ImgWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}

export function ImgWithFallback({ src, alt, className, fallback }: ImgWithFallbackProps) {
  const [error, setError] = useState(false);

  if (error) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
}
