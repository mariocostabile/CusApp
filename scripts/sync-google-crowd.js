/**
 * Automated Google Maps Popular Times & Live Busyness Scraper for CUS Unical
 * Runs inside GitHub Actions (or locally with `node scripts/sync-google-crowd.js`)
 */

const fs = require('fs');
const path = require('path');

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/place/CUS+Unical/@39.3576258,16.2169142,17z?hl=it';
const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q=CUS+Unical+Quattromiglia&hl=it&gl=it';
const OUTPUT_FILE = path.join(__dirname, '..', 'crowd_live.json');

async function scrapeGoogleCrowd() {
  console.log('[CrowdSync] Starting Google Maps sync for CUS Unical...');
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (err) {
    console.warn('[CrowdSync] Puppeteer not installed. Skipping live headless scrape.');
    return;
  }

  // Load existing file as baseline
  let existingData = {};
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[CrowdSync] Could not read existing crowd_live.json:', e.message);
  }

  // The runner is in UTC: take day and hour in Italian time, the same used in weeklyData
  const romeParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const currentHour = parseInt(romeParts.hour, 10);
  const todayKey = { Sun: 'domenica', Mon: 'lunedi', Tue: 'martedi', Wed: 'mercoledi', Thu: 'giovedi', Fri: 'venerdi', Sat: 'sabato' }[romeParts.weekday];
  // CUS opens 10-22, Saturday 10-14, closed Sunday
  const closeHour = todayKey === 'sabato' ? 14 : todayKey === 'domenica' ? 0 : 22;
  if (currentHour < 10 || currentHour >= closeHour) {
    console.log(`[CrowdSync] CUS closed (${todayKey} ${currentHour}:xx Rome time), skipping.`);
    return;
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--lang=it-IT,it',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Maps serves a "limited view" without popular times to headless browsers: use the Search knowledge panel
    console.log('[CrowdSync] Navigating to Google Search knowledge panel...');
    await page.goto(GOOGLE_SEARCH_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    // The consent page has hidden duplicate buttons and "Rifiuta tutto" first: click the visible "Accetta tutto"
    const accepted = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => /accetta tutto/i.test(b.innerText) && b.offsetParent
      );
      if (btn) btn.click();
      return !!btn;
    });
    if (accepted) {
      console.log('[CrowdSync] Accepted Google cookie consent.');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
    }
    await new Promise((r) => setTimeout(r, 3000));

    if (page.url().includes('/sorry/')) {
      console.warn('[CrowdSync] Google served a captcha (/sorry): live data unavailable for this run.');
    }

    const scrapedResult = await page.evaluate(() => {
      // Screen-reader text of the knowledge panel, e.g. "In tempo reale: Meno affollato del solito"
      const liveRegion = Array.from(document.querySelectorAll('[aria-live]')).find((e) =>
        /In tempo reale/i.test(e.textContent || '')
      );
      const liveText = liveRegion ? liveRegion.textContent.trim() : '';
      let liveStatus = 'Consueto';
      if (/Più affollato/i.test(liveText)) liveStatus = 'Più affollato del solito';
      else if (/Meno affollato/i.test(liveText)) liveStatus = 'Meno affollato del solito';
      return { isLive: !!liveText, liveStatus, liveText, pageUrl: location.href };
    });

    console.log('[CrowdSync] Scrape evaluation:', scrapedResult);

    const now = new Date();

    // Drop live readings left by previous runs, so they never outlive their hour
    for (const day of Object.values(existingData.weeklyData || {})) {
      for (const h of day.hours || []) {
        if (h.isLive) {
          delete h.isLive;
          h.percent = h.typical;
          h.comparisonStatus = 'Consueto';
        }
      }
    }

    const updatedData = {
      ...existingData,
      lastUpdated: now.toISOString(),
      placeName: 'CUS Unical - Centro Universitario Sportivo Cosenza',
      googleMapsUrl: GOOGLE_MAPS_URL,
      isLiveActive: scrapedResult.isLive,
      comparisonStatus: scrapedResult.isLive ? scrapedResult.liveStatus : 'Consueto',
    };

    // Google gives live crowding in words only: percent stays the typical value, the status goes on the current hour
    const slot = ((updatedData.weeklyData || {})[todayKey]?.hours || []).find((h) => h.hour === currentHour);
    if (slot) {
      updatedData.currentPercent = slot.typical;
      updatedData.currentTypical = slot.typical;
      if (scrapedResult.isLive) {
        slot.comparisonStatus = scrapedResult.liveStatus;
        slot.isLive = true;
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(updatedData, null, 2), 'utf8');
    console.log('[CrowdSync] Successfully updated crowd_live.json at:', updatedData.lastUpdated);
  } catch (err) {
    console.error('[CrowdSync] Error during scraping:', err.message);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  scrapeGoogleCrowd();
}

module.exports = { scrapeGoogleCrowd };
