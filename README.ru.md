# Netlas Asset

[简体中文](README.zh-CN.md) · [English](README.md) · Русский

Netlas Asset — многоязычный настольный и консольный клиент для точечных разрешённых запросов через официальный API Netlas. В ветке `desk-cli` находится версия Node.js/Electron, а версия Python остаётся в `main`.

## Возможности

- Сводная информация по IP-адресам и полным доменным именам.
- Поиск в публичных ответах Netlas с пагинацией и ограничением в 200 результатов.
- Табличный просмотр и JSON, экспорт JSON/JSONL/CSV, история и избранное.
- Автоматическое определение и ручной выбор английского, китайского или русского языка.
- Необязательное безопасное хранение ключа API средствами операционной системы.
- Сборки Windows и Linux для x64 и ARM64.

Используйте программу только для собственных активов или при наличии явного разрешения.

## Использование

Загрузите пакет в [GitHub Releases](https://github.com/thufo/netlas-asset-cli/releases). В настройках укажите ключ API. По умолчанию он хранится только до закрытия программы. В Linux сохранение отключается, если безопасная служба секретов недоступна. История содержит только параметры запроса, но не ответы API и не ключи.

```text
netlas-asset host TARGET [--timeout SECONDS] [--retries COUNT] [--format json|jsonl|csv] [--output PATH]
netlas-asset search QUERY [--limit 1..200] [--timeout SECONDS] [--retries COUNT] [--format json|jsonl|csv] [--output PATH]
```

```bash
export NETLAS_API_KEY='ваш-ключ'
netlas-asset --lang ru host example.com
```

Для разработки требуется Node.js 22 или новее: `npm ci`, `npm run check`, `npm run dev`. Лицензия MIT.
