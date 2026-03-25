// ================= IMPORT =================
require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

// ================= INIT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== ADMIN ID =====
const ADMIN_ID = 1251521284;

// ===== LOGIN IDS =====
const validIds = ["TNPSC001", "TNPSC002", "TNPSC003"];

// ================= LOAD QUESTIONS =================
let toggle = false;

function loadQuestions() {
  toggle = !toggle;

  if (toggle) {
    return require("./questions.json");
  } else {
    return require("./questions1.json");
  }
}

// ================= FILE =================
function getLoginUsers() {
  try {
    return JSON.parse(fs.readFileSync("./loginUsers.json"));
  } catch {
    return {};
  }
}

function saveLoginUsers(data) {
  fs.writeFileSync("./loginUsers.json", JSON.stringify(data, null, 2));
}

// ================= SESSION =================
const users = {};

// ================= START =================
bot.start((ctx) => {
  const id = ctx.from.id;

  users[id] = {
    step: id === ADMIN_ID ? "quiz" : "login",
    name: id === ADMIN_ID ? "ADMIN" : "",
    loginId: "",
    current: 0,
    score: 0,
    waitingJump: false,
    waitingDoubt: false,
    questions: loadQuestions()
  };

  if (id === ADMIN_ID) {
    ctx.reply("👑 Admin Access Granted");
    return sendQuestion(ctx, id);
  }

  ctx.reply("🔐 Enter your Login ID:");
});

// ================= TEXT =================
bot.on("text", (ctx) => {
  const id = ctx.from.id;
  const user = users[id];
  if (!user) return;

  const input = ctx.message.text.trim();

  // ===== ADMIN REPLY =====
  if (input.startsWith("reply")) {
    if (id !== ADMIN_ID) return;

    const parts = input.split(" ");
    const userId = parts[1];
    const msg = parts.slice(2).join(" ");

    if (!userId || !msg) {
      return ctx.reply("❌ Usage: reply USERID message");
    }

    bot.telegram.sendMessage(userId, `📢 Admin Reply:\n${msg}`);
    return ctx.reply("✅ Reply sent");
  }

  // ===== LOGIN =====
  if (user.step === "login") {
    if (validIds.includes(input)) {
      user.loginId = input;
      user.step = "name";
      return ctx.reply("👤 Enter your Name:");
    } else {
      return ctx.reply("❌ Invalid Login ID");
    }
  }

  // ===== NAME =====
  if (user.step === "name") {
    user.name = input;
    user.step = "quiz";

    const db = getLoginUsers();
    db[id] = { name: user.name, loginId: user.loginId };
    saveLoginUsers(db);

    ctx.reply(`✅ Welcome ${user.name}\n🔥 Quiz Started!`);
    return sendQuestion(ctx, id);
  }

  // ===== DOUBT =====
  if (user.waitingDoubt) {
    user.waitingDoubt = false;

    bot.telegram.sendMessage(
      ADMIN_ID,
      `📩 Doubt from ${user.name} (${id}):\n${input}`
    );

    return ctx.reply("✅ Doubt sent to admin");
  }

  // ===== JUMP =====
  if (user.waitingJump) {
    const num = parseInt(input);

    if (isNaN(num) || num < 1 || num > user.questions.length) {
      return ctx.reply("❌ Invalid number");
    }

    user.current = num - 1;
    user.waitingJump = false;

    return sendQuestion(ctx, id);
  }
});

// ================= QUESTION =================
function sendQuestion(ctx, id) {
  const user = users[id];
  const q = user.questions[user.current];

  if (!q) {
    return ctx.reply(
      `🎯 Completed!\n👤 ${user.name}\n✅ ${user.score}\n❌ ${
        user.questions.length - user.score
      }`
    );
  }

  ctx.reply(
    `👤 ${user.name}\n\nQ${user.current + 1}/${user.questions.length}: ${q.q}\n\nA) ${q.options[0]}\nB) ${q.options[1]}\nC) ${q.options[2]}\nD) ${q.options[3]}`,
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
        Markup.button.callback("➡️ Next", "next"),
        Markup.button.callback("🔢 Jump", "jump")
      ],
      [
        Markup.button.callback("💬 Doubt", "doubt")
      ]
    ])
  );
}

// ================= BUTTON =================
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery();

  const id = ctx.from.id;
  const user = users[id];
  if (!user) return;

  const data = ctx.callbackQuery.data;
  const q = user.questions[user.current];

  if (["0", "1", "2", "3"].includes(data)) {
    const selected = q.options[data];
    if (selected === q.answer) user.score++;

    return ctx.reply(
      `${selected === q.answer ? "✅ Correct" : "❌ Wrong"}\n👉 ${q.answer}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("➡️ Next", "next")]
      ])
    );
  }

  if (data === "next") {
    user.current++;
    return sendQuestion(ctx, id);
  }

  if (data === "jump") {
    user.waitingJump = true;
    return ctx.reply("🔢 Enter number:");
  }

  if (data === "doubt") {
    user.waitingDoubt = true;
    return ctx.reply("✍️ Type your doubt:");
  }
});

// ================= START =================
bot.launch();
console.log("Bot running...");

// ================= EXPRESS =================
const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Bot running"));

app.listen(process.env.PORT || 3000);