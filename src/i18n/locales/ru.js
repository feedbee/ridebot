export const ru = {
  templates: {
    start: `
<b>🚲 Добро пожаловать в Ride Announcement Bot!</b>

Я <b>Telegram-бот для организации велопоездок</b>. Я помогу вам организовывать покатушки с друзьями и сообществом сразу в нескольких чатах.

<b>Ключевые возможности:</b>
• Создание и планирование поездок
• Публикация поездок сразу в нескольких чатах
• Учет участников через кнопки join/leave
• Автоматическая синхронизация обновлений для всех

<b>Быстрый старт:</b>
1. Используйте /newride в этом чате, чтобы создать первую поездку через мастер
2. Присоединитесь к поездке кнопкой join
3. Поделитесь поездкой в другие чаты через /shareride (бот должен быть добавлен в другой чат до публикации; /shareride@botname можно использовать в чате, где бот не админ)
4. Все участники и изменения синхронизируются автоматически!

<b>Подробнее:</b>
• Введите /help для подробной инструкции с примерами
• Используйте /listrides, чтобы посмотреть созданные вами поездки
• Используйте команды управления поездками по ID

Хороших покатушек! 🚴‍♀️💨
    `.trim(),

    help1: `
<b>🚲 Помощь по Ride Announcement Bot</b>

<i>Для обзора возможностей и принципа работы бота используйте команду /start.</i>

<b>➕ Создание новой поездки</b>
Создать поездку можно так:
1. Через мастер (рекомендуется):
Просто отправьте команду /newride без параметров, чтобы запустить интерактивный мастер, который проведет вас по шагам. <i>(Примечание: режим мастера доступен только в личных чатах с ботом)</i>

2. Через команду с параметрами:
Используйте /newride и передайте параметры (по одному на строку):
<pre>
/newride
title: Ride title
when: Date and time (e.g., "tomorrow at 6pm", "this saturday 10am", "21 Jul 14:30")
category: One of: "Regular/Mixed Ride" (default), "Road Ride", "Gravel Ride", "Mountain/Enduro/Downhill Ride", "MTB-XC Ride", "E-Bike Ride", "Virtual/Indoor Ride" (optional)
meet: Meeting point (optional)
route: Route link (optional)
dist: Distance in km (optional)
duration: Duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: Speed in km/h: range (25-28), min (25+ or 25-), max (-28), avg (25 or ~25) (optional)
info: Additional information (optional)
</pre>

Пример:
<pre>
/newride
title: Evening Ride
when: tomorrow at 6pm
category: Road Ride
meet: Bike Shop on Main St
route: https://www.strava.com/routes/123456
dist: 35
duration: 2h 30m
speed: 25-28
info: Bring lights and a rain jacket
</pre>

<b>Управление поездками</b>

<b>🔄 Обновление поездки</b>
Обновлять поездку может только создатель. Доступно 4 способа:
1. Ответьте на сообщение поездки командой /updateride без параметров, чтобы запустить интерактивный мастер. <i>(Примечание: режим мастера доступен только в личных чатах с ботом)</i>
2. Ответьте на сообщение поездки командой /updateride и передайте новые параметры
3. Используйте /updateride с ID сразу после команды: <code>/updateride abc123</code>
4. Используйте /updateride с ID как параметр:
<pre>
/updateride
id: abc123
title: New title (optional)
when: New date/time (optional)
meet: New meeting point (optional)
route: New route link (optional)
dist: New distance (optional)
duration: New duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: New speed (optional)
info: Additional information (optional)
</pre>
    `.trim(),

    help2: `
<b>❌ Отмена поездки</b>
Отменять поездку может только создатель:
1. Ответьте на сообщение поездки командой /cancelride
2. Используйте /cancelride с ID сразу после команды: <code>/cancelride abc123</code>
3. Используйте /cancelride с ID как параметр:
<pre>
/cancelride
id: abc123
</pre>

<b>↩️ Возобновление отмененной поездки</b>
Возобновлять отмененную поездку может только создатель:
1. Ответьте на сообщение поездки командой /resumeride
2. Используйте /resumeride с ID сразу после команды: <code>/resumeride abc123</code>
3. Используйте /resumeride с ID как параметр:
<pre>
/resumeride
id: abc123
</pre>

<b>🗑 Удаление поездки</b>
Удалять поездку может только создатель:
1. Ответьте на сообщение поездки командой /deleteride
2. Используйте /deleteride с ID сразу после команды: <code>/deleteride abc123</code>
3. Используйте /deleteride с ID как параметр:
<pre>
/deleteride
id: abc123
</pre>

<b>🔄 Дублирование поездки</b>
Дублировать поездку может только создатель. Доступно 4 способа:
1. Ответьте на сообщение поездки командой /dupride без параметров, чтобы запустить интерактивный мастер. <i>(Примечание: режим мастера доступен только в личных чатах с ботом)</i>
2. Ответьте на сообщение поездки командой /dupride и передайте новые параметры
3. Используйте /dupride с ID сразу после команды: <code>/dupride abc123</code>
4. Используйте /dupride с ID и опциональными параметрами:
<pre>
/dupride
id: abc123
title: New title (optional)
when: New date/time (optional)
category: One of: "Regular/Mixed Ride" (default), "Road Ride", "Gravel Ride", "Mountain/Enduro/Downhill Ride", "MTB-XC Ride", "E-Bike Ride", "Virtual/Indoor Ride" (optional)
meet: New meeting point (optional)
route: New route link (optional)
dist: New distance (optional)
duration: New duration in minutes or human-readable format (e.g., "2h 30m", "90m", "1.5h") (optional)
speed: New speed (optional)
info: Additional information (optional)
</pre>
Параметры, которые не были переданы, будут скопированы из исходной поездки.
По умолчанию новая поездка будет запланирована на завтра в то же время.

<b>📋 Список ваших поездок</b>
Используйте /listrides, чтобы посмотреть все созданные вами поездки:
• Поездки сортируются по дате (сначала более новые)
• Используйте кнопки навигации для переключения страниц

<b>📢 Публикация поездки</b>
Публиковать поездку в другой чат может только создатель:
1. Перейдите в целевой чат, куда хотите опубликовать поездку
2. Используйте /shareride (или /shareride@botname) с ID сразу после команды: <code>/shareride@botname abc123</code>
3. Или используйте /shareride (или /shareride@botname) с ID как параметр:
<pre>
/shareride@botname
id: abc123 (or #abc123)
</pre>
Поездка будет опубликована в текущий чат, а все копии будут синхронизироваться при изменении деталей или участии пользователей.

<b>Важно:</b> Бот должен быть добавлен в другой чат до публикации. Для короткой формы /shareride бот должен быть администратором в том чате, но всегда можно использовать полную форму /shareride@botname.

<b>📎 Привязка группы к поездке</b>
Привязать группу может только создатель поездки:
1. Создайте Telegram-группу и добавьте бота как администратора (нужны права «Добавление участников» и «Блокировка пользователей»)
2. Используйте /attach с ID поездки в группе: <code>/attach #abc123</code>
Бот опубликует информацию о поездке в группе и будет автоматически добавлять/удалять участников по мере изменения их статуса.
Чтобы отвязать группу, используйте /detach в группе.

    `.trim(),

    ride: `
🚲 <b>{title}</b>{cancelledBadge}

{rideDetails}
🚴 {joinedLabel} ({participantCount}): {participants}
🤔 {thinkingLabel} ({thinkingCount}): {thinking}
🙅 {notInterestedLabel}: {notInterestedCount}

{shareLine}🎫 #Ride #{id}{cancelledInstructions}
    `.trim(),

    cancelled: '❌ ОТМЕНЕНО',
    cancelledMessage: 'Эта поездка была отменена.',
    deleteConfirmation: '⚠️ Вы уверены, что хотите удалить эту поездку? Действие нельзя отменить.',
    shareRideHelp: `
<b>ℹ️ Как опубликовать поездку в этом чате:</b>

1. Создайте поездку в личном чате с ботом
2. Получите ID поездки из сообщения-подтверждения или через /listrides
3. Используйте <code>/shareride@botname RIDE_ID</code> в этом чате

Нажмите здесь, чтобы открыть личный чат: @botname
    `.trim()
  },
  buttons: {
    join: 'Я в деле! 🚴',
    thinking: 'Подумаю 🤔',
    pass: 'Пас 🙅',
    confirmDelete: 'Да, удалить ❌',
    cancelDelete: 'Нет, оставить ✅',
    back: '⬅️ Назад',
    skip: '⏩ Пропустить',
    cancel: '❌ Отмена',
    create: '✅ Создать',
    update: '✅ Обновить',
    keep: '↩️ Оставить текущее',
    previous: '◀️ Назад',
    next: 'Вперед ▶️'
  },
  common: {
    greeting: 'Привет, {name}!',
    yes: 'Да',
    no: 'Нет',
    onlyEn: 'Только английский ключ'
  },
  errors: {
    generic: 'Произошла ошибка.'
  },
  commands: {
    common: {
      rideNotFoundById: 'Поездка #{id} не найдена',
      rideNotFoundByIdWithDot: 'Поездка #{id} не найдена.',
      errorAccessingRideData: 'Ошибка при доступе к данным поездки',
      unknownParameters: 'Неизвестные параметры: {params}',
      validParameters: 'Допустимые параметры:',
      onlyCreatorAction: 'Только создатель поездки может выполнить это действие.',
      rideActionUpdatedMessages: 'Поездка успешно {action}. Обновлено сообщений: {count}.',
      rideActionNoMessagesUpdated: 'Поездка была {action}, но ни одно сообщение не обновилось. Возможно, стоит снова опубликовать поездку через /shareride в нужных чатах: старые сообщения могли быть удалены.',
      removedUnavailableMessages: 'Удалено недоступных сообщений: {count}.',
      actions: {
        cancelled: 'отменена',
        resumed: 'возобновлена',
        updated: 'обновлена'
      },
      verbs: {
        cancel: 'отменить',
        resume: 'возобновить'
      }
    },
    update: {
      onlyCreator: 'Только создатель поездки может ее обновить.',
      messageUpdateError: 'Поездка была обновлена, но возникла ошибка при обновлении сообщения о поездке. Возможно, нужно создать новое сообщение о поездке.'
    },
    cancel: {
      alreadyCancelled: 'Эта поездка уже отменена.'
    },
    resume: {
      notCancelled: 'Эта поездка не отменена.'
    },
    duplicate: {
      success: 'Поездка успешно продублирована!'
    },
    listParticipants: {
      invalidRideIdUsage: 'Укажите корректный ID поездки. Использование: /listparticipants rideID',
      allParticipantsTitle: 'Все участники для "{title}" ({total})',
      joinedLabel: 'Участвуют ({count})',
      thinkingLabel: 'Думают ({count})',
      notInterestedLabel: 'Не интересно ({count})',
      noOneJoinedYet: 'Пока никто не присоединился.',
      retrieveError: 'Произошла ошибка при получении списка участников.'
    },
    share: {
      invalidRideIdUsage: 'Укажите корректный ID поездки. Использование: /shareride rideID',
      onlyCreatorRepost: 'Только создатель поездки может публиковать ее повторно.',
      cannotRepostCancelled: 'Нельзя повторно публиковать отмененную поездку.',
      alreadyPostedInChat: 'Эта поездка уже опубликована в этом чате{topicSuffix}.',
      topicSuffix: ' теме',
      failedToPostWithError: 'Не удалось опубликовать поездку: {error}',
      postingError: 'Произошла ошибка при публикации поездки.',
      botNotMemberOrBlocked: 'Бот не является участником этого чата или был заблокирован.',
      botNoPermission: 'У бота нет прав на отправку сообщений в этом чате.',
      failedToPost: 'Не удалось опубликовать поездку'
    },
    participation: {
      joinedSuccess: 'Вы присоединились к поездке!',
      thinkingSuccess: 'Вы рассматриваете участие в поездке',
      skippedSuccess: 'Вы отказались от участия в поездке',
      rideNotFound: 'Поездка не найдена',
      rideCancelled: 'Эта поездка была отменена',
      updatedButMessageFailed: 'Ваш статус участия обновлен, но обновление сообщения не удалось',
      genericError: 'Произошла ошибка',
      alreadyInState: 'У вас уже установлен статус: {state}',
      states: {
        joined: 'участвую',
        thinking: 'думаю',
        skipped: 'пропускаю'
      }
    },
    notifications: {
      joined: '🚴 <b>{name}</b> присоединился к вашей поездке "<b>{title}</b>"\n\n🔕 Отключить уведомления:\n<pre>/updateride #{rideId}\nnotify: no</pre>',
      thinking: '🤔 <b>{name}</b> думает о вашей поездке "<b>{title}</b>"\n\n🔕 Отключить уведомления:\n<pre>/updateride #{rideId}\nnotify: no</pre>',
      skipped: '🙅 <b>{name}</b> отказался от вашей поездки "<b>{title}</b>"\n\n🔕 Отключить уведомления:\n<pre>/updateride #{rideId}\nnotify: no</pre>'
    },
    stateChange: {
      onlyCreator: 'Только создатель поездки может {action} эту поездку.',
      messageUpdateError: 'Поездка была {action}, но возникла ошибка при обновлении сообщения о поездке. Возможно, нужно создать новое сообщение о поездке.'
    },
    group: {
      notInGroup: 'Эта команда должна использоваться в групповом чате.',
      notSupergroup: 'Эта команда доступна только для супергрупп. Чтобы преобразовать группу, включите «Историю сообщений для новых участников» в настройках группы — Telegram автоматически обновит её до супергруппы. Затем повторите: <code>{command}</code>',
      rideNotFound: 'Поездка не найдена.',
      notCreator: 'Только создатель поездки может выполнить это действие.',
      alreadyAttached: 'К этой поездке уже привязана группа. Сначала используйте /detach.',
      botNotAdmin: 'Бот не является администратором в этой группе. Сделайте его администратором и попробуйте снова.',
      botNeedsAddMembersPermission: 'Боту нужно право администратора «Добавление участников». Обновите права бота и попробуйте снова.',
      attachSuccess: 'Группа успешно привязана! Участники будут автоматически добавляться при записи на поездку.',
      detachSuccess: 'Группа отвязана. Участники больше не будут добавляться автоматически.',
      noGroupAttached: 'К этой группе не привязана ни одна поездка.',
      inviteLinkSent: 'Вы приглашены в группу поездки: {link}\n\nЭта группа предназначена для организации поездки, общения до и после неё, а также обмена фотографиями. Ссылка действительна 24 часа.',
      inviteLinkForCreator: 'Участник не смог получить ссылку-приглашение автоматически — он ещё не начал разговор с ботом. Пожалуйста, отправьте ему эту ссылку вручную: {link}',
      invalidRideIdUsage: 'Укажите корректный ID поездки. Использование: /attach #rideID'
    },
    delete: {
      onlyCreator: 'Только создатель поездки может удалить ее.',
      cancelledMessage: 'Удаление отменено.',
      cancelledCallback: 'Удаление отменено',
      notFoundMessage: 'Поездка не найдена.',
      notFoundCallback: 'Поездка не найдена',
      successMessage: 'Поездка успешно удалена.',
      successCallback: 'Поездка успешно удалена',
      failedMessage: 'Не удалось удалить поездку.',
      failedCallback: 'Не удалось удалить поездку',
      deletedMessages: 'Удалено сообщений: {count}.',
      removedMessages: 'Удалено недоступных сообщений: {count}.'
    }
  },
  formatter: {
    truncateMarker: '\n\n... (сообщение обрезано из-за ограничения длины)',
    noParticipantsYet: 'Пока нет участников',
    noOneJoinedYet: 'Пока никто не присоединился',
    atWord: 'в',
    routeLinkLabel: 'Ссылка',
    noCreatedRides: 'Вы еще не создали ни одной поездки.',
    yourRidesTitle: 'Ваши поездки',
    postedInSingleChat: 'Опубликовано в {count} чате',
    postedInMultipleChats: 'Опубликовано в {count} чатах',
    notPostedInAnyChats: 'Не опубликовано ни в одном чате',
    pageLabel: 'Страница {page}/{totalPages}',
    andMoreParticipants: '{displayedList} и еще {count}',
    upToSpeed: 'до {max} км/ч',
    shareLine: 'Поделиться поездкой: <code>/shareride #{id}</code>',
    labels: {
      when: 'Когда',
      category: 'Категория',
      organizer: 'Организатор',
      meetingPoint: 'Место встречи',
      route: 'Маршрут',
      distance: 'Дистанция',
      duration: 'Длительность',
      speed: 'Ср. скорость',
      additionalInfo: 'Дополнительно'
    },
    participation: {
      joined: 'Участвуют',
      thinking: 'Думают',
      notInterested: 'Не интересно'
    },
    units: {
      km: 'км',
      min: 'мин',
      hour: 'ч',
      kmh: 'км/ч'
    }
  },
  categories: {
    regularMixed: 'Смешанная поездка',
    road: 'Шоссе',
    gravel: 'Гревел',
    mountainEnduroDownhill: 'MTB/Enduro/Downhill',
    mtbXc: 'MTB кросс-кантри',
    eBike: 'Электро',
    virtualIndoor: 'Виртуальная/Индор поездка'
  },
  parsers: {
    date: {
      invalidFormat: '❌ Не удалось распознать формат даты/времени. Попробуйте, например:\n• завтра в 18:00\n• через 2 часа\n• в субботу в 10:00\n• 21 июля 14:30',
      timezoneNote: 'Примечание: время интерпретируется в часовом поясе {timezone}.',
      pastDate: '❌ Нельзя запланировать поездку на прошлое время. Укажите дату и время в будущем.'
    },
    duration: {
      invalidFormat: '❌ Не удалось распознать формат длительности. Попробуйте, например:\n• 90 (90 минут)\n• 2h (2 часа)\n• 2h 30m (2 часа 30 минут)\n• 1.5h (1 час 30 минут)'
    }
  },
  wizard: {
    messages: {
      completeOrCancelCurrent: 'Пожалуйста, завершите или отмените текущий мастер создания поездки перед запуском нового.',
      privateChatOnlyReply: '⚠️ Команды мастера доступны только в личном чате с ботом. Используйте команду с параметрами.',
      privateChatOnlyCallback: '⚠️ Команды мастера доступны только в личном чате с ботом',
      sessionExpired: 'Сессия мастера истекла',
      invalidCategory: 'Выбрана некорректная категория',
      creationCancelled: 'Создание поездки отменено',
      updatedSuccessfully: 'Поездка успешно обновлена!',
      duplicatedSuccessfully: 'Поездка успешно продублирована!',
      createdSuccessfully: 'Поездка успешно создана!',
      errorWithMessage: 'Ошибка: {message}',
      currentValue: 'Текущее значение'
    },
    prompts: {
      title: '🚲 Введите название поездки:',
      category: '🚵 Выберите категорию поездки:',
      organizer: '👤 Кто организует эту поездку?\n<i>Введите дефис (-), чтобы очистить/пропустить это поле</i>',
      date: '📅 Когда состоится поездка?\nМожно использовать естественный язык, например:\n• завтра в 18:00\n• через 2 часа\n• в субботу в 10:00\n• 21 июля 14:30',
      route: '🗺️ Введите ссылку на маршрут (или пропустите):\n<i>Введите дефис (-), чтобы очистить/пропустить это поле</i>',
      distance: '📏 Введите дистанцию в километрах (или пропустите):\n<i>Введите дефис (-), чтобы очистить/пропустить это поле</i>',
      duration: '⏱ Введите длительность (например, \"2h 30m\", \"90m\", \"1.5h\"):\n<i>Введите дефис (-), чтобы очистить/пропустить это поле</i>',
      speed: '⚡ Ср. скорость в км/ч или пропустите:\n• 25-28 — диапазон\n• 25+ или 25- — минимум\n• -28 — максимум\n• 25 или ~25 — среднее\n<i>Введите дефис (-), чтобы очистить/пропустить это поле</i>',
      meet: '📍 Введите место встречи (или пропустите):\n<i>Введите дефис (-), чтобы очистить/пропустить это поле</i>',
      info: 'ℹ️ Введите дополнительную информацию (или пропустите):\n<i>Введите дефис (-), чтобы очистить/пропустить это поле</i>',
      notify: '🔔 Уведомлять вас, когда участники присоединяются или выходят?\n<i>Это можно изменить позже через обновление поездки.</i>'
    },
    validation: {
      titleRequired: 'Название не может быть пустым',
      routeInvalid: 'Некорректный формат ссылки на маршрут. Укажите корректный URL, используйте дефис (-) для очистки поля или нажмите Skip.',
      distanceInvalid: 'Введите корректное число для дистанции или используйте дефис (-), чтобы очистить поле.'
    },
    confirm: {
      confirmPrompt: '👆 Проверьте предварительный просмотр выше и подтвердите'
    },
    preview: {
      placeholder: '🚲 <b>Предварительный просмотр</b>\n\n<i>Заполните поля, и предварительный просмотр появится здесь.</i>'
    }
  },
  services: {
    ride: {
      pleaseProvideTitleAndDate: 'Укажите как минимум название и дату/время.',
      errorCreatingRide: 'Произошла ошибка при создании поездки.',
      errorUpdatingRide: 'Произошла ошибка при обновлении поездки.',
      originalRideNotFound: 'Исходная поездка не найдена'
    },
    rideMessages: {
      couldNotFindRideIdInMessage: 'Не удалось найти ID поездки в сообщении. Убедитесь, что вы отвечаете на сообщение о поездке, или передайте ID поездки.',
      provideRideIdAfterCommand: 'Укажите ID поездки после команды (например, /{commandName} rideID) или ответьте на сообщение о поездке.'
    }
  },
  params: {
    title: 'Название поездки',
    category: 'Категория поездки',
    organizer: 'Имя организатора',
    when: 'Дата и время поездки',
    meet: 'Место встречи',
    route: 'URL маршрута',
    dist: 'Дистанция в километрах',
    duration: 'Длительность в минутах',
    speed: 'Скорость: диапазон (25-28), мин (25+), макс (-28), ср. (25)',
    info: 'Дополнительная информация',
    notify: 'Уведомлять об изменениях участников (yes/no)',
    id: 'ID поездки (для команд, где требуется)'
  },
  utils: {
    routeParser: {
      invalidUrl: 'Некорректный формат URL. Укажите корректную ссылку.'
    }
  },
  bot: {
    commandDescriptions: {
      start: 'Запустить бота и показать приветствие',
      help: 'Показать справку по командам',
      newride: 'Создать новую поездку',
      updateride: 'Обновить существующую поездку',
      cancelride: 'Отменить поездку',
      deleteride: 'Удалить поездку',
      listrides: 'Показать все ваши поездки',
      listparticipants: 'Показать всех участников поездки',
      dupride: 'Дублировать существующую поездку',
      resumeride: 'Возобновить отмененную поездку',
      shareride: 'Опубликовать поездку в чате',
      attach: 'Привязать Telegram-группу к поездке',
      detach: 'Отвязать Telegram-группу от поездки'
    }
  }
};
