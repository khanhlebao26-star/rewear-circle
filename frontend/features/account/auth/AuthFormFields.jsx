import { Field } from "@/components/ui/FormFields";
import { Icon } from "@/components/ui/Icon";

export function validatePassword(password, setError) {
  if (password && new TextEncoder().encode(password).length > 72) {
    setError(new Error("Mật khẩu tối đa 72 byte UTF-8."));
    return false;
  }
  return true;
}

export function AuthCredentialsFields({ passwordAutoComplete }) {
  return (
    <>
      <Field
        label="Email *"
        name="email"
        type="email"
        required
        autoComplete="email"
      />
      <Field
        label="Mật khẩu *"
        name="password"
        type="password"
        required
        minLength={12}
        autoComplete={passwordAutoComplete}
        help="Ít nhất 12 ký tự, tối đa 72 byte UTF-8."
      />
    </>
  );
}

export function AuthSubmitButton({ pending, children }) {
  return (
    <button className="btn full" disabled={pending}>
      {pending ? "Đang xử lý…" : children}
      <Icon name="arrow" size={15} />
    </button>
  );
}
