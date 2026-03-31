require("dotenv").config();

const { MongoClient } = require("mongodb");
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const express = require("express");

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

const bot = new Telegraf(BOT_TOKEN);
const app = express();

const DOUBT_FILE = "./doubts.json";

// ===== LOAD QUESTIONS (YOUR FILE STRUCTURE) =====
function loadQuestions() {
  let all = [];

  for (let i = 0; i <= 23; i++) {
    let fileName = i === 0 ? "questions.json" : `questions${i}.json`;

    if (fs.existsSync(fileName)) {
      const data = JSON.parse(fs.readFileSync(fileName));
      all.push(...data);
    }
  }

  console.log("Total Questions:", all.length); // ✅ debug

  return all;
}

const ALL_QUESTIONS = loadQuestions();

// ===== CODE CHECK =====
async function checkCode(userCode) {
  const code = await db.collection("codes").findOne({ code: userCode });

  if (!code) return "invalid";
  if (code.used) return "used";
  if (new Date() > new Date(code.expiry)) return "expired";

  return "valid";
}

// ===== USERS =====
const users = {};

// ===== START =====
bot.start(async (ctx) => {
  const id = ctx.from.id;

  users[id] = {
    step: "name",
    name: "",
    current: 0,
    score: 0,
    waitingDoubt: false,
    questions: ALL_QUESTIONS,
    isPaid: false
  };

  ctx.reply("👤 Enter your name:");
});

// ===== TEXT =====
bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const input = ctx.message.text.trim();
  const user = users[id];

  if (!user) return;

  // NAME → QUIZ START
  if (user.step === "name") {
    user.name = input;
    user.step = "quiz";

    ctx.reply(`✅ Welcome ${user.name}\n🎯 Quiz Started!`);
    return sendQuestion(ctx, id);
  }

  // JUMP
  if (user.step === "jump") {
    const num = parseInt(input);

    if (isNaN(num) || num < 1 || num > user.questions.length) {
      return ctx.reply("❌ Invalid number");
    }

    user.current = num - 1;
    user.step = "quiz";
    return sendQuestion(ctx, id);
  }

  // CODE ENTRY
  if (input === "🔑 Enter Code") {
    user.step = "login";
    return ctx.reply("Enter code:");
  }

  if (user.step === "login") {
    const result = await checkCode(input);

    if (result === "invalid") return ctx.reply("❌ Invalid");
    if (result === "expired") return ctx.reply("⛔ Expired");
    if (result === "used") return ctx.reply("🚫 Used");

    await db.collection("codes").updateOne(
      { code: input },
      { $set: { used: true, userId: id } }
    );

    user.isPaid = true;
    user.step = "quiz";

    ctx.reply("✅ Premium unlocked!");
    return sendQuestion(ctx, id);
  }

  // DOUBT
  if (user.waitingDoubt) {
    user.waitingDoubt = false;

    const doubts = fs.existsSync(DOUBT_FILE)
      ? JSON.parse(fs.readFileSync(DOUBT_FILE))
      : [];

    doubts.push({ id: Date.now(), userId: id, text: input });

    fs.writeFileSync(DOUBT_FILE, JSON.stringify(doubts, null, 2));

    return ctx.reply("✅ Doubt sent");
  }
});

// ===== CALLBACK =====
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery();

  const data = ctx.callbackQuery.data;
  const id = ctx.from.id;
  const user = users[id];

  if (!user) return;

  const q = user.questions[user.current];

  // ANSWER
  if (["0", "1", "2", "3"].includes(data)) {
    const selected = q.options[data];

    if (selected === q.answer) user.score++;

    return ctx.reply(
      `${selected === q.answer ? "✅ Correct" : "❌ Wrong"}\n👉 ${q.answer}`
    );
  }

  // NEXT
  if (data === "next") {
    user.current++;
    return sendQuestion(ctx, id);
  }

  // PREVIOUS
  if (data === "prev") {
    if (user.current > 0) user.current--;
    return sendQuestion(ctx, id);
  }

  // JUMP
  if (data === "jump") {
    user.step = "jump";
    return ctx.reply("Enter question number:");
  }

  // DOUBT
  if (data === "doubt") {
    user.waitingDoubt = true;
    return ctx.reply("Type your doubt:");
  }
});

// ===== QUESTION =====
function sendQuestion(ctx, id) {
  const user = users[id];

  // FREE LIMIT
  if (!user.isPaid && user.current >= 200) {
    return ctx.reply(
      `🔒 200 Questions முடிந்தது!

👉 Continue செய்ய code enter செய்யுங்கள்`,
      {
        reply_markup: {
          keyboard: [["🔑 Enter Code"]],
          resize_keyboard: true
        }
      }
    );
  }

  const q = user.questions[user.current];

  if (!q) {
    return ctx.reply(`🎯 Completed!\nScore: ${user.score}`);
  }

  ctx.reply(
    `👤 ${user.name}
Q${user.current + 1}/${user.questions.length}: ${q.q}

A) ${q.options[0]}
B) ${q.options[1]}
C) ${q.options[2]}
D) ${q.options[3]}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("A", "0"),
        Markup.button.callback("B", "1")
      ],
      [
        Markup.button.callback("C", "2"),
        Markup.button.callback("D", "3")
      ],
      [
        Markup.button.callback("⬅️ Prev", "prev"),
        Markup.button.callback("➡️ Next", "next")
      ],
      [
        Markup.button.callback("🔢 Jump", "jump"),
        Markup.button.callback("💬 Doubt", "doubt")
      ]
    ])
  );
}

// ===== START =====
bot.launch();
console.log("🤖 Running");

app.get("/", (req, res) => res.send("Bot running"));
app.listen(process.env.PORT || 3000);