require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);
const questions = require("./questions.json");

const users = {};

// ===== START =====
bot.start((ctx) => {
  const id = ctx.from.id;

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

// ===== BUTTON =====
bot.on("callback_query", async (ctx) => {
  const id = ctx.from.id;
  const user = users[id];
  if (!user) return;

  const data = ctx.callbackQuery.data;
  const q = questions[user.current];

  // ===== ANSWER =====
  if (["0", "1", "2", "3"].includes(data)) {
    const selected = q.options[parseInt(data)];

    let result = selected === q.answer ? "✅ Correct" : "❌ Wrong";

    if (selected === q.answer) user.score++;

    await ctx.reply(
      `${result}\n👉 Correct Answer: ${q.answer}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("➡️ Next", "next")]
      ])
    );

    return;
  }

  // ===== NEXT =====
  if (data === "next") {
    user.current++;
    return sendQuestion(ctx, id);
  }

  // ===== JUMP BUTTON =====
  if (data === "jump") {
    user.waitingJump = true;
    return ctx.reply("🔢 Enter question number (example: 5)");
  }
});

// ===== TEXT INPUT (JUMP HANDLE) =====
bot.on("text", (ctx) => {
  const id = ctx.from.id;
  const user = users[id];
  if (!user || !user.waitingJump) return;

  const num = parseInt(ctx.message.text);

  if (isNaN(num) || num < 1 || num > questions.length) {
    return ctx.reply("❌ Invalid number");
  }

  user.current = num - 1;
  user.waitingJump = false;

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