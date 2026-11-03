export const MIN_PASSWORD_LENGTH = 8;
/** Supabase hashes passwords with bcrypt, which ignores anything past 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72;
export const MAX_NAME_LENGTH = 40;

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface SignUpCheck {
  ok: boolean;
  errors: { name: string | null; email: string | null; password: string | null };
  /** Cleaned values to send: name with tidy spaces, email trimmed and lower-case. */
  clean: SignUpInput;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkSignUp(input: SignUpInput): SignUpCheck {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  const errors = {
    name: !name
      ? 'Enter your name so the admin knows who you are'
      : name.length > MAX_NAME_LENGTH
        ? `Use at most ${MAX_NAME_LENGTH} characters`
        : null,
    email: !email ? 'Enter your email' : EMAIL.test(email) ? null : 'That email address doesn’t look right',
    password:
      password.length < MIN_PASSWORD_LENGTH
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters`
        : new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH
          ? `Use at most ${MAX_PASSWORD_LENGTH} characters`
          : null,
  };

  return {
    ok: !errors.name && !errors.email && !errors.password,
    errors,
    clean: { name, email, password },
  };
}
