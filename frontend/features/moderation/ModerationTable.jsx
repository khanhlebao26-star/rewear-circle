"use client";

export function ModerationTable({ headings, children }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headings.map((text, i) => (
              <th key={i}>{text}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
