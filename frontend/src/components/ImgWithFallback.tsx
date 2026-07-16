import { useState } from "react";
import { proxiedImageUrl } from "../imageProxy";

interface ImgWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fallback: React.ReactNode;
}

export function ImgWithFallback({ src, alt, className, loading = "lazy", fallback }: ImgWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = proxiedImageUrl(src) ?? src;

  if (failedSrc === resolvedSrc) return <>{fallback}</>;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => setFailedSrc(resolvedSrc)}
    />
  );
}
