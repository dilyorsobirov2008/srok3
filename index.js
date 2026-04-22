require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const moment = require('moment-timezone');
const { getPosts, savePost, updatePosts } = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN);
const TIMEZONE = 'Asia/Tashkent';

bot.start((ctx) => {
    ctx.reply(
        "Rasm va sana yuboring\n\nFormat:\n25.05.2026 17:00\naksiya_tugash: 25.06.2026 17:00"
    );
});

bot.on('photo', async (ctx) => {
    const caption = ctx.message.caption || '';
    
    let endDateStr = null;
    let endDatetime = null;
    let aksiyaVaqti = null;
    
    const endDateMatch = caption.match(/aksiya_tugash:\s*(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})/i);
    
    if (endDateMatch) {
        endDateStr = endDateMatch[1];
        endDatetime = moment.tz(endDateStr, 'DD.MM.YYYY HH:mm', TIMEZONE);
        if(!endDatetime.isValid()) {
            return ctx.reply("❌ Aksiya tugash sanasi noto‘g‘ri\n\nTo‘g‘ri format: 25.05.2026 17:00");
        }
        aksiyaVaqti = endDatetime.clone().subtract(30, 'days').toISOString();
    }
    
    const textWithoutEnd = caption.replace(/aksiya_tugash:\s*\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}/i, '');
    const mainDateMatch = textWithoutEnd.match(/(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})/);
    
    if (!mainDateMatch) {
        return ctx.reply("❌ Sana noto‘g‘ri\n\nTo‘g‘ri format: 25.05.2026 17:00");
    }
    
    const mainDateStr = mainDateMatch[1];
    const mainDatetime = moment.tz(mainDateStr, 'DD.MM.YYYY HH:mm', TIMEZONE);
    
    if (!mainDatetime.isValid()) {
        return ctx.reply("❌ Sana noto‘g‘ri\n\nTo‘g‘ri format: 25.05.2026 17:00");
    }

    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    
    const newPost = {
        id: Date.now().toString(),
        user_id: ctx.from.id,
        file_id: fileId,
        caption: caption,
        main_datetime: mainDatetime.toISOString(),
        end_datetime: endDatetime ? endDatetime.toISOString() : null,
        aksiya_vaqti: aksiyaVaqti,
        status_main: 'pending',
        status_sale: endDateMatch ? 'pending' : 'not_applicable'
    };
    
    savePost(newPost);
    
    let replyMsg = "✅ Ma'lumot saqlandi!\n";
    replyMsg += `Asosiy yuborish vaqti: ${mainDatetime.format('DD.MM.YYYY HH:mm')}\n`;
    if (aksiyaVaqti) {
        replyMsg += `Aksiya xabari yuboriladigan vaqt: ${moment(aksiyaVaqti).tz(TIMEZONE).format('DD.MM.YYYY HH:mm')}`;
    }
    
    ctx.reply(replyMsg);
});

bot.on('text', (ctx) => {
    ctx.reply("Iltimos, rasm bilan birga matn (caption) yuboring.");
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
