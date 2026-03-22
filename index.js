require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

// ===== TOKEN CHECK =====
if (!process.env.BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== QUESTIONS =====
const questions = [
  {
    q: "இந்தியாவின் தேசிய பறவை?",
    options: ["மயில்", "காகம்", "கிளி", "கருடன்"],
    answer: "மயில்"
  },
  {
    q: "இந்தியாவின் தலைநகர்?",
    options: ["சென்னை", "மும்பை", "டெல்லி", "கோல்கத்தா"],
    answer: "டெல்லி"
  }
];

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

  // 👉 QUESTION + OPTIONS
  ctx.reply(
    `Q${user.current + 1}: ${q.q}`,
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

  // 👉 CONTROL BUTTONS (SEPARATE)
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

  // ===== PAUSE =====
  if (data === "pause") {
    user.paused = true;
    return ctx.answerCbQuery("⏸ Paused");
  }

  // ===== CONTINUE =====
  if (data === "continue") {
    user.paused = false;
    ctx.answerCbQuery("▶️ Continued");
    return sendQuestion(ctx, userId);
  }

  // ===== STOP =====
  if (data === "stop") {
    delete users[userId];
    return ctx.reply("🛑 Quiz Stopped");
  }

  // ===== PREVIOUS =====
  if (data === "prev") {
    if (user.current > 0) user.current--;
    return sendQuestion(ctx, userId);
  }

  // ===== IF PAUSED =====
  if (user.paused) {
    return ctx.answerCbQuery("⏸ Quiz Paused");
  }

  // ===== ANSWER CHECK =====
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
