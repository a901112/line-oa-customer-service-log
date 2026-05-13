const SHEET_NAME = "Sheet1";
const SECRET = "bbe7cd47152d05b91ca781b12f9fd9ab80560458f1197a49";

const COLUMNS = [
  "created_at",
  "line_user_id",
  "line_display_name",
  "message_type",
  "raw_message",
  "summary",
  "category",
  "product_or_part_number",
  "order_or_invoice",
  "urgency",
  "requires_human_reply",
  "suggested_action",
  "customer_intent",
  "language",
  "keywords",
  "risk_note",
  "status",
  "owner",
  "staff_note",
  "last_updated_at",
  "webhook_event_id",
  "line_message_id"
];

function doPost(e) {
  try {
    const providedSecret = e?.parameter?.secret || getHeaderValue_(e, "x-apps-script-secret");
    if (SECRET && providedSecret !== SECRET) {
      return json_({ ok: false, error: "Unauthorized" }, 401);
    }

    const payload = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return json_({ ok: false, error: `Sheet not found: ${SHEET_NAME}` }, 500);
    }

    const row = COLUMNS.map((column) => {
      const value = payload[column];
      return Array.isArray(value) ? value.join(", ") : value ?? "";
    });

    sheet.appendRow(row);
    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: String(error) }, 500);
  }
}

function getHeaderValue_(e, headerName) {
  const headers = e?.headers || {};
  const lowerName = headerName.toLowerCase();

  for (const key in headers) {
    if (key.toLowerCase() === lowerName) {
      return headers[key];
    }
  }

  return "";
}

function json_(data, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...data, statusCode }))
    .setMimeType(ContentService.MimeType.JSON);
}
