export async function mutate(action: string, payload: unknown) {
  const response = await fetch("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Åtgärden misslyckades");
  return data;
}
