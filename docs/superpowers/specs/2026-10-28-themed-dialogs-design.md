# Dialog a tema CusApp al posto degli Alert di sistema

## Problema

Quattro avvisi in `src/app/index.tsx` usano `Alert.alert` e su Android appaiono con la
grafica di sistema, incoerente con l'app. L'unico dialog a tema è quello di annullamento
prenotazione (`Modal` con stili `customModalBackdrop` / `customConfirmCard` / ...).

## Soluzione

Un componente unico `src/components/app-dialog.tsx` con la grafica del dialog di
annullamento attuale, usato da tutti gli avvisi dell'app.

### Componente `AppDialog`

Props:
- `visible: boolean`
- `title: string`
- `message: React.ReactNode` (string o testo con grassetti, come nel dialog di annullamento)
- `actions: { label: string; variant: 'danger' | 'secondary'; onPress?: () => void }[]`
- `onClose: () => void` (back di Android e tocco su un pulsante: il dialog si chiude sempre, poi parte `onPress`)

Icona: sempre ⚠️ nel cerchio rosso chiaro, come oggi.

Stili: spostati da `index.tsx` nel componente (`customModalBackdrop`, `customConfirmCard`,
`confirmIconCircle`, `confirmIconEmoji`, `customConfirmTitle`, `customConfirmDesc`,
`customConfirmActions`, `confirmCancelBtn(Text)` → variante `danger`,
`confirmKeepBtn(Text)` → variante `secondary`). Gli stili spostati vengono rimossi da `index.tsx`;
`boldText` resta in `index.tsx` (usato anche alla riga del certificato medico) e il messaggio di
annullamento lo usa per data e ora.
Proprietà `Modal` invariate: `transparent`, `animationType="fade"`, `statusBarTranslucent`, `navigationBarTranslucent`.

### Uso in `index.tsx`

Un solo stato `dialog: { title; message; actions } | null` e un solo `<AppDialog>` in fondo
al JSX (dopo tutti gli altri `Modal`, così compare sopra il modal di prenotazione aperto).

| Dove | Titolo | Pulsanti |
|---|---|---|
| `handleConfirmBooking`, turno non selezionabile | Turno non disponibile | Ho capito (secondary) |
| `handleConfirmBooking`, catch | Errore Prenotazione | Ho capito (secondary) |
| `executeCancelReservation`, catch | Errore Annullamento | Ho capito (secondary) |
| `handleLogout` | Disconnetti Profilo | Disconnetti (danger), Annulla (secondary) |
| `handlePromptCancel` (oggi `confirmCancelModalData`) | Annulla prenotazione | Annulla prenotazione (danger), Torna indietro (secondary) |

Il pulsante rosso è riservato alle azioni distruttive; gli avvisi informativi hanno solo
il pulsante grigio. Ordine pulsanti: azione principale sopra, come il dialog attuale.

Rimossi: stato `confirmCancelModalData`, il `Modal` inline di annullamento, l'import di `Alert`
se non più usato.

## Fuori scope

`CusAppDemo/`; altri `Modal` non di avviso (es. modal di prenotazione); cambi ai testi
oltre a "Ho capito".

## Verifica

Manuale su Android:
1. Ogni avviso della tabella appare con la grafica a tema e i pulsanti indicati.
2. Errore di prenotazione (es. posti esauriti) appare sopra il modal di prenotazione.
3. Back di Android chiude il dialog senza eseguire azioni.
4. Annulla prenotazione e Disconnetti eseguono l'azione solo col pulsante rosso.
