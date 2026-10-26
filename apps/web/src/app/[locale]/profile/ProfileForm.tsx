"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { cleanName } from "@/lib/names";

export function ProfileForm({ name }: { name: string }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  return (
    <>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const n = cleanName(value);
          if (!n) return;
          const { error } = await authClient.updateUser({ name: n });
          setState(error ? "error" : "saved");
          router.refresh();
        }}
      >
        <label>
          {t("name")}
          <input className="text-input" maxLength={20} value={value} onChange={(e) => { setValue(e.target.value); setState("idle"); }} />
        </label>
        <button className="btn" type="submit">
          {t("save")}
        </button>
        {state === "saved" ? <p className="form-ok">{t("saved")}</p> : null}
        {state === "error" ? <p className="form-error">{t("error")}</p> : null}
      </form>
      <button
        className="btn ghost"
        type="button"
        onClick={async () => {
          await authClient.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        {t("logout")}
      </button>
    </>
  );
}
