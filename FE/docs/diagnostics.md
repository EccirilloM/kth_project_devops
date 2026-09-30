# Diagnostica Raspberry

La pagina **Diagnostics** riceve il messaggio `sail_msgs/msg/RaspberryDiagnostics`
serializzato in JSON dal gateway ROS/MQTT, sul topic **`sail_gui/data/diagnostics`**
(plurale, senza slash iniziale).

La WebApp usa MQTT via WebSocket, come per gli altri dati della barca: il gateway
deve inoltrare questo messaggio sul broker. La sola pubblicazione su ROS non basta.
Il formato provvisorio con `schema_version`, `raspberry` e `batteries` è stato sostituito
dal messaggio piatto riportato sotto.

## Accesso e disponibilità

La pagina e la sottoscrizione sono riservate a Staff (`AuthRoles.Admin`). Guest
non sottoscrive il topic e viene reindirizzato se apre `/#/diagnostics`.
Le ACL del broker devono autorizzare Staff sul topic nuovo e negarlo a Guest
per proteggere i dati anche fuori dalla WebApp.

- Ogni messaggio sostituisce completamente il campione precedente, incluso `device_id`.
- Dopo 15 secondi senza campioni accettati i dati diventano non disponibili.
  La durata è configurabile con `diagnosticTimeoutMs` in `app-config.ts`.
- La scadenza si misura dall'arrivo; l'orario mostrato deriva da `stamp`, nel fuso del browser.
- Disconnessione e logout cancellano i dati; i messaggi retained vengono ignorati.
- La pagina non pubblica comandi. Il verde MQTT indica la connessione al broker,
  non la ricezione della diagnostica.

## Esempio di payload

Valori illustrativi, non dati reali:

```json
{
  "stamp": { "sec": 1790182800, "nanosec": 0 },
  "device_id": "raspberry-main",
  "temperature": 48.2,
  "temperature_valid": true,
  "cpu_usage_percent": 23.5,
  "cpu_valid": true,
  "memory_used_bytes": 1073741824,
  "memory_total_bytes": 4294967296,
  "memory_valid": true,
  "uptime_seconds": 7200.5,
  "uptime_valid": true
}
```

## Interpretazione

- `stamp`: secondi interi int32 ROS e nanosecondi interi tra 0 e 999999999.
- `device_id`: identificativo non vuoto, mostrato sulla scheda Raspberry.
- `temperature`: temperatura in °C, usata solo se `temperature_valid` è true.
- `cpu_usage_percent`: percentuale 0–100, usata solo se `cpu_valid` è true.
- `memory_used_bytes` e `memory_total_bytes`: RAM utilizzata e totale in byte,
  usate solo se `memory_valid` è true. La percentuale è `used / total * 100`;
  la scheda mostra anche utilizzata/totale in GiB (1 GiB = 1024³ byte).
- `uptime_seconds`: tempo di attività non negativo, usato solo se `uptime_valid` è true;
  la pagina lo presenta in ore e minuti.

I flag sono booleani obbligatori. Con un flag false la relativa misura appare come **—**:
nessun valore segnaposto viene interpretato come una misura reale. Con un flag true,
la misura deve essere presente, numerica, finita e nell'intervallo previsto. Zero è valido.
Per la RAM servono interi non negativi rappresentabili esattamente in JavaScript,
con totale maggiore di zero e utilizzata non superiore al totale.

Un messaggio malformato viene scartato interamente senza rinnovare il timeout del
campione precedente. Un messaggio con tutti i flag false è invece accettato:
identifica un campione ricevuto con misure non disponibili. I campi aggiuntivi vengono ignorati.

Il messaggio non contiene uno stato di salute complessivo né dati delle batterie.
Non vengono dedotte soglie di allarme dai flag di validità. Le schede batterie
restano vuote con una spiegazione esplicita; non rappresentano batterie rilevate.

DTO della vista: `src/app/dtos/DiagnosticData.ts`.
Adattamento e validazione: `src/app/core/mqtt/diagnostic-payload.ts`.

## Verifica

I test locali coprono il formato ROS, conversione RAM, zeri, flag di validità,
payload malformati, topic esatto, ruoli, scadenza, logout e disconnessione con un client simulato.
La verifica sulla barca richiede gateway e broker attivi con inoltro del nuovo topic
in JSON e ACL Staff aggiornate.
