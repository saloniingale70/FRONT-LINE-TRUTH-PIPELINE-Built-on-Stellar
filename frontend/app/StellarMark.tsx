/**
 * Renders the official Stellar logomark.
 *
 * IMPORTANT — brand compliance:
 * Per Stellar's Brand Policy (https://stellar.org/brand-policy), the Stellar
 * Logo must be used in its unaltered graphic form — don't recolor, restyle,
 * or redraw it. Rather than approximating the mark in hand-written SVG,
 * this component loads SDF's own official asset file.
 *
 * Setup (one-time, required before this renders correctly):
 *   1. Go to https://stellar.org/brand-resources
 *   2. Download the "Stellar logo pack"
 *   3. Inside the zip, take "Stellar Logo Final Black RGB.png"
 *      (the black version reads correctly on light backgrounds —
 *      the white version will be invisible here)
 *   4. Rename it and drop it into this project at exactly:
 *        /public/stellar-logo.png
 *
 * Until that file exists at that exact path, the browser will show a
 * broken-image icon here — that's expected, it just means the asset
 * hasn't been added to /public yet.
 *
 * Note: this particular logo pack only ships PNGs (full lockup, not an
 * icon-only mark), so it will render a bit wider than a perfect square
 * icon would. The width below is left auto so the image keeps its native
 * aspect ratio rather than getting squashed.
 *
 * Plain <img> is used intentionally instead of next/image: this is a
 * tiny static local image, so there's nothing to gain from the image
 * optimizer, and it avoids needing to allowlist formats in next.config.
 */
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