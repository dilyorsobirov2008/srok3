require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const moment = require('moment-timezone');
const { getPosts, savePost, updatePosts } = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN);
const TIMEZONE = 'Asia/Tashkent';

const userStates = new Map();

bot.start((ctx) => {
    ctx.reply(
        "Rasm va sana yuboring\n\nSana formati:\n25.05.2026 yoki 25.05.2026 17:00"
    );
});

bot.on('photo', async (ctx) => {
    const caption = ctx.message.caption || '';
    
    const mainDateMatch = caption.match(/(\d{2}\.\d{2}\.\d{4}(?:\s\d{2}:\d{2})?)/);
    
    if (!mainDateMatch) {
        return ctx.reply("❌ Sana noto‘g‘ri yoki topilmadi\n\nTo‘g‘ri format: 25.05.2026 yoki 25.05.2026 17:00");
    }
    
    const mainDateStr = mainDateMatch[1];
    const format = mainDateStr.length > 10 ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY';
    const mainDatetime = moment.tz(mainDateStr, format, TIMEZONE);
    
    if (!mainDatetime.isValid()) {
        return ctx.reply("❌ Sana noto‘g‘ri\n\nTo‘g‘ri format: 25.05.2026 yoki 25.05.2026 17:00");
    }

    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    
    userStates.set(ctx.from.id, {
        step: 'awaiting_end_date',
        fileId: fileId,
        caption: caption,
        mainDatetime: mainDatetime.toISOString()
    });
    
    ctx.reply("Aksiya qachongacha davom etadi?\n(Masalan: 30.04.2026 yoki 30.04.2026 17:00 deb yozing.\nAgar aksiya bo'lmasa 'yoq' deb yozing)");
});

bot.on('text', (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);

    if (state && state.step === 'awaiting_end_date') {
        const text = ctx.message.text.trim().toLowerCase();
        
        let endDatetime = null;
        let aksiyaVaqti = null;
        let statusSale = 'not_applicable';
        
        if (text !== 'yoq' && text !== "yo'q" && text !== 'yoq.') {
            const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4}(?:\s\d{2}:\d{2})?)/);
            
            if (!dateMatch) {
                return ctx.reply("❌ Sana noto‘g‘ri formatda.\n\nTo‘g‘ri format: 30.04.2026 yoki 30.04.2026 17:00\nIltimos qayta kiriting (yoki 'yoq' deb yozing).");
            }
            
            const dateStr = dateMatch[1];
            const format = dateStr.length > 10 ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY';
            endDatetime = moment.tz(dateStr, format, TIMEZONE);
            
            if (!endDatetime.isValid()) {
                return ctx.reply("❌ Sana noto‘g‘ri.\n\nTo‘g‘ri format: 30.04.2026 yoki 30.04.2026 17:00\nIltimos qayta kiriting.");
            }
            
            aksiyaVaqti = endDatetime.clone().subtract(30, 'days').toISOString();
            statusSale = 'pending';
        }
        
        const newPost = {
            id: Date.now().toString(),
            user_id: userId,
            file_id: state.fileId,
            caption: state.caption,
            main_datetime: state.mainDatetime,
            end_datetime: endDatetime ? endDatetime.toISOString() : null,
            aksiya_vaqti: aksiyaVaqti,
            status_main: 'pending',
            status_sale: statusSale
        };
        
        savePost(newPost);
        userStates.delete(userId);
        
        let replyMsg = "✅ Ma'lumot saqlandi!\n";
        replyMsg += `Asosiy yuborish vaqti: ${moment(state.mainDatetime).tz(TIMEZONE).format('DD.MM.YYYY HH:mm')}\n`;
        if (endDatetime) {
            replyMsg += `Aksiya tugash vaqti: ${endDatetime.format('DD.MM.YYYY HH:mm')}\n`;
            replyMsg += `Aksiya xabari yuboriladigan vaqt: ${moment(aksiyaVaqti).tz(TIMEZONE).format('DD.MM.YYYY HH:mm')}`;
        }
        
        return ctx.reply(replyMsg);
    }
    
    ctx.reply("Iltimos, avval rasm bilan birga matn (caption) va sanani yuboring.");
});

cron.schedule('* * * * *', async () => {
    const posts = getPosts();
    const now = moment().tz(TIMEZONE);
    let isUpdated = false;
    
    for (const post of posts) {
        // Aksiya xabarini yuborish (30 kun oldin)
        if (post.status_sale === 'pending' && post.aksiya_vaqti) {
            const aksiyaTime = moment(post.aksiya_vaqti);
            // agar current time is after aksiyaTime, yuborish
            if (now.isSameOrAfter(aksiyaTime)) {
                try {
                    await bot.telegram.sendPhoto(post.user_id, post.file_id, {
                        caption: post.caption + "\n\n🔥 AKSIYA BOSHLANDI"
                    });
                    post.status_sale = 'sent';
                    isUpdated = true;
                } catch (err) {
                    console.error(`Failed to send sale message to ${post.user_id}:`, err.message);
                }
            }
        }
        
        // Asosiy vaqtda xabar yuborish
        if (post.status_main === 'pending') {
            const mainTime = moment(post.main_datetime);
            if (now.isSameOrAfter(mainTime)) {
                try {
                    await bot.telegram.sendPhoto(post.user_id, post.file_id, {
                        caption: post.caption
                    });
                    post.status_main = 'sent';
                    isUpdated = true;
                } catch (err) {
                    console.error(`Failed to send main message to ${post.user_id}:`, err.message);
                }
            }
        }
    }
    
    if (isUpdated) {
        updatePosts(posts);
    }
});

bot.launch().then(() => {
    console.log("Bot is running!");
});

// Express server port for hosting platforms
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
