"use client";

import { ActionForm } from "@/components/action-form";
import {
  createCategory,
  deleteCategory,
  updateDebtGoal,
} from "@/lib/actions";

type Cat = { id: string; name: string };

export function SettingsForms({
  goal,
  expenses,
  incomes,
}: {
  goal: string;
  expenses: Cat[];
  incomes: Cat[];
}) {
  return (
    <>
      <section className="panel">
        <h2>Categories</h2>
        <ActionForm
          action={createCategory}
          successMessage="Category added"
          errorMessage="Could not add category"
          className="form-stack"
          style={{ marginBottom: "1rem" }}
          resetOnSuccess
        >
          <div className="field">
            <label htmlFor="name">New category</label>
            <input id="name" name="name" required placeholder="Subscriptions" />
          </div>
          <div className="field">
            <label htmlFor="kind">Type</label>
            <select id="kind" name="kind" defaultValue="expense">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            Add
          </button>
        </ActionForm>

        <h3 className="section-sub">Expense</h3>
        <ul className="cat-list">
          {expenses.map((c) => (
            <li key={c.id}>
              <span>{c.name}</span>
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
            </li>
          ))}
        </ul>

        <h3 className="section-sub">Income</h3>
        <ul className="cat-list">
          {incomes.map((c) => (
            <li key={c.id}>
              <span>{c.name}</span>
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
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Debt payoff goal</h2>
        <ActionForm
          action={updateDebtGoal}
          successMessage="Debt payoff goal saved"
          errorMessage="Could not save goal"
          className="form-stack"
        >
          <div className="field">
            <label htmlFor="goalPayoffDate">Target zero-debt date</label>
            <input
              id="goalPayoffDate"
              name="goalPayoffDate"
              type="date"
              required
              defaultValue={goal}
            />
          </div>
          <button className="btn btn-primary" type="submit">
            Save
          </button>
        </ActionForm>
      </section>
    </>
  );
}
