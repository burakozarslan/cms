import { compare, hash } from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * A valid hash of a value nothing will match, used to spend the same time
 * verifying a password for an unknown email as for a known one — otherwise the
 * response time reveals which emails are registered.
 */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.RUCk8pDb9YtC5rNBOfPUw6PWXpaN.Ny";

export function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function burnPasswordComparison(password: string): Promise<void> {
  await compare(password, DUMMY_HASH);
}
