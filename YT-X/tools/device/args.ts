// Argument parsing shared by the on-TV tools, so `-d`/`--device` behaves the
// same in deploy, drive, inspect and verify-device and can also come from the
// environment (`YTX_DEVICE`), the way deploy already reads YTX_RESOLUTION/YTX_UA.

/**
 * The value of `--flag value`, `--flag=value`, `-f value` or `-f=value`.
 * A flag with no value is an error, not a silent fall back to a default: a
 * trailing `--device` would otherwise deploy to whatever ares considers
 * default, which may be the wrong TV.
 */
export function optionValue(
  argv: readonly string[],
  names: readonly string[]
): string | undefined {
  for (const [i, arg] of argv.entries()) {
    for (const name of names) {
      if (arg === name) {
        const value = argv[i + 1];
        if (
          value === undefined ||
          (value.length > 1 && value.startsWith('-')) ||
          value === ''
        ) {
          throw new Error(`${name} needs a value`);
        }
        return value;
      }
      if (arg.startsWith(`${name}=`)) {
        const value = arg.slice(name.length + 1);
        if (value === '') throw new Error(`${name} needs a value`);
        return value;
      }
    }
  }
  return undefined;
}

/** Whether a bare flag was passed (`--dry-run`). */
export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

/**
 * The ares device: `-d`/`--device`, then `YTX_DEVICE`. `undefined` means "the
 * device ares marks as default".
 */
export function deviceArg(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return optionValue(argv, ['-d', '--device']) ?? env['YTX_DEVICE'];
}
