// Configuracao do Metro para o app mobile.
// getDefaultConfig ja aplica o suporte a monorepo: watchFolders, nodeModulesPaths
// e server.unstable_serverRoot apontando para a raiz do workspace.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// O pnpm (node-linker=hoisted) cria copias aninhadas de react 19 sob algumas
// dependencias compartilhadas com o app web (ex.: @tanstack/react-query).
// Desabilitar a busca hierarquica garante que o app resolva sempre o react
// unico do workspace (18.3.1), evitando "Invalid hook call".
config.resolver.disableHierarchicalLookup = true;

// withNativeWind compila o global.css e injeta os estilos resolvidos para as
// props className dos componentes React Native.
module.exports = withNativeWind(config, { input: './global.css' });
