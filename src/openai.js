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
  const researchText = await researchPartNumbers(client, model, messageText);

  const request = {
    model,
    reasoning: { effort: "high" },
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
              "你的主要任務不是摘要，而是料號/品號查找。你會收到一段已經完成的網路料號研究結果，必須優先從該研究結果抽取 OEM/HD 料號、aftermarket 品號候選、fitment 條件與來源連結。",
              "如果研究結果有候選號碼，part_lookup_status 必須是「已找到候選」，並把號碼填入 possible_oem_numbers 或 possible_aftermarket_numbers。",
              "summary 第一句必須是查找結果，不可只是『客戶詢問...』。格式優先使用：『料號查找：可能 OEM/HD ...；需確認 ...』或『料號查找：未找到可靠公開候選；需查 ...』。",
              "不要聲稱 Fangster 內部料號或庫存，除非客戶訊息本身提供。Fangster 內部號碼與庫存需人工查內部系統。",
              "如果找到 OEM/HD 候選，suggested_action 要直接說：用候選 OEM/HD 到 Fangster 內部對照表查 Fangster 品號與庫存。",
              "安全相關零件如煞車、輪框、車架，risk_note 必須提醒人工確認 fitment 與安全風險。",
              "若研究結果號碼互相衝突，請都列為候選並標示需確認前/後輪、ABS、卡鉗或年份。"
            ].join("\n")
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "請根據客戶訊息與料號研究結果，整理成符合 schema 的 JSON。",
              "",
              `客戶訊息：${messageText}`,
              "",
              "料號研究結果：",
              researchText
            ].join("\n")
          }
        ]
      }
    ]
  };
  addTemperatureIfSupported(request, model, 0.2);

  const response = await client.responses.create(request);

  const content = response.output_text;
  if (!content) {
    throw new Error("OpenAI returned empty web search analysis content.");
  }

  return JSON.parse(content);
}

async function researchPartNumbers(client, model, messageText) {
  const request = {
    model,
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
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "你是機車/汽車零件料號研究助理。你的唯一任務是從公開網路資料找出客戶需求對應的可能 OEM/原廠料號與 aftermarket 品號候選。",
              "不要摘要客戶問題。不要寫客服話術。請實際搜尋。",
              "搜尋策略：",
              "1. 先把客戶口語轉成英文查詢。",
              "2. 優先找官方 parts catalog、parts fiche、dealer fiche、品牌 catalog PDF、產品頁。",
              "3. 再找大型零件商或品牌型錄。",
              "4. 賣場/論壇只能作輔助，不可單獨作高信心結論。",
              "5. 若是 Harley-Davidson FLHX，請同時搜尋 Street Glide、front brake caliper、rear brake pad、brake pad kit、OEM part number。",
              "6. 若安全件有前後輪、ABS、卡鉗差異，必須分開列出。",
              "輸出格式用純文字即可，但必須包含：",
              "- possible OEM/HD numbers",
              "- possible aftermarket numbers",
              "- front/rear/fitment notes",
              "- source URLs",
              "- confidence and remaining questions"
            ].join("\n")
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `請查找這個客戶需求的料號/品號候選：${messageText}`
          }
        ]
      }
    ]
  };
  addTemperatureIfSupported(request, model, 0.1);

  const response = await client.responses.create(request);

  return response.output_text || "未取得料號研究結果。";
}

function addTemperatureIfSupported(request, model, temperature) {
  if (!model.startsWith("gpt-5")) {
    request.temperature = temperature;
  }
}
