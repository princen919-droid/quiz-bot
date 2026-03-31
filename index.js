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
      try {
        let data = JSON.parse(fs.readFileSync(file));
        data = data.filter(q => q.q && q.options && q.answer);
        all.push(...data);
      } catch (e) {
        console.log(`❌ Error in ${file}`);
      }
    }
  }
  console.log("Questions Loaded:", all.length);
  return all;
}

const QUESTIONS = loadQuestions();

// ===== START =====
bot.start(async (ctx) => {
  const id = ctx.from.id;

  if (id === ADMIN_ID) {
    return ctx.reply(
      "👑 Admin Panel",
      Markup.keyboard([
        ["📊 Users", "💰 Payments"],
        ["📝 Questions"]
      ]).resize()
    );
  }

  let user = await db.collection("users").findOne({ id });

  // ✅ USER EXIST
  if (user) {

    // 🔥 IF PAID → DIRECT QUIZ
    if (user.isPaid) {
      return sendQuestion(ctx, id);
    }

    // 🔥 FREE LIMIT OVER
    if (!user.isPaid && user.current >= 200) {
      return ctx.reply(
        "🔒 Free limit over",
        Markup.keyboard([["💎 Premium"]]).resize()
      );
    }

    // 🔥 CONTINUE
    return ctx.reply(
      `👋 Welcome back ${user.name}`,
      Markup.keyboard([["▶️ Continue"]]).resize()
    );
  }

  // ❌ ONLY NEW USER INSERT
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

  // ===== ADMIN =====
  if (id === ADMIN_ID) {

    if (text === "📊 Users") {
      const total = await db.collection("users").countDocuments();
      return ctx.reply(`👥 Total Users: ${total}`);
    }

    if (text === "💰 Payments") {
      const pending = await db.collection("payments")
        .find({ status: "pending" })
        .toArray();

      if (!pending.length) return ctx.reply("No pending");

      let msg = "💰 Pending:\n";
      pending.forEach(p => {
        msg += `${p.name} (${p.userId})\n`;
      });

      return ctx.reply(msg);
    }

    if (text.startsWith("/approve")) {
  const userId = Number(text.split(" ")[1]);

  await db.collection("users").updateOne(
    { id: userId },
    { $set: { isPaid: true, step: "quiz" } }
  );

  await db.collection("payments").updateMany(
    { userId: userId },
    { $set: { status: "approved" } }
  );

  await bot.telegram.sendMessage(userId, "✅ Payment Approved! 🎉");
  return ctx.reply("✅ Approved");
}
  }

  // NAME
  if (user.step === "name") {
    await db.collection("users").updateOne(
      { id },
      { $set: { name: text, step: "plan" } }
    );

    return ctx.reply(
      `Welcome ${text}`,
      Markup.keyboard([["🆓 Start Quiz"], ["💎 Premium"]]).resize()
    );
  }

  // PLAN
  if (user.step === "plan") {
    if (text.includes("Start")) {
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

      return ctx.reply(`💰 Pay: ${UPI_ID}\nSend screenshot`);
    }
  }

  // PAYMENT TEXT BLOCK
  if (user.step === "payment") {
    return ctx.reply("📸 Send payment screenshot");
  }

  // CONTINUE
  if (text === "▶️ Continue") {
    return sendQuestion(ctx, id);
  }

  // JUMP INPUT
  if (user.waitingJump) {
    const qNo = Number(text);

    if (isNaN(qNo) || qNo < 1 || qNo > QUESTIONS.length) {
      return ctx.reply("❌ Invalid number");
    }

    await db.collection("users").updateOne(
      { id },
      { $set: { current: qNo - 1, waitingJump: false, answered: false } }
    );

    return sendQuestion(ctx, id);
  }

  // DOUBT TEXT
  if (user.waitingDoubt) {
    await db.collection("doubts").insertOne({
      userId: id,
      question: user.doubtQuestion,
      doubt: text
    });

    await db.collection("users").updateOne(
      { id },
      { $set: { waitingDoubt: false } }
    );

    await bot.telegram.sendMessage(
      ADMIN_ID,
      `Doubt from ${user.name}\nQ${user.current + 1}\n${text}`
    );

    return ctx.reply("✅ Sent");
  }
});

// ===== PHOTO (PAYMENT) =====
bot.on("photo", async (ctx) => {
  const id = ctx.from.id;
  let user = await db.collection("users").findOne({ id });

  if (!user || user.step !== "payment") return;

  await db.collection("payments").insertOne({
    userId: id,
    name: user.name,
    status: "pending"
  });

  await bot.telegram.sendMessage(
    ADMIN_ID,
    `💰 Payment from ${user.name}\nUse /approve ${id}`
  );

  ctx.reply("⏳ Waiting approval");
});

// ===== CALLBACK =====
bot.on("callback_query", async (ctx) => {
  try {
    await ctx.answerCbQuery(); // 🔥 VERY IMPORTANT

    const id = ctx.from.id;
    const data = ctx.callbackQuery.data;

    let user = await db.collection("users").findOne({ id });
    if (!user) return;

    const q = QUESTIONS[user.current];
    if (!q) return ctx.reply("No question");

    // ANSWER
    if (["0","1","2","3"].includes(data)) {

      if (user.answered) {
        return ctx.reply("⚠️ Already answered");
      }

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
    if (data === "prev" && user.current > 0) {
      await db.collection("users").updateOne(
        { id },
        { $inc: { current: -1 }, $set: { answered: false } }
      );
      return sendQuestion(ctx, id);
    }

    // JUMP
    if (data === "jump") {
      await db.collection("users").updateOne(
        { id },
        { $set: { waitingJump: true } }
      );
      return ctx.reply("🔢 Enter question number");
    }

    // DOUBT
    if (data === "doubt") {
      await db.collection("users").updateOne(
        { id },
        {
          $set: {
            waitingDoubt: true,
            doubtQuestion: q.q
          }
        }
      );

      return ctx.reply("💬 Type your doubt:");
    }

  } catch (err) {
    console.log("❌ Callback Error:", err);
  }
});

// ===== SEND QUESTION =====
async function sendQuestion(ctx, id) {
  let user = await db.collection("users").findOne({ id });

  if (!user.isPaid && user.current >= 200) {
    return ctx.reply("🔒 Upgrade to continue");
  }

  const q = QUESTIONS[user.current];
  if (!q) return ctx.reply(`Score: ${user.score}`);

  return ctx.reply(
    `Q${user.current + 1}\n${q.q}

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
        Markup.button.callback("⬅️", "prev"),
        Markup.button.callback("➡️", "next")
      ],
      [
        Markup.button.callback("🔢", "jump"),
        Markup.button.callback("💬", "doubt")
      ]
    ])
  );
}

// ===== START =====
bot.launch();
console.log("🤖 Running");

// ===== SERVER =====
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot running");
});

app.listen(process.env.PORT || 3000);