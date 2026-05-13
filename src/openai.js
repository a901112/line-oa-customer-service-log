import OpenAI from "openai";

const fallbackAnalysis = {
  summary: "AI 分析失敗",
  category: "其他",
  product_or_part_number: "",
  order_or_invoice: "",
  urgency: "中",
  requires_human_reply: true,
  suggested_action: "請人工客服查看原始訊息並回覆。",
  customer_intent: "",
  language: "",
  keywords: [],
  risk_note: ""
};

const analysisSchema = {
  name: "customer_service_internal_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      category: {
        type: "string",
        enum: [
          "產品詢問",
          "報價詢問",
          "訂單進度",
          "出貨 / 物流",
          "安裝問題",
          "品質異常",
          "退貨 / 折讓",
          "合作 / 經銷",
          "其他"
        ]
      },
      product_or_part_number: { type: "string" },
      order_or_invoice: { type: "string" },
      urgency: {
        type: "string",
        enum: ["低", "中", "高", "緊急"]
      },
      requires_human_reply: { type: "boolean" },
      suggested_action: { type: "string" },
      customer_intent: { type: "string" },
      language: { type: "string" },
      keywords: {
        type: "array",
        items: { type: "string" }
      },
      risk_note: { type: "string" }
    },
    required: [
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
      "risk_note"
    ]
  }
};

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function getFallbackAnalysis() {
  return { ...fallbackAnalysis, keywords: [...fallbackAnalysis.keywords] };
}

export async function analyzeCustomerMessage(messageText) {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: analysisSchema
    },
    messages: [
      {
        role: "system",
        content: [
          "你是客服內部訊息分析助手，只能產生給人工客服參考的結構化資料。",
          "不要替客服撰寫可直接貼給客戶的完整回覆，也不要回答客戶實際問題。",
          "請支援中文、英文、日文訊息。",
          "若訊息太短或無法判斷，category 必須為「其他」，urgency 必須為「中」。",
          "分類規則：",
          "1. 提到破損、不能安裝、尺寸不對、漏油、異音、品質問題，category =「品質異常」。",
          "2. 問價格、MOQ、報價、折扣，category =「報價詢問」。",
          "3. 問何時出貨、追蹤號、物流、運費，category =「出貨 / 物流」。",
          "4. 問訂單是否處理、訂單進度，category =「訂單進度」。",
          "5. 問 fitment、安裝方式、零件怎麼裝，category =「安裝問題」。",
          "6. 問是否有某產品、適用車種、規格，category =「產品詢問」。",
          "7. 提到 return、refund、credit、allowance、折讓、退貨，category =「退貨 / 折讓」。",
          "8. 提到 distributor、dealer、cooperation、partnership，category =「合作 / 經銷」。",
          "9. 無法判斷時 category =「其他」。",
          "急迫程度規則：",
          "1. 涉及安全、煞車、輪框、車架、事故、人身受傷，urgency =「緊急」。",
          "2. 明確抱怨、要求賠償、品質異常、產品無法使用，urgency =「高」。",
          "3. 一般訂單、報價、出貨、安裝問題，urgency =「中」。",
          "4. 一般產品詢問或沒有明確時間壓力，urgency =「低」。"
        ].join("\n")
      },
      {
        role: "user",
        content: `請分析以下客戶訊息，僅輸出符合 schema 的 JSON：\n\n${messageText}`
      }
    ]
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty analysis content.");
  }

  return JSON.parse(content);
}
