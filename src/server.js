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
  if (isDuplicate(dedupeKey)) {
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
    summary: analysis.summary ?? "",
    category: analysis.category ?? "其他",
    product_or_part_number: analysis.product_or_part_number ?? "",
    order_or_invoice: analysis.order_or_invoice ?? "",
    urgency: analysis.urgency ?? "中",
    requires_human_reply: analysis.requires_human_reply ?? true,
    suggested_action: analysis.suggested_action ?? "",
    customer_intent: analysis.customer_intent ?? "",
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
    await appendCustomerServiceRow(record);
  } catch (error) {
    console.error("Google Sheets append failed:", error);
  }

  try {
    await replyFixedMessage(event.replyToken);
  } catch (error) {
    console.error("LINE reply failed:", error);
  }
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
