import { useEffect } from "react";

/** Keeps document.title aligned with the active page for SEO + tab clarity. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
