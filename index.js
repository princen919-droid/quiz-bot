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

  // 👑 ADMIN PANEL
  if (id === ADMIN_ID) {
    await ctx.reply("♻️ Loading Admin Panel...");

    return ctx.reply(
      "👑 Admin Panel",
      Markup.keyboard([
        ["📊 Users", "💰 Payments"],
        ["📝 Questions"]
      ]).resize()
    );
  }

  let user = await db.collection("users").findOne({ id });

  if (user) {

    // 🔥 FREE LIMIT FIX
    if (!user.isPaid && user.current >= 200) {
      return ctx.reply(
        `🔒 Free limit over\nChoose your plan`,
        Markup.keyboard([
          ["🆓 Free (200 Questions)"],
          ["💎 Premium"]
        ]).resize()
      );
    }

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

  // 👑 ADMIN ACTIONS
  if (id === ADMIN_ID) {

    if (text === "📊 Users") {
      const total = await db.collection("users").countDocuments();

      const last = await db.collection("users")
        .find()
        .sort({ _id: -1 })
        .limit(5)
        .toArray();

      let msg = `👥 Total Users: ${total}\n\n🆕 Last 5 Users:\n`;

      last.forEach((u, i) => {
        msg += `${i + 1}. ${u.name || "No Name"} (${u.id})\n`;
      });

      return ctx.reply(msg);
    }

    if (text === "💰 Payments") {
      const pending = await db.collection("payments")
        .find({ status: "pending" })
        .toArray();

      if (!pending.length) {
        return ctx.reply("✅ No pending payments");
      }

      let msg = "💰 Pending Payments:\n\n";

      pending.forEach(p => {
        msg += `👤 ${p.name}\nID: ${p.userId}\n\n`;
      });

      return ctx.reply(msg);
    }

    if (text === "📝 Questions") {
      return ctx.reply(`📚 Total Questions: ${QUESTIONS.length}`);
    }
  }

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

  // PAYMENT
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

  // APPROVE
  if (text.startsWith("/approve")) {
    const userId = Number(text.split(" ")[1]);

    await db.collection("users").updateOne(
      { id: userId },
      { $set: { isPaid: true } }
    );

    await bot.telegram.sendMessage(userId, "✅ Payment Approved! 🎉");
    return ctx.reply("✅ Approved");
  }

  // DOUBT TEXT (FIXED)
  if (user.waitingDoubt) {
    await db.collection("doubts").insertOne({
      userId: id,
      name: user.name,
      qNo: user.current + 1,
      question: user.doubtQuestion,
      doubt: text
    });

    await db.collection("users").updateOne(
      { id },
      { $set: { waitingDoubt: false } }
    );

    await ctx.reply("✅ Doubt sent");

    await bot.telegram.sendMessage(
      ADMIN_ID,
      `💬 Doubt from ${user.name}
Q${user.current + 1}

📘 ${user.doubtQuestion}

❓ ${text}

👉 /reply ${id} your_answer`
    );
  }

  // JUMP
  if (user.waitingJump) {
    const qNo = Number(text);

    if (isNaN(qNo) || qNo < 1 || qNo > QUESTIONS.length) {
      return ctx.reply("❌ Invalid number");
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

    await bot.telegram.sendMessage(userId, `📢 ${msg}`);
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

  if (user.answered && ["0","1","2","3"].includes(data)) {
    return ctx.reply("⚠️ Already answered");
  }

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

  if (data === "next") {
    await db.collection("users").updateOne(
      { id },
      { $inc: { current: 1 }, $set: { answered: false } }
    );
    return sendQuestion(ctx, id);
  }

  if (data === "prev") {
    await db.collection("users").updateOne(
      { id },
      { $inc: { current: -1 }, $set: { answered: false } }
    );
    return sendQuestion(ctx, id);
  }

  if (data === "jump") {
    await db.collection("users").updateOne(
      { id },
      { $set: { waitingJump: true } }
    );
    return ctx.reply("🔢 Enter question number");
  }

  // 🔥 DOUBT FIX
  if (data === "doubt") {
    await db.collection("users").updateOne(
      { id },
      {
        $set: {
          waitingDoubt: true,
          doubtQuestion: QUESTIONS[user.current].q
        }
      }
    );

    return ctx.reply("💬 Type your doubt:");
  }
});

// ===== SEND QUESTION =====
async function sendQuestion(ctx, id) {
  let user = await db.collection("users").findOne({ id });

  if (!user.isPaid && user.current >= 200) {
    return ctx.reply(
      "🔒 Free limit over\nChoose your plan",
      Markup.keyboard([
        ["🆓 Free (200 Questions)"],
        ["💎 Premium"]
      ]).resize()
    );
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

// ===== EXPRESS =====
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});