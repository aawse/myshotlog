import type { Session, Result, Profile, Firearm } from "../lib/models";
export const profile: Profile = {
  displayName: "Test",
  birthDate: null,
  birthYear: 1990,
  language: "sv",
  timezone: "Europe/Stockholm",
};
export const firearm: Firearm = {
  id: "10000000-0000-4000-8000-000000000001",
  make: "Test",
  model: "Test",
  caliber: ".22",
  group: "C",
  serial: "TEST-SERIAL-SECRET-98431",
  nickname: "",
  notes: "",
  archived: false,
};
export const result: Result = {
  id: "10000000-0000-4000-8000-000000000002",
  label: "Serie",
  type: "score",
  shots: 5,
  points: 46,
  distance: 25,
  seconds: 300,
  target: "precision25",
};
export const session: Session = {
  id: "10000000-0000-4000-8000-000000000003",
  date: "2026-10-10",
  time: "",
  location: "Test",
  discipline: "precision",
  program: "5 skott",
  firearmId: firearm.id,
  firearmSnapshot: {
    id: firearm.id,
    make: firearm.make,
    model: firearm.model,
    caliber: firearm.caliber,
    nickname: "",
    group: "C",
  },
  group: "C",
  context: "practice",
  notes: "",
  results: [result],
  revision: 1,
};
