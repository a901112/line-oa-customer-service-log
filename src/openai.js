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
  risk_note: "",
  vehicle_year: "",
  vehicle_make: "",
  vehicle_model: "",
  requested_part: "",
  possible_oem_numbers: [],
  possible_aftermarket_numbers: [],
  research_links: [],
  fitment_questions: [],
  confidence: "低",
  part_lookup_status: "未查到可靠候選"
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
      risk_note: { type: "string" },
      vehicle_year: { type: "string" },
      vehicle_make: { type: "string" },
      vehicle_model: { type: "string" },
      requested_part: { type: "string" },
      possible_oem_numbers: {
        type: "array",
        items: { type: "string" }
      },
      possible_aftermarket_numbers: {
        type: "array",
        items: { type: "string" }
      },
      research_links: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            note: { type: "string" }
          },
          required: ["title", "url", "note"]
        }
      },
      fitment_questions: {
        type: "array",
        items: { type: "string" }
      },
      confidence: {
        type: "string",
        enum: ["低", "中", "高"]
      },
      part_lookup_status: {
        type: "string",
        enum: ["已找到候選", "需補充車輛條件", "未查到可靠候選", "需查內部系統"]
      }
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
      "risk_note",
      "vehicle_year",
      "vehicle_make",
      "vehicle_model",
      "requested_part",
      "possible_oem_numbers",
      "possible_aftermarket_numbers",
      "research_links",
      "fitment_questions",
      "confidence",
      "part_lookup_status"
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
  if (process.env.ENABLE_WEB_SEARCH === "true") {
    return analyzeCustomerMessageWithWebSearch(messageText);
  }

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
          "你的定位是 AI 分析助理：協助客服理解需求、萃取車種年份零件資訊、提出查詢方向。",
          "如果客戶詢問車用零件號碼，請盡量萃取車種、年份、零件類型、可能需要確認的 fitment 條件。",
          "沒有網路或內部資料佐證時，不要編造 OEM 號碼、HD 號碼或 Fangster 號碼。",
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

async function analyzeCustomerMessageWithWebSearch(messageText) {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || "gpt-5.5";

  const request = {
    model,
    temperature: 0.2,
    reasoning: { effort: "high" },
    tools: [
      {
        type: "web_search",
        search_context_size: "high",
        external_web_access: true
      }
    ],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    text: {
      format: {
        type: "json_schema",
        name: analysisSchema.name,
        strict: true,
        schema: analysisSchema.schema
      }
    },
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "你是 Fangster 客服團隊的 AI 分析助理，不直接回覆客戶，只整理給人工客服參考的 JSON。",
              "你的主要任務不是摘要，而是料號/品號查找。從客戶訊息判斷車種、年份、零件需求，並用 web search 查找可能的原廠零件號碼、HD/OEM 號碼、相關 aftermarket 品號候選與參考連結。",
              "只要客戶訊息包含車種/年份/零件類型，就必須實際搜尋網路，不可只重述客戶問題。",
              "如果客戶問「號碼」、「料號」、「品號」、「part number」、「OEM」、「有貨嗎」且訊息有車種或零件，possible_oem_numbers 或 possible_aftermarket_numbers 必須盡力填入候選；如果真的找不到，part_lookup_status 必須是「未查到可靠候選」或「需補充車輛條件」，並在 suggested_action 寫下一步該查什麼。",
              "搜尋時要把客戶口語轉成英文關鍵字，例如：2008 Harley-Davidson FLHX brake pad OEM part number front rear、2008 Street Glide FLHX brake pads part number。",
              "搜尋策略：先找官方/零件圖/parts fiche/OEM lookup，再找大型零件商或品牌型錄，再找論壇或賣場作輔助。不要只用單一賣場結果下結論。",
              "對 Harley-Davidson 車款，FLHX 通常也可能被稱為 Street Glide；請同時用 FLHX 與 Street Glide 搜尋。",
              "如果客戶問煞車皮、輪框、車架等安全件，必須嘗試找前/後輪差異、ABS/非 ABS 或卡鉗差異。",
              "summary 第一句必須是查找結果，不可只是『客戶詢問...』。格式優先使用：『料號查找：可能 OEM/HD ...；需確認 ...』或『料號查找：未找到可靠公開候選；需查 ...』。",
              "如果找到的號碼來源不一致或無法確認，請放在 possible_oem_numbers 或 possible_aftermarket_numbers，並在 risk_note 註明需人工確認。",
              "如果沒有找到可靠 OEM/HD 號碼，possible_oem_numbers 保持空陣列，但 product_or_part_number 或 suggested_action 必須寫明已搜尋但需人工用官方 parts catalog/內部系統確認。",
              "不要聲稱 Fangster 內部料號或庫存，除非客戶訊息本身提供。Fangster 內部號碼與庫存需人工查內部系統。",
              "如果找到 OEM/HD 候選，suggested_action 要直接說：用候選 OEM/HD 到 Fangster 內部對照表查 Fangster 品號與庫存。不要泛泛說『請人工確認』。",
              "suggested_action 要具體，例如：確認前後輪位置、煞車卡鉗型式、是否 ABS、以找到的 OEM/HD 候選查 Fangster 料號、再確認庫存。",
              "research_links 最多 5 個，放與車種/零件/OEM 查詢最相關的來源。",
              "若訊息太短或無法判斷，category =「其他」，urgency =「中」，confidence =「低」。",
              "安全相關零件如煞車、輪框、車架，risk_note 必須提醒人工確認 fitment 與安全風險。",
              "分類與急迫程度請遵守原本規則。"
            ].join("\n")
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `請分析以下客戶訊息，必要時搜尋網路找可能的 OEM/HD 號碼與參考連結。僅輸出符合 schema 的 JSON：\n\n${messageText}`
          }
        ]
      }
    ]
  };

  const response = await client.responses.create(request);

  const content = response.output_text;
  if (!content) {
    throw new Error("OpenAI returned empty web search analysis content.");
  }

  return JSON.parse(content);
}
