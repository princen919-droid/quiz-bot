quiz_bot_complete.js
require("dotenv").config();
console.log("VERSION 3 🚀");
const { MongoClient } = require("mongodb");

const MONGO_URL = process.env.MONGO_URL;
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

const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN_ID = Number(process.env.ADMIN_ID);

// ===== FILES =====
const CODE_FILE = "./codes.json"; // This is not used anymore as codes are in MongoDB
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
  const fs = require("fs");

  const files = fs.readdirSync("./")
    .filter(f => f.startsWith("questions") && f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let allQuestions = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(`./${file}`));
    allQuestions.push(...data);
  }

  return allQuestions;
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
const users = {}; // In-memory user state, should be persisted for full functionality

// ===== START =====
bot.start(async (ctx) => {
  const id = ctx.from.id;

  // ADMIN
  if (id === ADMIN_ID) {
    return ctx.reply("👑 Admin Mode Active\nCommands:\n/quiz - Start Quiz\nreply ID message");
  }

  // Check if user exists in DB and has an active plan
  let userFromDb = await db.collection("users").findOne({ userId: id });
  let isPaid = false;
  if (userFromDb && userFromDb.code) {
    const codeStatus = await checkCode(userFromDb.code);
    if (codeStatus === "valid") {
      isPaid = true;
    }
  }

  // USER INIT
  users[id] = {
    step: "rules",
    name: userFromDb?.name || "",
    plan: userFromDb?.plan || "",
    current: userFromDb?.current || 0,
    score: userFromDb?.score || 0,
    freeCount: userFromDb?.freeCount || 0,
    isPaid: isPaid,
    waitingDoubt: false,
    questions: loadQuestions()
  };

  ctx.reply(
    `🎯 Welcome to Exam Guider Bot\n\n📌 Rules:\n\n1. Login process follow செய்ய வேண்டும்  
2. Payment செய்த பிறகு மட்டும் access கிடைக்கும்  
3. Daily /start use பண்ணினால் new questions வரும்  
4. Login code save பண்ணிக்கொள்ளவும்  

📞 Admin Support:\n👉 https://t.me/Aanamica\n
👇 Continue அழுத்தி அடுத்த step செல்லவும்`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Continue ➡️", callback_data: "continue" }]
        ]
      }
    }
  );
});


// ===== TEXT =====
bot.command("reset", async (ctx) => {
  const id = ctx.from.id;
  delete users[id];
  await db.collection("users").deleteOne({ userId: id }); // Clear user data from DB as well
  ctx.reply("♻️ Reset done. Press /start");
});

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
      freeCount: 0,
      isPaid: true, // Admin is always paid
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
    user.step = "menu"; // Change to menu to allow plan selection or code entry

    await db.collection("users").updateOne(
      { userId: id },
      { $set: { name: user.name } },
      { upsert: true }
    );

    return ctx.reply(`✅ Welcome ${user.name}! Please choose an option:`, {
      reply_markup: {
        keyboard: [["🆕 New User"], ["🔑 Enter Code"]],
        resize_keyboard: true
      }
    });
  }
  
  // ===== MENU =====
  if (input.includes("New User")) {
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

    return ctx.reply(`💳 Payment:\n\nUPI: 9500612854@ptsbi\nAmount: ₹${amount}\n\nClick "✅ I Paid"`, {
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

  if (input.includes("Enter Code")) {
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
          loginTime: new Date(),
          isPaid: true // Set isPaid to true on successful login
        }
      },
      { upsert: true }
    );

    user.step = "quiz";
    user.isPaid = true; // Update in-memory state
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
      `📩 Doubt ID: ${newDoubt.id}\n👤 ${user.name} (${id})\n\n${input}`
    );

    return ctx.reply("✅ Doubt sent");
  }
});

// ===== PHOTO =====
bot.on("photo", async (ctx) => {
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

  if (data === "continue") {
    const id = ctx.from.id;
    const user = users[id];

    if (!user) return;

    // If user is already paid, directly go to quiz
    if (user.isPaid) {
      user.step = "quiz";
      return sendQuestion(ctx, id);
    }

    user.step = "name";
    return ctx.reply("👤 Enter your name:");
  }

  if (data.startsWith("approve_")) {
    const userId = Number(data.split("_")[1]);

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

    // Update user's DB entry with the generated code and set as paid
    await db.collection("users").updateOne(
      { userId: userId },
      { $set: { code: code, loginTime: new Date(), isPaid: true, plan: userData.plan } },
      { upsert: true }
    );

    // Update in-memory user state
    if (users[userId]) {
      users[userId].isPaid = true;
      users[userId].plan = userData.plan;
    }

    bot.telegram.sendMessage(userId, `✅ Approved\n🎟 Code: ${code}\n📅 Valid: ${expiry}`);
    return;
  }

  if (data.startsWith("reject_")) {
    const userId = Number(data.split("_")[1]);
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
      Markup.inlineKeyboard([
        [Markup.button.callback("➡️ Next", "next")]
      ])
    );
  }

  if (data === "next") {
    if (!user.isPaid && user.freeCount >= 200) {
      user.step = "menu";
      return ctx.reply(
        "🚫 Free limit over!\n\n🔑 Please enter code or choose plan to continue.",
        {
          reply_markup: {
            keyboard: [["🆕 New User"], ["🔑 Enter Code"]],
            resize_keyboard: true
          }
        }
      );
    }
    user.current++;
    return sendQuestion(ctx, id);
  }
  
  if (data === "prev") {
    if (user.current > 0) {
      user.current--;
    }
    return sendQuestion(ctx, id);
  }

  if (data === "jump") {
    if (!user.isPaid && user.freeCount >= 200) {
      user.step = "menu";
      return ctx.reply(
        "🚫 Free limit over!\n\n🔑 Please enter code or choose plan to continue.",
        {
          reply_markup: {
            keyboard: [["🆕 New User"], ["🔑 Enter Code"]],
            resize_keyboard: true
          }
        }
      );
    }
    user.step = "jump";
    return ctx.reply("🔢 Enter question number:");
  }

  if (data === "doubt") {
    user.waitingDoubt = true;
    return ctx.reply("✍️ Type your doubt:");
  }
});

// ===== QUESTION =====
async function sendQuestion(ctx, id) {
  const user = users[id];

  // Persist user state before sending question
  await db.collection("users").updateOne(
    { userId: id },
    { $set: { ...user, userId: id } }, // Ensure userId is set for upsert
    { upsert: true }
  );

  // Increment freeCount only if not paid and not admin
  if (!user.isPaid && id !== ADMIN_ID) {
    user.freeCount++;
  }

  // Check limit after incrementing for the current question
  if (!user.isPaid && user.freeCount > 200) {
    user.step = "menu";
    return ctx.reply(
      "🚫 Free limit over!\n\n🔑 Please enter code or choose plan to continue.",
      {
        reply_markup: {
          keyboard: [["🆕 New User"], ["🔑 Enter Code"]],
          resize_keyboard: true
        }
      }
    );
  }

  const q = user.questions[user.current];

  if (!q) {
    // Quiz completed, show final score and reset for next quiz
    const finalMessage = `🎯 Completed!\n👤 ${user.name}\nScore: ${user.score}/${user.questions.length}`;
    
    // Reset user state for next quiz, but keep paid status and name
    users[id].current = 0;
    users[id].score = 0;
    users[id].step = "rules"; // Go back to rules or menu after completion

    await db.collection("users").updateOne(
      { userId: id },
      { $set: { current: 0, score: 0, step: "rules" } },
      { upsert: true }
    );

    return ctx.reply(finalMessage);
  }

  ctx.reply(
    `👤 ${user.name}\nQ${user.current + 1}/${user.questions.length}: ${q.q}\n\nA) ${q.options[0]}\nB) ${q.options[1]}\nC) ${q.options[2]}\nD) ${q.options[3]}`,
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
console.log("🤖 Running");

// ===== SERVER =====
const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Bot running"));

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Server running...");
});
