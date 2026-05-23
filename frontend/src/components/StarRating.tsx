interface StarRatingProps {
  value: number;
}

export function StarRating({ value }: StarRatingProps) {
  return (
    <span className="inline-flex gap-px">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={star <= value ? "text-yellow-400" : "text-gray-600"}
        >
          ★
        </span>
      ))}
    </span>
  );
}