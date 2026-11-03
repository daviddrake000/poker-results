/**
 * A dollar input. Plain text with a decimal keypad, never type="number",
 * which silently turns what it can't read into an empty value.
 */
export function MoneyField({
  id,
  label,
  value,
  error,
  placeholder,
  autoFocus,
  onChange,
  onBlur,
  onEnter,
}: {
  id: string;
  label: string;
  value: string;
  error: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="money-input">
        <input
          id={id}
          className="input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          enterKeyHint={onEnter ? 'done' : 'next'}
          placeholder={placeholder}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onFocus={autoFocus ? (e) => e.target.select() : undefined}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (onEnter && e.key === 'Enter') {
              e.preventDefault();
              onEnter();
            }
          }}
        />
      </div>
      {error && (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
