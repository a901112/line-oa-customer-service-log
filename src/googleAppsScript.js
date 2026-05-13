export async function appendRowViaAppsScript(record) {
  const url = process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL;
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET;

  if (!url) {
    throw new Error("GOOGLE_APPS_SCRIPT_WEBHOOK_URL is not configured.");
  }

  const requestUrl = new URL(url);
  if (secret) {
    requestUrl.searchParams.set("secret", secret);
  }

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(record)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Google Apps Script append failed: ${response.status} ${text}`);
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }

  if (result?.ok === false) {
    throw new Error(`Google Apps Script returned error: ${text}`);
  }

  return result;
}
