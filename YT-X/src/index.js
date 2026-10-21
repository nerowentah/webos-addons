import { extractLaunchParams, handleLaunch } from './core/utils';

function main() {
  const params = extractLaunchParams();
  handleLaunch(params);
}

main();
