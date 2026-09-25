declare const manifest: {
  entries(raw: unknown): Array<{id: string; folder: string; owner: string; path: string; html: string}>;
  spec(raw: unknown, entry: {id: string; owner: string}): unknown;
};
export = manifest;
