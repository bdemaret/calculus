"use client";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { isSoundOn, setSoundOn, sfx } from "@/lib/sound";
import { currentTheme, setTheme, type Theme } from "@/lib/theme";

/** Thème, son et langue. */
export function HeaderTools() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [sound, setSound] = useState(true);
  const [theme, setThemeState] = useState<Theme | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setSound(isSoundOn());
    setThemeState(currentTheme());
  }, []);

  const other = locale === "fr" ? "en" : "fr";
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <>
      <button
        className="icon-btn"
        type="button"
        title={next === "dark" ? t("themeDark") : t("themeLight")}
        aria-label={next === "dark" ? t("themeDark") : t("themeLight")}
        onClick={() => {
          setTheme(next);
          setThemeState(next);
        }}
      >
        {/* Lune en clair (passer en sombre), soleil en sombre ; rien avant hydratation. */}
        {theme && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {next === "dark" ? (
              <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            )}
          </svg>
        )}
      </button>
      <button
        className="icon-btn"
        type="button"
        aria-pressed={sound}
        title={sound ? t("soundOff") : t("soundOn")}
        onClick={() => {
          setSoundOn(!sound);
          setSound(!sound);
          if (!sound) sfx.ok();
        }}
      >
        {t("sound")}
      </button>
      <button
        className="icon-btn"
        type="button"
        lang={other}
        title={t("language")}
        onClick={() =>
          startTransition(() => {
            router.replace(pathname, { locale: other });
          })
        }
      >
        {other.toUpperCase()}
      </button>
    </>
  );
}
