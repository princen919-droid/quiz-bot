require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

// ===== TOKEN =====
const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== LOAD JSON =====
const questions = require("./questions.json");

// ===== USER DATA =====
const users = {};

// ===== START =====
bot.start((ctx) => {
  const id = ctx.from.id;

  users[id] = {
    current: 0,
    score: 0,
    paused: false
  };

  ctx.reply("🔥 Quiz Started!");
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

  // ✅ OPTIONS TEXT (IMPORTANT FIX)
  let text =
    "Q" +
    (user.current + 1) +
    ": " +
    q.q +
    "\n\n" +
    "A) " +
    q.options[0] +
    "\n" +
    "B) " +
    q.options[1] +
    "\n" +
    "C) " +
    q.options[2] +
    "\n" +
    "D) " +
    q.options[3];

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

  // CONTROLS
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

// ===== BUTTON =====
bot.on("callback_query", async (ctx) => {
  const id = ctx.from.id;

  if (!users[id]) {
    users[id] = { current: 0, score: 0, paused: false };
  }

  const user = users[id];
  const data = ctx.callbackQuery.data;

  if (data === "pause") {
    user.paused = true;
    return ctx.answerCbQuery("Paused");
  }

  if (data === "continue") {
    user.paused = false;
    ctx.answerCbQuery("Continue");
    return sendQuestion(ctx, id);
  }

  if (data === "stop") {
    delete users[id];
    return ctx.reply("🛑 Quiz Stopped");
  }

  if (data === "prev") {
    if (user.current > 0) user.current--;
    return sendQuestion(ctx, id);
  }

  if (user.paused) {
    return ctx.answerCbQuery("Paused");
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
  sendQuestion(ctx, id);
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

app.listen(process.env.PORT || 3000);