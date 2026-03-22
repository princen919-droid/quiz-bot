require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

// START
bot.start((ctx) => {
  ctx.reply("🤖 Bot working ✅\n\nClick below to start quiz", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🧠 Start Quiz", callback_data: "quiz" }]
      ]
    }
  });
});

// QUIZ QUESTION
bot.action("quiz", (ctx) => {
  ctx.reply(
    "Q1: இந்தியாவின் தேசிய பறவை?\n\nA) மயில்\nB) காகம்\nC) கிளி\nD) கழுகு",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "A", callback_data: "A" },
            { text: "B", callback_data: "B" }
          ],
          [
            { text: "C", callback_data: "C" },
            { text: "D", callback_data: "D" }
          ]
        ]
      }
    }
  );
});

// ANSWER CHECK
bot.action(["A", "B", "C", "D"], (ctx) => {
  if (ctx.callbackQuery.data === "A") {
    ctx.reply("✅ Correct! மயில் தான் தேசிய பறவை");
  } else {
    ctx.reply("❌ Wrong answer");
  }
});

// BOT START
bot.launch();

console.log("Bot running...");

// 👉 IMPORTANT (Render fix)
require("http")
  .createServer((req, res) => res.end("ok"))
  .listen(process.env.PORT || 3000);