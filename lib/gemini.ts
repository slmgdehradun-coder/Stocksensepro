interface GeminiGenerateOptions {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export class GeminiConfigError extends Error {
  constructor() {
    super('Gemini API key is not configured on the server. Set GEMINI_API_KEY in .env.local.');
    this.name = 'GeminiConfigError';
  }
}

export async function generateGeminiText({
  systemInstruction,
  prompt,
  temperature = 0.25,
  maxOutputTokens = 900,
}: GeminiGenerateOptions) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiConfigError();

  const model = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Gemini request failed with ${response.status}`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return {
    text,
    model,
  };
}
