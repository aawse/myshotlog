"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { translator, type Language } from "@/lib/i18n";
const LanguageContext = createContext({
  ...translator("sv"),
  setLanguage: (_language: Language) => {},
});
export function LanguageProvider({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) {
  const [current, setLanguage] = useState(language);
  useEffect(() => setLanguage(language), [language]);
  useEffect(() => {
    document.documentElement.lang = current;
  }, [current]);
  return (
    <LanguageContext.Provider value={{ ...translator(current), setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useI18n() {
  return useContext(LanguageContext);
}
