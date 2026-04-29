// Vercel serverless proxy for OpenAI's Responses API.
// Browsers POST here instead of calling api.openai.com directly, so the
// OPENAI_API_KEY env var stays on the server.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: "Server is missing OPENAI_API_KEY env var." },
    });
    return;
  }

  // Vercel parses JSON bodies automatically when Content-Type is application/json.
  // Fall back to raw body if it arrived as a string for any reason.
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });
  } catch (err) {
    res.status(502).json({
      error: { message: `Upstream fetch failed: ${err?.message ?? "unknown"}` },
    });
    return;
  }

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(text);
}
