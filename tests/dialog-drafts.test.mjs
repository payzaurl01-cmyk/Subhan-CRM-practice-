import { test } from "node:test";
import assert from "node:assert/strict";
import {
  captureDialogDrafts,
  restoreDialogDrafts,
} from "../src/features/crm/dialog-drafts.js";

function input(name, value = "", extra = {}) {
  return {
    id: "",
    name,
    type: "text",
    tagName: "INPUT",
    dataset: {},
    defaultValue: "",
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    isConnected: true,
    focus() {},
    ...extra,
  };
}

function overlay(title, fields) {
  const dialog = {
    querySelector(selector) {
      if (selector === ".modal-head h2") return { textContent: title };
      if (selector === ".modal-close")
        return { dataset: { action: "close-modal" } };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "form") return [{ id: "edit-form" }];
      if (selector === "input, select, textarea") return fields;
      return [];
    },
  };
  return { querySelectorAll: () => [dialog] };
}

test("unsaved dialog values survive a redraw and do not enter another dialog", () => {
  const name = input("customer", "New customer");
  const notes = input("notes", "Measurements to confirm", {
    tagName: "TEXTAREA",
  });
  const checked = input("urgent", "on", {
    type: "checkbox",
    checked: true,
    defaultChecked: false,
  });
  const installer = input("installerId", "u1", {
    type: "select-one",
    tagName: "SELECT",
    multiple: false,
    options: [
      { value: "", selected: false, defaultSelected: true },
      { value: "u1", selected: true, defaultSelected: false },
    ],
  });
  const original = overlay("Edit lead", [name, notes, checked, installer]);
  const draft = captureDialogDrafts(original, name);

  const nextName = input("customer");
  const nextNotes = input("notes", "", { tagName: "TEXTAREA" });
  const nextCheck = input("urgent", "on", {
    type: "checkbox",
    checked: false,
    defaultChecked: false,
  });
  const nextInstaller = input("installerId", "", {
    type: "select-one",
    tagName: "SELECT",
    multiple: false,
    options: [
      { value: "", selected: true, defaultSelected: true },
      { value: "u1", selected: false, defaultSelected: false },
    ],
  });
  const focus = restoreDialogDrafts(
    overlay("Edit lead", [nextName, nextNotes, nextCheck, nextInstaller]),
    draft,
  );
  assert.equal(nextName.value, "New customer");
  assert.equal(nextNotes.value, "Measurements to confirm");
  assert.equal(nextCheck.checked, true);
  assert.equal(nextInstaller.options[1].selected, true);
  assert.equal(focus.field, nextName);

  const unrelated = input("customer");
  restoreDialogDrafts(overlay("Create lead", [unrelated]), draft);
  assert.equal(unrelated.value, "");
});

test("controlled fields retain their state-generated value", () => {
  const original = input("quote-notes", "Unsaved", {
    dataset: { draftField: "notes" },
  });
  const draft = captureDialogDrafts(overlay("Lead", [original]));
  const regenerated = input("quote-notes", "Saved value", {
    dataset: { draftField: "notes" },
  });
  restoreDialogDrafts(overlay("Lead", [regenerated]), draft);
  assert.equal(regenerated.value, "Saved value");
});
