
export default function StellarMark({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/stellar-logo.png"
      alt="Stellar"
      height={size}
      className={className}
      style={{ display: "block", height: size, width: "auto" }}
    />
  );
}