require("dotenv").config(); // ✅ FIRST LINE

const { MongoClient } = require("mongodb");
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const express = require("express");

// ===== ENV =====
const MONGO_URL = process.env.MONGO_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;

const client = new MongoClient(MONGO_URL);
let db;

async function connectDB() {
  await client.connect();
  db = client.db("quizbot");
  console.log("✅ MongoDB Connected");
}
connectDB();

// ===== BOT =====
const bot = new Telegraf(BOT_TOKEN);
const app = express();

const ADMIN_ID = 1251521284;

// ===== FILES =====
const DOUBT_FILE = "./doubts.json";

// ===== HELPERS =====
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===== QUESTIONS LOAD (OPTIMIZED) =====
function loadQuestions() {
  const files = fs.readdirSync(".");
  let all = [];

  files.forEach(file => {
    if (file.startsWith("questions") && file.endsWith(".json")) {
      const data = JSON.parse(fs.readFileSync(file));
      all.push(...data);
    }
  });

  return all;
}

const ALL_QUESTIONS = loadQuestions();

// ===== CODE CHECK (UPDATED) =====
async function checkCode(userCode) {
  const code = await db.collection("codes").findOne({ code: userCode });

  if (!code) return "invalid";
  if (code.used) return "used"; // 🔥 NEW

  const today = new Date();
  const expiry = new Date(code.expiry);

  if (today > expiry) return "expired";

  return "valid";
}

// ===== USERS =====
const users = {};

// ===== START =====
bot.start(async (ctx) => {
  const id = ctx.from.id;

  if (id === ADMIN_ID) {
    return ctx.reply("👑 Admin Mode Active\nCommands:\n/quiz");
  }

  const existingUser = await db.collection("users").findOne({ userId: id });

  users[id] = {
    step: "rules",
    name: existingUser?.name || "",
    plan: "",
    current: 0,
    score: 0,
    waitingDoubt: false,
    questions: ALL_QUESTIONS,
    isPaid: existingUser?.code ? true : false
  };

  ctx.reply(`🎯 Welcome to Exam Guider Bot  

🎁 முதல் 200 Questions FREE!

👇 Continue`, {
    reply_markup: {
      inline_keyboard: [[{ text: "Continue ➡️", callback_data: "continue" }]]
    }
  });
});

// ===== TEXT =====
bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const input = ctx.message.text.trim();
  const user = users[id];

  if (!user) return;

  // ===== NAME =====
  if (user.step === "name") {
    user.name = input;
    user.step = "menu";

    return ctx.reply(`✅ Welcome ${user.name}`, {
      reply_markup: {
        keyboard: [["🆕 New User"], ["🔑 Enter Code"]],
        resize_keyboard: true
      }
    });
  }

  // ===== PLAN =====
  if (input === "🆕 New User") {
    user.step = "plan";
    return ctx.reply("📅 Select Plan:", {
      reply_markup: {
        keyboard: [["7 Days"], ["15 Days"], ["30 Days"]],
        resize_keyboard: true
      }
    });
  }

  if (user.step === "plan") {
    user.plan = input;
    user.step = "payment";

    return ctx.reply(`💳 Pay & click I Paid`, {
      reply_markup: {
        keyboard: [["✅ I Paid"]],
        resize_keyboard: true
      }
    });
  }

  if (input === "✅ I Paid") {
    user.step = "screenshot";
    return ctx.reply("📸 Send screenshot");
  }

  if (input === "🔑 Enter Code") {
    user.step = "login";
    return ctx.reply("🔐 Enter code:");
  }

  // ===== LOGIN =====
  if (user.step === "login") {
    const result = await checkCode(input);

    if (result === "invalid") return ctx.reply("❌ Invalid Code");
    if (result === "expired") return ctx.reply("⛔ Expired Code");
    if (result === "used") return ctx.reply("🚫 Code already used");

    // 🔥 mark code used
    await db.collection("codes").updateOne(
      { code: input },
      { $set: { used: true, userId: id } }
    );

    await db.collection("users").updateOne(
      { userId: id },
      {
        $set: {
          userId: id,
          name: user.name,
          code: input,
          loginTime: new Date()
        }
      },
      { upsert: true }
    );

    user.isPaid = true;
    user.step = "quiz";

    ctx.reply("✅ Access Granted!");
    return sendQuestion(ctx, id);
  }

  // ===== DOUBT =====
  if (user.waitingDoubt) {
    user.waitingDoubt = false;

    const doubts = readJSON(DOUBT_FILE);

    doubts.push({
      id: Date.now(),
      userId: id,
      text: input
    });

    writeJSON(DOUBT_FILE, doubts);

    return ctx.reply("✅ Doubt sent");
  }
});

// ===== PHOTO =====
bot.on("photo", (ctx) => {
  const id = ctx.from.id;
  const user = users[id];

  if (!user || user.step !== "screenshot") return;

  const fileId = ctx.message.photo.slice(-1)[0].file_id;

  bot.telegram.sendPhoto(ADMIN_ID, fileId, {
    caption: `Payment from ${id}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `approve_${id}` },
          { text: "❌ Reject", callback_data: `reject_${id}` }
        ]
      ]
    }
  });

  user.step = "waiting";
  ctx.reply("⏳ Waiting...");
});

// ===== CALLBACK =====
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery();

  const data = ctx.callbackQuery.data;
  const id = ctx.from.id;
  const user = users[id];

  if (data === "continue") {
    user.step = "name";
    return ctx.reply("Enter name:");
  }

  if (data.startsWith("approve_")) {
    const userId = data.split("_")[1];

    const code = "QUIZ-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);

    await db.collection("codes").insertOne({
      code,
      expiry,
      used: false // 🔥 IMPORTANT
    });

    bot.telegram.sendMessage(userId, `Code: ${code}`);
    return;
  }

  if (!user) return;

  const q = user.questions[user.current];

  if (["0", "1", "2", "3"].includes(data)) {
    if (q.options[data] === q.answer) user.score++;

    return ctx.reply(
      `👉 ${q.answer}`,
      Markup.inlineKeyboard([[Markup.button.callback("Next", "next")]])
    );
  }

  if (data === "next") {
    user.current++;
    return sendQuestion(ctx, id);
  }
});

// ===== QUESTION =====
function sendQuestion(ctx, id) {
  const user = users[id];

  if (!user.isPaid && user.current >= 200) {
    return ctx.reply("🔒 Free limit over");
  }

  const q = user.questions[user.current];

  if (!q) {
    return ctx.reply(`Score: ${user.score}`);
  }

  ctx.reply(
    `Q${user.current + 1}: ${q.q}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("A", "0"),
        Markup.button.callback("B", "1"),
        Markup.button.callback("C", "2"),
        Markup.button.callback("D", "3")
      ]
    ])
  );
}

// ===== START =====
bot.launch();
console.log("🤖 Running");

app.get("/", (req, res) => res.send("Bot running"));

app.listen(process.env.PORT || 3000);