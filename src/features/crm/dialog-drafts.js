const controls = (dialog) =>
  [...dialog.querySelectorAll("input, select, textarea")].filter(
    (field) =>
      field.type !== "hidden" &&
      ![
        "draftField",
        "lineField",
        "ui",
        "filter",
        "chatMessage",
        "usedItem",
      ].some((name) => name in field.dataset),
  );

const dialogKey = (dialog, index) =>
  [
    index,
    dialog.querySelector(".modal-head h2")?.textContent || "",
    dialog.querySelector(".modal-close")?.dataset.action || "",
    [...dialog.querySelectorAll("form")].map((form) => form.id).join("|"),
  ].join("::");

function keyedControls(dialog) {
  const counts = new Map();
  return controls(dialog).map((field, index) => {
    const identity =
      field.id || field.name || field.dataset.focus || `field-${index}`;
    const count = counts.get(identity) || 0;
    counts.set(identity, count + 1);
    return [field, `${identity}::${count}`];
  });
}

function fieldDraft(field) {
  if (field.type === "file")
    return field.files?.length ? { type: "file", files: field.files } : null;
  if (field.type === "checkbox" || field.type === "radio")
    return field.checked !== field.defaultChecked
      ? { type: "checked", checked: field.checked }
      : null;
  if (field.tagName === "SELECT") {
    const selected = [...field.options]
      .filter((option) => option.selected)
      .map((option) => option.value);
    const defaults = [...field.options]
      .filter((option) => option.defaultSelected)
      .map((option) => option.value);
    if (!defaults.length && !field.multiple && field.options.length)
      defaults.push(field.options[0].value);
    return selected.join("\0") !== defaults.join("\0")
      ? { type: "select", values: selected }
      : null;
  }
  return field.value !== field.defaultValue
    ? { type: "value", value: field.value }
    : null;
}

export function captureDialogDrafts(overlay, activeElement) {
  if (!overlay) return [];
  return [...overlay.querySelectorAll(".backdrop .modal")].map(
    (dialog, index) => {
      const fields = new Map();
      let focus = null;
      for (const [field, key] of keyedControls(dialog)) {
        const draft = fieldDraft(field);
        if (draft) fields.set(key, draft);
        if (field === activeElement) {
          focus = { key };
          try {
            focus.start = field.selectionStart;
            focus.end = field.selectionEnd;
          } catch {}
        }
      }
      return { key: dialogKey(dialog, index), fields, focus };
    },
  );
}

export function restoreDialogDrafts(overlay, drafts) {
  if (!overlay || !drafts?.length) return null;
  let focus = null;
  [...overlay.querySelectorAll(".backdrop .modal")].forEach((dialog, index) => {
    const saved = drafts.find(
      (draft) => draft.key === dialogKey(dialog, index),
    );
    if (!saved) return;
    for (const [field, key] of keyedControls(dialog)) {
      const draft = saved.fields.get(key);
      if (draft?.type === "value") field.value = draft.value;
      if (draft?.type === "checked") field.checked = draft.checked;
      if (draft?.type === "select") {
        const values = new Set(draft.values);
        if (
          [...values].every((value) =>
            [...field.options].some((option) => option.value === value),
          )
        )
          for (const option of field.options)
            option.selected = values.has(option.value);
      }
      if (draft?.type === "file") {
        try {
          field.files = draft.files;
        } catch {}
      }
      if (saved.focus?.key === key) focus = { field, ...saved.focus };
    }
  });
  return focus;
}
