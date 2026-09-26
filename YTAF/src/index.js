import './tv-specs';
import { extractLaunchParams, handleLaunch } from './utils';

function main() {
  const params = extractLaunchParams();
  handleLaunch(params);
}

main();
