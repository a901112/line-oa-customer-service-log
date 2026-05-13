export async function appendRowViaAppsScript(record) {
  const url = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET;

  if (!url) {
    throw new Error("GOOGLE_APPS_SCRIPT_WEBHOOK_URL is not configured.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-apps-script-secret": secret ?? ""
    },
    body: JSON.stringify(record)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Google Apps Script append failed: ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}
