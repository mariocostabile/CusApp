import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { AppDialog, type AppDialogAction } from '@/components/app-dialog';
import { checkForUpdate, type AvailableUpdate } from '@/services/updateService';
import { downloadAndInstall } from '@/services/updateInstaller';

type Phase =
  | { kind: 'ready' }
  | { kind: 'downloading'; progress: number | null }
  | { kind: 'failed' };

export function UpdatePrompt() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  // "Più tardi" vale per tutta la sessione: la stessa versione non ricompare a ogni ritorno nell'app.
  const dismissedVersion = useRef<string | null>(null);

  useEffect(() => {
    const check = () =>
      checkForUpdate().then((next) => {
        if (next && next.version !== dismissedVersion.current) setUpdate((prev) => prev ?? next);
      });
    check();
    // Ricontrolla anche al ritorno in primo piano, non solo all'avvio a freddo.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  if (!update) return null;

  const downloading = phase.kind === 'downloading';
  const dismissible = !update.mandatory && !downloading;

  const install = async () => {
    setPhase({ kind: 'downloading', progress: 0 });
    try {
      await downloadAndInstall(update, (progress) => setPhase({ kind: 'downloading', progress }));
      // Se l'utente annulla l'installer, il popup torna disponibile.
      setPhase({ kind: 'ready' });
    } catch {
      setPhase({ kind: 'failed' });
    }
  };

  const later: AppDialogAction[] = dismissible ? [{ label: 'Più tardi', variant: 'secondary' }] : [];
  let message: string;
  let actions: AppDialogAction[];

  if (phase.kind === 'downloading') {
    message =
      phase.progress === null
        ? 'Download in corso…'
        : `Download ${Math.round(phase.progress * 100)}%…`;
    actions = [];
  } else if (phase.kind === 'failed') {
    message = "Download o installazione non riusciti. Riprova oppure scarica l'APK dal browser.";
    actions = [
      { label: 'Riprova', variant: 'danger', keepOpen: true, onPress: install },
      {
        label: 'Apri nel browser',
        variant: 'secondary',
        keepOpen: true,
        onPress: () => Linking.openURL(update.apkUrl),
      },
      ...later,
    ];
  } else {
    message = `${update.notes || "È disponibile una nuova versione dell'app."}\n\nSe Android lo chiede, consenti a CusApp di installare app sconosciute.`;
    actions = [{ label: 'Aggiorna ora', variant: 'danger', keepOpen: true, onPress: install }, ...later];
  }

  return (
    <AppDialog
      visible
      icon="🚀"
      title={`${update.mandatory ? 'Aggiornamento obbligatorio' : 'Nuova versione'} ${update.version}`}
      message={message}
      actions={actions}
      dismissible={dismissible}
      onClose={() => {
        if (!dismissible) return;
        dismissedVersion.current = update.version;
        setUpdate(null);
      }}
    />
  );
}
