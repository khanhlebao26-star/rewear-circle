"use client";

import { label } from "@/lib/api.mjs";

export function Field({ label: text, name, children, help, ...props }) {
  return (
    <label className="field">
      <span>{text}</span>
      {children || <input name={name} {...props} />}
      {help && <small>{help}</small>}
    </label>
  );
}

export function SelectField({
  label: text,
  name,
  values,
  placeholder,
  ...props
}) {
  return (
    <Field label={text}>
      <select name={name} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {values.map((value) => {
          const [id, title] = Array.isArray(value)
            ? value
            : [value, label(value)];
          return (
            <option key={id} value={id}>
              {title === "FREE_SIZE" ? "Freesize" : title}
            </option>
          );
        })}
      </select>
    </Field>
  );
}
