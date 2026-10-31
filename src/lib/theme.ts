export type Theme = "light" | "dark";

export function normalizeTheme(value: string | null | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}
