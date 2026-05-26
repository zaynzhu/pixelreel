import { useState } from "react";

interface ImgWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fallback: React.ReactNode;
}

export function ImgWithFallback({ src, alt, className, loading = "lazy", fallback }: ImgWithFallbackProps) {
  const [error, setError] = useState(false);

  if (error) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => setError(true)}
    />
  );
}
