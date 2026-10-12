// Stable translation keys; English UI can be introduced without changing stored records.
export const messages = {
  sv: {
    dashboard: "Översikt",
    sessions: "Träningspass",
    firearms: "Mina vapen",
    qualifications: "Märkesprogress",
    settings: "Inställningar",
  },
  en: {
    dashboard: "Dashboard",
    sessions: "Sessions",
    firearms: "Firearms",
    qualifications: "Qualification progress",
    settings: "Settings",
  },
} as const;
export function t(language: "sv" | "en", key: keyof typeof messages.sv) {
  return messages[language][key];
}
