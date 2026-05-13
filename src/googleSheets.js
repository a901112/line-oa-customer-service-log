import { google } from "googleapis";
import { appendRowViaAppsScript } from "./googleAppsScript.js";

export const SHEET_COLUMNS = [
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function getAuth() {
  const clientEmail = requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

export async function appendCustomerServiceRow(record) {
  if (process.env.GOOGLE_APPS_SCRIPT_WEBHOOK_URL) {
    return appendRowViaAppsScript(record);
  }

  const sheetId = requiredEnv("GOOGLE_SHEET_ID");
  const sheetName = process.env.GOOGLE_SHEET_NAME || "Sheet1";
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const values = [
    [
      record.created_at,
      record.line_user_id,
      record.line_display_name,
      record.message_type,
      record.raw_message,
      record.summary,
      record.category,
      record.product_or_part_number,
      record.order_or_invoice,
      record.urgency,
      String(record.requires_human_reply),
      record.suggested_action,
      record.customer_intent,
      record.language,
      Array.isArray(record.keywords) ? record.keywords.join(", ") : "",
      record.risk_note,
      record.status,
      record.owner,
      record.staff_note,
      record.last_updated_at,
      record.webhook_event_id,
      record.line_message_id
    ]
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${sheetName}!A:V`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values }
  });
}
