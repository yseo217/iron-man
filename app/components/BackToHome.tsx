import Link from "next/link";

export function BackToHome({
  label = "← 메인으로",
  align = "self-start",
}: {
  label?: string;
  align?: "self-start" | "self-center";
}) {
  return (
    <Link
      href="/"
      className={`${align} text-sm font-bold text-brand-red hover:underline dark:text-red-400`}
    >
      {label}
    </Link>
  );
}
