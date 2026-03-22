require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

// ===== TOKEN CHECK =====
if (!process.env.BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== LOAD QUESTIONS =====
const questions = require("./questions.json");

// ===== USER DATA =====
const users = {};

// ===== START =====
bot.start((ctx) => {
  const userId = ctx.from.id;

  users[userId] = {
    current: 0,
    score: 0,
    paused: false
  };

  ctx.reply("🔥 Quiz Started!");
  sendQuestion(ctx, userId);
});

// ===== SEND QUESTION =====
function sendQuestion(ctx, userId) {
  const user = users[userId];
  const q = questions[user.current];

  if (!q) {
    return ctx.reply(
      `🎯 Quiz Completed!\n\n✅ Correct: ${user.score}\n❌ Wrong: ${
        questions.length - user.score
      }`
    );
  }

  // 👉 OPTIONS TEXT + BUTTONS
  const text = `Q${user.current + 1}: ${q.q}

A) ${q.options[0]}
B) ${q.options[1]}
C) ${q.options[2]}
D) ${q.options[3]}`;

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
      ]
    ])
  );

  // 👉 CONTROLS
  ctx.reply(
    "🎮 Controls 👇",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("⬅️ Prev", "prev"),
        Markup.button.callback("⏸ Pause", "pause")
      ],
      [
        Markup.button.callback("▶️ Continue", "continue"),
        Markup.button.callback("⏹ Stop", "stop")
      ]
    ])
  );
}

// ===== BUTTON CLICK =====
bot.on("callback_query", async (ctx) => {
  const userId = ctx.from.id;

  if (!users[userId]) {
    users[userId] = {
      current: 0,
      score: 0,
      paused: false
    };
  }

  const user = users[userId];
  const data = ctx.callbackQuery.data;

  if (data === "pause") {
    user.paused = true;
    return ctx.answerCbQuery("⏸ Paused");
  }

  if (data === "continue") {
    user.paused = false;
    ctx.answerCbQuery("▶️ Continued");
    return sendQuestion(ctx, userId);
  }

  if (data === "stop") {
    delete users[userId];
    return ctx.reply("🛑 Quiz Stopped");
  }

  if (data === "prev") {
    if (user.current > 0) user.current--;
    return sendQuestion(ctx, userId);
  }

  if (user.paused) {
    return ctx.answerCbQuery("⏸ Quiz Paused");
  }

  const q = questions[user.current];
  const selected = q.options[parseInt(data)];

  if (selected === q.answer) {
    user.score++;
    await ctx.answerCbQuery("✅ Correct");
  } else {
    await ctx.answerCbQuery("❌ Wrong");
  }

  user.current++;
  sendQuestion(ctx, userId);
});

// ===== LAUNCH =====
bot.launch().then(() => {
  console.log("🤖 Bot running...");
});

// ===== EXPRESS SERVER =====
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running ✅");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});