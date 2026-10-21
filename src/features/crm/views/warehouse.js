/** Preserved prototype views/warehouse. Live services will replace browser mutations in runtime.js. */
export function createWarehouse(ctx) {
  function renderInventory() {
    if (ctx.inventoryControls) return ctx.inventoryControls.view();
    const readOnly = !ctx.hasCapability("inventory_adjust"),
      installer = ctx.isInstaller(),
      q = ctx.ui.inventorySearch.toLowerCase(),
      products = ctx.state.products.filter(
        (p) =>
          (!ctx.workProducts() || ctx.workProducts().has(p.id)) &&
          `${p.name} ${p.sku} ${p.barcode} ${p.location}`
            .toLowerCase()
            .includes(q),
      ),
      stockValue = ctx.state.products.reduce(
        (s, p) => s + p.onHand * p.costPrice,
        0,
      ),
      low = ctx.state.products.filter(ctx.lowStockProduct).length,
      reserved = ctx.state.products.reduce((s, p) => s + p.reserved, 0);
    const rows = products
      .map((p) => {
        const a = p.onHand - p.reserved,
          status =
            a <= 0
              ? "Out of stock"
              : ctx.lowStockProduct(p)
                ? "Low stock"
                : "In stock";
        return `<tr><td><strong>${ctx.esc(p.name)}</strong><div class="secondary-line">${ctx.esc(p.sku)} · ${ctx.esc(p.barcode)}</div></td><td>${ctx.esc(p.location)}</td><td class="strong">${p.onHand}</td><td>${p.reserved}</td><td class="strong">${a}</td><td>${ctx.badge(status)}</td>${readOnly ? "" : `<td><button class="btn secondary sm" data-action="adjust-stock" data-id="${p.id}">Adjust stock</button></td>`}</tr>`;
      })
      .join("");
    return `${ctx.header("WAREHOUSE CONTROL", installer ? "Inventory availability." : "Inventory with a complete movement trail.", readOnly ? "Read-only access: view products, locations and available stock." : "Managers and administrators can adjust stock, but posted movements remain visible and immutable.", readOnly ? ctx.badge("Read only") : `<button class="btn" data-action="adjust-stock" data-id="${ctx.state.products[0]?.id || ""}">${ctx.icon("plus")} Stock adjustment</button>`)}<div class="metric-grid" style="grid-template-columns:repeat(3,1fr)">${installer ? ctx.metric("Products", String(ctx.state.products.length), "Inventory catalogue · read only", "box", "green") : ctx.metric("Stock value", ctx.money(stockValue), "Based on current cost prices", "receipt", "green")}${ctx.metric("Low-stock products", String(low), "Below 3 available units or at/below minimum", "box", "red")}${ctx.metric("Reserved units", String(reserved), "Allocated to confirmed jobs", "box", "amber")}</div><div class="card toolbar"><input class="input" style="max-width:none" placeholder="Search SKU, barcode, product or location" value="${ctx.attr(ctx.ui.inventorySearch)}" data-filter="inventorySearch" data-focus="inventory-search"></div><div class="card"><div class="table-wrap desktop-table"><table class="data-table"><thead><tr><th>Product</th><th>Location</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Status</th>${readOnly ? "" : "<th></th>"}</tr></thead><tbody>${rows}</tbody></table></div><div class="cards-mobile">${products
      .map((p) => {
        const a = p.onHand - p.reserved,
          status =
            a <= 0
              ? "Out of stock"
              : ctx.lowStockProduct(p)
                ? "Low stock"
                : "In stock";
        return `<div class="mobile-card"><div class="row gap10"><span class="icon-box">${ctx.icon("box")}</span><div class="grow"><strong>${ctx.esc(p.name)}</strong><div class="secondary-line">${p.sku} · ${p.location}</div></div>${ctx.badge(status)}</div><div class="row wrap gap6 mt12">${ctx.badge(`On hand ${p.onHand}`)}${ctx.badge(`Reserved ${p.reserved}`)}${ctx.badge(`Available ${a}`)}</div>${readOnly ? "" : `<button class="btn secondary sm mt12" data-action="adjust-stock" data-id="${p.id}">Adjust stock</button>`}</div>`;
      })
      .join("")}</div></div>${
      installer
        ? ""
        : `<div class="card card-pad mt16">${ctx.sectionTitle("Recent stock movements", "Every adjustment records who, when and why.")} ${ctx.state.stockMovements
            .filter(
              (m) =>
                !ctx.workJobId() ||
                m.jobId === ctx.workJobId() ||
                ctx.workProducts()?.has(m.productId),
            )
            .slice(0, 8)
            .map(
              (m) =>
                `<div class="list-row"><span class="icon-box ${m.quantity > 0 ? "green" : "red"}">${ctx.icon(m.quantity > 0 ? "download" : "arrow")}</span><div class="grow"><div class="list-title">${ctx.esc(m.productName)}</div><div class="list-sub">${ctx.esc(m.type)} · ${ctx.esc(m.reason)}</div></div><div class="right"><strong style="color:${m.quantity > 0 ? "var(--green)" : "var(--red)"}">${m.quantity > 0 ? "+" : ""}${m.quantity}</strong><div class="secondary-line">${ctx.fmt(m.createdAt, true)}</div></div></div>`,
            )
            .join("")}</div>`
    }`;
  }

  function renderStockAlerts() {
    if (!["manager", "admin", "super_admin"].includes(ctx.currentUser()?.role))
      return "";
    const low = ctx.state.products
        .filter(ctx.lowStockProduct)
        .sort((a, b) => ctx.availableStock(a) - ctx.availableStock(b)),
      tasks = ctx.state.tasks.filter(
        (t) =>
          t.workflowAction === "collection-restock" &&
          (t.status !== "Completed" || !t.shortageResolvedAt),
      );
    return `<section class="card card-pad" style="margin-bottom:20px" data-stock-alerts>${ctx.sectionTitle("Stock alerts & urgent restocking", "Alert below 3 available units; existing product minimums also apply.", `<button class="btn ghost sm" data-page="inventory">Open inventory</button>`)}${tasks.map((t) => `<div class="list-row"><span class="icon-box red">${ctx.icon("tasks")}</span><div class="grow"><div class="list-title">${ctx.esc(t.title)}</div><div class="list-sub">${t.shortfall ? `${t.shortfall} additional unit(s) needed` : "Stock available — finish the ordering task"} · ${ctx.esc(ctx.userName(t.assignedTo))}</div><div class="row wrap gap6 mt8">${ctx.badge("Urgent")}${ctx.badge(t.status)}</div></div><button class="btn secondary sm" data-action="open-task-work" data-id="${ctx.attr(t.id)}">Review task</button></div>`).join("")}${low.map((p) => `<div class="list-row"><span class="icon-box ${ctx.availableStock(p) <= 0 ? "red" : "amber"}">${ctx.icon("box")}</span><div class="grow"><div class="list-title">${ctx.esc(p.name)}</div><div class="list-sub">${ctx.esc(p.sku)} · ${ctx.esc(p.warehouse)} / ${ctx.esc(p.location)}</div><div class="small mt8">${p.onHand} on hand · ${p.reserved} reserved · <strong>${ctx.availableStock(p)} available</strong></div></div>${ctx.badge(ctx.availableStock(p) <= 0 ? "Out of stock" : "Low stock")}</div>`).join("")}${!low.length && !tasks.length ? '<p class="muted small">No stock alerts or pending collection restock tasks.</p>' : ""}</section>`;
  }

  function renderPickingState(p, j) {
    const complete = ctx.matchesComplete(j),
      location = p.pickupLocation || "Not confirmed";
    let title,
      detail,
      action = "";
    const nextButton = (target, label) => {
      const error = ctx.jobTransitionError(j, target);
      return `<button class="btn" data-action="job-status" data-id="${ctx.attr(j.id)}" data-status="${ctx.attr(target)}" ${error ? "disabled" : ""}>${label}</button>${error ? `<p class="small muted">${ctx.esc(error)}</p>` : ""}`;
    };
    if (["Confirmed", "Stock Shortage"].includes(j.status)) {
      title = "Start pickup";
      detail =
        "The pickup step only confirms the warehouse location. Product matching happens at collection.";
      action = nextButton("Picking", "Start pickup");
    } else if (j.status === "Picking") {
      title = "Pickup · warehouse location";
      detail =
        "Select and confirm where the products will be collected. No product scanning is required at this stage.";
      if (!j.collectionIssuedAt) {
        action = `<div class="field" style="width:100%"><label for="pickup-location">Warehouse location</label><select class="select" id="pickup-location" ${ctx.canConfirmPickup(p) ? "" : "disabled"}><option value="">Select warehouse location</option>${ctx
          .pickupLocations(j)
          .map(
            (v) =>
              `<option value="${ctx.attr(v)}" ${p.pickupLocation === v ? "selected" : ""}>${ctx.esc(v)}</option>`,
          )
          .join(
            "",
          )}</select></div><button class="btn" data-action="confirm-pickup-location" data-id="${ctx.attr(p.id)}" ${ctx.canConfirmPickup(p) ? "" : "disabled"}>Confirm location &amp; continue</button>${p.pickupConfirmedAt ? nextButton("Ready for Collection", "Continue to collection") : ""}`;
      }
    } else if (j.status === "Ready for Collection") {
      title = complete
        ? "All products scan matched"
        : "Collection · match required products";
      detail =
        "Match each required quantity by camera, barcode scanner or manual barcode / SKU entry. The final match completes the collection task and moves the job to Collected when all stage requirements are clear.";
      if (complete && !j.collectionIssuedAt) {
        const error =
          ctx.jobTransitionError(j, "Collected") || ctx.collectionStockError(j);
        action = `<button class="btn" data-action="confirm-collection" data-id="${ctx.attr(j.id)}" ${error || !ctx.canCollectJob(j) ? "disabled" : ""}>Complete collection</button>${error ? `<p class="small muted">${ctx.esc(error)}</p>` : ""}`;
      }
      if (!p.pickupConfirmedAt) {
        detail =
          "This job reached collection without a confirmed pickup location. Reopen pickup and confirm the warehouse location first.";
        if (ctx.isStatusAdmin() && !j.collectionIssuedAt)
          action = `<button class="btn" data-action="repair-collection" data-id="${ctx.attr(j.id)}">Reopen pickup</button>`;
      }
    } else if (j.status === "On Hold") {
      title = "Job on hold";
      detail = "Resolve the hold before continuing pickup or collection.";
    } else if (j.collectionIssuedAt) {
      title = "Collection completed";
      detail = `All products were matched and warehouse stock was issued on ${ctx.fmt(j.collectionIssuedAt, true)}. Continue with installation scheduling.`;
      action = `<button class="btn secondary" data-action="open-job-work" data-id="${ctx.attr(j.id)}">Open current job stage</button>`;
    } else {
      title = "Collection needs review";
      detail =
        "The job was advanced without a recorded collection. Review the job history before reopening collection. Reopening does not deduct stock.";
      if (ctx.isStatusAdmin())
        action = `<button class="btn" data-action="repair-collection" data-id="${ctx.attr(j.id)}">${p.pickupConfirmedAt ? "Reopen collection" : "Reopen pickup"}</button>`;
    }
    if (
      j.collectionIssuedAt &&
      ["Picking", "Ready for Collection"].includes(j.status)
    ) {
      title = "Collection already recorded";
      detail =
        "This job was moved backwards after collection. Its stock has already been issued; collection cannot deduct it again.";
      action = "";
    }
    return `<section class="form-note mt16" data-picking-state><div class="row wrap gap8">${ctx.badge(`Job stage: ${j.status}`)}${ctx.badge(p.pickupConfirmedAt ? "Location confirmed" : "Location required")}</div><h3 class="mt12">${ctx.esc(title)}</h3><p class="small">${ctx.esc(detail)}</p><p class="small"><strong>Pickup location:</strong> ${ctx.esc(location)}</p><div class="row wrap gap8">${action}<button class="btn secondary" data-action="open-job" data-id="${ctx.attr(j.id)}">Job details &amp; tasks</button></div></section>`;
  }

  function renderPicking() {
    const requests = ctx.renderProductRequests();
    if (ctx.ui.productRequestId) return requests;
    return (
      (ctx.inventoryControls ? ctx.inventoryControls.view("picking") : "") +
      requests +
      ctx.renderOriginalPicking()
    );
  }

  function renderOriginalPicking() {
    const lists = ctx.visiblePickLists();
    if (!lists.length)
      return `${ctx.header("PICKUP & COLLECTION", "Warehouse handover.", "No Pick Lists are available for this selection.")}<div class="card empty">No Pick Lists available.</div>`;
    if (!lists.some((p) => p.id === ctx.ui.scanPickId))
      ctx.ui.scanPickId = lists[0].id;
    const selected = lists.find((p) => p.id === ctx.ui.scanPickId),
      job = ctx.jobOf(selected.jobId),
      error = ctx.pickScanError(selected),
      canScan = !error,
      required = job.items.reduce((n, x) => n + Number(x.quantityRequired), 0),
      matched = job.items.reduce(
        (n, x) => n + Number(x.quantityMatched || 0),
        0,
      );
    return `${ctx.header("PICKUP & COLLECTION", "Confirm location. Match products. Collect.", "Picking confirms the warehouse location. Ready for Collection verifies product quantities and records the handover.")}<div class="scanner"><div class="card card-pad">${ctx.sectionTitle("Pick Lists", "Select a job")}${lists
      .map((p) => {
        const j = ctx.jobOf(p.jobId);
        return `<button class="account ${p.id === selected.id ? "active" : ""}" style="width:100%;margin-bottom:8px" data-action="select-pick" data-id="${ctx.attr(p.id)}"><span class="icon-box">${ctx.icon("box")}</span><span class="grow"><span class="title">${ctx.esc(p.number)}</span><span class="detail">${ctx.esc(j.number)} · ${ctx.esc(j.customer)} · ${ctx.esc(j.status)}</span></span>${ctx.badge(p.status)}</button>`;
      })
      .join(
        "",
      )}</div><div class="card card-pad"><div class="job-top"><div><div class="eyebrow">${ctx.esc(selected.number)}</div><h2 style="margin:5px 0;font-size:20px">${ctx.esc(job.number)} · ${ctx.esc(job.customer)}</h2></div>${ctx.badge(job.status)}</div>${ctx.renderPickingState(selected, job)}${ctx.ui.scanMessage ? `<div class="form-note mt12" role="status" style="background:${ctx.ui.scanMessage.ok ? "var(--green2)" : "var(--red2)"};color:${ctx.ui.scanMessage.ok ? "var(--green)" : "var(--red)"}">${ctx.esc(ctx.ui.scanMessage.text)}</div>` : ""}${job.status !== "Picking" ? `<div class="mt16"><div class="workload-head"><span>Collection matches</span><span>${matched}/${required}</span></div><div class="progress"><span style="width:${required ? Math.min(100, (matched / required) * 100) : 100}%"></span></div></div>` : ""}${canScan ? `<div class="scanner-console mt16"><div class="camera-box" id="camera-box"><div class="center">${ctx.icon("scan", "lg")}<h3>Scan a required product</h3><p class="small">Camera, USB / Bluetooth scanner, or manual barcode / SKU entry.</p></div></div><div class="form-grid mt12"><div class="field"><label for="barcode-input">Barcode or SKU</label><input class="input" id="barcode-input" placeholder="Scan or type product code" data-focus="barcode-input" autocomplete="off"></div><div class="field"><label for="scan-quantity">Quantity to match</label><input class="input" id="scan-quantity" type="number" min="0.001" step="any" value="1" style="max-width:120px"></div></div><div class="row wrap gap8 mt12"><button class="btn" data-action="scan-barcode">${ctx.icon("check")} Match product</button><button class="btn dark" data-action="toggle-camera">${ctx.icon("camera")} <span id="camera-label">Use camera scanner</span></button></div></div>` : job.status === "Ready for Collection" && !ctx.matchesComplete(job) ? `<p class="small muted mt12">${ctx.esc(error)}</p>` : ""}<div class="mt16">${ctx.sectionTitle("Required products", job.status === "Picking" ? "Reference list · product matching opens at collection" : "Each required quantity must match")}${job.items.map((x) => `<div class="item-row"><span class="icon-box ${Number(x.quantityMatched || 0) >= x.quantityRequired ? "green" : ""}">${ctx.icon(Number(x.quantityMatched || 0) >= x.quantityRequired ? "check" : "box")}</span><div class="grow"><div class="item-name">${ctx.esc(x.name)}</div><div class="item-meta">${ctx.esc(x.sku)} · ${ctx.esc(x.barcode)}</div></div><div class="qty-box">${Number(x.quantityMatched || 0)}/${x.quantityRequired}<div class="mt8">${ctx.badge(Number(x.quantityMatched || 0) >= x.quantityRequired ? "Scan matched" : Number(x.quantityMatched || 0) > 0 ? "Partially matched" : "Awaiting match")}</div></div></div>`).join("")}</div></div></div>`;
  }

  function renderProductRequestForm(j, returnId = "") {
    if (!j || !ctx.hasCapability("job_manage")) return "";
    return `<section class="card card-pad mt16"><h3>Request a different / additional product</h3><p class="small muted">Management approval is required before any new SKU can be picked up. Approved additions get their own pickup and scan tasks.</p><div class="field"><label>Request type</label><select class="select" id="addition-direction"><option value="outbound" ${!returnId ? "selected" : ""}>New / replacement product for installation</option><option value="return" ${returnId ? "selected" : ""}>Different SKU found for return collection</option></select></div><div class="form-grid mt12"><div class="field"><label>Inventory product</label><select class="select" id="addition-product"><option value="">Select product</option>${ctx.state.products.map((p) => `<option value="${ctx.attr(p.id)}">${ctx.esc(p.sku)} · ${ctx.esc(p.name)} · ${ctx.availableStock(p)} available</option>`).join("")}</select></div><div class="field"><label>Quantity</label><input class="input" id="addition-quantity" type="number" min="1" step="1" value="1"></div></div><div class="field mt12"><label>Reason for the product request</label><textarea class="textarea" id="addition-reason" placeholder="Replacement for defective piece, different specification, or other reason"></textarea></div><button class="btn mt12" data-action="request-product" data-id="${ctx.attr(j.id)}" data-return-id="${ctx.attr(returnId)}">Request manager approval</button></section>`;
  }

  function renderProductRequests() {
    const list = (ctx.state.productRequests || []).filter(
      ctx.canViewProductRequest,
    );
    let r = list.find((x) => x.id === ctx.ui.productRequestId);
    if (!r && ctx.ui.productRequestId) ctx.ui.productRequestId = "";
    const j = r && ctx.jobOf(r.jobId),
      p = r && ctx.state.products.find((p) => p.id === r.productId);
    return `<section class="card card-pad" style="margin-bottom:20px"><h3>Additional / replacement product requests</h3><div class="field"><label>Request</label><select class="select" data-filter="productRequestId"><option value="">Select request</option>${list.map((x) => `<option value="${ctx.attr(x.id)}" ${r?.id === x.id ? "selected" : ""}>${ctx.esc(ctx.jobOf(x.jobId)?.number || "")} · ${ctx.esc(ctx.state.products.find((p) => p.id === x.productId)?.sku || "")} · ${x.quantity} · ${ctx.esc(x.status)}</option>`).join("")}</select></div>${!list.length ? '<p class="small muted">Request a product from the job Products tab or its Return record.</p>' : ""}${
      r
        ? `<div class="row wrap gap8 mt16"><strong>${ctx.esc(j?.number || "")} · ${ctx.esc(p?.name || "")}</strong>${ctx.badge(r.status)}</div><p class="small muted"><strong>${r.direction === "return" ? "Inbound return collection" : "Outbound product addition"}</strong> · ${ctx.esc(r.reason)} · ${r.quantity} unit(s)</p>${
            r.status === "Awaiting approval" && ctx.canManageJobDetails()
              ? `<div class="form-grid"><div class="field"><label>Assign pickup installer</label><select class="select" id="addition-installer">${ctx.state.users
                  .filter(
                    (u) => u.status === "Active" && u.role === "installer",
                  )
                  .map(
                    (u) =>
                      `<option value="${u.id}" ${r.installerId === u.id ? "selected" : ""}>${ctx.esc(u.name)}</option>`,
                  )
                  .join(
                    "",
                  )}</select></div>${r.direction === "return" ? '<input type="hidden" id="addition-price" value="0">' : `<div class="field"><label>Unit price including tax (confirm)</label><input class="input" id="addition-price" type="number" min="0" step="0.01" value="${Number(p?.salePrice || 0)}"></div>`}</div>${r.direction === "return" ? '<p class="small muted">This authorizes the different SKU for inbound return collection. It creates no outbound stock issue or client charge.</p>' : '<p class="small muted">Confirm the client charge, including tax. Enter 0 for a no-charge warranty replacement; set the original return to “No credit — warranty” during inspection if the original charge should remain.</p>'}<textarea class="textarea" id="addition-decision-note" placeholder="Approval / rejection reason"></textarea><div class="row wrap gap8 mt12"><button class="btn" data-action="approve-product" data-id="${r.id}">Approve & create pickup tasks</button><button class="btn ghost" data-action="reject-product" data-id="${r.id}">Reject request</button></div>`
              : ""
          }${ctx.renderReopenControls(j)}${r.direction === "return" && r.returnId && r.status !== "Awaiting approval" && r.status !== "Rejected" ? `<button class="btn mt12" data-action="open-approved-return" data-id="${r.returnId}">Open approved return pickup</button><p class="small muted">This is an inbound return, not a new stock issue or customer charge.</p>` : ""}${r.status === "Approved" && ctx.canCollectRequest(r) ? `<div class="field mt12"><label>Confirm pickup location</label><select class="select" id="addition-location"><option value="">Select location</option><option>${ctx.esc(r.productSnapshot.warehouse + " · " + r.productSnapshot.location)}</option></select></div><button class="btn mt12" data-action="confirm-addition-location" data-id="${r.id}">Confirm warehouse location</button>` : ""}${r.status === "Ready for Collection" && ctx.canCollectRequest(r) ? `<p class="small strong">${r.matched}/${r.quantity} scan matched</p><div class="row wrap gap8"><input class="input grow" id="barcode-input" placeholder="Scan approved barcode or enter SKU"><input class="input" style="width:90px" id="scan-quantity" type="number" min="1" value="1" aria-label="Additional collection quantity"><button class="btn" data-action="scan-addition" data-id="${r.id}">Match product</button><button class="btn secondary" data-action="toggle-camera"><span id="camera-label">Use camera scanner</span></button></div><div id="camera-box" class="mt12"></div>` : ""}${ctx.canManageJobDetails() && r.direction !== "return" && ["Approved", "Ready for Collection"].includes(r.status) && !r.matched ? `<div class="row wrap gap8 mt12"><input class="input grow" id="addition-cancel-reason" placeholder="Reason for cancelling this approved pickup"><button class="btn ghost" data-action="cancel-product-request" data-id="${r.id}">Cancel approved request</button></div>` : ""}${r.status === "Collected" ? `<p class="form-note">Stock issued once for this approved request. The assigned job installer must upload fresh installation evidence before final completion.</p>` : ""}<div class="mt12">${ctx.state.tasks
            .filter((t) => t.requestId === r.id && ctx.canViewTask(t))
            .map(
              (t) =>
                `<div class="list-row"><div class="grow"><strong>${ctx.esc(t.title)}</strong><div class="list-sub">${ctx.esc(ctx.userName(t.assignedTo))}</div></div>${ctx.badge(t.status)}</div>`,
            )
            .join(
              "",
            )}</div><button class="btn ghost sm mt12" data-action="close-addition">Show original job collections</button>`
        : ""
    }</section>`;
  }

  function renderReopenControls(j) {
    if (
      !ctx.canManageJobDetails() ||
      !["Completed", "On Hold"].includes(j.status)
    )
      return "";
    return `<section class="form-note mt16"><h4>Reopen for return / replacement</h4><div class="row wrap gap8"><select class="select" id="reopen-target"><option value="Installation in Progress">In progress — Installation in Progress</option><option value="On Hold">Pending — On Hold</option></select><input class="input grow" id="reopen-reason" placeholder="Client return / replacement reason"><button class="btn secondary" data-action="reopen-job" data-id="${j.id}">Reopen job</button></div><p class="small">Existing stock movements and invoices remain recorded. Final billing is reconciled again after all work is complete.</p></section>`;
  }

  function renderReturnDetail(r) {
    const j = ctx.jobOf(r.jobId),
      management = ctx.canManageReturns(),
      edit = ctx.canEditReturn(r),
      pickup = ctx.canReturnPickup(r),
      upload = ctx.canUploadReturnForm(r),
      scannable = edit || pickup;
    return `<section class="card card-pad mt16" data-return-detail><div class="row wrap gap12"><div class="grow"><div class="eyebrow">${ctx.esc(r.number)} · ${ctx.esc(j?.number || "")}</div><h3>${ctx.esc(j?.customer || "")}</h3><p class="small muted">${ctx.esc(j?.address || "")} · ${ctx.esc(j?.suburb || "")} · ${ctx.esc(j?.phone || "")}</p></div>${ctx.badge(r.status)}</div>${r.migrationNote && edit ? `<p class="form-note">${ctx.esc(r.migrationNote)}</p>` : ""}${r.reason ? `<p class="small"><strong>Return reason:</strong> ${ctx.esc(r.reason)}</p>` : ""}${r.siteCollection ? `<p class="small muted">Onsite confirmation · Device position ${r.siteCollection.location.latitude.toFixed(5)}, ${r.siteCollection.location.longitude.toFixed(5)} · ±${Math.round(r.siteCollection.location.accuracy)} m</p>` : ""}${r.method ? `<p class="small"><strong>${ctx.esc(r.method)}</strong> · ${ctx.esc(r.warehouse)}${r.pickupInstallerId ? " · " + ctx.esc(ctx.userName(r.pickupInstallerId)) : ""}</p>` : ""}
      ${
        r.legacyUnverified
          ? `<div class="form-note">This processed legacy return has no recorded product quantities. Reconcile its history before requesting another return for this job. Inventory will not be changed.</div>${
              management
                ? `<div class="form-stack mt12" id="legacy-return-fields">${ctx
                    .allJobItems(j)
                    .map(
                      (x) =>
                        `<div class="field"><label>${ctx.esc(x.name)} · previously returned quantity</label><input class="input" type="number" min="0" max="${x.quantityIssued ?? x.quantityPicked ?? 0}" value="0" data-legacy-qty="${ctx.attr(x.id)}"></div>`,
                    )
                    .join(
                      "",
                    )}<textarea class="textarea" id="legacy-return-note" placeholder="Explain the historical quantity reconciliation"></textarea><button class="btn" data-action="reconcile-return" data-id="${ctx.attr(r.id)}">Confirm historical quantities</button></div>`
                : ""
            }`
          : ""
      }
      ${(edit || management) && ["Draft", "Awaiting manager", "Awaiting client delivery", "Pickup assigned"].includes(r.status) && !r.items.some((x) => x.pickupMatched > 0) ? `<button class="btn ghost sm mt12" data-action="cancel-return" data-id="${ctx.attr(r.id)}">Cancel return</button>` : ""}
      ${
        r.items
          .map((x) => {
            const item = ctx.allJobItems(j).find((i) => i.id === x.jobItemId);
            return `<div class="list-row"><div class="grow"><strong>${ctx.esc(item?.name || x.productId)}</strong><div class="list-sub">${ctx.esc(item?.sku || "")} · Return quantity: ${x.quantity}${r.method === "Installer pickup" ? ` · Pickup matched: ${x.pickupMatched || 0}/${x.quantity}` : ""}</div>${r.status === "Processed" ? `<div class="small">${x.usable ?? "—"} usable · ${x.damaged ?? "—"} damaged</div>` : ""}</div>${edit ? `<button class="btn ghost sm" data-action="remove-return-item" data-id="${ctx.attr(r.id)}" data-item="${ctx.attr(x.jobItemId)}">Remove</button>` : ""}</div>`;
          })
          .join("") ||
        (!r.legacyUnverified
          ? '<p class="small muted">Scan a product or enter its SKU to add the quantity to return.</p>'
          : "")
      }
      ${scannable ? `<div class="form-note mt16">${edit ? "Verify the products to request a return." : "Scan every requested quantity at the client location, then confirm collection."}</div><div class="row wrap gap8 mt12"><input class="input grow" id="barcode-input" placeholder="Scan barcode or enter SKU"><input class="input" id="scan-quantity" type="number" min="1" step="1" value="1" aria-label="Return quantity" style="width:90px"><button class="btn" data-action="scan-return" data-id="${ctx.attr(r.id)}">${edit ? "Add to return" : "Match pickup"}</button><button class="btn secondary" data-action="toggle-camera"><span id="camera-label">Use camera scanner</span></button></div><div id="camera-box" class="mt12"></div>` : ""}
      ${edit ? `<div class="row wrap gap8 mt16"><select class="select" id="return-condition"><option value="">Select return reason</option>${["Defective piece", "Need other product", "No need for this product", "Other"].map((c) => `<option ${r.reason === c ? "selected" : ""}>${c}</option>`).join("")}</select><input class="input grow" id="return-reason-note" placeholder="Additional reason details (required for Other)"><button class="btn" data-action="submit-return" data-id="${ctx.attr(r.id)}" ${!r.items.length ? "disabled" : ""}>Submit to manager</button></div>${ctx.isInstaller() ? `<div class="form-note mt12"><label><input type="checkbox" id="return-onsite"> I am at the client location and have scanned these products for return.</label><p class="small">Your device location is recorded with your confirmation; it does not verify the client address.</p><button class="btn mt8" data-action="self-collect-return" data-id="${r.id}">Collect onsite without approval</button></div>` : ""}` : ""}
      ${
        management &&
        [
          "Awaiting manager",
          "Awaiting client delivery",
          "Pickup assigned",
        ].includes(r.status) &&
        !r.items.some((x) => x.pickupMatched > 0)
          ? `<div class="form-grid mt16"><div class="field"><label>Delivery method</label><select class="select" id="return-method">${["Client delivery", "Installer pickup"].map((x) => `<option ${r.method === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="field"><label>Pickup installer (for installer pickup)</label><select class="select" id="return-installer"><option value="">Select installer</option>${ctx.state.users
              .filter((u) => u.role === "installer" && u.status === "Active")
              .map(
                (u) =>
                  `<option value="${u.id}" ${r.pickupInstallerId === u.id ? "selected" : ""}>${ctx.esc(u.name)}</option>`,
              )
              .join(
                "",
              )}</select></div><div class="field"><label>Company warehouse</label><select class="select" id="return-warehouse">${ctx
              .returnWarehouses()
              .map(
                (w) =>
                  `<option ${r.warehouse === w ? "selected" : ""}>${ctx.esc(w)}</option>`,
              )
              .join(
                "",
              )}</select></div></div><button class="btn mt12" data-action="arrange-return" data-id="${ctx.attr(r.id)}">Save delivery plan</button>`
          : ""
      }
      ${pickup ? `<button class="btn mt16" data-action="collect-return" data-id="${ctx.attr(r.id)}" ${r.items.some((x) => x.pickupMatched !== x.quantity) ? "disabled" : ""}>Confirm products collected</button>` : ""}
      ${upload ? `<div class="form-note mt16">${r.status === "Delivered" ? "Warehouse handover is recorded. You can upload a replacement return form if needed." : `Deliver these products to ${ctx.esc(r.warehouse)}. Upload the return form, then confirm warehouse handover to complete your pickup task.`}</div><label class="btn secondary mt12">Upload return form<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" data-return-form="${ctx.attr(r.id)}" hidden></label>${r.status === "Collected for return" ? `<button class="btn mt12" data-action="deliver-return" data-id="${ctx.attr(r.id)}" ${!ctx.validReturnForm(r) ? "disabled" : ""}>Confirm warehouse handover</button>` : ""}` : ""}
      ${(r.forms || []).length ? `<div class="mt16"><h4>Return forms</h4>${r.forms.map((f) => `<div class="list-row"><div class="grow"><strong>${ctx.esc(f.name)}</strong><div class="list-sub">${ctx.fmt(f.createdAt, true)}</div></div>${ctx.proofAvailability.get(f.blobId) === true ? `<a class="btn secondary sm" data-return-form-link="${ctx.attr(f.blobId)}" download="${ctx.attr(f.name)}" target="_blank" rel="noopener">Open / download</a>` : `<span class="small muted">${ctx.proofAvailability.get(f.blobId) === false ? "File unavailable in this browser" : "Checking file…"}</span>`}</div>`).join("")}</div>` : ""}
      ${upload || (r.forms || []).length ? '<p class="small muted">PDF or image, up to 10 MB. Forms are stored in this browser and do not sync between devices.</p>' : ""}
      ${management && r.status === "Awaiting client delivery" ? `<button class="btn mt16" data-action="client-return-received" data-id="${ctx.attr(r.id)}">Confirm client delivery received</button>` : ""}
      ${management && r.status === "Delivered" ? `<div class="form-note mt16">Inspect the returned products. Enter the usable quantity; the remainder is recorded as damaged/quarantined and does not increase available stock.</div>${r.items.map((x) => `<div class="field mt12"><label>${ctx.esc(ctx.allJobItems(j).find((i) => i.id === x.jobItemId)?.name || "Product")} · usable out of ${x.quantity}</label><input class="input" type="number" min="0" max="${x.quantity}" step="1" value="${r.condition === "Damaged" ? 0 : x.quantity}" data-return-usable="${ctx.attr(x.jobItemId)}"></div>`).join("")}<div class="field mt12"><label>Client billing treatment</label><select class="select" id="return-credit"><option value="credit">Credit returned units on final invoice</option><option value="warranty">No credit — warranty / original charge retained</option></select></div><button class="btn mt16" data-action="process-return" data-id="${ctx.attr(r.id)}">Confirm inspection & process return</button>` : ""}
      <div class="mt16">${ctx.state.tasks
        .filter((t) => t.returnId === r.id && ctx.canViewTask(t))
        .map(
          (t) =>
            `<div class="list-row"><div class="grow"><strong>${ctx.esc(t.title)}</strong><div class="list-sub">${ctx.esc(ctx.userName(t.assignedTo))}</div></div>${ctx.badge(t.status)}</div>`,
        )
        .join("")}</div></section>`;
  }

  function renderReturns() {
    if (ctx.inventoryControls)
      return ctx.inventoryControls.view("returns") + renderLegacyReturns();
    return renderLegacyReturns();
  }
  function renderLegacyReturns() {
    const records = ctx.state.returns.filter(
        (r) => ctx.canViewReturn(r) && ctx.inWorkJob(r.jobId),
      ),
      jobs = ctx.state.jobs.filter(
        (j) => ctx.canViewJob(j) && ctx.returnHasSupply(j),
      );
    let r = records.find((x) => x.id === ctx.ui.returnId);
    if (!r) {
      r = records[0];
      ctx.ui.returnId = r?.id || "";
    }
    return `${ctx.header("STOCK RECONCILIATION", "Returns", "Request a return, arrange delivery, verify collection and record warehouse inspection.")}<section class="card card-pad"><div class="row wrap gap12"><div class="field grow"><label>Job for a new return</label><select class="select" id="return-job"><option value="">Select job</option>${jobs.map((j) => `<option value="${j.id}">${ctx.esc(j.number)} · ${ctx.esc(j.customer)}</option>`).join("")}</select></div><button class="btn" data-action="start-return">Start return request</button></div></section><section class="card card-pad mt16"><div class="field"><label>Return record</label><select class="select" data-filter="returnId"><option value="">Select return</option>${records.map((x) => `<option value="${ctx.attr(x.id)}" ${r?.id === x.id ? "selected" : ""}>${ctx.esc(x.number)} · ${ctx.esc(ctx.jobOf(x.jobId)?.number || "")} · ${ctx.esc(x.status)}</option>`).join("")}</select></div>${!records.length ? '<p class="muted small">No returns assigned to you.</p>' : ""}</section>${r ? ctx.renderReturnDetail(r) + ctx.renderReopenControls(ctx.jobOf(r.jobId)) + ctx.renderProductRequestForm(ctx.jobOf(r.jobId), r.id) : ""}`;
  }

  function renderPurchasing() {
    return (
      (ctx.inventoryControls ? ctx.inventoryControls.view("purchasing") : "") +
      renderLegacyPurchasing()
    );
  }
  function renderLegacyPurchasing() {
    if (ctx.ui.purchasingTab === "Email Configuration")
      ctx.ui.purchasingTab = "Purchase Orders";
    return `${ctx.header("PROCUREMENT", "Purchase orders & suppliers.", "Add multiple products with a separate quantity for each product.")}<div class="row wrap gap8"><button class="btn" data-action="new-po">Create Purchase Order</button><button class="btn ghost" data-action="new-supplier">Add Supplier</button></div><div class="card card-pad mt16"><div class="tabs">${["Purchase Orders", "Suppliers"].map((t) => `<button class="tab ${ctx.ui.purchasingTab === t ? "active" : ""}" data-action="purchasing-tab" data-tab="${t}">${t}</button>`).join("")}</div></div><div class="job-grid mt16">${
      ctx.ui.purchasingTab === "Suppliers"
        ? ctx.state.suppliers
            .map(
              (s) =>
                `<div class="card card-pad"><h3>${ctx.esc(s.name)}</h3><p>${ctx.esc(s.contact || "")}</p><p>${ctx.esc(s.email)}<br>${ctx.esc(s.phone || "")}</p></div>`,
            )
            .join("")
        : ctx
            .workPurchaseOrders()
            .map(
              (p) =>
                `<div class="card card-pad">${ctx.badge(p.status)}<div class="eyebrow mt16">${ctx.esc(p.number)}</div><h3>${ctx.esc(p.supplierName || ctx.state.suppliers.find((x) => x.id === p.supplierId)?.name || "")}</h3>${ctx
                  .poLines(p)
                  .map(
                    (l) =>
                      `<p class="small">${ctx.esc(l.sku)} · ${ctx.esc(l.name)} · ${l.received || 0}/${l.quantity} received</p>`,
                  )
                  .join(
                    "",
                  )}<p class="small">Expected: ${ctx.fmt(p.expectedDate)}</p><div class="row wrap gap8"><button class="btn ghost" data-action="view-po" data-id="${ctx.attr(p.id)}">View / Print</button><button class="btn ghost" data-action="email-po" data-id="${ctx.attr(p.id)}">Email draft</button><button class="btn ghost" data-action="send-po-resend" data-id="${ctx.attr(p.id)}">Send via Resend</button>${p.status !== "Received" ? `<button class="btn" data-action="receive-po" data-id="${ctx.attr(p.id)}">Receive remaining goods</button>` : ""}</div></div>`,
            )
            .join("")
    }</div>`;
  }

  function renderProcurementModal(m) {
    if (m.type === "supplier")
      return ctx.modalFrame(
        "Add Supplier",
        "Company details for purchase orders",
        `<form id="supplier-form" class="form-stack" onsubmit="return false"><div class="field"><label>Company name</label><input class="input" name="name" required></div><div class="field"><label>Company email</label><input class="input" name="email" type="email" required></div><div class="field"><label>Contact person</label><input class="input" name="contact"></div><div class="field"><label>Phone</label><input class="input" name="phone"></div><div class="field"><label>PO sender email (optional override)</label><input class="input" name="poFromEmail" type="email" placeholder="${ctx.attr(ctx.state.emailConfig?.poFromEmail || "Uses default PO sender")}"></div></form>`,
        "",
        "close-modal",
        '<button class="btn" data-action="save-supplier">Save Supplier</button>',
      );
    if (m.type === "newPO")
      return ctx.modalFrame(
        "Create Purchase Order",
        "Add each product and its quantity, then use Add Product for another line.",
        `<form id="po-form" onsubmit="return false"><div class="form-grid"><div class="field"><label>Supplier / company</label><select class="select" name="supplierId" required><option value="">Select supplier</option>${ctx.state.suppliers.map((x) => `<option value="${ctx.attr(x.id)}">${ctx.esc(x.name)} · ${ctx.esc(x.email)}</option>`).join("")}</select></div><div class="field"><label>Expected delivery</label><input class="input" name="expectedDate" type="date" required></div></div><div id="po-lines">${ctx.poRow()}</div><button type="button" class="btn ghost mt12" data-action="add-po-line">Add Product</button><div class="field mt16"><label>Notes</label><textarea class="input" name="notes"></textarea></div></form>`,
        "wide",
        "close-modal",
        '<button class="btn" data-action="save-po">Create Purchase Order</button>',
      );
    const p = ctx.state.purchaseOrders.find((x) => x.id === m.id);
    if (!p) return "";
    const supplier = ctx.state.suppliers.find((x) => x.id === p.supplierId);
    return ctx.modalFrame(
      p.number,
      "Purchase order",
      `<article class="email-sheet"><h1>Interior Blinds & Shutters</h1><h2>Purchase Order ${ctx.esc(p.number)}</h2><p>Company: ${ctx.esc(p.supplierName || supplier?.name || "")}<br>Email: ${ctx.esc(p.supplierEmail || supplier?.email || "")}</p><p>Expected delivery: ${ctx.fmt(p.expectedDate)}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th>SKU / Product</th><th>Details</th><th>Quantity</th></tr></thead><tbody>${ctx
        .poLines(p)
        .map(
          (l) =>
            `<tr><td style="padding:12px 4px;border-bottom:1px solid #ddd">${ctx.esc(l.sku)}<br>${ctx.esc(l.name)}</td><td>${ctx.esc(l.details || "")}</td><td>${l.quantity}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><p style="white-space:pre-wrap">${ctx.esc(p.notes || "")}</p></article>`,
      "wide",
      "close-modal",
      `<button class="btn" data-action="print-po">Print Purchase Order</button><button class="btn ghost" data-action="email-po" data-id="${ctx.attr(p.id)}">Email draft</button><button class="btn ghost" data-action="send-po-resend" data-id="${ctx.attr(p.id)}">Send via Resend</button>`,
    );
  }

  function renderStockModal(id) {
    const p = ctx.state.products.find((x) => x.id === id);
    if (!p) return "";
    return ctx.modalFrame(
      "Post stock adjustment",
      `${p.name} · ${p.sku}`,
      `<div class="facts">${ctx.infoFact("Current on hand", String(p.onHand))}${ctx.infoFact("Reserved", String(p.reserved))}${ctx.infoFact("Available", String(p.onHand - p.reserved))}</div><form class="form-stack mt16" id="stock-form"><div class="field"><label>Adjustment type</label><select class="select" name="type"><option>Stock increase</option><option>Stock reduction</option><option>Damaged</option><option>Write-off</option></select></div><div class="field"><label>Quantity</label><input class="input" type="number" min="1" name="quantity" value="1"></div><div class="field"><label>Reason</label><textarea class="textarea" name="reason">Manual stock correction</textarea></div><div class="form-note">Posted movements cannot be deleted. Corrections should use a new reversing movement.</div></form>`,
      "",
      "close-modal",
      `<button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" data-action="post-stock" data-id="${p.id}">${ctx.icon("check")} Post movement</button>`,
    );
  }
  return {
    renderInventory,
    renderStockAlerts,
    renderPickingState,
    renderPicking,
    renderOriginalPicking,
    renderProductRequestForm,
    renderProductRequests,
    renderReopenControls,
    renderReturnDetail,
    renderReturns,
    renderPurchasing,
    renderProcurementModal,
    renderStockModal,
  };
}
