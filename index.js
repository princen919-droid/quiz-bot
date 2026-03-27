const { MongoClient } = require("mongodb");

const MONGO_URL = "mongodb://princen919_db_user:password@cluster0-shard-00-00.ftnjcsf.mongodb.net:27017,cluster0-shard-00-01.ftnjcsf.mongodb.net:27017,cluster0-shard-00-02.ftnjcsf.mongodb.net:27017/?ssl=true&replicaSet=atlas-xxxxx-shard-0&authSource=admin&retryWrites=true&w=majority";

const client = new MongoClient(MONGO_URL);

let db;

async function connectDB() {
  await client.connect();
  db = client.db("quizbot");
  console.log("✅ MongoDB Connected");
}

(async () => {
  await connectDB();
})();



require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const express = require("express");

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const ADMIN_ID = 1251521284;

// ===== FILES =====
const CODE_FILE = "./codes.json";
const DOUBT_FILE = "./doubts.json";

// ===== HELPERS =====
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ===== QUESTIONS =====
function loadQuestions() {
  const q1 = JSON.parse(fs.readFileSync("./questions.json"));
  const q2 = JSON.parse(fs.readFileSync("./questions1.json"));
  const q3 = JSON.parse(fs.readFileSync("./questions2.json"));
  const q4 = JSON.parse(fs.readFileSync("./questions3.json"));
  
  return [...q1, ...q2, ...q3, ...q4];
}

// ===== CODE CHECK =====
async function checkCode(userCode) {
  const code = await db.collection("codes").findOne({ code: userCode });

  if (!code) return "invalid";

  const today = new Date();
  const expiry = new Date(code.expiry);

  if (today > expiry) return "expired";

  return "valid";
}

// ===== USERS =====
const users = {};

// ===== START =====
bot.start((ctx) => {
  const id = ctx.from.id;

  // 🔥 ADMIN MODE
  if (id === ADMIN_ID) {
    return ctx.reply("👑 Admin Mode Active\nCommands:\n/quiz - Start Quiz\nreply ID message");
  }

  // 👤 USER
  users[id] = {
    step: "name",
    name: "",
    plan: "",
    current: 0,
    score: 0,
    waitingDoubt: false,
    questions: loadQuestions()
  };

  ctx.reply("👤 Enter your name:");
});

// ===== TEXT =====
bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const input = ctx.message.text.trim();

  const user = users[id];

  // ===== ADMIN REPLY =====
  if (input.startsWith("reply")) {
    if (id !== ADMIN_ID) return;

    const parts = input.split(" ");
    const doubtId = parts[1];
    const msg = parts.slice(2).join(" ");

    const doubts = readJSON(DOUBT_FILE);
    const doubt = doubts.find(d => String(d.id) === String(doubtId));

    if (!doubt) return ctx.reply("❌ Invalid ID");

    bot.telegram.sendMessage(doubt.userId, `📢 Admin Reply:\n${msg}`);
    return ctx.reply("✅ Reply sent");
  }

  // ===== ADMIN QUIZ COMMAND =====
  if (id === ADMIN_ID && input === "/quiz") {
    users[id] = {
      step: "quiz",
      name: "ADMIN",
      plan: "ADMIN",
      current: 0,
      score: 0,
      waitingDoubt: false,
      questions: loadQuestions()
    };

    return sendQuestion(ctx, id);
  }

  // ===== USER CHECK =====
  if (!user) return;
  if (user.step === "jump") {
  const num = parseInt(input);

  if (isNaN(num) || num < 1 || num > user.questions.length) {
    return ctx.reply("❌ Invalid question number");
  }

  user.current = num - 1;
  user.step = "quiz";
  return sendQuestion(ctx, id);
}

  // ===== NAME =====
  if (user.step === "name") {
    user.name = input;
    user.step = "menu";

    return ctx.reply(`✅ Welcome ${user.name}`, {
      reply_markup: {
        keyboard: [["🆕 New User"], ["🔑 Enter Code"]],
        resize_keyboard: true
      }
    });
  }

  // ===== MENU =====
  if (input === "🆕 New User") {
    user.step = "plan";
    return ctx.reply("📅 Select Plan:", {
      reply_markup: {
        keyboard: [["7 Days"], ["15 Days"], ["30 Days"]],
        resize_keyboard: true
      }
    });
  }

  if (user.step === "plan" && ["7 Days", "15 Days", "30 Days"].includes(input)) {
    user.plan = input;

    let amount = input === "7 Days" ? 20 : input === "15 Days" ? 30 : 50;

    user.step = "payment";

    return ctx.reply(`💳 Payment:

UPI: 9500612854@ptsbi
Amount: ₹${amount}

Click "✅ I Paid"`, {
      reply_markup: {
        keyboard: [["✅ I Paid"]],
        resize_keyboard: true
      }
    });
  }

  if (input === "✅ I Paid") {
    user.step = "screenshot";
    return ctx.reply("📸 Send screenshot");
  }

  if (input === "🔑 Enter Code") {
    user.step = "login";
    return ctx.reply("🔐 Enter code:");
  }

  // ===== LOGIN =====
  if (user.step === "login") {
    const result = await checkCode(input);

    if (result === "invalid") return ctx.reply("❌ Invalid Code");
    if (result === "expired") return ctx.reply("⛔ Expired Code");

await db.collection("users").updateOne(
  { userId: id },
  {
    $set: {
      userId: id,
      name: user.name,
      code: input,
      loginTime: new Date()
    }
  },
  { upsert: true }
);

    user.step = "quiz";
    ctx.reply("✅ Access Granted!");
    return sendQuestion(ctx, id);
  }

  // ===== DOUBT =====
  if (user.waitingDoubt) {
    user.waitingDoubt = false;

    const doubts = readJSON(DOUBT_FILE);

    const newDoubt = {
  id: Date.now(),
  userId: id,
  name: user.name,
  questionNo: user.current + 1,
  question: user.questions[user.current]?.q,
  text: input
};

    doubts.push(newDoubt);
    writeJSON(DOUBT_FILE, doubts);

    bot.telegram.sendMessage(
      ADMIN_ID,
      `📩 Doubt ID: ${newDoubt.id}
👤 ${user.name} (${id})

${input}`
    );

    return ctx.reply("✅ Doubt sent");
  }
});

// ===== PHOTO =====
bot.on("photo", (ctx) => {
  const id = ctx.from.id;
  const user = users[id];

  if (!user || user.step !== "screenshot") return;

  const fileId = ctx.message.photo.slice(-1)[0].file_id;

  bot.telegram.sendPhoto(ADMIN_ID, fileId, {
    caption: `📥 Payment\n👤 ${user.name} (${id})\n📅 ${user.plan}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `approve_${id}` },
          { text: "❌ Reject", callback_data: `reject_${id}` }
        ]
      ]
    }
  });

  user.step = "waiting";
  ctx.reply("⏳ Waiting for approval...");
});

// ===== BUTTON =====
bot.on("callback_query", async (ctx) => {
  await ctx.answerCbQuery();

  const data = ctx.callbackQuery.data;

  if (data.startsWith("approve_")) {
    const userId = data.split("_")[1];

    const code = "QUIZ-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const date = new Date();

const userData = users[userId];

let days = 7;
if (userData.plan === "15 Days") days = 15;
if (userData.plan === "30 Days") days = 30;

date.setDate(date.getDate() + days);

const expiry = date.toISOString().split("T")[0];

   await db.collection("codes").insertOne({
  code,
  expiry
}); 

    bot.telegram.sendMessage(userId, `✅ Approved\n🎟 Code: ${code}\n📅 Valid: ${expiry}`);
    return;
  }

  if (data.startsWith("reject_")) {
    const userId = data.split("_")[1];
    bot.telegram.sendMessage(userId, "❌ Payment rejected");
    return;
  }

  const id = ctx.from.id;
  const user = users[id];
  if (!user) return;

  const q = user.questions[user.current];

  if (["0", "1", "2", "3"].includes(data)) {
    const selected = q.options[data];

    if (selected === q.answer) user.score++;

    return ctx.reply(
      `${selected === q.answer ? "✅ Correct" : "❌ Wrong"}\n👉 ${q.answer}`,
      Markup.inlineKeyboard([[Markup.button.callback("➡️ Next", "next")]])
    );
  }

  if (data === "next") {
    user.current++;
    return sendQuestion(ctx, id);
  }
  if (data === "jump") {
  user.step = "jump";
  return ctx.reply("🔢 Enter question number:");
}

  if (data === "doubt") {
    user.waitingDoubt = true;
    return ctx.reply("✍️ Type your doubt:");
  }
});

// ===== QUESTION =====
function sendQuestion(ctx, id) {
  const user = users[id];
  const q = user.questions[user.current];

  if (!q) {
    return ctx.reply(
      `🎯 Completed!\n👤 ${user.name}\nScore: ${user.score}/${user.questions.length}`
    );
  }

  ctx.reply(
    `👤 ${user.name}
Q${user.current + 1}/${user.questions.length}: ${q.q}

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
    Markup.button.callback("➡️ Next", "next"),
    Markup.button.callback("🔢 Jump", "jump")
  ],
  [
    Markup.button.callback("💬 Doubt", "doubt")
  ]
])
  );
}

// ===== START =====
bot.launch();
console.log("🤖 Running");

// ===== SERVER =====
app.get("/", (req, res) => res.send("Bot running"));

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Server running...");
});