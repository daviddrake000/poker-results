import { describe, expect, it } from 'vitest';
import { checkSignUp } from './signup';

const good = { name: 'Hal', email: 'hal@example.test', password: 'correct horse' };

describe('checkSignUp', () => {
  it('accepts a complete form and tidies it', () => {
    const check = checkSignUp({ name: '  Hal   Reed ', email: ' Hal@Example.TEST ', password: 'correct horse' });
    expect(check.ok).toBe(true);
    expect(check.clean).toEqual({ name: 'Hal Reed', email: 'hal@example.test', password: 'correct horse' });
  });

  it('never trims or changes the password', () => {
    expect(checkSignUp({ ...good, password: ' spaced pass ' }).clean.password).toBe(' spaced pass ');
  });

  it('requires a name', () => {
    expect(checkSignUp({ ...good, name: '   ' }).errors.name).toMatch(/Enter your name/);
    expect(checkSignUp({ ...good, name: 'x'.repeat(41) }).errors.name).toBe('Use at most 40 characters');
  });

  it('requires a plausible email', () => {
    expect(checkSignUp({ ...good, email: '' }).errors.email).toBe('Enter your email');
    for (const email of ['hal', 'hal@', '@example.test', 'hal@example', 'ha l@example.test']) {
      expect(checkSignUp({ ...good, email }).ok).toBe(false);
    }
  });

  it('requires 8 to 72 bytes of password', () => {
    expect(checkSignUp({ ...good, password: 'short' }).errors.password).toBe('Use at least 8 characters');
    expect(checkSignUp({ ...good, password: 'a'.repeat(8) }).ok).toBe(true);
    expect(checkSignUp({ ...good, password: 'a'.repeat(72) }).ok).toBe(true);
    expect(checkSignUp({ ...good, password: 'a'.repeat(73) }).errors.password).toBe('Use at most 72 characters');
    // 36 two-byte characters are 72 bytes; one more is too long for bcrypt.
    expect(checkSignUp({ ...good, password: 'é'.repeat(37) }).ok).toBe(false);
  });
});
