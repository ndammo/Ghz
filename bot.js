/*
  ══════════════════════════════════════════════════════
  bot.js — Telegram бот для PIXEL RPG
  Режим: Webhook (не polling — нет конфликтов 409 при деплое)
  ══════════════════════════════════════════════════════
*/

const TelegramBot = require('node-telegram-bot-api');

let bot = null;
const BOT_TOKEN   = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || 'PixelRPG_Bot';
const WEBAPP_URL  = process.env.WEBAPP_URL  || 'https://your-domain.railway.app';
const API_URL     = process.env.API_URL     || 'https://ghz-production.up.railway.app';

console.log('🤖 [bot] Инициализация...');
console.log('🤖 [bot] BOT_TOKEN: ' + (BOT_TOKEN ? '✅ Установлен' : '❌ НЕ УСТАНОВЛЕН'));
console.log('🤖 [bot] WEBAPP_URL: ' + WEBAPP_URL);

// ── Инициализация бота ──
function initBot(app) {
  if (!BOT_TOKEN) {
    console.error('❌ [bot] BOT_TOKEN не задан!');
    return null;
  }

  try {
    // Webhook режим: Express принимает апдейты сам.
    // polling: false → нет конфликтов 409 при деплое Railway.
    bot = new TelegramBot(BOT_TOKEN, { polling: false });

    // Регистрируем webhook в Telegram
    var webhookUrl = (process.env.WEBHOOK_URL || API_URL) + '/webhook/' + BOT_TOKEN;
    bot.setWebHook(webhookUrl)
      .then(function() {
        console.log('✅ [bot] Webhook установлен: ' + webhookUrl.replace(BOT_TOKEN, '<TOKEN>'));
      })
      .catch(function(err) {
        console.error('❌ [bot] Ошибка установки webhook:', err.message);
      });

    // ── Маршрут для приёма апдейтов от Telegram ──
    // Регистрируем в Express до return, чтобы app был точно доступен
    app.post('/webhook/' + BOT_TOKEN, function(req, res) {
      try {
        bot.processUpdate(req.body);
      } catch (e) {
        console.error('❌ [bot] processUpdate error:', e.message);
      }
      res.sendStatus(200);
    });

    console.log('✅ [bot] Telegram бот создан (webhook mode)');

    // ── /start — исправлен regex: теперь захватывает реферальный параметр ──
    bot.onText(/\/start(?:\s+(.+))?/, function(msg, match) {
      try {
        var chatId     = msg.chat.id;
        var userId     = msg.from.id;
        var username   = msg.from.username || msg.from.first_name || 'Игрок';
        var startParam = (match && match[1]) ? match[1].trim() : null;

        console.log('📨 [bot] /start от ' + username + ' (' + userId + '), param: ' + (startParam || 'none'));

        var webappUrl = WEBAPP_URL;
        if (startParam) {
          webappUrl = webappUrl + '?startapp=' + startParam;
        }

        var greeting = getGreeting(username);

        var message =
greeting + '\n\n' +
'🔥 **PIXEL RPG** — эпическая RPG!\n\n' +
'━━━━━━━━━━━━━━━━━━━\n' +
'🎮 **В игре тебя ждут:**\n' +
'  ✦ 10 этажей с монстрами\n' +
'  ✦ 3 класса персонажей\n' +
'  ✦ Улучшения и навыки\n' +
'  ✦ Редкие предметы\n' +
'  ✦ Боевой пропуск\n' +
'  ✦ Реферальная система\n\n' +
'━━━━━━━━━━━━━━━━━━━\n' +
'👤 **Твой ID:** `' + userId + '`\n' +
(startParam ? '🔗 **Пригласил:** `' + startParam + '`\n' : '') +
'\nНажми на кнопку ниже, чтобы начать!';

        var options = {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🎮 ИГРАТЬ',
                  web_app: { url: webappUrl }
                }
              ],
              [
                {
                  text: '👥 Пригласить друзей',
                  callback_data: 'ref'
                },
                {
                  text: '📊 Статистика',
                  callback_data: 'profile'
                }
              ]
            ]
          }
        };

        bot.sendMessage(chatId, message, options)
          .then(function() {
            console.log('✅ [bot] /start отправлен для ' + userId);
          })
          .catch(function(err) {
            console.error('❌ [bot] Ошибка отправки /start:', err.message);
          });

      } catch (e) {
        console.error('❌ [bot] Ошибка в /start:', e.message);
      }
    });

    // ── /help ──
    bot.onText(/\/help/, function(msg) {
      var chatId = msg.chat.id;
      bot.sendMessage(chatId,
        '📖 **Команды:**\n\n' +
        '/start — Начать игру\n' +
        '/help — Справка\n' +
        '/ref — Реферальная ссылка\n' +
        '/profile — Мой профиль',
        { parse_mode: 'Markdown' }
      );
    });

    // ── /ref ──
    bot.onText(/\/ref/, function(msg) {
      var chatId = msg.chat.id;
      var userId = msg.from.id;
      var refLink = 'https://t.me/' + BOT_USERNAME + '?startapp=' + userId;

      bot.sendMessage(chatId,
        '👥 **Твоя реферальная ссылка:**\n\n' +
        '`' + refLink + '`',
        { parse_mode: 'Markdown' }
      );
    });

    // ── /profile ──
    bot.onText(/\/profile/, function(msg) {
      var chatId = msg.chat.id;
      var userId = msg.from.id;

      getPlayerProfile(userId).then(function(profile) {
        bot.sendMessage(chatId,
          '📊 **Твой профиль:**\n\n' +
          '👤 Имя: ' + profile.username + '\n' +
          '🎯 Уровень: ' + profile.level + '\n' +
          '⚔️ CP: ' + profile.cp + '\n' +
          '🏰 Этаж: ' + profile.floor + '\n' +
          '👾 Убийств: ' + profile.killCount + '\n' +
          '🪙 Золото: ' + profile.gold + '\n' +
          '💎 PIXR: ' + profile.pixr + '\n' +
          '⭐ GRAM: ' + profile.gram,
          { parse_mode: 'Markdown' }
        );
      });
    });

    // ═══════════════════════════════
    //  ОБРАБОТКА ТРАНЗАКЦИЙ
    // ═══════════════════════════════
    bot.on('callback_query', function(query) {
      try {
        var chatId = query.message.chat.id;
        var userId = query.from.id;
        var data   = query.data;

        console.log('📨 [bot] Callback: ' + data + ' от ' + userId);

        bot.answerCallbackQuery(query.id).catch(function() {});

        // ── Рефералка ──
        if (data === 'ref') {
          var refLink = 'https://t.me/' + BOT_USERNAME + '?startapp=' + userId;
          bot.sendMessage(chatId,
            '👥 **Твоя реферальная ссылка:**\n\n' +
            '`' + refLink + '`',
            { parse_mode: 'Markdown' }
          );
          return;
        }

        // ── Профиль ──
        if (data === 'profile') {
          getPlayerProfile(userId).then(function(profile) {
            bot.sendMessage(chatId,
              '📊 **Твой профиль:**\n\n' +
              '👤 Имя: ' + profile.username + '\n' +
              '🎯 Уровень: ' + profile.level + '\n' +
              '⚔️ CP: ' + profile.cp + '\n' +
              '🏰 Этаж: ' + profile.floor + '\n' +
              '👾 Убийств: ' + profile.killCount + '\n' +
              '🪙 Золото: ' + profile.gold + '\n' +
              '💎 PIXR: ' + profile.pixr + '\n' +
              '⭐ GRAM: ' + profile.gram,
              { parse_mode: 'Markdown' }
            );
          });
          return;
        }

        // ── Транзакции (approve / reject) ──
        if (data.startsWith('approve_') || data.startsWith('reject_')) {
          var action = data.startsWith('approve_') ? 'approve' : 'reject';
          var txId   = data.replace(/^(approve|reject)_/, '');
          var chatId = query.message.chat.id;
          var msgId  = query.message.message_id;

          console.log('💳 [bot] Обработка транзакции: ' + txId + ' -> ' + action);

          // Сразу меняем кнопки на "обработка" — мгновенная реакция
          bot.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: '⏳ Обработка...', callback_data: 'noop' }]] },
            { chat_id: chatId, message_id: msgId }
          ).catch(function() {});

          var _fetch = typeof fetch !== 'undefined' ? fetch : null;
          try { if (!_fetch) _fetch = require('node-fetch'); } catch(e) {}

          if (!_fetch) {
            bot.editMessageReplyMarkup(
              { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'approve_' + txId }, { text: '❌ Отклонить', callback_data: 'reject_' + txId }]] },
              { chat_id: chatId, message_id: msgId }
            ).catch(function() {});
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка: fetch недоступен' }).catch(function(){});
            return;
          }

          _fetch(API_URL + '/bot/transaction/' + txId + '/' + action, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bot-secret': BOT_TOKEN
            },
            body: JSON.stringify({})
          })
          .then(function(r) { return r.json(); })
          .then(function(result) {
            if (result.ok) {
              var doneText = action === 'approve' ? '✅ Подтверждено' : '❌ Отклонено';
              bot.editMessageReplyMarkup(
                { inline_keyboard: [[{ text: doneText, callback_data: 'done_' + txId }]] },
                { chat_id: chatId, message_id: msgId }
              ).catch(function() {});
              bot.answerCallbackQuery(query.id, { text: doneText }).catch(function(){});
            } else {
              // Ошибка — возвращаем кнопки обратно
              var already = result.error === 'already_processed';
              bot.editMessageReplyMarkup(
                already
                  ? { inline_keyboard: [[{ text: '⚠️ Уже обработана', callback_data: 'done_' + txId }]] }
                  : { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'approve_' + txId }, { text: '❌ Отклонить', callback_data: 'reject_' + txId }]] },
                { chat_id: chatId, message_id: msgId }
              ).catch(function() {});
              bot.answerCallbackQuery(query.id, {
                text: already ? '⚠️ Транзакция уже обработана' : '❌ Ошибка: ' + (result.error || 'unknown'),
                show_alert: true
              }).catch(function(){});
            }
          })
          .catch(function(err) {
            console.error('❌ [bot] Ошибка обработки транзакции:', err.message);
            // Возвращаем кнопки если запрос упал
            bot.editMessageReplyMarkup(
              { inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: 'approve_' + txId }, { text: '❌ Отклонить', callback_data: 'reject_' + txId }]] },
              { chat_id: chatId, message_id: msgId }
            ).catch(function() {});
            bot.answerCallbackQuery(query.id, { text: '❌ Ошибка сервера' }).catch(function(){});
          });
          return;
        }

        // ── Тап на кнопку статуса (done_ / noop) — игнорируем ──
        if (data.startsWith('done_') || data === 'noop') {
          bot.answerCallbackQuery(query.id, { text: 'Транзакция уже обработана' }).catch(function(){});
          return;
        }
      } catch (e) {
        console.error('❌ [bot] Callback error:', e.message);
      }
    });

    console.log('✅ [bot] Все обработчики зарегистрированы');
    return bot;

  } catch (e) {
    console.error('❌ [bot] Ошибка:', e.message);
    return null;
  }
}

// ═══════════════════════════════
//  Вспомогательные функции
// ═══════════════════════════════

function getGreeting(username) {
  var hour = new Date().getHours();
  var time = 'Добрый день';
  if (hour < 12)      time = '🌅 Доброе утро';
  else if (hour < 18) time = '☀️ Добрый день';
  else if (hour < 22) time = '🌇 Добрый вечер';
  else                time = '🌙 Доброй ночи';

  return time + ', *' + username + '*! 👋';
}

// ── Получение профиля ──
function getPlayerProfile(userId) {
  try {
    var mongoose = require('mongoose');
    var Save = mongoose.model('Save');

    return Save.findOne({ tgId: String(userId) }).lean()
      .then(function(doc) {
        if (!doc) {
          return { username: 'Новичок', level: 1, cp: 0, floor: 1, killCount: 0, gold: 0, pixr: 0, gram: 0 };
        }
        var data = doc.data || {};
        return {
          username:  doc.firstName || doc.username || 'Игрок',
          level:     doc.level     || 1,
          cp:        doc.cp        || 0,
          floor:     doc.floor     || 1,
          killCount: data.killCount || 0,
          gold:      data.gold     || 0,
          pixr:      data.pixr     || 0,
          gram:      data.gram     || 0
        };
      })
      .catch(function(e) {
        console.error('❌ [bot] getPlayerProfile error:', e.message);
        return { username: 'Ошибка', level: 0, cp: 0, floor: 0, killCount: 0, gold: 0, pixr: 0, gram: 0 };
      });
  } catch (e) {
    console.error('❌ [bot] getPlayerProfile error:', e.message);
    return Promise.resolve({ username: 'Ошибка', level: 0, cp: 0, floor: 0, killCount: 0, gold: 0, pixr: 0, gram: 0 });
  }
}

// ── Удаление webhook и остановка ──
function stopBot() {
  if (bot) {
    try {
      bot.deleteWebHook()
        .catch(function() {})
        .then(function() {
          bot = null;
          console.log('🛑 [bot] Webhook удалён, бот остановлен');
        });
    } catch (e) {
      console.error('❌ [bot] Ошибка остановки:', e.message);
    }
  }
}

module.exports = {
  initBot:  initBot,
  stopBot:  stopBot,
  get bot() { return bot; }
};
