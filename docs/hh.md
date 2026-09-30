# Доступ к HH API

`ru-market` получает вакансии HH через `https://api.hh.ru/vacancies`. HTML-режима для HH нет. Для авторизации HH использует OAuth `access_token` приложения, а не отдельный постоянный API key.

## Получить токен приложения

1. Зарегистрируйте своё приложение в [кабинете разработчика HH](https://dev.hh.ru/admin).
   Если форма требует Redirect URI, для этого плагина можно указать ориентировочный адрес, например `http://localhost:3000/hh/callback`, если форма принимает локальный адрес. Токен приложения не использует перенаправление пользователя; Redirect URI нужен для [авторизации пользователя](https://api.hh.ru/openapi/redoc#tag/Avtorizaciya-polzovatelya). Если позже добавите вход пользователя, замените адрес на реальный обработчик вашего приложения.
   Если обязательное поле «Приложением будут пользоваться» предлагает только сотрудников одного или нескольких работодателей, а приложение предназначено для личного поиска работы, оба варианта не описывают этот сценарий. [Условия HH API](https://dev.hh.ru/admin/developer_agreement) допускают соискателей как пользователей приложения и использование для личных нужд. Если тип заявки нельзя изменить, обратитесь в `api@hh.ru` и попросите подсказать способ зарегистрировать такой сценарий или создать подходящую заявку.
2. Получите токен приложения по [инструкции HH](https://github.com/hhru/api/blob/master/docs/authorization_for_application.md) и разделу «Авторизация приложения» в [OpenAPI](https://api.hh.ru/openapi/redoc#tag/Avtorizaciya-prilozheniya). HH указывает, что токен приложения генерируется один раз; действующий токен владелец может посмотреть в кабинете разработчика. При повторном выпуске прежний токен отзывается.
3. Храните `access_token` как секрет приложения. `client_id` и `client_secret` нужны для получения токена, но самому `ru-market` их передавать не требуется. Не добавляйте токен в `portals.yml`, исходный код или Git.

## Подключить к career-ops

В локальном файле `career-ops/.env` добавьте:

```dotenv
HH_ACCESS_TOKEN=<access_token_вашего_приложения>
```

Затем запустите обычное сканирование из каталога `career-ops`. Плагин читает `HH_ACCESS_TOKEN` из окружения и отправляет его только на `api.hh.ru` в заголовке `Authorization: Bearer`. В `portals.yml` для HH используется `ru_market.sources.hh.mode: api` (или `auto`, который также обращается к API).

## Использовать в своём приложении

Передайте токен через секреты окружения своего приложения и добавьте заголовок к запросу HH API. Пример для Node.js 18+:

```js
const token = process.env.HH_ACCESS_TOKEN;
if (!token) throw new Error('HH_ACCESS_TOKEN is missing');

const url = new URL('https://api.hh.ru/vacancies');
url.searchParams.set('text', 'разработчик python');
url.searchParams.set('page', '0');

const response = await fetch(url, {
  headers: {
    'HH-User-Agent': 'MyApp/1.0 (contact@example.com)',
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  },
});
if (!response.ok) throw new Error(`HH API: HTTP ${response.status}`);
const vacancies = await response.json();
```

Своё приложение должно само загружать секрет из окружения; Node.js не читает `.env` автоматически. HH описывает формат `Bearer` и проверку токена через `/me` в [документации авторизации](https://github.com/hhru/api/blob/master/docs/authorization.md).

## Если HH отвечает 403

Токен сам по себе не гарантирует доступ. Проверьте, что передан действующий токен нужного приложения; для проверки токена HH рекомендует `/me`. Если поиск вакансий всё равно возвращает `403`, сохраните HTTP-статус и `request_id` из ответа и обратитесь в [поддержку HH API](https://api.hh.ru/openapi/redoc). Плагин не повторяет `403` и не переключается на HTML: [условия HH](https://hh.ru/article/33205) требуют взаимодействия программных приложений через API.
