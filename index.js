require("dotenv").config();
console.log("VERSION 4 🚀 - ADMIN FEEDBACK & AUTO-LOGIN");
const { MongoClient } = require("mongodb");

const MONGO_URL = process.env.MONGO_URL;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const PORT = process.env.PORT || 3000;

// Environment variable checks
if (!MONGO_URL) {
  console.error("❌ ERROR: MONGO_URL is not defined in .env");
  process.exit(1);
}
if (!BOT_TOKEN) {
  console.error("❌ ERROR: BOT_TOKEN is not defined in .env");
  process.exit(1);
}
if (isNaN(ADMIN_ID)) {
  console.error("❌ ERROR: ADMIN_ID is not defined or invalid in .env");
  process.exit(1);
}

const client = new MongoClient(MONGO_URL);

let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("quizbot");
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Exit if DB connection fails
  }
}

(async () => {
  await connectDB();
})();

const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

const bot = new Telegraf(BOT_TOKEN);

bot.hears(/^\/timer/, (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  const parts = ctx.message.text.split(" ");

  if (parts[1] === "on") {
    ADMIN_TIMER.enabled = true;
    ADMIN_TIMER.seconds = parseInt(parts[2]) || 10;

    return ctx.reply(`✅ Timer ON (${ADMIN_TIMER.seconds}s)`);
  }

  if (parts[1] === "off") {
    ADMIN_TIMER.enabled = false;
    return ctx.reply("⛔ Timer OFF");
  }

});

 bot.command("stats", async (ctx) => {

if (ctx.from.id !== ADMIN_ID) return;

const total = await db.collection("users").countDocuments();

const paid = await db.collection("users").countDocuments({
isPaid: true
});

const free = total - paid;

ctx.reply(
`📊 USERS

👥 Total : ${total}
🆓 Free : ${free}
💰 Paid : ${paid}`
);

}); 

// ADD BELOW THIS
bot.command("free", async (ctx) => {

if (ctx.from.id !== ADMIN_ID) return;

const users = await db.collection("users")
.find({ isPaid: { $ne: true } })
.limit(20)
.toArray();

if (!users.length) return ctx.reply("No free users");

let text = "🆓 FREE USERS\n\n";

users.forEach((u,i)=>{
text += `${i+1}. ${u.name || "No name"} (${u.userId})\n`;
});

ctx.reply(text);

});

bot.command("paid", async (ctx) => {

if (ctx.from.id !== ADMIN_ID) return;

const users = await db.collection("users")
.find({ isPaid: true })
.limit(20)
.toArray();

if (!users.length) return ctx.reply("No paid users");

let text = "💰 PAID USERS\n\n";

users.forEach((u,i)=>{
text += `${i+1}. ${u.name || "No name"} (${u.userId})\n`;
});

ctx.reply(text);

});

bot.command("today", async (ctx) => {

if (ctx.from.id !== ADMIN_ID) return;

const today = new Date();
today.setHours(0,0,0,0);

const users = await db.collection("users").find({
loginTime: { $gte: today }
}).toArray();

if(!users.length) return ctx.reply("No users today");

let text = "📊 TODAY USERS\n\n";

users.forEach((u,i)=>{

const login = new Date(u.loginTime).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata"
});

const plan = u.isPaid ? "💰 PAID" : "🆓 FREE";

text += `${i+1}. ${u.name || "No name"}
🆔 ${u.userId}
👤 ${plan}
📅 ${login}
🎯 Score : ${u.score || 0}

`;
});

ctx.reply(text);

});

// PASTE BELOW THIS
bot.command("broadcast", async (ctx) => {

if (ctx.from.id !== ADMIN_ID) return;

users[ctx.from.id].step = "broadcast";

ctx.reply("📢 Send message to broadcast to all users");

});


// ===== HELPERS =====
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file));
  } catch (error) {
    console.warn(`⚠️ Warning: Could not read ${file}. Error: ${error.message}`);
    return [];
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`❌ Error writing to ${file}:`, error);
  }
}

const DOUBT_FILE = "./doubts.json";

// ===== QUESTIONS =====
function loadQuestions() {
  const fs = require("fs");

  let allQuestions = [];
  try {
    const files = fs.readdirSync("./")
      .filter(f => f.startsWith("questions") && f.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
      console.warn("⚠️ Warning: No 'questions*.json' files found.");
    }

    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(`./${file}`));
      allQuestions.push(...data);
    }
  } catch (error) {
    console.error("❌ Error loading questions:", error);
    return [];
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
const users = {}; 
let ADMIN_TIMER = {
  enabled: false,
  seconds: 10
};

let ACTIVE_TIMER = {};

// ===== START =====
bot.start(async (ctx) => {
  const id = ctx.from.id;
  delete users[id]; // 🔥 ADD THIS

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
    isPaid: isPaid,
    waitingDoubt: false,
    questions: loadQuestions() // Ensure questions are loaded
  };

  if (users[id].questions.length === 0) {
    return ctx.reply("❌ Quiz questions are not loaded. Please contact admin.");
  }

  ctx.reply(
    `🎯 Welcome to GROUP Exam Guider Bot\n\n📌 Rules:\n\n1. START YOUR FREE TRAIL \n \n2. உங்களுக்கு  பயன்படுத்துவதில் ஏதேனும் சிக்கல் ஏற்பட்டால் தொடர்பு கொள்ளவும் .\n \n\n📞 Admin Support:\n👉 https://t.me/Aanamica\n\n👇 Continue அழுத்தி அடுத்த step செல்லவும்`,
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
  await db.collection("users").deleteOne({ userId: id }); 
  ctx.reply("♻️ Reset done. Press /start");
});

bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const input = ctx.message.text.trim();

// 🤖 TEST AI
if (input.toLowerCase() === "test ai") {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Photosynthesis என்ன என்பதை தமிழில் 3 வரிகளில் விளக்கு"
    });

    return ctx.reply("🤖 AI:\n\n" + response.text);

  } catch (e) {
    console.error(e);
    return ctx.reply("❌ AI வேலை செய்யவில்லை\n" + e.message);
  }
}

  // BROADCAST
if (users[id]?.step === "broadcast" && id === ADMIN_ID) {

const message = input;

const allUsers = await db.collection("users").find().toArray();

ctx.reply(`📤 Sending to ${allUsers.length} users...`);

for (const u of allUsers) {
try {
await bot.telegram.sendMessage(u.userId, message);
} catch(e){}
}

users[id].step = "quiz";

return ctx.reply("✅ Broadcast sent");
}


  // 🔥 ADD THIS BLOCK
if (!users[id]) {
  users[id] = {
    step: "rules",
    name: "",
    plan: "",
    current: 0,
    score: 0,
    isPaid: false,
    waitingDoubt: false,
    questions: loadQuestions()
  };
}

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
      isPaid: true, 
      waitingDoubt: false,
      questions: loadQuestions()
    };

    if (users[id].questions.length === 0) {
      return ctx.reply("❌ Quiz questions are not loaded for admin. Please check files.");
    }

    return sendQuestion(ctx, id);
  }

  // ===== USER CHECK =====
  if (!user) return;

  if (user.step === "jump") {
    const num = parseInt(input);

    if (isNaN(num) || num < 1 || num > user.questions.length) {
      return ctx.reply("❌ Invalid question number");
    }

    if (!user.isPaid && num > 200) {
      user.step = "menu";
      return ctx.reply(
        "🚫 Free limit over (1-200 questions only)!\n\n🔑 Please enter code or choose plan to continue.",
        {
          reply_markup: {
            keyboard: [["🆕 New User"], ["🔑 Enter Code"]],
            resize_keyboard: true
          }
        }
      );
    }

    user.current = num - 1;
    user.step = "quiz";
    return sendQuestion(ctx, id);
  }

  // ===== NAME =====
  if (user.step === "name") {
    user.name = input;
    user.step = "quiz"; 

    await db.collection("users").updateOne(
  { userId: id },
  { 
    $set: { 
      current: user.current,
      score: user.score,
      name: user.name,
      userId: id,
      loginTime: new Date()   // ⭐ ADD THIS
    } 
  }, 
  { upsert: true }
);

    ctx.reply(`✅ Welcome ${user.name}! Let\'s start the free questions.`);
    return sendQuestion(ctx, id);
  }
  
  // ===== MENU =====
if (input.includes("New User")) {
  user.step = "plan";
  return ctx.reply("📅 Select Plan:", {
    reply_markup: {
      keyboard: [
        ["7 Days - ₹20"],
        ["15 Days - ₹30"],
        ["30 Days - ₹50"]
      ],
      resize_keyboard: true
    }
  });
}

if (
  user.step === "plan" &&
  ["7 Days - ₹20", "15 Days - ₹30", "30 Days - ₹50"].includes(input)
) {
  user.plan = input;

 const plans = {
  "7 Days - ₹20": 20,
  "15 Days - ₹30": 30,
  "30 Days - ₹50": 50
};

let amount = plans[input];
  user.step = "payment";

  return ctx.reply(
    `💳 Payment Details\n\n💰 Amount: ₹${amount}\n🏦 UPI: 9500612854@ptsbi\n\n👉 After payment click "✅ I Paid"`,
    {
      reply_markup: {
        keyboard: [["✅ I Paid"]],
        resize_keyboard: true
      }
    }
  );
}

if (input === "✅ I Paid") {
  user.step = "screenshot";
  return ctx.reply("📸 Please send your payment screenshot");
}

if (input.includes("Enter Code")) {
  user.step = "login";
  return ctx.reply("🔐 Enter your access code:");
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
          isPaid: true 
        }
      },
      { upsert: true }
    );

    user.step = "quiz";
    user.isPaid = true; 
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
  `📩 Doubt ID: ${newDoubt.id}\n\n👤 User: ${user.name} (${id})\n\n📍 Question No: ${newDoubt.questionNo}\n\n❓ Question:\n${newDoubt.question}\n\n💬 Doubt:\n${newDoubt.text}`
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

    user.step = "name";
    return ctx.reply("👤 Enter your name:");
  }

if (data === "timer_on") {
  ADMIN_TIMER.enabled = true;
  startTimer(ctx, ctx.from.id);
  return ctx.reply("🟢 Timer ON");
}

if (data === "timer_off") {
  ADMIN_TIMER.enabled = false;

  if (ACTIVE_TIMER[ctx.from.id]) {
    clearInterval(ACTIVE_TIMER[ctx.from.id]);
  }

  return ctx.reply("🔴 Timer OFF");
}

  // AUTO-LOGIN AFTER APPROVAL
  if (data === "start_q201") {
    const id = ctx.from.id;
    const user = users[id];
    if (!user) return;
    
    user.current = 200; // Go to 201st question
    user.step = "quiz";
    return sendQuestion(ctx, id);
  }

  if (data.startsWith("approve_")) {
    const userId = Number(data.split("_")[1]);

    // Check if already approved to prevent multiple codes
    let userInDb = await db.collection("users").findOne({ userId: userId });
    if (userInDb && userInDb.isPaid) {
      return ctx.editMessageCaption(`✅ Already Approved\n👤 User: ${userId}`);
    }

    const code = "QUIZ-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const date = new Date();
    const userData = users[userId] || userInDb;

    let days = 7;
    if (userData.plan === "15 Days - ₹30") days = 15; // Corrected plan string
    if (userData.plan === "30 Days - ₹50") days = 30; // Corrected plan string

    date.setDate(date.getDate() + days);
    const expiry = date.toISOString().split("T")[0];

    await db.collection("codes").insertOne({
      code,
      expiry
    }); 

    await db.collection("users").updateOne(
      { userId: userId },
      { $set: { code: code, loginTime: new Date(), isPaid: true, plan: userData.plan } },
      { upsert: true }
    );

    if (users[userId]) {
      users[userId].isPaid = true;
      users[userId].plan = userData.plan;
    }

    // Update Admin Message to show "Approved"
    ctx.editMessageCaption(`✅ Approved\n👤 ${userData.name} (${userId})\n🎟 Code: ${code}\n📅 Valid: ${expiry}`);

    // Send code to User with a Continue button
    bot.telegram.sendMessage(userId, 
      `✅ Approved\n🎟 Code: ${code}\n📅 Valid: ${expiry}\n\n👇 201-வது கேள்வியிலிருந்து தொடர கீழே உள்ள பட்டனை அழுத்தவும்.`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Continue to Q201 ➡️", "start_q201")]
      ])
    );
    return;
  }

  if (data.startsWith("reject_")) {
    const userId = Number(data.split("_")[1]);
    ctx.editMessageCaption(`❌ Payment Rejected\n👤 User: ${userId}`);
    bot.telegram.sendMessage(userId, "❌ Payment rejected. Please contact admin.");
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
    if (!user.isPaid && user.current + 1 >= 200) {
      user.step = "menu";
      return ctx.reply(
        "🚫 Free limit over (1-200 questions only)!\n\n🔑 Please enter code or choose plan to continue.",
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
    user.step = "jump";
    return ctx.reply("🔢 Enter question number:");
  }

  if (data === "doubt") {
    user.waitingDoubt = true;
    return ctx.reply("✍️ Type your doubt:");
  }
});

async function startTimer(ctx, id) {

  if (!ADMIN_TIMER.enabled) return;

  // stop old timer
  if (ACTIVE_TIMER[id]) {
    clearInterval(ACTIVE_TIMER[id]);
  }

  let time = ADMIN_TIMER.seconds;

  const msg = await ctx.reply(`⏱ ${time}`);

  ACTIVE_TIMER[id] = setInterval(async () => {

    time--;

    try {
      await ctx.telegram.editMessageText(
        msg.chat.id,
        msg.message_id,
        null,
        `⏱ ${time}`
      );
    } catch {}

    if (time <= 0) {
      clearInterval(ACTIVE_TIMER[id]);

      try {
        await ctx.telegram.editMessageText(
          msg.chat.id,
          msg.message_id,
          null,
          `⏱ 0`
        );
      } catch {}
    }

  }, 1000);

}

// ===== QUESTION =====
async function sendQuestion(ctx, id) {
  const user = users[id];

   // 🔥 AUTO EXPIRY CHECK (PASTE HERE)
  if (user && user.isPaid) {
    const userDb = await db.collection("users").findOne({ userId: id });

    if (userDb && userDb.code) {
      const status = await checkCode(userDb.code);

      if (status !== "valid") {
        user.isPaid = false;
        user.step = "menu";

        await db.collection("users").updateOne(
          { userId: id },
          { $set: { isPaid: false } }
        );

        return ctx.reply(
          "⛔ உங்கள் paid access முடிந்துவிட்டது.\n\n🔑 புதிய code வாங்கவும்.",
          {
            reply_markup: {
              keyboard: [["🆕 New User"], ["🔑 Enter Code"]],
              resize_keyboard: true
            }
          }
        );
      }
    }
  }

  if (!user || !user.questions || user.questions.length === 0) {
    return ctx.reply("❌ No questions available. Please contact admin.");
  }

  await db.collection("users").updateOne(
    { userId: id },
    { $set: { current: user.current, score: user.score, name: user.name, userId: id } }, 
    { upsert: true }
  );

  const q = user.questions[user.current];

  if (!q) {
    const finalMessage = `🎯 Completed!\n👤 ${user.name}\nScore: ${user.score}/${user.questions.length}`;
    users[id].current = 0;
    users[id].score = 0;
    users[id].step = "rules"; 

    await db.collection("users").updateOne(
      { userId: id },
      { $set: { current: 0, score: 0, step: "rules" } },
      { upsert: true }
    );

    return ctx.reply(finalMessage);
  }

 const isAdmin = id === ADMIN_ID;

let buttons = [
[
Markup.button.callback("A","0"),
Markup.button.callback("B","1")
],
[
Markup.button.callback("C","2"),
Markup.button.callback("D","3")
],
[
Markup.button.callback("⬅️ Prev","prev"),
Markup.button.callback("➡️ Next","next")
],
[
Markup.button.callback("🔢 Jump","jump"),
Markup.button.callback("💬 Doubt","doubt")
]
];

if(isAdmin){
buttons.push([
Markup.button.callback("🟢 Timer ON","timer_on"),
Markup.button.callback("🔴 Timer OFF","timer_off")
]);
}

const sent = await ctx.reply(
`👤 ${user.name}
Q${user.current + 1}/${user.questions.length}: ${q.q}

A) ${q.options[0]}
B) ${q.options[1]}
C) ${q.options[2]}
D) ${q.options[3]}`,
Markup.inlineKeyboard(buttons)
);

}

// ===== START EXPRESS SERVER =====
const express = require("express");
const app = express();

app.use(express.json());

// ✅ VERY IMPORTANT - Telegram updates handle ஆகும்


// optional check
app.get("/", (req, res) => {
  res.send("Bot running ✅");
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}...`);
}).on('error', (err) => {
  console.error("❌ Express server error:", err);
  process.exit(1);
});
console.log("🔥 BOT FULLY STARTED");
bot.launch();
bot.catch(err => console.error("BOT ERROR:", err));