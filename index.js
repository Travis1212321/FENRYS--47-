import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";

import { TelegramClient } from "telegram";

import { StringSession } from "telegram/sessions/index.js";

import { Api } from "telegram/tl/index.js"; // صححنا الاستيراد هنا

import input from "input";

import fs from "fs";

// ================== إعداد تليجرام ==================

const apiId = 22775288;

const apiHash = "420a5572f0cf94a4ea38f613e042aa54";

const sessionFile = "./string.session";

// اقرأ الجلسة لو موجودة

let savedSession = "";

if (fs.existsSync(sessionFile)) {

    savedSession = fs.readFileSync(sessionFile, "utf8");

}

const stringSession = new StringSession(savedSession);

const targetChat = "ebtihvltarq_bot"; // غيره لو عندك بوت/شخص تاني

let lastButtons = [];

const tgClient = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

async function startTelegram() {

    await tgClient.start({

        phoneNumber: async () => await input.text("📱 دخل رقم تلفونك بتاع التليجرام: "),

        password: async () => await input.text("🔑 دخل الباسورد (لو عندك 2FA): "),

        phoneCode: async () => await input.text("📩 دخل الكود الواصل في التليجرام: "),

        onError: (err) => console.log(err),

    });

    console.log("✅ اتصلنا بتليجرام");

    // خزّن الجلسة في ملف

    fs.writeFileSync(sessionFile, tgClient.session.save());

    console.log("✅ تم حفظ الجلسة في string.session");

}

// ================== واتساب ==================

async function startWhatsApp() {

    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    const sock = makeWASocket({ auth: state });

    sock.ev.on("creds.update", saveCreds);

    console.log("✅ اتصلنا بواتساب");

    sock.ev.on("messages.upsert", async ({ messages }) => {

        let msg = messages[0];

        if (!msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;

        const content = msg.message.conversation || msg.message.extendedTextMessage?.text;

        // لو كتب .menu

        if (content?.toLowerCase() === ".menu") {

            const history = await tgClient.getMessages(targetChat, { limit: 1 });

            if (history.length === 0) {

                await sock.sendMessage(jid, { text: "❌ ما في رسالة حديثة من البوت." });

                return;

            }

            const lastMsg = history[0];

            if (!lastMsg.replyMarkup || !lastMsg.replyMarkup.rows) {

                await sock.sendMessage(jid, { text: "❌ ما في أزرار في آخر رسالة." });

                return;

            }

            lastButtons = [];

            let menuText = "📋 الأوامر المتاحة:\n\n";

            lastMsg.replyMarkup.rows.forEach((row) => {

                row.buttons.forEach((btn) => {

                    lastButtons.push(btn);

                    menuText += `${lastButtons.length}. ${btn.text}\n`;

                });

            });

            await sock.sendMessage(jid, { text: menuText });

            return;

        }

        // لو كتب رقم

        if (content?.startsWith(".")) {

            let num = parseInt(content.slice(1));

            if (!isNaN(num) && num > 0 && num <= lastButtons.length) {

                const btn = lastButtons[num - 1];

                await tgClient.invoke(

                    new Api.messages.GetBotCallbackAnswer({

                        peer: targetChat,

                        msgId: (await tgClient.getMessages(targetChat, { limit: 1 }))[0].id,

                        data: btn.data,

                    })

                );

                await sock.sendMessage(jid, { text: `✅ ضغطت الزر: ${btn.text}` });

            }

        }

    });

    // التليجرام → الواتساب

    tgClient.addEventHandler(async (update) => {

        try {

            const msg = update.message;

            if (!msg || msg.out) return;

            const jid = Object.keys(sock.chats)[0]; // ممكن تحددي jid مضبوط بدل الاعتماد على الأول

            if (!jid) return;

            if (msg.message) {

                await sock.sendMessage(jid, { text: msg.message });

            }

            if (msg.media) {

                const buffer = await tgClient.downloadMedia(msg.media);

                let fileName = "file";

                if (msg.document?.attributes) {

                    const attr = msg.document.attributes.find(a => a.fileName);

                    if (attr) fileName = attr.fileName;

                }

                await sock.sendMessage(jid, {

                    document: buffer,

                    mimetype: "application/octet-stream",

                    fileName,

                });

            }

        } catch (e) {

            console.log("❌ خطأ في استلام رسالة من تليجرام:", e);

        }

    });

}

// ================== تشغيل الكل ==================

async function startAll() {

    await startTelegram();

    await startWhatsApp();

}

startAll();
