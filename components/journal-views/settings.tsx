"use client";
import { RepositoryAccess } from "@/components/repository-access";
import { InstallationCheck } from "@/components/installation-check";
import { AppUpdates } from "@/components/app-updates";
import { useI18n } from "@/components/language-provider";
import { useJournalState } from "@/components/journal-provider";
import { SettingsForm } from "@/components/settings-form";
export default function View() {
  const { tr } = useI18n();

  const data = useJournalState().records;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{tr("settings.eyebrow")}</span>
          <h1>{tr("nav.settings")}</h1>
          <p>{tr("settings.intro")}</p>
        </div>
      </div>
      {data ? (
        <SettingsForm profile={data.profile} />
      ) : (
        <p role="alert">{tr("installation.journalUnavailable")}</p>
      )}
      <RepositoryAccess />
      <InstallationCheck />
      <AppUpdates />
    </>
  );
}
