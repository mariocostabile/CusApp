# Percentuale e barra nel download dell'aggiornamento — design

## Perché
Su alcuni telefoni (es. un Pixel) il popup di aggiornamento mostra solo "Download in corso…" senza
percentuale: il server di download di GitHub non sempre manda `Content-Length`, quindi `totalBytes`
è 0. L'utente vuole la percentuale su tutti i telefoni e in più una barra di avanzamento.

## Obiettivi
- Percentuale visibile su tutti i telefoni durante il download.
- Barra di avanzamento sotto la percentuale nel popup.

## Non obiettivi
- Download in background / ripresa dopo uscita dall'app, riuso dell'APK dopo annullo (punto E, futuro).
- Cancellare l'APK dalla cache (punto C).
- Aggiornamenti modulari (punto F, futuro).

## Vincoli
- Nessuna dipendenza nuova, nessuna chiamata di rete in più.
- Un aggiornamento senza `size` valida va comunque proposto (si ricade sul comportamento attuale).
- Gli altri dialog che usano `AppDialog` restano identici.

## Approcci
- **Scelto — `size` dell'asset dalla risposta `releases/latest`**: è già nella risposta che l'app
  scarica per il controllo, è esatta in byte. Si usa come totale quando il server non manda il suo.
- Scartato — richiesta HEAD prima del download: chiamata in più, stesso rischio di header mancante.
- Scartato — barra indeterminata: inutile, la dimensione si conosce.

## Design
- `AvailableUpdate` ha in più `apkSize: number | null` (intero positivo, altrimenti null).
- Funzione pura `downloadFraction(bytesWritten, totalBytes, apkSize)`: totale = `totalBytes` se > 0,
  altrimenti `apkSize`; senza totale restituisce null; risultato limitato a 0..1.
- `AppDialog` accetta `children` opzionali, mostrati tra il messaggio e i pulsanti.
- Il popup durante il download mostra "Download N%…" e una barra con lo stile di quella della home
  (sfondo `#E2E8F0`, riempimento `#0284C7`, altezza 10, angoli 5). Se la frazione è null: solo testo.

## Limite noto
Il codice che scarica è quello della versione installata: l'effetto si vede dal download successivo
alla release che contiene questa modifica.
