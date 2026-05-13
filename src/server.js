import "dotenv/config";
import express from "express";
import { makeDedupeKey, isDuplicate } from "./dedupe.js";
import { appendCustomerServiceRow } from "./googleSheets.js";
import { getDisplayName, replyFixedMessage, verifyLineSignature } from "./line.js";
import { analyzeCustomerMessage, getFallbackAnalysis } from "./openai.js";
import { nowTaipeiString } from "./utils/time.js";

const app = express();
const port = process.env.PORT || 3000;

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

app.get("/", (_req, res) => {
  res.status(200).json({ ok: true, service: "line-oa-customer-service-log" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/line/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.header("x-line-signature");
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!verifyLineSignature(req.body, signature, channelSecret)) {
    return res.status(401).json({ error: "Invalid LINE signature." });
  }

  let body;
  try {
    body = JSON.parse(req.body.toString("utf8"));
  } catch (error) {
    console.error("Failed to parse LINE webhook body:", error);
    return res.status(200).json({ ok: true });
  }

  try {
    const events = Array.isArray(body.events) ? body.events : [];
    await Promise.all(events.map((event) => handleLineEvent(event)));
  } catch (error) {
    console.error("Failed to handle LINE webhook:", error);
  }

  return res.status(200).json({ ok: true });
});

async function handleLineEvent(event) {
  const dedupeKey = makeDedupeKey(event);
  console.log("Received LINE event:", {
    type: event?.type,
    messageType: event?.message?.type,
    dedupeKey
  });

  if (isDuplicate(dedupeKey)) {
    console.log("Skipped duplicate LINE event:", dedupeKey);
    return;
  }

  const createdAt = nowTaipeiString();
  const messageType = event?.message?.type ?? event?.type ?? "unknown";
  const lineUserId = event?.source?.userId ?? "";
  const lineMessageId = event?.message?.id ?? "";
  const rawMessage = getRawMessage(event);

  let displayName = "";
  if (lineUserId) {
    displayName = await getDisplayName(event.source);
  }

  let analysis = getFallbackAnalysis();

  if (messageType === "text") {
    try {
      analysis = await analyzeCustomerMessage(event.message.text);
    } catch (error) {
      console.error("OpenAI analysis failed:", error);
      analysis = getFallbackAnalysis();
    }
  } else {
    analysis = {
      ...getFallbackAnalysis(),
      summary: "非文字訊息，未送 OpenAI 分析",
      category: "其他",
      urgency: "中",
      suggested_action: "請人工客服在 LINE Official Account 後台查看附件或原始訊息。",
      customer_intent: "非文字訊息",
      language: "",
      keywords: [messageType],
      risk_note: ""
    };
  }

  const record = {
    created_at: createdAt,
    line_user_id: lineUserId,
    line_display_name: displayName,
    message_type: messageType,
    raw_message: rawMessage,
    summary: buildSummary(analysis),
    category: analysis.category ?? "其他",
    product_or_part_number: buildProductResearchNote(analysis),
    order_or_invoice: analysis.order_or_invoice ?? "",
    urgency: analysis.urgency ?? "中",
    requires_human_reply: analysis.requires_human_reply ?? true,
    suggested_action: buildSuggestedAction(analysis),
    customer_intent: buildCustomerIntent(analysis),
    language: analysis.language ?? "",
    keywords: analysis.keywords ?? [],
    risk_note: analysis.risk_note ?? "",
    status: "未處理",
    owner: "",
    staff_note: "",
    last_updated_at: createdAt,
    webhook_event_id: dedupeKey,
    line_message_id: lineMessageId
  };

  try {
    const sheetResult = await appendCustomerServiceRow(record);
    console.log("Customer service row append result:", sheetResult);
  } catch (error) {
    console.error("Google Sheets append failed:", error);
  }

  try {
    await replyFixedMessage(event.replyToken);
  } catch (error) {
    console.error("LINE reply failed:", error);
  }
}

function buildSummary(analysis) {
  const base = analysis.summary ?? "";
  const vehicle = [analysis.vehicle_year, analysis.vehicle_make, analysis.vehicle_model]
    .filter(Boolean)
    .join(" ");
  const requestedPart = analysis.requested_part ? `需求零件：${analysis.requested_part}` : "";
  const lookupStatus = analysis.part_lookup_status ? `查找狀態：${analysis.part_lookup_status}` : "";
  const oemNumbers =
    Array.isArray(analysis.possible_oem_numbers) && analysis.possible_oem_numbers.length > 0
      ? `可能 OEM/HD：${analysis.possible_oem_numbers.join(", ")}`
      : "";
  const aftermarketNumbers =
    Array.isArray(analysis.possible_aftermarket_numbers) && analysis.possible_aftermarket_numbers.length > 0
      ? `可能 aftermarket/Fangster 候選：${analysis.possible_aftermarket_numbers.join(", ")}`
      : "";
  const links =
    Array.isArray(analysis.research_links) && analysis.research_links.length > 0
      ? `參考來源：${analysis.research_links
          .slice(0, 3)
          .map((link) => link.title || link.url)
          .filter(Boolean)
          .join("；")}`
      : "";
  const confidence = analysis.confidence ? `信心：${analysis.confidence}` : "";
  return [
    lookupStatus,
    base,
    vehicle && `車種判斷：${vehicle}`,
    requestedPart,
    oemNumbers,
    aftermarketNumbers,
    links,
    confidence
  ]
    .filter(Boolean)
    .join("\n");
}

function buildProductResearchNote(analysis) {
  const values = [];

  if (analysis.product_or_part_number) {
    values.push(`客戶提供/提及：${analysis.product_or_part_number}`);
  }

  if (analysis.part_lookup_status) {
    values.push(`查找狀態：${analysis.part_lookup_status}`);
  }

  if (Array.isArray(analysis.possible_oem_numbers) && analysis.possible_oem_numbers.length > 0) {
    values.push(`可能 OEM/HD 號碼：${analysis.possible_oem_numbers.join(", ")}`);
  }

  if (Array.isArray(analysis.possible_aftermarket_numbers) && analysis.possible_aftermarket_numbers.length > 0) {
    values.push(`可能 aftermarket/Fangster 對照候選：${analysis.possible_aftermarket_numbers.join(", ")}`);
  }

  if (Array.isArray(analysis.research_links) && analysis.research_links.length > 0) {
    values.push(
      `參考連結：${analysis.research_links
        .map((link) => `${link.title || "source"} ${link.url || ""}${link.note ? ` (${link.note})` : ""}`)
        .join(" | ")}`
    );
  }

  return values.join("\n");
}

function buildSuggestedAction(analysis) {
  const actions = [];
  if (analysis.suggested_action) {
    actions.push(analysis.suggested_action);
  }

  if (Array.isArray(analysis.fitment_questions) && analysis.fitment_questions.length > 0) {
    actions.push(`建議追問/確認：${analysis.fitment_questions.join("；")}`);
  }

  return actions.join("\n");
}

function buildCustomerIntent(analysis) {
  const parts = [];
  if (analysis.customer_intent) {
    parts.push(analysis.customer_intent);
  }

  const vehicle = [analysis.vehicle_year, analysis.vehicle_make, analysis.vehicle_model]
    .filter(Boolean)
    .join(" ");
  if (vehicle) {
    parts.push(`車種：${vehicle}`);
  }

  if (analysis.requested_part) {
    parts.push(`零件：${analysis.requested_part}`);
  }

  return parts.join("\n");
}

function getRawMessage(event) {
  if (event?.message?.type === "text") {
    return event.message.text ?? "";
  }

  if (event?.message) {
    return JSON.stringify(event.message);
  }

  return JSON.stringify(event ?? {});
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
