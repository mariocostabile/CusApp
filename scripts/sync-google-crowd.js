/**
 * Automated Google Maps Popular Times & Live Busyness Scraper for CUS Unical
 * Runs inside GitHub Actions (or locally with `node scripts/sync-google-crowd.js`)
 */

const fs = require('fs');
const path = require('path');

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/place/CUS+Unical/@39.3576258,16.2169142,17z?hl=it';
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
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('[CrowdSync] Navigating to Google Maps place...');
    await page.goto(GOOGLE_MAPS_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    // Handle cookie consent if visible
    try {
      const consentButton = await page.$('button[aria-label*="Accetta"], form[action*="consent"] button');
      if (consentButton) {
        console.log('[CrowdSync] Accepting Google cookie consent...');
        await consentButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => { });
      }
    } catch { }

    // Wait a bit for popular times to render
    await new Promise((r) => setTimeout(r, 4000));

    // Evaluate live busyness and popular times elements
    const scrapedResult = await page.evaluate(() => {
      let liveText = '';
      let livePercent = null;
      let liveStatus = 'Consueto';

      // Look for aria-label with live busyness
      const elementsWithAria = Array.from(document.querySelectorAll('[aria-label]'));
      for (const el of elementsWithAria) {
        const aria = el.getAttribute('aria-label') || '';
        // E.g. "Attualmente affollato al 75%, di solito al 75%"
        if (aria.includes('Attualmente') || aria.includes('In tempo reale') || aria.includes('affollato al')) {
          liveText = aria;
          const pctMatch = aria.match(/(\d+)%/);
          if (pctMatch) {
            livePercent = parseInt(pctMatch[1], 10);
          }
          if (aria.includes('Più affollato') || aria.includes('più affollato')) {
            liveStatus = 'Più affollato del solito';
          } else if (aria.includes('Meno affollato') || aria.includes('meno affollato')) {
            liveStatus = 'Meno affollato del solito';
          }
          break;
        }
      }

      return {
        liveText,
        livePercent,
        liveStatus,
      };
    });

    console.log('[CrowdSync] Scrape evaluation:', scrapedResult);

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    const CROWD_DAY_MAP = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
    const todayKey = CROWD_DAY_MAP[currentDay];

    const updatedData = {
      ...existingData,
      lastUpdated: now.toISOString(),
      placeName: 'CUS Unical - Centro Universitario Sportivo Cosenza',
      googleMapsUrl: GOOGLE_MAPS_URL,
      isLiveActive: scrapedResult.livePercent !== null,
    };

    if (scrapedResult.livePercent !== null) {
      updatedData.currentPercent = scrapedResult.livePercent;
      updatedData.comparisonStatus = scrapedResult.liveStatus;

      // Update today's current hour slot in weeklyData if available
      if (updatedData.weeklyData && updatedData.weeklyData[todayKey]) {
        const hours = updatedData.weeklyData[todayKey].hours || [];
        const slot = hours.find((h) => h.hour === currentHour);
        if (slot) {
          slot.percent = scrapedResult.livePercent;
          slot.comparisonStatus = scrapedResult.liveStatus;
          slot.isLive = true;
        }
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
