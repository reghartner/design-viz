import config from './playwright.config.mjs';

// CI shards at test granularity so one large spec cannot monopolize a shard.
// Each checkout still runs one test at a time because fixtures share fixed paths.
export default {
  ...config,
  fullyParallel:true,
  workers:1,
  reporter:[['line'],['blob',{outputDir:'blob-report'}]],
};
