require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const { MongoClient } = require("mongodb");
const fs = require("fs");

// ===== ENV =====
const bot = new Telegraf(process.env.BOT_TOKEN);
const client = new MongoClient(process.env.MONGO_URL);
const ADMIN_ID = Number(process.env.ADMIN_ID);
const UPI_ID = process.env.UPI_ID;

let db;

// ===== CONNECT DB =====
(async () => {
  await client.connect();
  db = client.db("quizbot");
  console.log("✅ DB Connected");
})();

// ===== LOAD QUESTIONS =====
function loadQuestions() {
  let all = [];
  for (let i = 0; i <= 23; i++) {
    let file = i === 0 ? "questions.json" : `questions${i}.json`;
    if (fs.existsSync(file)) {
      all.push(...JSON.parse(fs.readFileSync(file)));
    }
  }
  console.log("Questions:", all.length);
  return all;
}

const QUESTIONS = loadQuestions();

// ===== START =====
bot.start(async (ctx) => {
  const id = ctx.from.id;

  // 🔥 இதை இங்கே paste பண்ணு
  if (id === ADMIN_ID) {
    await ctx.reply("♻️ Loading Admin Panel...");

    return ctx.reply(
      "👑 Admin Panel",
      Markup.keyboard([
        ["📊 Users", "💰 Payments"],
        ["📝 Questions"]
      ])
        .resize()
        .oneTime()
    );
  }

  let user = await db.collection("users").findOne({ id });

  if (user) {
    return ctx.reply(
      `👋 Welcome back ${user.name}\nContinue your quiz`,
      Markup.keyboard([["▶️ Continue"]]).resize()
    );
  }

  await db.collection("users").insertOne({
    id,
    name: "",
    step: "name",
    current: 0,
    score: 0,
    isPaid: false,
    answered: false
  });

  ctx.reply("👤 Enter your name:");
});

// ===== TEXT =====
bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const text = ctx.message.text;

  let user = await db.collection("users").findOne({ id });
  if (!user) return;

  // NAME
  if (user.step === "name") {
    await db.collection("users").updateOne(
      { id },
      { $set: { name: text, step: "plan" } }
    );

    return ctx.reply(
      `👋 Welcome ${text}\nChoose your plan`,
      Markup.keyboard([
        ["🆓 Free (200 Questions)"],
        ["💎 Premium"]
      ]).resize()
    );
  }

  // PLAN
  if (user.step === "plan") {
    if (text.includes("Free")) {
      await db.collection("users").updateOne(
        { id },
        { $set: { step: "quiz" } }
      );
      return sendQuestion(ctx, id);
    }

    if (text.includes("Premium")) {
      await db.collection("users").updateOne(
        { id },
        { $set: { step: "payment" } }
      );

      return ctx.reply(
        `💰 Pay via UPI:\n${UPI_ID}\n\n📸 Send screenshot after payment`
      );
    }
  }

  // PAYMENT SCREENSHOT (TEXT FALLBACK)
  if (user.step === "payment") {
    await db.collection("payments").insertOne({
      userId: id,
      name: user.name,
      status: "pending"
    });

    await ctx.reply("⏳ Waiting for admin approval");

    await bot.telegram.sendMessage(
      ADMIN_ID,
      `💰 New Payment\nUser: ${user.name}\nID: ${id}\n\nUse /approve ${id}`
    );

    return;
  }

  // CONTINUE
  if (text === "▶️ Continue") {
    return sendQuestion(ctx, id);
  }

  
  // ADMIN APPROVE (FIXED)
if (text.startsWith("/approve")) {
  const userId = Number(text.split(" ")[1]);

  if (!userId) {
    return ctx.reply("❌ Invalid user ID");
  }

  await db.collection("users").updateOne(
    { id: userId },
    { $set: { isPaid: true } }
  );

  await bot.telegram.sendMessage(userId, "✅ Payment Approved! 🎉");

  return ctx.reply("✅ Approved successfully");
}
  // DOUBT TEXT
  if (user.waitingDoubt) {
    await db.collection("doubts").insertOne({
      userId: id,
      name: user.name,
      qNo: user.current + 1,
      question: QUESTIONS[user.current].q,
      doubt: text
    });

    await db.collection("users").updateOne(
      { id },
      { $set: { waitingDoubt: false } }
    );

    await ctx.reply("✅ Doubt sent");

    await bot.telegram.sendMessage(
      ADMIN_ID,
      `💬 Doubt from ${user.name}\nQ${user.current + 1}\n${text}\n\n/reply ${id} your_answer`
    );
  }

 // JUMP INPUT
if (user.waitingJump) {
  if (isNaN(text)) {
    await db.collection("users").updateOne(
      { id },
      { $set: { waitingJump: false } }
    );
    return ctx.reply("❌ Enter valid number");
  }

  const qNo = Number(text);

  if (qNo < 1 || qNo > QUESTIONS.length) {
    await db.collection("users").updateOne(
      { id },
      { $set: { waitingJump: false } }
    );
    return ctx.reply("❌ Out of range");
  }

  await db.collection("users").updateOne(
    { id },
    {
      $set: {
        current: qNo - 1,
        waitingJump: false,
        answered: false
      }
    }
  );

  return sendQuestion(ctx, id);
}
  // ADMIN REPLY
  if (id === ADMIN_ID && text.startsWith("/reply")) {
    const parts = text.split(" ");
    const userId = Number(parts[1]);
    const msg = parts.slice(2).join(" ");

    await bot.telegram.sendMessage(userId, `📢 Admin Reply:\n${msg}`);
    return ctx.reply("Sent");
  }
});

// ===== CALLBACK =====
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery();

  const id = ctx.from.id;
  const data = ctx.callbackQuery.data;

  let user = await db.collection("users").findOne({ id });

  if (!user) return;

  const q = QUESTIONS[user.current];

  // ANSWER LOCK
  if (user.answered && ["0","1","2","3"].includes(data)) {
    return ctx.reply("⚠️ Already answered");
  }

  // ANSWER
  if (["0","1","2","3"].includes(data)) {
    const selected = q.options[data];

    let score = user.score;
    if (selected === q.answer) score++;

    await db.collection("users").updateOne(
      { id },
      { $set: { score, answered: true } }
    );

    return ctx.reply(
      `${selected === q.answer ? "✅ Correct" : "❌ Wrong"}\n👉 ${q.answer}`
    );
  }

  // NEXT
  if (data === "next") {
    await db.collection("users").updateOne(
      { id },
      { $inc: { current: 1 }, $set: { answered: false } }
    );
    return sendQuestion(ctx, id);
  }

  // PREV
  if (data === "prev") {
    await db.collection("users").updateOne(
      { id },
      { $inc: { current: -1 }, $set: { answered: false } }
    );
    return sendQuestion(ctx, id);
  }

  // JUMP BUTTON
if (data === "jump") {
  await db.collection("users").updateOne(
    { id },
    { $set: { waitingJump: true } }
  );

  return ctx.reply("🔢 Enter question number (1 - " + QUESTIONS.length + ")");
}

  // DOUBT
  if (data === "doubt") {
    await db.collection("users").updateOne(
      { id },
      { $set: { waitingDoubt: true } }
    );
    return ctx.reply("💬 Type your doubt:");
  }
});

// ===== SEND QUESTION =====
async function sendQuestion(ctx, id) {
  let user = await db.collection("users").findOne({ id });

  if (!user.isPaid && user.current >= 200) {
    return ctx.reply("🔒 Free limit over\nBuy Premium");
  }

  const q = QUESTIONS[user.current];

  if (!q) {
    return ctx.reply(`🎯 Completed!\nScore: ${user.score}`);
  }

  ctx.reply(
    `👤 ${user.name}
Q${user.current + 1}/${QUESTIONS.length}
${q.q}

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
console.log("🤖 Bot Running");

// 👇 இதுக்கு கீழே add பண்ணு
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});