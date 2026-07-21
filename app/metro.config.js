const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ---------------------------------------------------------------------------
// Force a SINGLE copy of `react` across the whole bundle.
//
// moti pulls in framer-motion / react-dom, which npm nests as a second react
// version (19.2.7) under node_modules/moti. At runtime that gives React two
// dispatchers → "Invalid hook call" / "Cannot read property 'useContext' of
// null". npm `overrides` didn't dedupe it, so we pin resolution here instead:
// every `react` (and `react/...` subpath) import resolves to the ROOT copy,
// which matches the version React Native 0.81 requires.
// ---------------------------------------------------------------------------
const rootNodeModules = path.resolve(__dirname, 'node_modules');
const baseResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    try {
      return {
        type: 'sourceFile',
        filePath: require.resolve(moduleName, { paths: [rootNodeModules] }),
      };
    } catch (e) {
      // fall through to default resolution
    }
  }
  return baseResolveRequest
    ? baseResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
