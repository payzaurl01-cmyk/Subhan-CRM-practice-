// Extensions of the existing job.status / task.jobStage workflow, not a second
// state machine. System stage types remain stable even when their labels change.
export const STOCK_STAGES = [
  "Stock Shortage",
  "Picking",
  "Ready for Collection",
  "Collected",
];
export const WORK_STAGES = [
  "Confirmed",
  ...STOCK_STAGES,
  "Installation Scheduled",
  "Installation in Progress",
  "Repair Scheduled",
  "Repair in Progress",
  "Return Pending",
  "On Hold",
];
export const applicableTask = (t, job) =>
  t.status !== "Not applicable" &&
  t.applicable !== false &&
  !job?.stages?.some((s) => s.id === t.jobStage && s.applicable === false);
const n = (v) => Math.max(0, Number(v) || 0);
export function workType(job) {
  if (["repair", "installation", "supply"].includes(job.workType))
    return job.workType;
  if (/repair|maintenance/i.test(job.service || "")) return "repair";
  return /supply.?only|delivery.?only/i.test(job.service || "")
    ? "supply"
    : "installation";
}
export function companyStockLine(line) {
  const type = String(
    line.lineKind || line.line_kind || line.kind || line.itemType || "",
  ).toLowerCase();
  const source = String(
    line.fulfilmentSource || line.fulfillmentSource || "company",
  ).toLowerCase();
  return (
    line.requiresInventory !== false &&
    line.requires_inventory !== false &&
    ![
      "customer",
      "customer supplied",
      "customer_supplied",
      "none",
      "service",
    ].includes(source) &&
    !["service", "labour", "labor", "fee", "note", "custom"].includes(type) &&
    (line.requiresInventory === true ||
      line.requires_inventory === true ||
      !!(
        line.variantId ||
        line.variant_id ||
        line.productId ||
        line.product_id
      ) ||
      ["inventory", "physical", "product", "stock"].includes(type))
  );
}
export const activeLine = (line) =>
  line.active !== false &&
  !line.cancelled &&
  !line.excluded &&
  !["cancelled", "canceled", "excluded"].includes(
    String(line.status || "").toLowerCase(),
  );
export function stockFacts(job) {
  const rows = (job.items || []).filter(companyStockLine).map((line) => {
    const required = activeLine(line)
      ? n(line.quantityRequired ?? line.quantity)
      : 0;
    const issued = n(
      line.quantityIssued ??
        line.quantity_issued ??
        (job.collectionIssuedAt ? line.quantityPicked : 0),
    );
    const returned = n(line.quantityReturned ?? line.quantity_returned);
    const used = n(line.quantityUsed ?? line.quantity_used);
    return {
      line,
      required,
      issued,
      returned,
      used,
      outstanding: Math.max(0, required - issued),
      surplus: Math.max(0, issued - returned - used - required),
      reserved: n(line.quantityReserved),
      picked: job.collectionIssuedAt ? 0 : n(line.quantityPicked),
      matched: n(line.quantityMatched),
    };
  });
  return {
    rows,
    outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
    surplus: rows.reduce((s, r) => s + r.surplus, 0),
    activity: rows.some(
      (r) =>
        r.issued || r.reserved || r.picked || r.matched || r.used || r.returned,
    ),
    requiresCompanyStock: rows.some((r) => r.required > 0),
  };
}
export function stageType(job, id = job.status) {
  return (job.stages || []).find((s) => s.id === id)?.type || id;
}
export function stageLabel(job, id = job.status) {
  return (job.stages || []).find((s) => s.id === id)?.name || id;
}
export function activeStages(job) {
  return (job.stages || []).filter(
    (s) => s.applicable !== false && s.status !== "Not applicable",
  );
}
export function defaultStageTypes(
  job,
  { shortage = false, returns = false } = {},
) {
  const stock = stockFacts(job),
    type = workType(job);
  return [
    "Confirmed",
    ...(stock.outstanding
      ? [
          ...(shortage ? ["Stock Shortage"] : []),
          "Picking",
          "Ready for Collection",
          "Collected",
        ]
      : []),
    ...(type === "supply"
      ? []
      : [
          type === "repair" ? "Repair Scheduled" : "Installation Scheduled",
          type === "repair" ? "Repair in Progress" : "Installation in Progress",
        ]),
    ...(returns || stock.surplus ? ["Return Pending"] : []),
    "Completed",
  ];
}
export function reconcileWorkflow(job, tasks = [], options = {}) {
  const result = structuredClone(job),
    linked = structuredClone(tasks),
    at = options.at || new Date().toISOString();
  result.items ||= [];
  result.timeline ||= [];
  result.stages ||= [];
  // Completed jobs are immutable until an explicit reopening, including migrations.
  if (result.status === "Completed") return { job: result, tasks: linked };
  const type = workType(result),
    wanted = defaultStageTypes(result, options);
  result.workType = type;
  result.workflowVersion = 1;
  for (const stage of result.stages) {
    if (
      stage.origin === "generated" &&
      !wanted.includes(stage.type) &&
      stage.status !== "Completed"
    ) {
      stage.applicable = false;
      stage.status = "Not applicable";
      stage.notApplicableReason = "No outstanding requirement";
    }
  }
  for (const kind of wanted) {
    let stage = result.stages.find(
      (s) =>
        s.origin === "generated" && s.type === kind && s.status !== "Completed",
    );
    if (
      !stage &&
      result.stages.some((s) => s.type === kind && s.status === "Completed") &&
      !(STOCK_STAGES.includes(kind) && stockFacts(result).outstanding)
    )
      continue;
    if (!stage) {
      stage = {
        id: result.stages.some((s) => s.id === kind)
          ? `${kind}:${result.stages.length + 1}`
          : kind,
        type: kind,
        name: kind,
        description: "",
        origin: "generated",
        status: "Pending",
        applicable: true,
      };
      result.stages.push(stage);
    }
    stage.applicable = true;
    if (stage.status === "Not applicable") stage.status = "Pending";
  }
  // Keep manual stages in their selected position; generated stages use the
  // existing identifiers. A newly required stock task can run beside ongoing work.
  const order = [
    "Confirmed",
    ...STOCK_STAGES,
    "Installation Scheduled",
    "Repair Scheduled",
    "Installation in Progress",
    "Repair in Progress",
    "Return Pending",
    "Completed",
  ];
  const automatic = result.stages
    .filter((s) => s.origin !== "manual")
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  for (const manual of result.stages.filter((s) => s.origin === "manual")) {
    const index = automatic.findIndex((s) => s.id === manual.after);
    automatic.splice(
      index < 0 ? Math.max(0, automatic.length - 1) : index + 1,
      0,
      manual,
    );
  }
  result.stages = automatic;
  const definitions = {
    "Stock Shortage": [
      "Resolve stock shortage",
      "Warehouse",
      "resolve-shortage",
    ],
    Picking: [
      "Confirm pickup warehouse location",
      "Picking",
      "confirm-location",
    ],
    "Ready for Collection": [
      "Scan and match collection products",
      "Collection",
      "scan-collection",
    ],
    [type === "repair" ? "Repair Scheduled" : "Installation Scheduled"]: [
      `Schedule ${type === "repair" ? "repair" : "installation"}`,
      type === "repair" ? "Repair" : "Installation",
      "schedule-work",
    ],
    [type === "repair" ? "Repair in Progress" : "Installation in Progress"]: [
      `Complete ${type === "repair" ? "repair" : "installation"}`,
      type === "repair" ? "Repair" : "Installation",
      "perform-work",
    ],
  };
  for (const t of linked) {
    if (t.status === "Completed" || t.workflowOrigin !== "generated") continue;
    const stage = result.stages.find((s) => s.id === t.jobStage);
    if (stage?.applicable === false) {
      t.status = "Not applicable";
      t.applicable = false;
      t.notApplicableReason = stage.notApplicableReason;
    }
  }
  for (const s of result.stages.filter(
    (s) =>
      s.origin === "generated" &&
      s.applicable !== false &&
      s.status !== "Completed",
  )) {
    const d = definitions[s.type];
    if (!d) continue;
    const existing = linked.find(
      (t) =>
        t.jobId === result.id &&
        t.workflowOrigin === "generated" &&
        t.workflowAction === d[2] &&
        t.jobStage === s.id,
    );
    if (existing) {
      if (existing.status === "Not applicable") {
        existing.status = "Pending";
        existing.applicable = true;
      }
      continue;
    }
    if (
      result.quoteId &&
      result.leadId &&
      linked.some(
        (t) =>
          t.status === "Completed" &&
          t.quoteId === result.quoteId &&
          t.leadId === result.leadId &&
          ["Installation", "Repair"].includes(t.category) &&
          ((d[2] === "schedule-work" && t.jobStage === "Collected") ||
            (d[2] === "perform-work" &&
              ["Installation in Progress", "Repair in Progress"].includes(
                t.jobStage,
              ))),
      )
    )
      continue;
    // Do not infer legacy task origin from a title. An explicit action is safe
    // to adopt only for these existing generator-defined task kinds.
    if (
      linked.some(
        (t) =>
          t.jobId === result.id &&
          t.jobStage === s.id &&
          t.workflowAction === d[2] &&
          applicableTask(t),
      )
    )
      continue;
    linked.push({
      id: `${result.id}:workflow:${s.id}:${d[2]}`,
      jobId: result.id,
      leadId: result.leadId || "",
      jobStage: s.id,
      title: `${d[0]} for ${result.number}`,
      category: d[1],
      workflowAction: d[2],
      workflowOrigin: "generated",
      assignedTo: ["Picking", "Stock Shortage"].includes(s.type)
        ? options.managerId || ""
        : result.installerId || "",
      status: "Pending",
      priority: "High",
      dueAt: result.installationDate || at,
      notes: "Generated for the applicable job workflow.",
      required: true,
    });
  }
  if (
    type !== "supply" &&
    !linked.some(
      (t) =>
        t.workflowAction === "installation-proof" &&
        (!result.evidenceRequiredAfter ||
          t.status !== "Completed" ||
          new Date(t.completedAt) >= new Date(result.evidenceRequiredAfter)),
    )
  ) {
    const progress = result.stages.find(
      (s) =>
        s.type ===
          (type === "repair"
            ? "Repair in Progress"
            : "Installation in Progress") &&
        s.applicable !== false &&
        s.status !== "Completed",
    );
    linked.push({
      id: `${result.id}:proof:${result.evidenceRequiredAfter || "initial"}`,
      title: `Upload ${type === "repair" ? "repair" : "installation"} photos/videos for ${result.number}`,
      jobId: result.id,
      jobStage:
        progress?.id ||
        (type === "repair" ? "Repair in Progress" : "Installation in Progress"),
      category: type === "repair" ? "Repair" : "Installation",
      workflowAction: "installation-proof",
      workflowOrigin: "generated",
      assignedTo: result.installerId || "",
      status: "Pending",
      priority: "High",
      dueAt: result.installationDate || at,
      requiredEvidence: "after",
      evidenceRequiredAfter: result.evidenceRequiredAfter,
    });
  }
  const current = result.stages.find((s) => s.id === result.status);
  if (current?.applicable === false)
    result.status =
      activeStages(result).find(
        (s) => s.status !== "Completed" && s.type !== "Completed",
      )?.id || "Confirmed";
  return { job: result, tasks: linked };
}
export function nextStage(job) {
  if (job.status === "Completed") return null;
  if (job.status === "On Hold") return job.resumeStage || "Confirmed";
  const stages = activeStages(job),
    index = stages.findIndex((s) => s.id === job.status);
  return (
    stages.slice(index + 1).find((s) => s.status !== "Completed")?.id || null
  );
}
export function completionError(job, tasks = [], returns = []) {
  const stock = stockFacts(job);
  if (stock.outstanding)
    return "Complete outstanding company-stock picking and issue before final completion.";
  if (stock.surplus)
    return "Return or reconcile issued surplus before final completion.";
  if (returns.some((r) => !["Processed", "Cancelled"].includes(r.status)))
    return "Resolve outstanding returns before completion.";
  if (
    tasks.some(
      (t) =>
        applicableTask(t, job) &&
        t.required !== false &&
        t.status !== "Completed",
    )
  )
    return "Complete the required applicable tasks.";
  if (
    activeStages(job).some(
      (s) =>
        s.origin === "manual" &&
        s.type !== "Completed" &&
        s.status !== "Completed" &&
        s.id !== job.status,
    )
  )
    return "Complete the outstanding manual stages.";
  return "";
}
export function updateProduct(
  job,
  change,
  { id, reason, at = new Date().toISOString(), actor = "" } = {},
) {
  if (job.status === "Completed")
    throw Error("Reopen the completed job before changing products.");
  if (!String(reason || "").trim())
    throw Error("Enter a reason for the product change.");
  const result = structuredClone(job),
    line = result.items.find((x) => x.id === change.id);
  const quantity = Number(change.quantityRequired);
  if (!Number.isFinite(quantity) || quantity < 0)
    throw Error("Quantity must be a non-negative number.");
  if (
    !line &&
    (!change.productId ||
      !Number.isFinite(Number(change.unitGross)) ||
      Number(change.unitGross) < 0 ||
      change.priceConfirmed !== true)
  )
    throw Error("Choose a product and explicitly confirm its variation price.");
  if (line) {
    const old = stockFacts({ ...job, items: [line] }).rows[0],
      target =
        change.cancelled || change.fulfilmentSource === "customer"
          ? 0
          : quantity;
    if (
      old &&
      (target < old.required ||
        (change.productId && change.productId !== line.productId))
    ) {
      if (old.used > target)
        throw Error(
          "Consumed stock needs the established correction/variation process.",
        );
      if (old.issued - old.returned > target)
        throw Error(
          "Return or reconcile the issued quantity before excluding or reducing this product.",
        );
      if (old.reserved > target || old.picked > target || old.matched > target)
        throw Error(
          "Release affected reservations and reverse unissued picking through the transactional backend first.",
        );
    }
    Object.assign(line, {
      quantityRequired: quantity,
      cancelled: !!change.cancelled,
      fulfilmentSource:
        change.fulfilmentSource || line.fulfilmentSource || "company",
    });
    if (
      change.priceConfirmed === true &&
      Number.isFinite(Number(change.unitGross)) &&
      Number(change.unitGross) >= 0
    )
      line.approvedUnitGross = Number(change.unitGross);
    if (change.productId && change.productId !== line.productId)
      Object.assign(line, {
        productId: change.productId,
        variantId: change.variantId || change.productId,
        name: change.name,
        sku: change.sku,
      });
  } else
    result.items.push({
      id: id || change.id,
      productId: change.productId,
      variantId: change.variantId || change.productId,
      name: change.name,
      sku: change.sku || "",
      kind: "Inventory",
      requiresInventory: true,
      quantityRequired: quantity,
      fulfilmentSource: change.fulfilmentSource || "company",
      quantityIssued: 0,
      quantityUsed: 0,
      quantityReturned: 0,
      quantityReserved: 0,
      quantityMatched: 0,
      quantityPicked: 0,
      approvedUnitGross: Number(change.unitGross),
    });
  if (stockFacts(result).outstanding > stockFacts(job).outstanding)
    result.evidenceRequiredAfter = at;
  result.variations ||= [];
  result.variations.push({
    id,
    at,
    actor,
    reason,
    lineId: line?.id || id,
    before: line
      ? structuredClone(job.items.find((x) => x.id === line.id))
      : null,
    after: structuredClone(result.items.find((x) => x.id === (line?.id || id))),
    priceConfirmed: change.priceConfirmed === true,
    unitGross: Number(change.unitGross || 0),
  });
  return result;
}
// Confirmed variation amounts feed the existing final reconciliation. Accepted
// quotation totals and issued document snapshots remain the original basis.
export function variationAdjustments(job) {
  const seen = new Set();
  return (job.variations || [])
    .filter((v) => {
      if (!v.id || seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    })
    .map((v) => {
      const before = v.before,
        after = v.after;
      const oldQty =
          before && activeLine(before) ? n(before.quantityRequired) : 0,
        newQty = after && activeLine(after) ? n(after.quantityRequired) : 0;
      const basePrice =
        before?.approvedUnitGross ??
        job.billingBasis?.lines?.find((x) => x.itemId === v.lineId)?.unitGross;
      const oldPrice = before ? Number(basePrice) : 0,
        newPrice = Number(v.unitGross);
      const reviewed =
        v.priceConfirmed === true &&
        Number.isFinite(newPrice) &&
        newPrice >= 0 &&
        (!before || (basePrice != null && Number.isFinite(oldPrice)));
      // Returned issued goods are credited by the existing return-credit process.
      const issued = n(
        before?.quantityIssued ??
          (job.collectionIssuedAt ? before?.quantityPicked : 0),
      );
      const amount = reviewed
        ? newQty < oldQty && issued > 0
          ? 0
          : Math.round((newQty * newPrice - oldQty * oldPrice) * 100) / 100
        : 0;
      return {
        variationId: v.id,
        requestId: `variation:${v.id}`,
        itemId: v.lineId,
        sku: after?.sku || before?.sku || "",
        quantity: newQty - oldQty,
        unitGross: newPrice,
        amount,
        needsReview: !reviewed,
      };
    });
}
export function editStage(
  job,
  change,
  { id, reason, at = new Date().toISOString(), actor = "" } = {},
) {
  if (job.status === "Completed")
    throw Error("Reopen the completed job before changing its workflow.");
  if (!String(reason || "").trim() || !String(change.name || "").trim())
    throw Error("Stage name and reason are required.");
  const result = structuredClone(job);
  result.stages ||= [];
  const existing = result.stages.find((s) => s.id === change.id);
  if (existing?.status === "Completed")
    throw Error("Completed stages and their history cannot be edited.");
  const type = existing?.type || change.type || "Custom";
  if (type !== "Custom" && !WORK_STAGES.includes(type))
    throw Error("Unknown system stage type.");
  if (
    change.applicable === false &&
    ((STOCK_STAGES.includes(type) &&
      (stockFacts(job).outstanding || stockFacts(job).surplus)) ||
      ["Return Pending", "Completed"].includes(type))
  )
    throw Error(
      "A system prerequisite cannot be skipped while obligations remain.",
    );
  const stage = {
    ...(existing || {
      id: id || change.id,
      origin: "manual",
      status: "Pending",
    }),
    type,
    name: change.name.trim(),
    description: String(change.description || ""),
    after: change.after || "Confirmed",
    applicable: change.applicable !== false,
    requiredEvidence: change.requiredEvidence || "none",
    requiresStock: !!change.requiresStock,
    updatedAt: at,
    updatedBy: actor,
    changeReason: reason,
  };
  if (existing && existing.origin === "generated") stage.origin = "manual";
  if (stage.applicable === false) stage.status = "Not applicable";
  if (
    stage.after === stage.id ||
    (result.stages.find((s) => s.id === stage.after)?.status === "Completed" &&
      stage.after !== job.status)
  )
    throw Error("Place stages among outstanding work.");
  if (existing) Object.assign(existing, stage);
  else result.stages.push(stage);
  return result;
}
