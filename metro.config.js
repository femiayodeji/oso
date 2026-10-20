const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Agent worktrees under .claude/ hold their own node_modules; watching them exhausts inotify.
config.resolver.blockList = [/\/\.claude\/.*/];

module.exports = config;
