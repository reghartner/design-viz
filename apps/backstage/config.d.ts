export interface Config {
  flowview?: {
    /**
     * Authenticated Backstage proxy route. Defaults to /flowview.
     * @visibility frontend
     */
    proxyPath?: string;
  };
}
