async function clickNextContinue(page) {
    try {
        const nextBtn = await page.$('.tasksBtnext');
        if (!nextBtn) return false;

        console.log('  → Detectado .tasksBtnext');
        await nextBtn.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(1000);

        const iframe = await page.$('#colorBoxIframe');
        if (iframe) {
            const frame = await iframe.contentFrame();
            if (frame) {
                const contBtn = frame.locator('text=Continue');
                if (await contBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                    await contBtn.click();
                    console.log('  → Click en Continue (iframe)');
                    await page.waitForTimeout(1500);
                    return true;
                }
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

module.exports = { clickNextContinue };
