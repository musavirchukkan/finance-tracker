"use client";

import { useState } from "react";
import {
  CATEGORY_ICON_CHOICES,
  defaultIconForCategoryName,
} from "@/lib/category-icons";

export function CategoryIconPicker({
  name = "icon",
  defaultIcon,
  categoryName = "",
}: {
  name?: string;
  defaultIcon?: string | null;
  categoryName?: string;
}) {
  const fallback = defaultIconForCategoryName(categoryName || "Other");
  const [icon, setIcon] = useState(defaultIcon?.trim() || fallback);

  return (
    <div className="field">
      <label>Icon</label>
      <input type="hidden" name={name} value={icon} />
      <div className="cat-icon-picker" role="listbox" aria-label="Category icon">
        {CATEGORY_ICON_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            role="option"
            aria-selected={icon === choice}
            className={`cat-icon-option ${icon === choice ? "selected" : ""}`}
            onClick={() => setIcon(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      <div className="cat-icon-custom">
        <label htmlFor={`${name}-custom`} className="sr-only">
          Custom emoji
        </label>
        <input
          id={`${name}-custom`}
          type="text"
          inputMode="text"
          maxLength={8}
          value={icon}
          onChange={(e) => setIcon(e.target.value.slice(0, 8))}
          aria-label="Custom emoji"
          placeholder="Or paste emoji"
        />
        <span className="cat-icon-preview" aria-hidden>
          {icon || "📁"}
        </span>
      </div>
    </div>
  );
}
