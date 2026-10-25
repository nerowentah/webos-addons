import { claimHook } from '../../core/hook-once';
import { configRead } from '../../config/config';
import { registerParseProcessor } from '../../youtube/hooks/json-parse';

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

if (claimHook('remove-endscreen-parse')) {
  registerParseProcessor((res) => {
    if (!configRead('removeEndscreen')) {
      return;
    }

    if (
      isObject(res) &&
      'endscreen' in res &&
      isObject(res.endscreen) &&
      'endscreenRenderer' in res.endscreen
    ) {
      delete res.endscreen;
    }
  });
}
