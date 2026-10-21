import { configRead } from './config';
import { registerParseProcessor } from './hooks/json-parse';

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
