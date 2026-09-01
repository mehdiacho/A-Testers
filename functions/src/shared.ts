/**
 * Single re-export point for the shared domain package.
 *
 * functions/tsconfig.json compiles ../packages/shared/src into the same output tree, so
 * this relative path is the one place that has to know about the layout. Everything else
 * imports from './shared.js' (or '../shared.js').
 */
export * from '../../packages/shared/src/index.js';
