# Turno pieno: niente prenotazione silenziosa del turno successivo

## Problema

Se il turno richiesto è saturo, GinniPAL non lo include in `edOrarioPrenotato.items`.
Il codice di prenotazione, non trovandolo, ripiega sul primo turno libero della lista
e completa la prenotazione (`Procedi` + `Conferma`) senza avvisare. L'utente si ritrova
prenotato a un turno diverso da quello scelto.

## Soluzione (strada A: blocco e avviso)

Rimuovere il fallback sul primo turno libero. Se il turno richiesto non è nella lista
del server, la prenotazione si interrompe prima di `OrarioPrenotatoChanged` lanciando:

> `Posti esauriti per il turno <timeSlot> del <dateStr>`

L'errore è già mostrato all'utente dal `catch` esistente in `src/app/index.tsx`
(`Alert.alert('Errore Prenotazione', err.message)`), nessuna modifica alla UI.

## File toccati

- `src/services/ginnipalService.ts`: rimuovere il blocco `if (!matchedSlot && slotItems.length > 0) { ... }`, cambiare il messaggio d'errore.
- `src/services/ginnipalNodeFetcher.js`: stessa modifica (percorso usato dal proxy in `metro.config.js`).

Fuori scope: `CusAppDemo/` (ha lo stesso bug, si tocca solo su richiesta esplicita),
la logica di matching del turno (etichetta esatta o orario di inizio), il controllo UI a `index.tsx:691`.

## Limite noto

I turni dell'app sono scritti nel codice (`index.tsx`), quelli del server arrivano da GinniPAL.
Se la palestra cambia formato o orari delle etichette, l'app mostrerà "Posti esauriti"
anche se la causa è un'etichetta non riconosciuta. È accettato: è meglio un avviso
impreciso che una prenotazione sbagliata.

## Verifica

Manuale (non c'è una suite di test, vedi jest-expo rimandata):
1. Prenotare un turno pieno: compare l'Alert "Posti esauriti per il turno ...", nessuna nuova prenotazione su GinniPAL.
2. Prenotare un turno libero: la prenotazione va a buon fine come prima.
