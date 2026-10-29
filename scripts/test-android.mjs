import assert from "node:assert/strict";

/** Exercise the same static app on narrow Android-sized touch screens. */
export async function testAndroid(browser, url, errors, apiRequests) {
  for (const width of [320, 360, 412]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${width}px: ${error.message}`));
    page.on("request", (request) => { if (new URL(request.url()).pathname.includes("/api/")) apiRequests.push(request.url()); });
    let acceptDialog = true;
    page.on("dialog", (dialog) => acceptDialog ? dialog.accept() : dialog.dismiss());
    await page.goto(url, { waitUntil: "networkidle" });
    // Clear the previous test's journal even on single-process Chromium builds.
    await page.evaluate(() => localStorage.removeItem("nihtlouw-comfort-trade-journal:v1"));
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".app-shell").waitFor();

    async function navigate(view) {
      const bottom = page.locator(".mobile-bottom-nav");
      const direct = { Overview: "Overview", "Trade journal": "Journal", Calendar: "Calendar" }[view];
      if (direct) await bottom.getByRole("button", { name: direct, exact: true }).click();
      else {
        await bottom.getByRole("button", { name: "More", exact: true }).click();
        await page.locator(".sidebar-nav").getByRole("button", { name: view, exact: true }).click();
      }
      await page.locator(`.view-motion[data-view="${view}"]`).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${view}: page fits at ${width}px`);
      const headings = await page.locator(".page-content h1, .page-content h2").allTextContents();
      const normalized = headings.map((heading) => heading.trim().replace(/\s+/g, " ").toLowerCase());
      assert.equal(new Set(normalized).size, normalized.length, `${view}: no repeated headings`);
      assert.equal(await page.locator(".page-content h1").count(), 1);
    }
    async function closeModal() {
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.locator(".modal").waitFor({ state: "detached" });
    }
    async function assertVisibleRow(row, amount) {
      await row.scrollIntoViewIfNeeded();
      assert.equal(await row.locator(".amount-cell").innerText(), amount);
      assert.equal(await row.locator(".trade-action button").isVisible(), true);
      const geometry = await row.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll("th,td")).every((cell) => {
          const box = cell.getBoundingClientRect();
          return box.left >= bounds.left - 1 && box.right <= bounds.right + 1 && cell.scrollWidth <= cell.clientWidth + 1;
        });
      });
      assert.equal(geometry, true, `trade details and edit control fit at ${width}px`);
    }

    // Visit every page using the real bottom bar and drawer, not hidden desktop controls.
    for (const view of ["Trade journal", "Analytics", "Weekly review", "Calendar", "Playbook", "Mindset", "Patience", "Goals", "Overview"]) {
      await navigate(view);
      if (view === "Playbook" || view === "Goals") assert.equal(await page.getByLabel("Filter by trading account").count(), 0);
      if (view === "Patience") {
        await page.getByRole("group", { name: "Patience page language" }).getByRole("button", { name: "ID", exact: true }).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `Patience ID fits at ${width}px`);
        const idHeadings = (await page.locator(".page-content h1, .page-content h2").allTextContents()).map((h) => h.trim().replace(/\s+/g, " ").toLowerCase());
        assert.equal(new Set(idHeadings).size, idHeadings.length, `Patience ID: no repeated headings at ${width}px`);
        await page.getByRole("group", { name: "Bahasa halaman Patience" }).getByRole("button", { name: "EN", exact: true }).click();
      }
    }
    assert.equal(await page.locator(".mobile-top-brand").isVisible(), true);
    assert.equal(await page.getByLabel("Take a breath").isVisible(), true);
    assert.ok((await page.getByLabel("Filter by trading account").boundingBox()).height >= 44);
    assert.ok((await page.locator(".mobile-bottom-nav button").first().boundingBox()).height >= 44);

    await navigate("Trade journal");
    assert.equal(await page.locator(".mobile-bottom-nav").getByRole("button", { name: "Journal", exact: true }).getAttribute("aria-current"), "page");
    await page.getByLabel("Search trades").focus();
    assert.notEqual(await page.locator(".search-box").evaluate((el) => getComputedStyle(el).outlineStyle), "none");
    assert.equal(await page.locator(".filters-toggle").getAttribute("aria-expanded"), "false");
    assert.equal(await page.getByLabel("Filter by result").isVisible(), false);
    await page.locator(".filters-toggle").click();
    await page.getByLabel("Filter by result").selectOption({ label: "Losses" });
    assert.ok(await page.locator(".trade-row").count() > 0);
    assert.equal(await page.locator(".trade-row .result-pill:not(.loss)").count(), 0);
    assert.equal(await page.locator(".filters-toggle b").innerText(), "1");
    await page.locator(".filters-toggle").click();
    assert.equal(await page.locator(".filters-toggle").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator(".filters-toggle b").innerText(), "1", "active filters remain discoverable when collapsed");
    await page.locator(".filters-toggle").click();
    await page.getByRole("button", { name: "Clear filters" }).click();
    assert.equal(await page.getByLabel("Filter by result").inputValue(), "All results");
    await page.locator(".filters-toggle").click();
    await page.getByLabel("Search trades").fill("BTC/USD");
    assert.ok(await page.locator(".trade-row").count() > 0);
    assert.equal(await page.locator(".trade-row").filter({ hasNotText: "BTC/USD" }).count(), 0);
    await page.getByLabel("Search trades").fill("");
    assert.equal(await page.locator(".trade-table").getAttribute("role"), "table");
    assert.ok(await page.getByRole("columnheader", { name: "Net P&L" }).count());
    assert.equal(await page.locator(".trade-table").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "mobile table has no hidden columns");

    // Create and edit a large exact amount on the phone, then verify calendar drill-down.
    await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
    assert.equal(await page.getByLabel("Asset / symbol").evaluate((el) => getComputedStyle(el).fontSize), "16px");
    const today = await page.getByLabel("Trade date").inputValue();
    await page.getByLabel("Asset / symbol").fill(`ANDROID-${width}`);
    await page.getByLabel("Net P&L (USD)").fill("123456.78");
    await page.getByLabel("Setup", { exact: true }).fill("A long setup name that should wrap instead of disappearing");
    await page.getByRole("button", { name: "Save trade", exact: true }).click();
    await page.locator(".modal").waitFor({ state: "detached" });
    const trade = page.locator(".trade-row").filter({ hasText: `ANDROID-${width}` });
    await assertVisibleRow(trade, "+$123,456.78");
    await page.getByLabel("Hide amounts").click();
    assert.equal(await trade.locator(".amount-cell").innerText(), "••••••");
    await page.getByLabel("Show amounts").click();
    await navigate("Calendar");
    assert.equal(await page.getByRole("heading", { name: "All-time summary" }).count(), 1);
    const calendarDay = page.locator(".calendar-day.today");
    assert.match(await calendarDay.getAttribute("aria-label"), /\$123,456\.78/);
    assert.equal(await calendarDay.locator(".calendar-value-marker").innerText(), "+");
    assert.equal(await calendarDay.locator(".calendar-value-full").isVisible(), false);
    const month = await page.locator(".calendar-nav strong").innerText();
    await page.getByLabel("Previous month").click();
    assert.notEqual(await page.locator(".calendar-nav strong").innerText(), month);
    await page.getByLabel("Next month").click();
    assert.equal(await page.locator(".calendar-nav strong").innerText(), month);
    await page.locator(".calendar-day.today").click();
    assert.match(await page.locator(".selected-day").innerText(), /Showing/);
    await assertVisibleRow(trade, "+$123,456.78");
    await page.getByLabel(`Edit ANDROID-${width} trade`).click();
    await page.getByLabel("Net P&L (USD)").fill("-98765.43");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.locator(".modal").waitFor({ state: "detached" });
    await assertVisibleRow(trade, "−$98,765.43");
    await navigate("Calendar");
    assert.equal(await page.locator(".calendar-day.today .calendar-value-marker").innerText(), "−");
    assert.match(await page.locator(".calendar-day.today").getAttribute("aria-label"), /−\$98,765\.43/);
    await page.locator(".calendar-day.today").click();
    await page.getByLabel(`Edit ANDROID-${width} trade`).click();
    await page.getByLabel("Net P&L (USD)").fill("0");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.locator(".modal").waitFor({ state: "detached" });
    await navigate("Calendar");
    assert.equal(await page.locator(".calendar-day.today .calendar-value-marker").innerText(), "=");
    assert.match(await page.locator(".calendar-day.today").getAttribute("aria-label"), /\$0\.00/);
    await page.locator(".calendar-day.today").click();
    await page.getByLabel("Clear selected day").click();

    // Import/export from the mobile toolbar; older trades must not be called monthly totals.
    await page.getByRole("button", { name: "Import CSV", exact: true }).click();
    const csv = `Ticker,Date,Net Profit,Market,Direction,Setup\nANDROID-CSV,2000-01-01,17.25,Stocks,Long,Review`;
    await page.locator(".csv-upload input").setInputFiles({ name: "mobile.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByText("1 ready to import").waitFor();
    await page.getByRole("button", { name: "Import 1 trade", exact: true }).click();
    await page.locator(".modal").waitFor({ state: "detached" });
    await page.getByLabel("Search trades").fill("ANDROID-CSV");
    assert.equal(await page.locator(".trade-row").count(), 1);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV", exact: true }).click()]);
    assert.match(download.suggestedFilename(), /\.csv$/i);
    await page.getByLabel("Search trades").fill("");
    await navigate("Calendar");
    const allTimeCount = Number(await page.locator(".calendar-summary > div:not(.widget-icon)").first().locator("strong").innerText());
    const monthCount = Number((await page.locator(".calendar-count").innerText()).split(" ")[0]);
    assert.ok(allTimeCount > monthCount, "all-time summary includes the imported trade outside this month");
    assert.ok(today.length === 10);

    await navigate("Playbook");
    await page.getByRole("button", { name: "Add a rule", exact: true }).first().click();
    await page.getByLabel("New playbook rule").fill("Review on Android");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const rule = page.locator(".rule-row").filter({ hasText: "Review on Android" });
    await rule.locator(".rule-toggle").click();
    assert.equal(await rule.locator(".rule-toggle").getAttribute("aria-pressed"), "true");
    acceptDialog = false;
    await page.getByLabel("Remove Review on Android").click();
    assert.equal(await rule.count(), 1, "cancelled removal keeps the rule");
    acceptDialog = true;
    await page.getByLabel("Remove Review on Android").click();
    assert.equal(await rule.count(), 0);

    await navigate("Mindset");
    await page.getByRole("button", { name: "Calm", exact: true }).click();
    await page.getByLabel("Today’s check-in note").fill("Ready for the session.");
    await page.getByRole("button", { name: /Save today/ }).click();
    await page.getByLabel("What went well?").fill("Waited for the setup.");
    await page.getByRole("button", { name: "Save reflection", exact: true }).click();
    assert.ok(await page.getByText("Waited for the setup.").count());
    await page.getByRole("button", { name: "Start breathing", exact: true }).click();
    await page.getByRole("button", { name: "Begin breathing", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Pause", exact: true }).isVisible(), true);
    await closeModal();

    await navigate("Goals");
    await page.getByLabel("Your intention").fill("Android habit");
    await page.getByRole("button", { name: "Add intention", exact: true }).click();
    const goal = page.locator(".goal-detail").filter({ hasText: "Android habit" });
    await goal.getByRole("button", { name: "Mark today", exact: true }).click();
    assert.match(await goal.locator(".goal-progress-label").innerText(), /1\s*\/\s*5/);
    await goal.getByRole("button", { name: "Undo", exact: true }).click();
    assert.match(await goal.locator(".goal-progress-label").innerText(), /0\s*\/\s*5/);
    await goal.getByRole("button", { name: "Mark today", exact: true }).click();
    await goal.getByRole("button", { name: "Reset", exact: true }).click();
    assert.match(await goal.locator(".goal-progress-label").innerText(), /0\s*\/\s*5/);

    await page.getByLabel("Open settings").click();
    await page.getByRole("button", { name: "☾ Dark mode", exact: true }).click();
    assert.equal(await page.locator(".app-shell").getAttribute("data-theme"), "dark");
    await page.getByRole("button", { name: "Data", exact: true }).click();
    assert.ok(await page.getByText(/No automatic sync or backup/).isVisible());
    await closeModal();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator(".app-shell").getAttribute("data-theme"), "dark");
    await navigate("Weekly review");
    assert.equal(await page.locator(".app-shell").getAttribute("data-theme"), "dark");
    await page.getByLabel("Previous week").click(); assert.ok(await page.getByRole("button", { name: "This week" }).isEnabled());
    await page.getByRole("button", { name: "This week" }).click();
    await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Risk", exact: true }).click();
    assert.equal(await page.getByLabel("Initial risk per trade (USD)").evaluate((el) => getComputedStyle(el).fontSize), "16px");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width); await closeModal();
    await navigate("Trade journal");
    await page.getByLabel("Search trades").fill(`ANDROID-${width}`);
    await assertVisibleRow(page.locator(".trade-row").first(), "$0.00");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    console.log(`PASS: ${width}px Android navigation, all pages, filters, trade cards, calendar, import/export, wellbeing, settings and persistence.`);
    // Keep contexts alive until browser cleanup.
  }

  // A phone in landscape can cross the tablet breakpoint while keeping a short viewport.
  for (const width of [651, 720]) {
    const context = await browser.newContext({ viewport: { width, height: 360 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${width}px landscape: ${error.message}`));
    page.on("request", (request) => { if (new URL(request.url()).pathname.includes("/api/")) apiRequests.push(request.url()); });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.removeItem("nihtlouw-comfort-trade-journal:v1"));
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".mobile-bottom-nav").getByRole("button", { name: "Journal", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert.equal(await page.locator(".table-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "landscape trade details fit without horizontal scrolling");
    const editFits = await page.locator(".table-scroll").evaluate((el) => {
      const bounds = el.getBoundingClientRect(); const edit = el.querySelector(".row-more").getBoundingClientRect();
      return edit.left >= bounds.left - 1 && edit.right <= bounds.right + 1;
    });
    assert.equal(editFits, true);
    await page.getByRole("button", { name: "Log a trade", exact: true }).first().click();
    assert.equal(await page.getByLabel("Asset / symbol").evaluate((el) => getComputedStyle(el).fontSize), "16px");
    await page.getByLabel("Asset / symbol").fill(`LANDSCAPE-${width}`);
    await page.getByLabel("Net P&L (USD)").fill("45.67");
    await page.getByRole("button", { name: "Save trade", exact: true }).click();
    await page.locator(".modal").waitFor({ state: "detached" });
    assert.ok(await page.getByLabel(`Edit LANDSCAPE-${width} trade`).count());
    await page.locator(".mobile-bottom-nav").getByRole("button", { name: "Calendar", exact: true }).click();
    const month = await page.locator(".calendar-nav strong").innerText();
    await page.getByLabel("Previous month").click();
    assert.notEqual(await page.locator(".calendar-nav strong").innerText(), month);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.locator(".mobile-bottom-nav").getByRole("button", { name: "More", exact: true }).click();
    await page.locator(".sidebar-nav").getByRole("button", { name: "Weekly review", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    await page.getByLabel("Previous week").click(); await page.getByRole("button", { name: "This week" }).click();
    await page.getByLabel("Open settings").click(); await page.getByRole("button", { name: "Risk", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    console.log(`PASS: ${width}×360 Android landscape trade details, forms, calendar and weekly review.`);
  }
}
