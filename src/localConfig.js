// Stub for deployment. Stress Workshop reads the key from the in-page input
// and falls back to this; Line Craft reads it from this file directly.
// To use Line Craft, paste your OpenAI key here, or set it in localStorage
// from the browser console: localStorage.setItem("lc.apiKey", "sk-...").
export const LOCAL_OPENAI_CONFIG = {
  apiKey: "",
  model: "gpt-4.1-mini",
  aiEnabled: true,
};
