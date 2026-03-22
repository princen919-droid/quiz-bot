require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);
const questions = require("./questions.json");

// ===== VALID LOGIN IDS =====
const validIds = ["TNPSC001", "TNPSC002", "TNPSC003"];

// ===== USER SESSION =====
const users = {};

// ===== START =====
bot.start((ctx) => {
  const id = ctx.from.id;

  users[id] = {
    loggedIn: false,
    waitingLogin: true,
    current: 0,
    score: 0,
    waitingJump: false
  };

  ctx.reply("🔐 Enter your Login ID:");
});

// ===== LOGIN INPUT =====
bot.on("text", (ctx) => {
  const id = ctx.from.id;
  const user = users[id];

  if (!user) return;

  // ===== LOGIN CHECK =====
  if (user.waitingLogin) {
    const input = ctx.message.text.trim();

    if (validIds.includes(input)) {
      user.loggedIn = true;
      user.waitingLogin = false;

      ctx.reply("✅ Login Successful!\n\n🔥 Quiz Started!");
      return sendQuestion(ctx, id);
    } else {
      return ctx.reply("❌ Invalid Login ID");
    }
  }

  // ===== JUMP INPUT =====
  if (user.waitingJump) {
    const num = parseInt(ctx.message.text);

    if (isNaN(num) || num < 1 || num > questions.length) {
      return ctx.reply("❌ Invalid number");
    }

    user.current = num - 1;
    user.waitingJump = false;

    return sendQuestion(ctx, id);
  }
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
  if (!user || !user.loggedIn) return;

  const data = ctx.callbackQuery.data;
  const q = questions[user.current];

  // ANSWER
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

  // NEXT
  if (data === "next") {
    user.current++;
    return sendQuestion(ctx, id);
  }

  // JUMP
  if (data === "jump") {
    user.waitingJump = true;
    return ctx.reply("🔢 Enter question number (example: 5)");
  }
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