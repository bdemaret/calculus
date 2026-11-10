import { useFormatter, useTranslations } from "next-intl";
import type { AdminBotReport } from "@calculus/db";
import { DAILY_BAN_MS, DAILY_REVIEW_MS, dailyDifficulty } from "@calculus/game-core";
import { MathText } from "@/components/MathText";

/** Preuve d'un signalement : les réponses de l'essai, leur temps mesuré par le serveur et le seuil de signalement du niveau. Un temps impossible (ban) est en rouge. */
export function ReportEvidence({ report }: { report: AdminBotReport }) {
  const t = useTranslations("admin.bans");
  const tl = useTranslations("levels");
  const format = useFormatter();
  const ms = (value: number) => t("ms", { value: format.number(value) });
  return (
    <div className="stack">
      <div className="feedback-head">
        <span className={`admin-phase ${report.verdict === "bot" ? "bug" : ""}`}>{t(`verdict.${report.verdict}`)}</span>
        <span className="muted">
          {t("dailyOf", { date: format.dateTime(new Date(`${report.ref}T12:00:00Z`), { dateStyle: "long", timeZone: "UTC" }) })}
          {report.rules.map((rule) => ` · ${t(`rule.${rule}`)}`)}
        </span>
      </div>
      <div className="scroll-x">
        <table className="games" aria-label={t("evidence")}>
          <thead>
            <tr>
              <th>{t("level")}</th>
              <th>{t("calculation")}</th>
              <th>{t("answer")}</th>
              <th>{t("time")}</th>
              <th>{t("threshold")}</th>
            </tr>
          </thead>
          <tbody>
            {report.answers.map((a, index) => {
              const threshold = DAILY_REVIEW_MS[index];
              return (
                <tr key={index}>
                  <td>{threshold !== undefined ? tl(String(dailyDifficulty(index))) : "–"}</td>
                  <td>
                    <MathText text={a.text} />
                  </td>
                  <td className={a.correct ? "ok" : "ko"}>{a.value ?? t("timeUp")}</td>
                  <td>
                    {a.correct && a.timeMs < DAILY_BAN_MS ? (
                      <strong className="ko">{ms(a.timeMs)}</strong>
                    ) : a.correct && threshold !== undefined && a.timeMs < threshold ? (
                      <strong>{ms(a.timeMs)}</strong>
                    ) : (
                      ms(a.timeMs)
                    )}
                  </td>
                  <td className="muted">{threshold !== undefined ? ms(threshold) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
