const sizes = {
  back: 24,
  camera: 22,
  "details-plus": 22,
  chevron: 20,
  "chevron-light": 24,
  equipment: 22,
  forward: 24,
  journal: 24,
  minus: 26,
  more: 24,
  plus: 22,
  "plus-light": 22,
  progress: 24,
  rules: 22,
  sessions: 24,
  settings: 22,
  target: 32,
} as const;

export function RedesignIcon({ name }: { name: keyof typeof sizes }) {
  return (
    <img
      src={`/redesign/${name}.svg`}
      alt=""
      width={sizes[name]}
      height={sizes[name]}
    />
  );
}
