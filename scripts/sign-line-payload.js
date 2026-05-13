import crypto from "crypto";
import fs from "fs";

const [, , payloadPath, channelSecret] = process.argv;

if (!payloadPath || !channelSecret) {
  console.error("Usage: node scripts/sign-line-payload.js <payload.json> <LINE_CHANNEL_SECRET>");
  process.exit(1);
}

const payload = fs.readFileSync(payloadPath);
const signature = crypto.createHmac("sha256", channelSecret).update(payload).digest("base64");
console.log(signature);
