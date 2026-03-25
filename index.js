// ================= IMPORT =================
require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

// ================= INIT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== ADMIN ID =====
const ADMIN_ID = 123456789;

// ===== LOGIN IDS (manual subscription codes) =====
const validIds = ["TNPSC001", "TNPSC002", "TNPSC003"];

// ================= LOAD QUESTION SET =================
let questions = [];

function loadQuestions() {
  const files = ["questions.json", "questions1.json"];

  const randomFile = files[Math.floor(Math.random() * files.length)];

  console.log("Loaded:", randomFile);

  return require(`./${randomFile}`);
}

// ================= FILE SYSTEM =================
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
  questions = loadQuestions();

  // ===== ADMIN FREE ACCESS =====
  if (id === ADMIN_ID) {
    questions = loadQuestions();

    users[id] = {
      step: "quiz",
      name: "ADMIN",
      current: 0,
      score: 0,
      waitingJump: false,
      waitingDoubt: false
    };

    ctx.reply("👑 Admin Access Granted");
    return sendQuestion(ctx, id);
  }


  // ===== NORMAL USER =====
  users[id] = {
    step: "login",
    name: "",
    loginId: "",
    current: 0,
    score: 0,
    waitingJump: false,
    waitingDoubt: false
  };

  ctx.reply("🔐 Enter your Login ID:");
});

// ================= TEXT HANDLER =================
bot.on("text", (ctx) => {
  const id = ctx.from.id;
  const user = users[id];
  if (!user) return;

  const input = ctx.message.text.trim();

  // ===== LOGIN STEP =====
  if (user.step === "login") {
    if (validIds.includes(input)) {
      user.loginId = input;
      user.step = "name";
      return ctx.reply("👤 Enter your Name:");
    } else {
      return ctx.reply("❌ Invalid Login ID");
    }
  }

  // ===== NAME STEP =====
  if (user.step === "name") {
    user.name = input;
    user.step = "quiz";
    questions = loadQuestions();

    // LOAD QUESTIONS
    questions = loadQuestions();

    // SAVE USER
    const db = getLoginUsers();
    db[id] = {
      name: user.name,
      loginId: user.loginId
    };
    saveLoginUsers(db);

    ctx.reply(`✅ Welcome ${user.name}!\n🔥 Quiz Started!`);
    return sendQuestion(ctx, id);
  }

  // ===== DOUBT SYSTEM =====
  if (user.waitingDoubt) {
    user.waitingDoubt = false;

    bot.telegram.sendMessage(
      ADMIN_ID,
      `📩 Doubt from ${user.name} (${id}):\n${input}`
    );

    return ctx.reply("✅ Your doubt sent to admin");
  }

  // ===== JUMP =====
  if (user.waitingJump) {
    const num = parseInt(input);

    if (isNaN(num) || num < 1 || num > questions.length) {
      return ctx.reply("❌ Invalid number");
    }

    user.current = num - 1;
    user.waitingJump = false;

    return sendQuestion(ctx, id);
  }
});

// ================= ADMIN COMMAND =================
bot.command("users", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("❌ Not admin");
  }

  const db = getLoginUsers();
  let text = "📊 Logged Users:\n\n";

  let i = 1;
  for (let id in db) {
    text += `${i}. ${db[id].name} (${db[id].loginId})\n`;
    i++;
  }

  if (i === 1) text += "No users yet";

  ctx.reply(text);
});

// ================= DOUBT COMMAND =================
bot.command("doubt", (ctx) => {
  const id = ctx.from.id;
  if (!users[id]) return;

  users[id].waitingDoubt = true;
  ctx.reply("✍️ Enter your doubt:");
});

// ================= ADMIN REPLY =================
bot.command("reply", (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.split(" ");
  const userId = parts[1];
  const msg = parts.slice(2).join(" ");

  bot.telegram.sendMessage(userId, `📢 Admin Reply:\n${msg}`);
});

// ================= QUESTION =================
function sendQuestion(ctx, id) {
  const user = users[id];
  const q = questions[user.current];

  if (!q) {
    return ctx.reply(
      `🎯 Quiz Completed!\n\n👤 ${user.name}\n✅ Correct: ${user.score}\n❌ Wrong: ${
        questions.length - user.score
      }`
    );
  }

  let text =
    `👤 ${user.name}\n\n` +
    `Q${user.current + 1}/${questions.length}: ${q.q}\n\n` +
    `A) ${q.options[0]}\n` +
    `B) ${q.options[1]}\n` +
    `C) ${q.options[2]}\n` +
    `D) ${q.options[3]}`;

  ctx.reply(
    text,
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
  if (!user || user.step !== "quiz") return;

  const data = ctx.callbackQuery.data;
  const q = questions[user.current];

  // ===== ANSWER =====
  if (["0", "1", "2", "3"].includes(data)) {
    const selected = q.options[parseInt(data)];

    let result = selected === q.answer ? "✅ Correct" : "❌ Wrong";

    if (selected === q.answer) user.score++;

    return ctx.reply(
      `${result}\n👉 Correct Answer: ${q.answer}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("➡️ Next", "next")]
      ])
    );
  }

  // ===== NEXT =====
  if (data === "next") {
    user.current++;
    return sendQuestion(ctx, id);
  }

  // ===== JUMP =====
  if (data === "jump") {
    user.waitingJump = true;
    return ctx.reply("🔢 Enter question number:");
  }

  // ===== DOUBT BUTTON =====
  if (data === "doubt") {
    user.waitingDoubt = true;
    return ctx.reply("✍️ Type your doubt:");
  }
});

// ================= START BOT =================
bot.launch();
console.log("Bot running...");

// ================= EXPRESS (Render keep alive) =================
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});