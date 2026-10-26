"use client";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { isSoundOn, setSoundOn, sfx } from "@/lib/sound";

/** Son et langue. */
export function HeaderTools() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [sound, setSound] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => setSound(isSoundOn()), []);

  const other = locale === "fr" ? "en" : "fr";
  return (
    <>
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
