const PLAY_SELECTORS = [
    '.learning__RAMRButton',
    '.learning__RAMRButton--play',
    '#CTrackerPlayBtn',
    '.learning__playBtn',
    '.learning__videoBtn',
    '.learning__RAMR',
    'div[class*="RAMR"]',
    'button:has-text("Play")',
    'a:has-text("Play")',
    'div[class*="playButton"]',
    '.learning__btPlay'
];

async function clickPlay(page) {
    for (const sel of PLAY_SELECTORS) {
        try {
            const el = await page.$(sel);
            if (el) {
                console.log(`  → Encontrado: "${sel}"`);
                try {
                    await el.click({ force: true, timeout: 5000 });
                } catch (e) {
                    await page.evaluate((el) => el.click(), el);
                }
                return true;
            }
        } catch (e) {
            continue;
        }
    }
    return false;
}

module.exports = { clickPlay };