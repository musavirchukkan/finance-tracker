"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { AddCategoryButton } from "@/components/add-modals";
import { CategoryIconPicker } from "@/components/category-icon-picker";
import { Modal } from "@/components/modal";
import { deleteCategory, updateCategory } from "@/lib/actions";
import { resolveCategoryIcon } from "@/lib/category-icons";

type Cat = { id: string; name: string; icon?: string | null };

function EditCategoryButton({ cat, kind }: { cat: Cat; kind: "expense" | "income" }) {
  const [open, setOpen] = useState(false);
  const icon = resolveCategoryIcon(cat.name, cat.icon);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(true)}
      >
        Edit
      </button>
      <Modal open={open} title="Edit category" onClose={() => setOpen(false)}>
        <ActionForm
          action={updateCategory}
          successMessage="Category updated"
          errorMessage="Could not update category"
          className="form-stack"
          onSuccess={() => setOpen(false)}
        >
          <input type="hidden" name="id" value={cat.id} />
          <div className="field">
            <label htmlFor={`edit-cat-name-${cat.id}`}>Name</label>
            <input
              id={`edit-cat-name-${cat.id}`}
              name="name"
              required
              defaultValue={cat.name}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor={`edit-cat-kind-${cat.id}`}>Type</label>
            <select
              id={`edit-cat-kind-${cat.id}`}
              name="kind"
              defaultValue={kind}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <CategoryIconPicker
            defaultIcon={icon}
            categoryName={cat.name}
          />
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              Save changes
            </button>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

function CategoryGroup({
  title,
  kind,
  items,
}: {
  title: string;
  kind: "expense" | "income";
  items: Cat[];
}) {
  return (
    <div className="cat-group">
      <div className="cat-group-head">
        <h3 className="section-sub">{title}</h3>
        <span className="cat-count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="empty">No {kind} categories yet.</div>
      ) : (
        <ul className="cat-grid">
          {items.map((c) => {
            const icon = resolveCategoryIcon(c.name, c.icon);
            return (
              <li key={c.id} className="cat-card">
                <span className="cat-card-icon" aria-hidden>
                  {icon}
                </span>
                <div className="cat-card-body">
                  <strong className="cat-card-name">{c.name}</strong>
                  <span className={`cat-kind-pill ${kind}`}>{kind}</span>
                </div>
                <div className="cat-card-actions">
                  <EditCategoryButton cat={c} kind={kind} />
                  <ActionForm
                    action={deleteCategory}
                    successMessage={`“${c.name}” deleted`}
                    errorMessage="Could not delete category"
                    confirmMessage={`Delete category “${c.name}”?`}
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <button className="btn btn-danger btn-xs" type="submit">
                      Delete
                    </button>
                  </ActionForm>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SettingsForms({
  expenses,
  incomes,
}: {
  expenses: Cat[];
  incomes: Cat[];
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Categories</h2>
          <p className="muted page-sub" style={{ margin: "0.25rem 0 0" }}>
            Pick an emoji for each category — it shows up when you add
            transactions.
          </p>
        </div>
        <AddCategoryButton />
      </div>

      <div className="cat-columns">
        <CategoryGroup title="Expense" kind="expense" items={expenses} />
        <CategoryGroup title="Income" kind="income" items={incomes} />
      </div>
    </section>
  );
}
