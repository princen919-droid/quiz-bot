require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);
const questions = require("./questions.json");

// ===== USER DATABASE (FILE) =====
function getUsersFile() {
  return JSON.parse(fs.readFileSync("./users.json"));
}

function saveUsersFile(data) {
  fs.writeFileSync("./users.json", JSON.stringify(data, null, 2));
}

// ===== TEMP USER SESSION =====
const users = {};

// ===== START =====
bot.start((ctx) => {
  const id = ctx.from.id;

  // ===== SAVE USER =====
  const db = getUsersFile();

  if (!db[id]) {
    db[id] = {
      name: ctx.from.first_name,
      active: true
    };
    saveUsersFile(db);
  }

  // ===== BLOCK CHECK =====
  if (!db[id].active) {
    return ctx.reply("🚫 You are blocked");
  }

  // ===== QUIZ SESSION =====
  users[id] = {
    current: 0,
    score: 0,
    waitingJump: false
  };

  ctx.reply(`🔥 Quiz Started!\nTotal Questions: ${questions.length}`);
  sendQuestion(ctx, id);
});

// ===== SEND QUESTION =====
function sendQuestion(ctx, id) {
  const user = users[id];
  const q = questions[user.current];

  if (!q) {
    return ctx.reply(
      `🎯 Quiz Completed!\n\n✅ Correct: ${user.score}\n❌ Wrong: ${
        questions.length - user.score
      }`
    );
  }

  let text =
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
      ]
    ])
  );
}

// ===== BUTTON HANDLER =====
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery();

  const id = ctx.from.id;
  const user = users[id];
  if (!user) return;

  // ===== BLOCK CHECK =====
  const db = getUsersFile();
  if (!db[id] || !db[id].active) {
    return ctx.reply("🚫 You are blocked");
  }

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
    return ctx.reply("🔢 Enter question number (example: 5)");
  }
});

// ===== TEXT INPUT =====
bot.on("text", (ctx) => {
  const id = ctx.from.id;
  const user = users[id];
  if (!user || !user.waitingJump) return;

  // ===== BLOCK CHECK =====
  const db = getUsersFile();
  if (!db[id] || !db[id].active) {
    return ctx.reply("🚫 You are blocked");
  }

  const num = parseInt(ctx.message.text);

  if (isNaN(num) || num < 1 || num > questions.length) {
    return ctx.reply("❌ Invalid number");
  }

  user.current = num - 1;
  user.waitingJump = false;

  sendQuestion(ctx, id);
});

// ===== ADMIN BLOCK =====
bot.command("block", (ctx) => {
  const ADMIN_ID = 123456789; // 👉 CHANGE THIS

  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("❌ Not admin");
  }

  const userId = ctx.message.text.split(" ")[1];
  if (!userId) return ctx.reply("Usage: /block userId");

  const db = getUsersFile();

  if (!db[userId]) return ctx.reply("User not found");

  db[userId].active = false;
  saveUsersFile(db);

  ctx.reply("🚫 User blocked");
});

// ===== ADMIN UNBLOCK =====
bot.command("unblock", (ctx) => {
  const ADMIN_ID = 123456789; // 👉 CHANGE THIS

  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("❌ Not admin");
  }

  const userId = ctx.message.text.split(" ")[1];
  if (!userId) return ctx.reply("Usage: /unblock userId");

  const db = getUsersFile();

  if (!db[userId]) return ctx.reply("User not found");

  db[userId].active = true;
  saveUsersFile(db);

  ctx.reply("✅ User unblocked");
});

// ===== START BOT =====
bot.launch();
console.log("Bot running...");

// ===== EXPRESS =====
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});