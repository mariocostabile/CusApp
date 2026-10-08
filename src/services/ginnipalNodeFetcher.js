const https = require('https');

const DEFAULT_EMAIL = process.env.GINNIPAL_EMAIL || '';
const DEFAULT_PASSWORD = process.env.GINNIPAL_PASSWORD || '';

function request(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          cookies: res.headers['set-cookie'] || [],
          body: data
        });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function mergeCookies(existing, incoming) {
  const map = new Map();
  for (const c of existing) {
    const part = c.split(';')[0];
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) map.set(part.substring(0, eqIdx).trim(), part.substring(eqIdx + 1).trim());
  }
  for (const c of incoming) {
    const part = c.split(';')[0];
    const eqIdx = part.indexOf('=');
    if (eqIdx !== -1) map.set(part.substring(0, eqIdx).trim(), part.substring(eqIdx + 1).trim());
  }
  const result = [];
  for (const [k, v] of map.entries()) {
    result.push(`${k}=${v}`);
  }
  return result;
}

function decodeHtml(html) {
  return html
    .replace(/&#160;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&#224;/g, 'à')
    .replace(/&#232;/g, 'è')
    .replace(/&#233;/g, 'é')
    .replace(/&#242;/g, 'ò')
    .replace(/&#249;/g, 'ù')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchLiveGinnipalFromNode(email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  let cookies = [];

  // Step 1: GET AltLogin.aspx
  const step1 = await request('https://ginnipal.it/CusCosenza/AltLogin.aspx', {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  cookies = mergeCookies(cookies, step1.cookies);
  const formKey1Match = step1.body.match(/var FormKey = "([^"]+)";/);
  if (!formKey1Match) throw new Error('FormKey non trovato in AltLogin.aspx');
  const formKey1 = formKey1Match[1];

  // Step 2: POST to Login
  const postParams = new URLSearchParams({
    FormKey: formKey1,
    Params: JSON.stringify({
      controls: {
        edEmail: { text: email, enabled: true, readonly: false },
        edPassword: { text: password, enabled: true, readonly: false }
      },
      sender: 'bLogin'
    })
  }).toString();

  const step2 = await request('https://ginnipal.it/CusCosenza/AltLogin.Ajax.ashx/Login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(postParams),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }, postParams);
  cookies = mergeCookies(cookies, step2.cookies);

  const loginRes = JSON.parse(step2.body);
  const redirectPath = loginRes.actions?.[0]?.redirect;
  if (!redirectPath) throw new Error('Login fallito o credenziali errate');

  // Step 3: GET ExtMain
  const step3 = await request('https://ginnipal.it/CusCosenza/' + redirectPath, {
    method: 'GET',
    headers: {
      'Cookie': cookies.join('; '),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  cookies = mergeCookies(cookies, step3.cookies);
  const formKeyExtMatch = step3.body.match(/var FormKey = "([^"]+)";/);
  if (!formKeyExtMatch) throw new Error('FormKey ExtMain non trovato');
  const extMainFormKey = formKeyExtMatch[1];

  // Step 4: GET Initialize on ExtMain
  const step4 = await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${extMainFormKey}`, {
    method: 'GET',
    headers: {
      'Cookie': cookies.join('; '),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  cookies = mergeCookies(cookies, step4.cookies);

  const subFormMatch = step4.body.match(/formKey=([^&"]+)/);
  const subFormKey = subFormMatch ? subFormMatch[1] : null;

  const initControls = JSON.parse(step4.body.replace(/^var initialData\s*=\s*/, '').replace(/;$/, '')).actions?.[0]?.controls || {};
  const name = initControls.mp_stPersona?.html || 'Tesserato CUS';
  const tessera = initControls.mp_stNumeroTessera?.html || '';

  // Step 5: GET SubForm Initialize
  let subInitControls = {};
  if (subFormKey) {
    const step5 = await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${subFormKey}`, {
      method: 'GET',
      headers: {
        'Cookie': cookies.join('; '),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    cookies = mergeCookies(cookies, step5.cookies);
    try {
      const parsed = JSON.parse(step5.body.replace(/^var initialData\s*=\s*/, '').replace(/;$/, ''));
      subInitControls = parsed.actions?.[0]?.controls || {};
    } catch (e) {
      console.log('Error parsing subInit:', e);
    }
  }

  // Parse Subscriptions from HTML
  const rawIscrizioni = decodeHtml(subInitControls.stIscrizioni?.html || '');
  const totMatch = rawIscrizioni.match(/Totale utilizzi:\s*(\d+)/i);
  const usuMatch = rawIscrizioni.match(/Usufruiti:\s*(\d+)/i);
  const rimMatch = rawIscrizioni.match(/Rimanenti:\s*(\d+)/i);
  const valMatch = rawIscrizioni.match(/(dal\s+\d{2}\/\d{2}\/\d{4}\s+al\s+\d{2}\/\d{2}\/\d{4})/i);

  // Parse Medical Cert
  const rawCert = decodeHtml(subInitControls.stDatiCertificatoMedico?.html || '');
  const certExpMatch = rawCert.match(/Scadenza:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const certIdoMatch = rawCert.match(/Idoneit[aà]:\s*([^<]+)/i);

  // Parse Reservations
  const reservationHtmls = [subInitControls.stPrenotazioni?.html || ''];
  const rowSuffixes = subInitControls.ctPrenotazioni?.rowSuffixes || [];
  for (const s of rowSuffixes) {
    if (subInitControls['stPrenotazione-' + s]?.html) {
      reservationHtmls.push(subInitControls['stPrenotazione-' + s].html);
    }
  }
  for (const k of Object.keys(subInitControls)) {
    if (k.startsWith('stPrenotazione-') && !reservationHtmls.includes(subInitControls[k]?.html)) {
      reservationHtmls.push(subInitControls[k].html);
    }
  }

  const combinedPrenotazioni = decodeHtml(reservationHtmls.join('\n'));
  const reservations = [];
  const pRegex = /Prenotazione n\.\s*(\d+)\s*per il giorno\s*(\d{2}\/\d{2}\/\d{4})\s*dalle\s*([\d:]+)\s*alle\s*([\d:]+)/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(combinedPrenotazioni)) !== null) {
    reservations.push({
      id: pMatch[1],
      title: 'Palestra body building',
      code: 'BB',
      quota: 'TURNO',
      date: pMatch[2],
      time: `${pMatch[3]} - ${pMatch[4]}`,
      rawText: pMatch[0]
    });
  }

  return {
    name,
    tessera,
    email,
    academicYear: '2026/2027',
    medicalCertExpiry: certExpMatch ? certExpMatch[1] : '',
    medicalCertFitness: certIdoMatch ? certIdoMatch[1].trim() : 'In regola',
    subscription: {
      title: 'Body Building',
      code: 'BB',
      total: totMatch ? parseInt(totMatch[1], 10) : 0,
      used: usuMatch ? parseInt(usuMatch[1], 10) : 0,
      remaining: rimMatch ? parseInt(rimMatch[1], 10) : 0,
      validity: valMatch ? valMatch[1] : ''
    },
    reservations
  };
}

async function bookSlotLiveGinnipal(
  email = DEFAULT_EMAIL,
  password = DEFAULT_PASSWORD,
  dateStr = '',
  timeSlot = ''
) {
  const dateParts = dateStr.split('/');
  const targetDateIso = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : dateStr;

  let cookies = [];
  const step1 = await request('https://ginnipal.it/CusCosenza/AltLogin.aspx');
  cookies = mergeCookies(cookies, step1.cookies);
  const formKey1Match = step1.body.match(/var FormKey = "([^"]+)";/);
  if (!formKey1Match) throw new Error('FormKey non trovato in AltLogin');
  const formKey1 = formKey1Match[1];

  const postParams = new URLSearchParams({
    FormKey: formKey1,
    Params: JSON.stringify({
      controls: {
        edEmail: { text: email, enabled: true, readonly: false },
        edPassword: { text: password, enabled: true, readonly: false }
      },
      sender: 'bLogin'
    })
  }).toString();

  const step2 = await request('https://ginnipal.it/CusCosenza/AltLogin.Ajax.ashx/Login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(postParams),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, postParams);
  cookies = mergeCookies(cookies, step2.cookies);
  const loginRes = JSON.parse(step2.body);
  const redirectPath = loginRes.actions?.[0]?.redirect;
  if (!redirectPath) throw new Error('Login non riuscito su GinniPAL');

  const step3 = await request('https://ginnipal.it/CusCosenza/' + redirectPath, {
    headers: { 'Cookie': cookies.join('; ') }
  });
  cookies = mergeCookies(cookies, step3.cookies);
  const extMainFormKey = step3.body.match(/var FormKey = "([^"]+)";/)[1];

  const step4 = await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${extMainFormKey}`, {
    headers: { 'Cookie': cookies.join('; ') }
  });
  cookies = mergeCookies(cookies, step4.cookies);
  const subFormKey = step4.body.match(/formKey=([^&"]+)/)[1];

  await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${subFormKey}`, {
    headers: { 'Cookie': cookies.join('; ') }
  });

  const prenPayload = new URLSearchParams({
    FormKey: subFormKey,
    Params: JSON.stringify({ controls: {}, sender: 'bPrenotazione' })
  }).toString();

  const prenRes = await request('https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Prenotazione', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(prenPayload),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, prenPayload);
  cookies = mergeCookies(cookies, prenRes.cookies);

  const prenData = JSON.parse(prenRes.body);
  const corsiUrl = prenData.actions?.[0]?.navigate?.url;
  if (!corsiUrl) throw new Error('Impossibile accedere all\'elenco corsi');
  const corsiSubKey = corsiUrl.match(/formKey=([^&]+)/)[1];

  await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${corsiSubKey}`, {
    headers: { 'Cookie': cookies.join('; ') }
  });

  const dettPayload = new URLSearchParams({
    FormKey: corsiSubKey,
    Params: JSON.stringify({ controls: {}, sender: 'bDettagli-1' })
  }).toString();

  const dettRes = await request('https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Dettagli', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(dettPayload),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, dettPayload);
  cookies = mergeCookies(cookies, dettRes.cookies);

  const dettData = JSON.parse(dettRes.body);
  const iscrizioneUrl = dettData.actions?.[0]?.navigate?.url;
  if (!iscrizioneUrl) throw new Error('Modulo di prenotazione non disponibile');
  const iscrizioneSubKey = iscrizioneUrl.match(/formKey=([^&]+)/)[1];

  await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${iscrizioneSubKey}`, {
    headers: { 'Cookie': cookies.join('; ') }
  });

  const dateChangePayload = new URLSearchParams({
    FormKey: iscrizioneSubKey,
    Params: JSON.stringify({
      sender: 'edDataPrenotata',
      changedControl: 'edDataPrenotata',
      controls: {
        edQuota: { value: 'TURNO', enabled: true },
        edDataPrenotata: { date: targetDateIso, enabled: true, readonly: false },
        edOrarioPrenotato: { value: '-1', enabled: true }
      }
    })
  }).toString();

  const dateChangeRes = await request('https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/DataPrenotataChanged', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(dateChangePayload),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, dateChangePayload);
  cookies = mergeCookies(cookies, dateChangeRes.cookies);

  const dateChangeData = JSON.parse(dateChangeRes.body);
  const slotItems = dateChangeData.actions?.[0]?.controls?.edOrarioPrenotato?.items || [];
  
  let matchedSlot = slotItems.find((item) => item.label && (item.label.trim() === timeSlot.trim() || item.label.startsWith(timeSlot.split(' - ')[0])));
  if (!matchedSlot && slotItems.length > 0) {
    matchedSlot = slotItems.find((item) => item.value !== '-1' && item.label);
  }

  if (!matchedSlot || matchedSlot.value === '-1') {
    throw new Error(`Orario ${timeSlot} non disponibile per il ${dateStr} (posti esauriti o turno non attivo)`);
  }

  const slotChangePayload = new URLSearchParams({
    FormKey: iscrizioneSubKey,
    Params: JSON.stringify({
      sender: 'edOrarioPrenotato',
      changedControl: 'edOrarioPrenotato',
      controls: {
        edQuota: { value: 'TURNO', enabled: true },
        edDataPrenotata: { date: targetDateIso, enabled: true, readonly: false },
        edOrarioPrenotato: { value: matchedSlot.value, enabled: true }
      }
    })
  }).toString();

  await request('https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/OrarioPrenotatoChanged', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(slotChangePayload),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, slotChangePayload);

  const procediPayload = new URLSearchParams({
    FormKey: iscrizioneSubKey,
    Params: JSON.stringify({
      sender: 'bProcedi',
      controls: {
        edQuota: { value: 'TURNO', enabled: true },
        edDataPrenotata: { date: targetDateIso, enabled: true, readonly: false },
        edOrarioPrenotato: { value: matchedSlot.value, enabled: true }
      }
    })
  }).toString();

  const procediRes = await request('https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Procedi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(procediPayload),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, procediPayload);
  cookies = mergeCookies(cookies, procediRes.cookies);

  const procediData = JSON.parse(procediRes.body);
  const riepilogoUrl = procediData.actions?.[0]?.navigate?.url;
  if (!riepilogoUrl) throw new Error('Impossibile raggiungere il riepilogo dell\'ordine');
  const riepilogoSubKey = riepilogoUrl.match(/formKey=([^&]+)/)[1];

  await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${riepilogoSubKey}`, {
    headers: { 'Cookie': cookies.join('; ') }
  });

  const confermaPayload = new URLSearchParams({
    FormKey: riepilogoSubKey,
    Params: JSON.stringify({
      sender: 'bConferma',
      controls: {}
    })
  }).toString();

  const confermaRes = await request('https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Conferma', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(confermaPayload),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, confermaPayload);
  cookies = mergeCookies(cookies, confermaRes.cookies);

  // Complete checkout lifecycle by following redirect to EsitoPagamento to trigger confirmation email & ticket generation
  try {
    const confermaData = JSON.parse(confermaRes.body);
    const redirectUrl = confermaData.actions?.[0]?.redirect || confermaData.actions?.[0]?.navigate?.url || '';
    if (redirectUrl) {
      const urlBeforeHash = redirectUrl.split('#')[0];
      const stepEsito = await request(`https://ginnipal.it/CusCosenza/${urlBeforeHash}`, {
        headers: { 'Cookie': cookies.join('; ') }
      });
      cookies = mergeCookies(cookies, stepEsito.cookies);

      const subKeyMatch = redirectUrl.match(/[#&]formKey=([^&#]+)/i);
      const mainKeyMatch = redirectUrl.match(/FormKey=([^&#]+)/i);
      const esitoSubKey = subKeyMatch ? subKeyMatch[1] : (mainKeyMatch ? mainKeyMatch[1] : null);

      if (esitoSubKey) {
        const esitoInitRes = await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${esitoSubKey}`, {
          headers: { 'Cookie': cookies.join('; ') }
        });
        cookies = mergeCookies(cookies, esitoInitRes.cookies);
      }
    }
  } catch (err) {
    console.log('[GinnipalNodeFetcher] Notice on EsitoPagamento:', err.message);
  }

  return await fetchLiveGinnipalFromNode(email, password);
}

async function cancelBookingLiveGinnipal(
  email = DEFAULT_EMAIL,
  password = DEFAULT_PASSWORD,
  reservationId = ''
) {
  let cookies = [];
  const step1 = await request('https://ginnipal.it/CusCosenza/AltLogin.aspx');
  cookies = mergeCookies(cookies, step1.cookies);
  const formKey1Match = step1.body.match(/var FormKey = "([^"]+)";/);
  if (!formKey1Match) throw new Error('FormKey non trovato in AltLogin');
  const formKey1 = formKey1Match[1];

  const postParams = new URLSearchParams({
    FormKey: formKey1,
    Params: JSON.stringify({
      controls: {
        edEmail: { text: email, enabled: true, readonly: false },
        edPassword: { text: password, enabled: true, readonly: false }
      },
      sender: 'bLogin'
    })
  }).toString();

  const step2 = await request('https://ginnipal.it/CusCosenza/AltLogin.Ajax.ashx/Login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(postParams),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, postParams);
  cookies = mergeCookies(cookies, step2.cookies);
  const redirectPath = JSON.parse(step2.body).actions?.[0]?.redirect;
  if (!redirectPath) throw new Error('Login fallito');

  const step3 = await request('https://ginnipal.it/CusCosenza/' + redirectPath, {
    headers: { 'Cookie': cookies.join('; ') }
  });
  cookies = mergeCookies(cookies, step3.cookies);
  const extMainFormKey = step3.body.match(/var FormKey = "([^"]+)";/)[1];

  const step4 = await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${extMainFormKey}`, {
    headers: { 'Cookie': cookies.join('; ') }
  });
  cookies = mergeCookies(cookies, step4.cookies);
  const subFormKey = step4.body.match(/formKey=([^&"]+)/)[1];

  const subRes = await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/Initialize?FormKey=${subFormKey}`, {
    headers: { 'Cookie': cookies.join('; ') }
  });

  const subData = JSON.parse(subRes.body.replace(/^var initialData\s*=\s*/, '').replace(/;$/, ''));
  const controls = subData.actions?.[0]?.controls || {};

  let targetSuffix = '1';
  const rowSuffixes = controls.ctPrenotazioni?.rowSuffixes || ['1'];
  for (const s of rowSuffixes) {
    const rowHtml = controls['stPrenotazione-' + s]?.html || '';
    if (reservationId && rowHtml.includes(reservationId)) {
      targetSuffix = s;
      break;
    }
  }

  const cancelPayload = new URLSearchParams({
    FormKey: subFormKey,
    Params: JSON.stringify({
      sender: `bAnnullaPrenotazione-${targetSuffix}`,
      controls: {}
    })
  }).toString();

  const cancelRes = await request('https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/AnnullaPrenotazione', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(cancelPayload),
      'Cookie': cookies.join('; '),
      'X-Requested-With': 'XMLHttpRequest'
    }
  }, cancelPayload);
  cookies = mergeCookies(cookies, cancelRes.cookies);

  // GinniPAL sends a confirmAlert action requiring a second confirmation request with userResponses
  try {
    const cancelData = JSON.parse(cancelRes.body);
    const alert = cancelData.actions?.[0]?.confirmAlert;
    if (alert && alert.yesCommand) {
      const confirmPayload = new URLSearchParams({
        FormKey: subFormKey,
        Params: JSON.stringify({
          sender: `bAnnullaPrenotazione-${targetSuffix}`,
          userResponses: {
            [alert.name || 'ConfermaAnnullamentoPrenotazione']: {
              promptType: 'confirmAlert',
              value: 'yes'
            }
          },
          controls: {}
        })
      }).toString();

      const confirmRes = await request(`https://ginnipal.it/CusCosenza/ExtMain.Ajax.ashx/${alert.yesCommand}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Content-Length': Buffer.byteLength(confirmPayload),
          'Cookie': cookies.join('; '),
          'X-Requested-With': 'XMLHttpRequest'
        }
      }, confirmPayload);
      cookies = mergeCookies(cookies, confirmRes.cookies);
    }
  } catch (err) {
    console.log('[GinnipalNodeFetcher] Notice on Annulla confirmation:', err.message);
  }

  return await fetchLiveGinnipalFromNode(email, password);
}

module.exports = {
  fetchLiveGinnipalFromNode,
  bookSlotLiveGinnipal,
  cancelBookingLiveGinnipal
};
