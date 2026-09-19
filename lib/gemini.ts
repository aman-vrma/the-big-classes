import { getAuthHeaders } from "./firebase";

export async function generateAIStream(prompt: string, onChunk: (text: string) => void) {
  const authHeaders = await getAuthHeaders();
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Failed to fetch response");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
  onChunk(text);
}

export async function generateAIJson<T>(prompt: string, imageBase64?: string): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ prompt, imageBase64, wantJson: true }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Failed to fetch structured response");
  let rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  rawJson = rawJson.replace(/^```json/m, "").replace(/```$/m, "").trim();
  return JSON.parse(rawJson);
}
