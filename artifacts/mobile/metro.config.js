const { getDefaultConfig } = require("expo/metro-config");
const path = require('path');

// Get the default config
const config = getDefaultConfig(__dirname);

// Configure the resolver to recognize @lib alias
config.resolver = config.resolver || {};
config.resolver.nodeModulesPaths = config.resolver.nodeModulesPaths || [];

// Add the lib folder as a node_modules path
config.resolver.nodeModulesPaths.push(path.resolve(__dirname, '../../lib'));

// Add watchFolders to include the lib directory
config.watchFolders = config.watchFolders || [];
config.watchFolders.push(path.resolve(__dirname, '../../lib'));

module.exports = config;
